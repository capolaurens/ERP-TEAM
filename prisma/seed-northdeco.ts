import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DAY = 24 * 60 * 60 * 1000;

async function ensureDesigner(name: string, email: string) {
  const passwordHash = await bcrypt.hash("Diseno1234", 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role: "DESIGN", team: "DESIGN", active: true },
    create: { name, email, role: "DESIGN", team: "DESIGN", active: true, passwordHash },
  });
}

async function ensureTask(opts: {
  title: string;
  description: string;
  projectId: string;
  assigneeId: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueOffsetDays: number;
  order: number;
  actorId: string | null;
}) {
  const existing = await prisma.task.findFirst({
    where: { projectId: opts.projectId, title: opts.title },
  });
  if (existing) return existing;

  const dueDate = new Date(Date.now() + opts.dueOffsetDays * DAY);
  const task = await prisma.task.create({
    data: {
      title: opts.title,
      description: opts.description,
      projectId: opts.projectId,
      team: "DESIGN",
      assigneeId: opts.assigneeId,
      status: opts.status,
      priority: opts.priority,
      dueDate,
      order: opts.order,
      createdById: opts.actorId,
    },
  });
  await prisma.activity.create({
    data: { type: "CREATED", taskId: task.id, actorId: opts.actorId, meta: { title: opts.title } },
  });
  return task;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const actorId = admin?.id ?? null;

  // Equipo 3D (para asignar y para ver su panel)
  const adria = await ensureDesigner("Adrià", "adria@navyx3d.com");
  const shiling = await ensureDesigner("Shiling", "shiling@navyx3d.com");

  // Proyecto grande del cliente
  let project = await prisma.project.findFirst({
    where: { name: "Northdeco · 200 productos 3D", team: "DESIGN" },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: "Northdeco · 200 productos 3D",
        team: "DESIGN",
        description:
          "Cliente: northdeco.com — Modelado 3D de 200 productos para su catálogo. Primer lote: 10 piezas (las 190 restantes se añaden por tandas).",
        status: "active",
        createdById: actorId,
      },
    });
    await prisma.activity.create({
      data: { type: "CREATED", projectId: project.id, actorId, meta: { name: project.name } },
    });
  }

  // Tarea GRANDE (resumen del lote)
  await ensureTask({
    title: "📦 Northdeco — Lote 1: 10 productos 3D",
    description:
      "Tarea grande del primer lote para northdeco.com. Subdividida en 10 piezas individuales (ver tareas «Producto 3D #01…#10»). Flujo por pieza: modelado → texturizado → exportar GLB + USDZ → revisión.",
    projectId: project.id,
    assigneeId: adria.id,
    status: "IN_PROGRESS",
    priority: "HIGH",
    dueOffsetDays: 16,
    order: 0,
    actorId,
  });

  // 10 piezas
  const pieces: Array<{
    n: number;
    status: "TODO" | "IN_PROGRESS" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    days: number;
    who: string;
  }> = [
    { n: 1, status: "DONE", priority: "MEDIUM", days: 1, who: adria.id },
    { n: 2, status: "IN_PROGRESS", priority: "HIGH", days: 2, who: shiling.id },
    { n: 3, status: "IN_PROGRESS", priority: "MEDIUM", days: 3, who: adria.id },
    { n: 4, status: "TODO", priority: "HIGH", days: 5, who: shiling.id },
    { n: 5, status: "TODO", priority: "MEDIUM", days: 6, who: adria.id },
    { n: 6, status: "TODO", priority: "MEDIUM", days: 8, who: shiling.id },
    { n: 7, status: "TODO", priority: "LOW", days: 9, who: adria.id },
    { n: 8, status: "TODO", priority: "MEDIUM", days: 11, who: shiling.id },
    { n: 9, status: "TODO", priority: "HIGH", days: 12, who: adria.id },
    { n: 10, status: "TODO", priority: "MEDIUM", days: 14, who: shiling.id },
  ];

  for (const p of pieces) {
    const nn = String(p.n).padStart(2, "0");
    await ensureTask({
      title: `Northdeco · Producto 3D #${nn}`,
      description: `Modelar, texturizar y exportar (GLB + USDZ) el producto #${nn} del catálogo de northdeco.com. Incluir miniatura de revisión.`,
      projectId: project.id,
      assigneeId: p.who,
      status: p.status,
      priority: p.priority,
      dueOffsetDays: p.days,
      order: p.n,
      actorId,
    });
  }

  const total = await prisma.task.count({ where: { projectId: project.id } });
  console.log(`✔ Proyecto «${project.name}» con ${total} tareas. Equipo 3D: ${adria.email}, ${shiling.email} (contraseña: Diseno1234)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
