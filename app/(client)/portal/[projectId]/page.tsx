import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { clientToggleApproval } from "../actions";

function CheckCell({ on }: { on: boolean }) {
  return (
    <div className="flex justify-center">
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded border",
          on ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/40 bg-white",
        )}
      >
        {on && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </div>
  );
}

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireAuth();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clientUsers: { select: { id: true } } },
  });
  if (!project) notFound();
  const isAdmin = user.role === "ADMIN";
  const linked = project.clientUsers.some((c) => c.id === user.id);
  if (!isAdmin && !linked) notFound();

  const pieces = await prisma.task.findMany({
    where: { projectId },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  const done = pieces.filter((p) => p.textureApprovedAt).length;
  const validated = pieces.filter((p) => p.clientApprovedAt).length;

  return (
    <div className="space-y-4">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver a tus proyectos
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-muted-foreground">
          {pieces.length} piezas · {done} terminadas · {validated} validadas por ti.
          Marca la última casilla cuando des tu visto bueno.
        </p>
      </div>

      {pieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Todavía no hay piezas en este proyecto.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border px-3 py-2">Listado</th>
                <th className="border-b border-border px-3 py-2">Link web</th>
                <th className="border-b border-border px-3 py-2">Categoría</th>
                <th className="border-b border-border px-3 py-2 text-center">Malla</th>
                <th className="border-b border-border px-3 py-2 text-center">Textura</th>
                <th className="border-b border-border px-3 py-2">Link Drive</th>
                <th className="border-b border-border bg-amber-50 px-3 py-2 text-center">
                  Tu visto bueno
                </th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((t) => {
                const clientOk = !!t.clientApprovedAt;
                const canValidate = !!t.textureApprovedAt;
                return (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="border-b border-border px-3 py-2 font-medium">{t.title}</td>
                    <td className="border-b border-border px-3 py-2">
                      {t.referenceUrl ? (
                        <a
                          href={t.referenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5" /> Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2 text-muted-foreground">
                      {t.category ?? "—"}
                    </td>
                    <td className="border-b border-border px-3 py-2">
                      <CheckCell on={!!t.meshApprovedAt} />
                    </td>
                    <td className="border-b border-border px-3 py-2">
                      <CheckCell on={!!t.textureApprovedAt} />
                    </td>
                    <td className="border-b border-border px-3 py-2">
                      {t.driveUrl ? (
                        <a
                          href={t.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5" /> Abrir
                        </a>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="border-b border-border bg-amber-50/40 px-3 py-2">
                      <form action={clientToggleApproval} className="flex justify-center">
                        <input type="hidden" name="taskId" value={t.id} />
                        <button
                          type="submit"
                          disabled={!canValidate}
                          title={
                            !canValidate
                              ? "Disponible cuando la pieza esté terminada"
                              : clientOk
                                ? "Quitar tu visto bueno"
                                : "Dar tu visto bueno"
                          }
                          className={cn(
                            "flex size-5 items-center justify-center rounded border transition",
                            clientOk
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-muted-foreground/50 bg-white hover:border-green-600",
                            !canValidate && "cursor-not-allowed opacity-30",
                          )}
                        >
                          {clientOk && <Check className="size-3.5" strokeWidth={3} />}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
