import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { extractDriveFileId } from "@/lib/drive";
import { PieceActions } from "./piece-actions";
import { PortalFilters, DEFAULT_FILTER } from "./portal-filters";
import { SortHeader } from "./sort-header";
import { ClientCheck, AdminPieceCells, ShowToggle } from "./toggles";

export default async function PortalProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ f?: string; q?: string; sort?: string; dir?: string }>;
}) {
  const { projectId } = await params;
  const { f, q, sort, dir } = await searchParams;
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

  type Piece = (typeof pieces)[number];
  const hasModel = (t: Piece) => !!extractDriveFileId(t.driveUrl);
  const clientValidated = (t: Piece) => !!t.clientMeshAt && !!t.clientTextureAt;
  // Rango del ESTADO para ordenar: 0 = falta lo nuestro, 1 = pendiente cliente
  // (0/2), 2 = falta uno del cliente, 3 = completo.
  const statusRank = (t: Piece): number => {
    const mesh = !!t.meshApprovedAt;
    const tex = !!t.textureApprovedAt;
    if (!mesh || !tex) return 0;
    const cm = !!t.clientMeshAt;
    const ct = !!t.clientTextureAt;
    if (!cm && !ct) return 1;
    if (!cm || !ct) return 2;
    return 3;
  };

  // El cliente solo ve las piezas que el admin ha abierto (showToClient).
  // El admin ve todas (para poder abrirlas/cerrarlas).
  const base = isAdmin ? pieces : pieces.filter((t) => t.showToClient);

  const counts: Record<string, number> = {
    "con-modelo": base.filter(hasModel).length,
    "por-validar": base.filter((t) => hasModel(t) && !clientValidated(t)).length,
    validadas: base.filter(clientValidated).length,
    todas: base.length,
  };

  const filter = f ?? DEFAULT_FILTER;
  const query = (q ?? "").trim();
  let visible = base.filter((t) => {
    if (filter === "con-modelo") return hasModel(t);
    if (filter === "por-validar") return hasModel(t) && !clientValidated(t);
    if (filter === "validadas") return clientValidated(t);
    return true; // "todas"
  });
  if (query) {
    const ql = query.toLowerCase();
    visible = visible.filter((t) => t.title.toLowerCase().includes(ql));
  }
  // Ordenación por columna (si se pidió); si no, prioridad a las que tienen
  // modelo (LINK DRIVE), luego categoría/título.
  const sortKey = (t: Piece): string | number => {
    switch (sort) {
      case "listado":
        return t.title.toLowerCase();
      case "categoria":
        return (t.category ?? "").toLowerCase();
      case "web":
        return t.referenceUrl ? 1 : 0;
      case "drive":
        return hasModel(t) ? 1 : 0;
      case "malla":
        return (isAdmin ? t.meshApprovedAt : t.clientMeshAt) ? 1 : 0;
      case "textura":
        return (isAdmin ? t.textureApprovedAt : t.clientTextureAt) ? 1 : 0;
      case "gate":
        return t.showToClient ? 1 : 0;
      case "estado":
        return statusRank(t);
      default:
        return 0;
    }
  };
  if (sort) {
    const s = dir === "desc" ? -1 : 1;
    visible = [...visible].sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka < kb) return -1 * s;
      if (ka > kb) return 1 * s;
      return a.title.localeCompare(b.title); // desempate estable
    });
  } else {
    visible = [...visible].sort(
      (a, b) =>
        (hasModel(b) ? 1 : 0) - (hasModel(a) ? 1 : 0) ||
        (a.category ?? "").localeCompare(b.category ?? "") ||
        a.title.localeCompare(b.title),
    );
  }

  const shownCount = pieces.filter((t) => t.showToClient).length;
  const validatedCount = base.filter(clientValidated).length;

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
        {isAdmin ? (
          <p className="max-w-3xl text-muted-foreground">
            Vista de administrador ({pieces.length} piezas · {shownCount}{" "}
            abiertas al cliente). Marca <strong>Malla</strong> y{" "}
            <strong>Textura</strong> cuando el equipo las entregue (desbloquea
            el visto bueno del cliente) y usa <strong>Tu validación</strong>{" "}
            para abrir u ocultar cada pieza al cliente. La columna{" "}
            <strong>Estado</strong> resume si falta algo nuestro, si falta el
            cliente o si está completo.
          </p>
        ) : (
          <p className="max-w-3xl text-muted-foreground">
            {base.length} piezas · {validatedCount} validadas por ti. Abre{" "}
            <strong>Ver 3D</strong>, compáralo con las fotos y marca{" "}
            <strong>Malla</strong> y <strong>Textura</strong> cuando lo des por
            bueno. Si algo no encaja, usa <strong>Solicitar cambios</strong>.
          </p>
        )}
      </div>

      {base.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          {isAdmin
            ? "Todavía no hay piezas en este proyecto."
            : "Todavía no hay piezas disponibles para revisar."}
        </div>
      ) : (
        <>
          <PortalFilters counts={counts} current={filter} query={query} />
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              Ninguna pieza coincide con este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <SortHeader col="listado" label="Listado" />
                    <SortHeader col="web" label="Link web" />
                    <SortHeader col="categoria" label="Categoría" />
                    {isAdmin && <SortHeader col="drive" label="Link Drive" />}
                    <th className="border-b border-border px-3 py-2 text-center">
                      Modelo 3D
                    </th>
                    <SortHeader
                      col="malla"
                      label="Malla"
                      align="center"
                      thClassName="bg-green-50 text-center"
                    />
                    <SortHeader
                      col="textura"
                      label="Textura"
                      align="center"
                      thClassName="bg-green-50 text-center"
                    />
                    {isAdmin && (
                      <SortHeader
                        col="estado"
                        label="Estado"
                        align="center"
                        thClassName="text-center"
                      />
                    )}
                    {isAdmin && (
                      <SortHeader
                        col="gate"
                        label="Tu validación"
                        align="center"
                        thClassName="bg-amber-50 text-center"
                      />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const hasM = hasModel(t);
                    return (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="border-b border-border px-3 py-2 font-medium">
                          {t.title}
                        </td>
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
                        {isAdmin && (
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
                        )}
                        <td className="border-b border-border px-3 py-2">
                          <PieceActions
                            taskId={t.id}
                            title={t.title}
                            hasModel={hasM}
                            changesRequested={t.changesRequested}
                            webUrl={t.referenceUrl}
                          />
                        </td>
                        {isAdmin ? (
                          <AdminPieceCells
                            taskId={t.id}
                            meshDelivered={!!t.meshApprovedAt}
                            textureDelivered={!!t.textureApprovedAt}
                            clientMesh={!!t.clientMeshAt}
                            clientTexture={!!t.clientTextureAt}
                          />
                        ) : (
                          <>
                            <td className="border-b border-border bg-green-50/40 px-3 py-2">
                              <ClientCheck
                                taskId={t.id}
                                kind="mesh"
                                initialOn={!!t.clientMeshAt}
                                locked={!t.meshApprovedAt}
                              />
                            </td>
                            <td className="border-b border-border bg-green-50/40 px-3 py-2">
                              <ClientCheck
                                taskId={t.id}
                                kind="texture"
                                initialOn={!!t.clientTextureAt}
                                locked={!t.textureApprovedAt}
                              />
                            </td>
                          </>
                        )}
                        {isAdmin && (
                          <td className="border-b border-border bg-amber-50/40 px-3 py-2">
                            <ShowToggle taskId={t.id} initialOn={t.showToClient} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
