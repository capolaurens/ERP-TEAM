import { FolderKanban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectCard } from "./project-card";

export default async function ProyectosPage() {
  const user = await requireAuth();
  const teams = visibleTeams(user);
  const projects = await prisma.project.findMany({
    where: { team: { in: teams } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { tasks: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos</h1>
          <p className="text-muted-foreground">
            Agrupa las tareas por proyecto o área de trabajo.
          </p>
        </div>
        <ProjectCreateForm role={user.role} team={user.team} />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <FolderKanban className="size-8" />
            <p>Todavía no hay proyectos. Crea el primero con «Nuevo proyecto».</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={{
                id: p.id,
                name: p.name,
                description: p.description,
                team: p.team,
                status: p.status,
                taskCount: p._count.tasks,
                websiteUrl: p.websiteUrl,
                logoUrl: p.logoUrl,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
