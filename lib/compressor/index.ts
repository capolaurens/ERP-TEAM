import fs from "fs/promises";
import os from "os";
import path from "path";
import { meshSimplifyService } from "./mesh-simplify";
import { textureCompressService } from "./texture-compress";
import { dracoService } from "./draco";

export type CompressResult = {
  buffer: Buffer;
  bytesBefore: number;
  bytesAfter: number;
  trisBefore: number;
  trisAfter: number;
};

export type CompressOptions = {
  /** Objetivo de triángulos tras decimar (adaptativo). Default 180.000. */
  targetTris?: number;
  /** Ratio fijo de triángulos a conservar (0-1). Si se pasa, gana a targetTris. */
  ratio?: number;
  /** Tope de dimensión de textura (px). Default 1024. */
  textureMaxDim?: number;
  /** Calidad WebP 1-100. Default 82. */
  textureQuality?: number;
};

/**
 * "Mega compresor": malla (meshopt) → texturas (WebP) → Draco. Sobre un buffer
 * GLB en memoria; usa archivos temporales y los limpia. Devuelve el GLB ligero.
 */
export async function compressGlbBuffer(
  input: Buffer,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "erp-glb-"));
  try {
    const p0 = path.join(work, "in.glb");
    const p1 = path.join(work, "s1.glb");
    const p2 = path.join(work, "s2.glb");
    const p3 = path.join(work, "s3.glb");
    await fs.writeFile(p0, input);

    const simp = await meshSimplifyService.simplifyGLB(
      p0,
      p1,
      opts.ratio != null
        ? { ratio: opts.ratio, error: 0.0008 }
        : { targetTris: opts.targetTris ?? 180000, error: 0.0008 },
    );
    await textureCompressService.compressTexturesToWebP(p1, p2, {
      maxDimension: opts.textureMaxDim ?? 1024,
      quality: opts.textureQuality ?? 82,
    });
    await dracoService.compressGLB(p2, p3);

    const buffer = await fs.readFile(p3);
    return {
      buffer,
      bytesBefore: input.length,
      bytesAfter: buffer.length,
      trisBefore: simp.trisBefore,
      trisAfter: simp.trisAfter,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** ¿El archivo es un GLB/glTF binario que podemos comprimir? */
export function isGlb(fileName: string, mimeType?: string): boolean {
  const n = fileName.toLowerCase();
  return (
    n.endsWith(".glb") ||
    n.endsWith(".gltf") ||
    mimeType === "model/gltf-binary"
  );
}
