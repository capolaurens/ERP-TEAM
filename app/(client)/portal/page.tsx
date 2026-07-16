import Link from "next/link";
import { FolderOpen, PackageCheck } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function PortalPage() {
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";

  const projects = await prisma.project.findMany({
    where: isAdmin ? {} : { clientUsers: { some: { id: user.id } } },
    orderBy: { name: "asc" },
  });
  const counts = await Promise.all(
    projects.map((p) =>
      prisma.task.count({
        where: { projectId: p.id, textureApprovedAt: { not: null } },
      }),
    ),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tus proyectos</h1>
        <p className="text-muted-foreground">
          Revisa y valida tus productos 3D terminados.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Aún no tienes proyectos asignados. Tu equipo de Navyx te dará acceso.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <Link
              key={p.id}
              href={`/portal/${p.id}`}
              className="group rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {p.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    className="size-11 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderOpen className="size-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate font-semibold transition group-hover:text-primary">
                    {p.name}
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PackageCheck className="size-3.5" /> {counts[i]} pieza
                    {counts[i] === 1 ? "" : "s"} lista{counts[i] === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
