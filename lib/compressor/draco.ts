/**
 * Draco geometry compression for GLB files.
 * Portado de navyx-saas (server/src/services/draco.service.ts).
 * gltf-pipeline (CJS) cargado con import() dinámico para compatibilidad con Next.
 */
import fs from "fs/promises";
import path from "path";
import { logger } from "./logger";

// Cuantización: máxima calidad visual + Blender-friendly (16-bit posiciones).
const DRACO_OPTIONS = {
  dracoOptions: {
    compressionLevel: 2,
    quantizePositionBits: 16,
    quantizeNormalBits: 12,
    quantizeTexcoordBits: 12,
    quantizeColorBits: 8,
    quantizeGenericBits: 12,
  },
};

export const dracoService = {
  async compressGLB(inputPath: string, outputPath?: string): Promise<string> {
    await fs.access(inputPath);
    if (!outputPath) outputPath = inputPath;

    const glbBuffer = await fs.readFile(inputPath);

    // gltf-pipeline es CommonJS: (await import()).default = module.exports.
    const mod: any = await import("gltf-pipeline");
    const gltfPipeline: any = mod.default ?? mod;

    let result: any;
    if (typeof gltfPipeline.processGlb === "function") {
      result = await gltfPipeline.processGlb(glbBuffer, DRACO_OPTIONS);
    } else if (typeof gltfPipeline.processGlbFile === "function") {
      result = await gltfPipeline.processGlbFile(inputPath, DRACO_OPTIONS);
    } else {
      throw new Error("gltf-pipeline: no se encontró processGlb/processGlbFile");
    }

    if (result?.glb && Buffer.isBuffer(result.glb)) {
      await fs.writeFile(outputPath, result.glb);
    } else if (result?.glb && typeof result.glb === "string") {
      await fs.copyFile(result.glb, outputPath);
    } else {
      throw new Error("gltf-pipeline no devolvió un buffer GLB válido");
    }

    const before = glbBuffer.length;
    const after = (await fs.stat(outputPath)).size;
    logger.info(
      `   ✅ Draco ${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB`,
    );
    return outputPath;
  },
};
