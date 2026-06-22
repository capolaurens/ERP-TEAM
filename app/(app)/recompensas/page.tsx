import { Coins, Check, X, Plus, Trash2, Power, Gift } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import {
  REWARD_KINDS,
  REWARD_KIND_LABELS,
  REWARD_KIND_BADGE,
  REDEMPTION_STATUS_LABELS,
  REDEMPTION_STATUS_BADGE,
} from "@/lib/rewards";
import {
  createReward,
  toggleReward,
  deleteReward,
  awardPoints,
  redeemReward,
  decideRedemption,
} from "./actions";

export default async function RecompensasPage() {
  const user = await requireAuth();
  const isAdmin = user.role === "ADMIN";

  const [balanceAgg, activeRewards, myRedemptions] = await Promise.all([
    prisma.pointsEntry.aggregate({ where: { userId: user.id }, _sum: { points: true } }),
    prisma.reward.findMany({ where: { active: true }, orderBy: { costPoints: "asc" } }),
    prisma.redemption.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const balance = balanceAgg._sum.points ?? 0;

  const adminData = isAdmin
    ? await (async () => {
        const [allRewards, pending, members, grouped] = await Promise.all([
          prisma.reward.findMany({ orderBy: [{ active: "desc" }, { costPoints: "asc" }] }),
          prisma.redemption.findMany({
            where: { status: "PENDING" },
            include: { user: true },
            orderBy: { createdAt: "asc" },
          }),
          prisma.user.findMany({
            where: { active: true, role: { not: "CLIENT" } },
            orderBy: { name: "asc" },
          }),
          prisma.pointsEntry.groupBy({ by: ["userId"], _sum: { points: true } }),
        ]);
        const balanceMap = new Map(grouped.map((g) => [g.userId, g._sum.points ?? 0]));
        return { allRewards, pending, members, balanceMap };
      })()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recompensas</h1>
          <p className="text-muted-foreground">
            Gana puntos por tu trabajo y canjéalos por mejoras.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
          <Coins className="size-5" />
          <span className="text-2xl font-bold tabular-nums">{balance}</span>
          <span className="text-sm font-medium">puntos</span>
        </div>
      </div>

      {/* Catálogo */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Catálogo de recompensas
        </h2>
        {activeRewards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            <Gift className="size-7" />
            Aún no hay recompensas.{" "}
            {isAdmin ? "Crea la primera abajo 👇" : "Tu equipo las añadirá pronto."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeRewards.map((r) => {
              const afford = balance >= r.costPoints;
              return (
                <Card key={r.id}>
                  <CardContent className="flex h-full flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={REWARD_KIND_BADGE[r.kind]}>
                        {REWARD_KIND_LABELS[r.kind]}
                      </Badge>
                      <span className="flex items-center gap-1 font-bold text-primary">
                        <Coins className="size-4" />
                        {r.costPoints}
                      </span>
                    </div>
                    <h3 className="font-semibold">{r.title}</h3>
                    {r.description && (
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                    )}
                    <form action={redeemReward} className="mt-auto pt-2">
                      <input type="hidden" name="rewardId" value={r.id} />
                      <Button type="submit" size="sm" disabled={!afford} className="w-full">
                        {afford ? "Canjear" : `Te faltan ${r.costPoints - balance} pts`}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Mis canjes */}
      {myRedemptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mis canjes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {myRedemptions.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{m.rewardTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.costPoints} pts · {formatRelative(m.createdAt)}
                    </div>
                  </div>
                  <Badge className={REDEMPTION_STATUS_BADGE[m.status]}>
                    {REDEMPTION_STATUS_LABELS[m.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---------- Zona admin ---------- */}
      {isAdmin && adminData && (
        <div className="space-y-6 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gestión (solo admin)
          </h2>

          {/* Solicitudes pendientes */}
          <Card>
            <CardHeader>
              <CardTitle>Solicitudes de canje ({adminData.pending.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {adminData.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {adminData.pending.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-medium">
                          {p.user?.name ?? "Usuario"} · {p.rewardTitle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.costPoints} pts · {formatRelative(p.createdAt)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <form action={decideRedemption}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <Button type="submit" size="sm">
                            <Check className="size-4" /> Aprobar
                          </Button>
                        </form>
                        <form action={decideRedemption}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <Button type="submit" size="sm" variant="outline">
                            <X className="size-4" /> Rechazar
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Dar puntos */}
            <Card>
              <CardHeader>
                <CardTitle>Dar / quitar puntos</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={awardPoints} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1">
                      <span className="text-xs text-muted-foreground">Persona</span>
                      <select
                        name="userId"
                        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      >
                        {adminData.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Puntos (+/−)</span>
                      <Input name="points" type="number" placeholder="10" className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Motivo</span>
                      <Input name="reason" placeholder="3D entregado a tiempo" className="h-9" />
                    </div>
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    <Plus className="size-4" /> Asignar puntos
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Saldos del equipo */}
            <Card>
              <CardHeader>
                <CardTitle>Saldos del equipo</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {adminData.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2">
                      <span>{m.name}</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Coins className="size-3.5 text-primary" />
                        {adminData.balanceMap.get(m.id) ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Crear / gestionar recompensas */}
          <Card>
            <CardHeader>
              <CardTitle>Crear recompensa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={createReward} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                <div className="space-y-1 lg:col-span-1">
                  <span className="text-xs text-muted-foreground">Título</span>
                  <Input name="title" required placeholder="Subir 0,5 la nota" className="h-9" />
                </div>
                <div className="space-y-1 lg:col-span-1">
                  <span className="text-xs text-muted-foreground">Descripción</span>
                  <Input name="description" placeholder="opcional" className="h-9" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Coste (pts)</span>
                  <Input name="costPoints" type="number" min={1} placeholder="100" className="h-9" required />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <select name="kind" defaultValue="GRADE" className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                    {REWARD_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {REWARD_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" className="lg:col-span-4 lg:w-fit">
                  <Plus className="size-4" /> Crear recompensa
                </Button>
              </form>

              {adminData.allRewards.length > 0 && (
                <ul className="divide-y divide-border text-sm">
                  {adminData.allRewards.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="flex items-center gap-2">
                        <Badge className={REWARD_KIND_BADGE[r.kind]}>
                          {REWARD_KIND_LABELS[r.kind]}
                        </Badge>
                        <span className={r.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                          {r.title}
                        </span>
                        <span className="text-xs text-muted-foreground">{r.costPoints} pts</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <form action={toggleReward}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                            title={r.active ? "Desactivar" : "Activar"}
                          >
                            <Power className="size-3.5" /> {r.active ? "Activa" : "Inactiva"}
                          </button>
                        </form>
                        <form action={deleteReward}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-muted-foreground transition hover:text-red-600" title="Eliminar">
                            <Trash2 className="size-4" />
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
