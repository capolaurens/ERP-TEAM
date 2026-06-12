import { calendar as calendarApi, auth as googleAuth } from "@googleapis/calendar";
import { parseServiceAccount } from "@/lib/google-credentials";
import { getSetting, CALENDAR_ID_KEY } from "@/lib/settings";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

/** ¿Hay credenciales de Google? (la cuenta de servicio es la misma que Drive) */
export function isCalendarConfigured(): boolean {
  return !!creds;
}

export async function getCalendarId(): Promise<string | null> {
  const fromDb = await getSetting(CALENDAR_ID_KEY);
  if (fromDb && fromDb.trim()) return fromDb.trim();
  return process.env.GOOGLE_CALENDAR_ID?.trim() || null;
}

function getClient() {
  if (!creds) throw new Error("Google no está configurado.");
  const authClient = new googleAuth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return calendarApi({ version: "v3", auth: authClient });
}

type TaskForEvent = {
  id: string;
  title: string;
  description?: string | null;
  dueDate: Date | null;
  googleEventId?: string | null;
};

/** "YYYY-MM-DD" en UTC para eventos de día completo. */
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Crea o actualiza el evento de Google Calendar de una tarea con fecha límite.
 * Best-effort: si no hay credenciales o calendario, no hace nada. Devuelve el
 * eventId resultante (o el existente) para guardarlo en la tarea.
 */
export async function upsertTaskEvent(
  task: TaskForEvent,
): Promise<string | null> {
  if (!creds || !task.dueDate) return task.googleEventId ?? null;
  const calendarId = await getCalendarId();
  if (!calendarId) return task.googleEventId ?? null;

  const start = dateOnly(task.dueDate);
  const endDate = new Date(task.dueDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const requestBody = {
    summary: `📌 ${task.title}`,
    description: task.description ?? undefined,
    start: { date: start },
    end: { date: dateOnly(endDate) },
  };

  try {
    const client = getClient();
    if (task.googleEventId) {
      const res = await client.events.update({
        calendarId,
        eventId: task.googleEventId,
        requestBody,
      });
      return res.data.id ?? task.googleEventId;
    }
    const res = await client.events.insert({ calendarId, requestBody });
    return res.data.id ?? null;
  } catch (e) {
    console.error("Error sincronizando evento de Calendar:", e);
    return task.googleEventId ?? null;
  }
}

export async function deleteTaskEvent(
  eventId: string | null | undefined,
): Promise<void> {
  if (!creds || !eventId) return;
  const calendarId = await getCalendarId();
  if (!calendarId) return;
  try {
    const client = getClient();
    await client.events.delete({ calendarId, eventId });
  } catch (e) {
    console.error("Error borrando evento de Calendar:", e);
  }
}
