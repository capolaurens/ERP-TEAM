import "dotenv/config";
import fs from "node:fs";
import { syncNorthdecoFolderBadge } from "../lib/northdeco-badges";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("public/northdeco/manifest.json", "utf8")) as { file: string; fam: string }[];
  const porFam = new Map<string, string>();
  for (const m of manifest) if (!porFam.has(m.fam)) porFam.set(m.fam, m.file);
  console.log("familias a sincronizar:", porFam.size);
  let done = 0, err = 0;
  for (const [fam, file] of porFam) {
    try { await syncNorthdecoFolderBadge(file); done++; }
    catch (e: any) { err++; console.log("fallo", fam, e.message); }
  }
  console.log(`sincronizadas: ${done} · fallos: ${err}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
