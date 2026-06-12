import { requireAuth } from "@/lib/session";
import { ROLE_LABELS, TEAM_LABELS, roleTeam } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePasswordForm } from "./profile-password-form";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default async function PerfilPage() {
  const user = await requireAuth();
  const team = user.team ?? roleTeam(user.role);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi perfil</h1>
        <p className="text-muted-foreground">Tus datos y seguridad.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Nombre" value={user.name ?? "—"} />
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Rol" value={ROLE_LABELS[user.role]} />
          <Row label="Equipo" value={team ? TEAM_LABELS[team] : "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfilePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
