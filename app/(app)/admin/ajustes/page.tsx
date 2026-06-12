import { CheckCircle2, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ALL_TEAMS, TEAM_LABELS } from "@/lib/rbac";
import { isDriveConfigured, getServiceAccountEmail } from "@/lib/drive";
import { getCalendarId } from "@/lib/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateTeamFolder, setCalendarId } from "./actions";

export default async function AjustesPage() {
  await requireAdmin();
  const configured = isDriveConfigured();
  const email = getServiceAccountEmail();
  const rows = await prisma.teamDriveFolder.findMany();
  const byTeam: Record<string, string> = Object.fromEntries(
    rows.map((r) => [r.team, r.driveFolderId]),
  );
  const calendarId = await getCalendarId();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ajustes</h1>
        <p className="text-muted-foreground">
          Conexión con Google Drive y carpetas de archivos por equipo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conexión con Google Drive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {configured ? (
            <div className="flex items-center gap-2 font-medium text-green-700">
              <CheckCircle2 className="size-4" /> Conectado con la cuenta de
              servicio.
            </div>
          ) : (
            <div className="flex items-center gap-2 font-medium text-amber-700">
              <AlertCircle className="size-4" /> Aún no conectado: falta la
              variable de entorno <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>.
            </div>
          )}
          {email && (
            <>
              <p className="text-muted-foreground">
                Comparte cada carpeta de Drive (permiso de <strong>Editor</strong>)
                con esta cuenta de servicio:
              </p>
              <code className="block rounded bg-muted px-2 py-1.5 text-xs">
                {email}
              </code>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carpetas por equipo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pega el ID de la carpeta de Drive de cada equipo. Lo encuentras en la
            URL de la carpeta: <code>drive.google.com/drive/folders/&lt;ID&gt;</code>
          </p>
          {ALL_TEAMS.map((team) => (
            <form
              key={team}
              action={updateTeamFolder}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="team" value={team} />
              <div className="min-w-60 flex-1 space-y-1.5">
                <Label>{TEAM_LABELS[team]}</Label>
                <Input
                  name="driveFolderId"
                  defaultValue={byTeam[team] ?? ""}
                  placeholder="ID de la carpeta de Drive"
                />
              </div>
              <SubmitButton variant="outline">Guardar</SubmitButton>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Sincroniza las fechas límite de las tareas a un Google Calendar de
            empresa (usa la misma cuenta de servicio). Comparte el calendario con
            la cuenta de servicio (permiso «Hacer cambios en los eventos») y pega
            aquí su ID (en los ajustes del calendario → «Integrar calendario → ID
            del calendario»).
          </p>
          <form action={setCalendarId} className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label>ID del calendario</Label>
              <Input
                name="calendarId"
                defaultValue={calendarId ?? ""}
                placeholder="ejemplo@group.calendar.google.com"
              />
            </div>
            <SubmitButton variant="outline">Guardar</SubmitButton>
          </form>
          {calendarId && (
            <p className="font-medium text-green-700">Calendario configurado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
