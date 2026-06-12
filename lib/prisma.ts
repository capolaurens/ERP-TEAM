import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 usa driver adapters. Conectamos con node-postgres (PrismaPg) usando
// DATABASE_URL — funciona igual en local (Postgres en Docker) y en Railway.
// El valor de relleno solo evita que el build de producción falle al cargar el
// módulo sin DATABASE_URL; en runtime (local/Railway) siempre está definida y
// durante el build no se ejecuta ninguna consulta.
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
