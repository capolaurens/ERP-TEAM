import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || user;

export function isEmailConfigured(): boolean {
  return !!(host && user && pass);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export function appUrl(path = ""): string {
  const base = (process.env.AUTH_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  return base + path;
}

/** Envía un email. Best-effort: si no está configurado el SMTP, no hace nada. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    await getTransporter().sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (e) {
    console.error("Error enviando email:", e);
  }
}

/** Plantilla simple y consistente para los avisos del ERP. */
export function emailLayout(title: string, body: string, ctaUrl?: string): string {
  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <div style="background:#0f172a;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:600">ERP Navyx</div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:20px">
      <h2 style="margin:0 0 8px;font-size:18px">${title}</h2>
      <p style="margin:0 0 16px;color:#475569;line-height:1.5">${body}</p>
      ${
        ctaUrl
          ? `<a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:500">Abrir en el ERP</a>`
          : ""
      }
    </div>
  </div>`;
}
