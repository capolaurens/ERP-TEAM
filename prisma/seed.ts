import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta la variable de entorno DATABASE_URL");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@navyx.com").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "Navyx2025!";
  const name = process.env.ADMIN_NAME || "Administrador";

  const passwordHash = await bcrypt.hash(password, 10);

  // No sobrescribimos la contraseña si el admin ya existe (por si la cambió).
  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", active: true },
    create: { email, name, role: "ADMIN", passwordHash, active: true },
  });
  console.log(`✔ Admin listo: ${admin.email} (rol ${admin.role})`);

  // Filas de configuración de carpetas de Drive por equipo (se rellenan en /admin/ajustes).
  const labels: Record<string, string> = {
    MARKETING: "Marketing",
    SALES: "Ventas",
    DESIGN: "Diseño / 3D",
  };
  for (const team of ["MARKETING", "SALES", "DESIGN"] as const) {
    await prisma.teamDriveFolder.upsert({
      where: { team },
      update: {},
      create: { team, driveFolderId: "", label: labels[team] },
    });
  }
  console.log("✔ Carpetas de Drive por equipo inicializadas (vacías)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Error en el seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
