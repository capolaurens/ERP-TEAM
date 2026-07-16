/**
 * Mesh simplification (geometry decimation) for GLB files.
 * Portado de navyx-saas (server/src/services/meshSimplify.service.ts).
 * Implementación: MeshoptSimplifier (Quadric Error Metrics) sobre cada primitiva.
 */
import fs from "fs/promises";
import path from "path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";
import { logger } from "./logger";

export interface MeshSimplifyOptions {
  /** Ratio de triángulos a CONSERVAR (0-1). 0.05 agresivo · 0.15 normal · 0.30 suave. */
  ratio?: number;
  /**
   * Objetivo de triángulos TOTALES (tiene prioridad sobre `ratio`). Decima hasta
   * ~este número, ADAPTÁNDOSE al modelo: uno pesado (900k) baja mucho, uno ligero
   * (50k) casi no se toca. Evita las roturas de un ratio fijo demasiado agresivo.
   */
  targetTris?: number;
  /** Error máx de posición (unidades del modelo). Default 0.0008 (0.8mm). Safety brake. */
  error?: number;
  overwrite?: boolean;
}

export interface MeshSimplifyStats {
  bytesBefore: number;
  bytesAfter: number;
  bytesReductionPct: number;
  trisBefore: number;
  trisAfter: number;
  trisReductionPct: number;
  vertsBefore: number;
  vertsAfter: number;
  outputPath: string;
}

function countTris(document: any): number {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) {
        total += indices.getCount() / 3;
      } else {
        const pos = prim.getAttribute("POSITION");
        if (pos) total += pos.getCount() / 3;
      }
    }
  }
  return Math.round(total);
}

function countVerts(document: any): number {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos) total += pos.getCount();
    }
  }
  return total;
}

export const meshSimplifyService = {
  async simplifyGLB(
    inputPath: string,
    outputPath?: string,
    options: MeshSimplifyOptions = {},
  ): Promise<MeshSimplifyStats> {
    const ratio = options.ratio ?? 0.15;
    const error = options.error ?? 0.0008;

    if (ratio <= 0 || ratio > 1) {
      throw new Error(`Invalid ratio ${ratio} — must be in (0, 1]`);
    }

    if (!outputPath) {
      const dir = path.dirname(inputPath);
      const ext = path.extname(inputPath);
      const basename = path.basename(inputPath, ext);
      outputPath = path.join(dir, `${basename}_simplified${ext}`);
    }

    await fs.access(inputPath);
    const beforeStats = await fs.stat(inputPath);

    logger.info(
      `📐 Simplifying GLB (ratio=${ratio}, error=${error.toFixed(4)}): ${path.basename(inputPath)}`,
    );

    // MeshoptSimplifier es WASM y requiere init explícito antes del primer uso.
    await MeshoptSimplifier.ready;

    // Registrar Draco (los GLBs pueden venir KHR_draco_mesh_compression).
    // @ts-ignore — draco3dgltf no publica tipos
    const draco3d = (await import("draco3dgltf")).default;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
      });
    const document = await io.read(inputPath);

    const trisBefore = countTris(document);
    const vertsBefore = countVerts(document);

    // Ratio efectivo: si hay objetivo de triángulos, se calcula desde el nº real
    // (adaptativo); si no, ratio fijo. Nunca por debajo de 2%.
    const effRatio = options.targetTris
      ? Math.min(1, Math.max(0.02, options.targetTris / Math.max(1, trisBefore)))
      : ratio;

    let primitivesProcessed = 0;
    let primitivesSkipped = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const indicesAcc = prim.getIndices();
        const posAcc = prim.getAttribute("POSITION");
        if (!indicesAcc || !posAcc) {
          primitivesSkipped++;
          continue;
        }
        const indicesArr = indicesAcc.getArray();
        const posArr = posAcc.getArray();
        if (!indicesArr || !posArr) {
          primitivesSkipped++;
          continue;
        }
        const indicesU32 = new Uint32Array(indicesArr.length);
        indicesU32.set(indicesArr);
        const posF32 = new Float32Array(posArr.length);
        posF32.set(posArr);

        const targetIndexCount = Math.max(
          3,
          Math.floor((indicesU32.length * effRatio) / 3) * 3,
        );

        // "LockBorder": no mueve los vértices de bordes abiertos (cantos de
        // paneles planos, listones) → mucha menos rotura en esas zonas.
        const [newIndices] = MeshoptSimplifier.simplify(
          indicesU32,
          posF32,
          3,
          targetIndexCount,
          error,
          ["LockBorder"] as any,
        );

        indicesAcc.setArray(newIndices as any);
        primitivesProcessed++;
      }
    }

    const trisAfter = countTris(document);
    const vertsAfter = countVerts(document);
    await io.write(outputPath, document);

    const afterStats = await fs.stat(outputPath);
    const bytesReductionPct = +((1 - afterStats.size / beforeStats.size) * 100).toFixed(1);
    const trisReductionPct = +((1 - trisAfter / trisBefore) * 100).toFixed(1);

    logger.info(
      `   ✅ ${(beforeStats.size / 1048576).toFixed(2)}MB → ${(afterStats.size / 1048576).toFixed(2)}MB · tris ${trisBefore}→${trisAfter} (↓${trisReductionPct}%) · prims ${primitivesProcessed}/${primitivesProcessed + primitivesSkipped}`,
    );

    return {
      bytesBefore: beforeStats.size,
      bytesAfter: afterStats.size,
      bytesReductionPct,
      trisBefore,
      trisAfter,
      trisReductionPct,
      vertsBefore,
      vertsAfter,
      outputPath,
    };
  },
};
