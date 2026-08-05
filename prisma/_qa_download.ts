import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as gauth } from "@googleapis/drive";
import { parseServiceAccount } from "../lib/google-credentials";

const SCRATCH = "/private/tmp/claude-501/-Users-lorenzoscianca-projects-navyx-saas/9e4dcfb0-5d41-41fe-a62c-ecb51be73b74/scratchpad/qa3d";
const LIMIT = parseInt(process.env.LIMIT ?? "9999", 10);
const safe = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 80);

async function main() {
  const manifest = JSON.parse(fs.readFileSync("public/northdeco/manifest.json", "utf8")) as any[];
  const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)!;
  const auth = new gauth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = driveApi({ version: "v3", auth });

  const entries: any[] = [];
  const slice = manifest.slice(0, LIMIT);
  let i = 0, dl = 0, fdl = 0;
  for (const m of slice) {
    const key = `${String(i).padStart(3, "0")}_${safe(m.fam)}`;
    i++;
    const glbPath = path.join(SCRATCH, "glb", key + ".glb");
    const fotoPath = path.join(SCRATCH, "foto", key + ".jpg");
    entries.push({ key, fam: m.fam, name: m.name, file: m.file, status: m.status });

    if (!fs.existsSync(glbPath)) {
      try {
        const res = await drive.files.get({ fileId: m.driveId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
        fs.writeFileSync(glbPath, Buffer.from(res.data as ArrayBuffer));
        dl++;
      } catch (e: any) { console.log("GLB FALLO", m.fam, e.message); }
    }
    if (!fs.existsSync(fotoPath) && m.img) {
      try {
        const r = await fetch(m.img + (m.img.includes("?") ? "&" : "?") + "width=700");
        if (r.ok) { fs.writeFileSync(fotoPath, Buffer.from(await r.arrayBuffer())); fdl++; }
      } catch { /* sin foto */ }
    }
    if (i % 20 === 0) console.log(`… ${i}/${slice.length}`);
  }
  fs.writeFileSync(path.join(SCRATCH, "models.json"), JSON.stringify(entries, null, 1));
  console.log(`hecho: ${entries.length} entradas · glb bajados ahora: ${dl} · fotos: ${fdl}`);
}
main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
