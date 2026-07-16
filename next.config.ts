import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las rutas.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Permite acceder al dev server desde otras máquinas de la LAN (solo dev).
  allowedDevOrigins: ["192.168.1.100", "192.168.1.102", "localhost", "127.0.0.1"],
  // El compresor 3D usa libs nativas/WASM: que Next NO las empaquete (se cargan
  // en runtime desde node_modules). Si no, el bundle peta con los .wasm/.node.
  serverExternalPackages: [
    "sharp",
    "draco3dgltf",
    "meshoptimizer",
    "gltf-pipeline",
    "@gltf-transform/core",
    "@gltf-transform/extensions",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
