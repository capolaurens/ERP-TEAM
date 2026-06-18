import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { clientToggleApproval } from "../actions";

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
    where: { projectId, textureApprovedAt: { not: null } },
    include: { modelImages: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ clientApprovedAt: "asc" }, { textureApprovedAt: "desc" }],
  });

  const pending = pieces.filter((p) => !p.clientApprovedAt).length;

  return (
    <div className="space-y-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver a tus proyectos
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-muted-foreground">
          {pieces.length} pieza{pieces.length === 1 ? "" : "s"} terminada
          {pieces.length === 1 ? "" : "s"}
          {pending > 0 ? ` · ${pending} pendiente${pending === 1 ? "" : "s"} de tu visto bueno` : " · todo validado ✓"}
        </p>
      </div>

      {pieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Todavía no hay piezas terminadas para revisar. Te avisaremos cuando
          estén listas.
        </div>
      ) : (
        <div className="space-y-4">
          {pieces.map((t) => {
            const ok = !!t.clientApprovedAt;
            return (
              <div
                key={t.id}
                className={
                  "rounded-xl border bg-card p-4 shadow-sm " +
                  (ok ? "border-green-300" : "border-border")
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.title}</h3>
                  {ok ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                      <Check className="size-3.5" /> Validado por ti
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Pendiente de tu visto bueno
                    </span>
                  )}
                </div>

                {t.modelImages.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {t.modelImages.map((im) => (
                      <a
                        key={im.id}
                        href={`/api/model-image/${im.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="overflow-hidden rounded-lg border border-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/model-image/${im.id}`}
                          alt="pieza"
                          className="aspect-square w-full bg-muted object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    (Sin imágenes adjuntas)
                  </p>
                )}

                <form action={clientToggleApproval} className="mt-3">
                  <input type="hidden" name="taskId" value={t.id} />
                  {ok ? (
                    <Button type="submit" variant="outline" size="sm">
                      Quitar mi validación
                    </Button>
                  ) : (
                    <Button type="submit" size="sm">
                      <ShieldCheck className="size-4" /> Validar pieza
                    </Button>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
