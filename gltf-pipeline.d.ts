// gltf-pipeline (CommonJS) no publica tipos. Se usa vía import() dinámico y se
// castea a `any` en lib/compressor/draco.ts; esta declaración evita el TS7016.
declare module "gltf-pipeline";
