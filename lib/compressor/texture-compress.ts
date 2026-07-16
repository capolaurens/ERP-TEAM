/**
 * Texture compression for GLB files using WebP + size cap.
 * Portado de navyx-saas (server/src/services/textureCompress.service.ts).
 * Lee las texturas embebidas con gltf-transform y las re-encodea con sharp a WebP.
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { logger } from "./logger";

export interface TextureCompressOptions {
  maxDimension?: number;
  quality?: number;
  overwrite?: boolean;
}

export interface TextureCompressStats {
  bytesBefore: number;
  bytesAfter: number;
  reductionPct: number;
  outputPath: string;
  texturesProcessed: number;
  texturesSkipped: number;
}

export const textureCompressService = {
  async compressTexturesToWebP(
    inputPath: string,
    outputPath?: string,
    options: TextureCompressOptions = {},
  ): Promise<TextureCompressStats> {
    const maxDim = options.maxDimension ?? 2048;
    const quality = options.quality ?? 85;

    if (!outputPath) {
      const dir = path.dirname(inputPath);
      const ext = path.extname(inputPath);
      const basename = path.basename(inputPath, ext);
      outputPath = path.join(dir, `${basename}_webp${ext}`);
    }

    await fs.access(inputPath);
    const beforeStats = await fs.stat(inputPath);

    // @ts-ignore — draco3dgltf no publica tipos
    const draco3d = (await import("draco3dgltf")).default;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
      });
    const document = await io.read(inputPath);
    const root = document.getRoot();

    let texturesProcessed = 0;
    let texturesSkipped = 0;

    for (const texture of root.listTextures()) {
      const image = texture.getImage();
      if (!image || image.byteLength === 0) {
        texturesSkipped++;
        continue;
      }
      try {
        const webpBuffer = await sharp(Buffer.from(image))
          .resize(maxDim, maxDim, {
            fit: "inside",
            withoutEnlargement: true,
            kernel: "lanczos3",
          })
          .webp({ quality, effort: 4 })
          .toBuffer();

        texture.setImage(new Uint8Array(webpBuffer));
        texture.setMimeType("image/webp");
        texturesProcessed++;
      } catch (texErr) {
        // No-fatal por textura: omitimos esta y seguimos.
        logger.warn(
          `textura "${texture.getName() || "unnamed"}" falló: ` +
            (texErr instanceof Error ? texErr.message : String(texErr)),
        );
        texturesSkipped++;
      }
    }

    await io.write(outputPath, document);

    const afterStats = await fs.stat(outputPath);
    const reductionPct = +((1 - afterStats.size / beforeStats.size) * 100).toFixed(1);

    logger.info(
      `   ✅ texturas ${texturesProcessed} ok / ${texturesSkipped} omit · ${(beforeStats.size / 1048576).toFixed(2)}MB → ${(afterStats.size / 1048576).toFixed(2)}MB`,
    );

    return {
      bytesBefore: beforeStats.size,
      bytesAfter: afterStats.size,
      reductionPct,
      outputPath,
      texturesProcessed,
      texturesSkipped,
    };
  },
};
