import "dotenv/config";
import fs from "node:fs";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "../lib/google-credentials";

// ALTA INCREMENTAL en la galería /northdeco.
//
// USO:  npx tsx scripts/alta-northdeco.ts [díasVentana=3]   (y después: git add+commit+push)
//
// Reglas de Drive para que un modelo "exista":
//   · una carpeta por SKU llamada exactamente "ND-XXXX" dentro de NORTHDECO
//   · el GLB dentro: "ND-XXXX.glb" (único) o "ND-XXXX - Variante.glb" (variantes)
//
// Qué hace:
//  1) Si alguien creó una carpeta-variante suelta ("ND-XXXX-COLOR"), mueve su GLB
//     a la carpeta del SKU (creándola si no existe) y manda la suelta a la papelera.
//  2) Da de alta los GLB de SKUs nuevos; de SKUs ya publicados solo archivos
//     subidos en los últimos N días (las variantes viejas no publicadas se
//     revisan aparte: puede haber versiones antiguas).
//  3) Añade las entradas AL FINAL del manifest (no reordena lo existente) y
//     cruza foto/url/variante por variant.sku del catálogo Shopify.

const NORTHDECO = process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";
const MANIFEST = "public/northdeco/manifest.json";
const DIAS = Number(process.argv[2] ?? 3);
const CUTOFF = Date.now() - DIAS * 86_400_000;

type Entry = {
  file: string;
  fam: string;
  name: string;
  status: string;
  driveId: string;
  modifiedTime?: string;
  img?: string | null;
  url?: string | null;
  variant?: string | null;
};

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new googleAuth.GoogleAuth({
  credentials: creds!,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = driveApi({ version: "v3", auth });

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
const famOf = (name: string) => (name.match(/ND-\d+/i) ?? [""])[0].toUpperCase();

type ShopVariant = {
  id: number;
  title: string;
  sku?: string | null;
  featured_image?: { src?: string } | null;
};
type ShopProduct = {
  handle: string;
  title: string;
  variants: ShopVariant[];
  images?: { src: string }[];
};

async function catalog(): Promise<ShopProduct[]> {
  const all: ShopProduct[] = [];
  for (let page = 1; page <= 8; page++) {
    const r = await fetch(`https://northdeco.com/products.json?limit=250&page=${page}`);
    if (!r.ok) break;
    const data = (await r.json()) as { products: ShopProduct[] };
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

/** Producto cuya ALGUNA variante tenga sku == fam o sku que empiece por "fam-". */
function productOf(products: ShopProduct[], fam: string) {
  return products.find((p) =>
    p.variants.some((v) => {
      const sku = (v.sku ?? "").toUpperCase();
      return sku === fam || sku.startsWith(fam + "-");
    }),
  );
}

function variantOf(p: ShopProduct, variantSku: string) {
  const target = variantSku.toUpperCase();
  return (
    p.variants.find((v) => (v.sku ?? "").toUpperCase() === target) ??
    p.variants.find((v) => (v.sku ?? "").toUpperCase() === target.replace(/#\d+$/, ""))
  );
}

async function listFolder(folderId: string) {
  const r = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,modifiedTime)",
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
  });
  return (r.data.files ?? []) as { id: string; name: string; modifiedTime?: string }[];
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Entry[];
  const fams = new Set(manifest.map((m) => m.fam.toUpperCase()));
  const products = await catalog();
  console.log(`Catálogo Shopify: ${products.length} productos`);

  // ---- carpetas de la unidad
  const folders: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await drive.files.list({
      q: `'${NORTHDECO}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });
    folders.push(...((r.data.files ?? []) as { id: string; name: string }[]));
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  const folderBySku = new Map(
    folders
      .filter((f) => /^ND-\d+\s*[✅🟡]?\s*$/.test(f.name.trim()) || /^ND-\d+$/.test(famOf(f.name)) && f.name.trim().replace(/[✅🟡]/g, "").trim() === famOf(f.name))
      .map((f) => [famOf(f.name), f]),
  );

  // ---- 1) ordenar las carpetas-variante de HOY (mover GLB a la carpeta del SKU)
  const strayFolders = folders.filter(
    (f) => !f.name.startsWith("_") && famOf(f.name) && f.name.replace(/[✅🟡]/g, "").trim() !== famOf(f.name),
  );
  for (const sf of strayFolders) {
    const fam = famOf(sf.name);
    let home = folderBySku.get(fam);
    if (!home) {
      const c = await drive.files.create({
        requestBody: { name: fam, mimeType: "application/vnd.google-apps.folder", parents: [NORTHDECO] },
        fields: "id,name",
        supportsAllDrives: true,
      });
      home = { id: c.data.id!, name: fam };
      folderBySku.set(fam, home);
      console.log(`📁 creada carpeta base ${fam}`);
    }
    const files = await listFolder(sf.id);
    for (const g of files) {
      const sufijo = sf.name.replace(/[✅🟡]/g, "").trim().slice(fam.length).replace(/^[-_ ]+/, "");
      const newName = `${fam} - ${sufijo}.glb`;
      await drive.files.update({
        fileId: g.id,
        requestBody: { name: newName },
        addParents: home.id,
        removeParents: sf.id,
        supportsAllDrives: true,
      });
      console.log(`📦 ${g.name} → carpeta ${home.name} como "${newName}"`);
    }
    const left = await listFolder(sf.id);
    if (!left.length) {
      await drive.files.update({
        fileId: sf.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      console.log(`🗑 carpeta "${sf.name}" vacía → papelera`);
    }
  }

  // ---- 2) alta de todo lo que falte (re-listar tras los movimientos)
  const nuevos: Entry[] = [];
  for (const f of folders) {
    if (f.name.startsWith("_")) continue;
    const fam = famOf(f.name);
    if (!fam) continue;
    const isBase = f.name.replace(/[✅🟡]/g, "").trim() === fam;
    if (!isBase) continue; // las sueltas ya se vaciaron
    const famEsNuevo = !fams.has(fam);
    let glbs = (await listFolder(f.id)).filter((g) => g.name.toLowerCase().includes("glb") || !g.name.includes("."));
    // SKUs ya publicados: solo archivos recientes (ventana en días por argv);
    // las variantes antiguas no publicadas se revisan aparte (puede haber versiones viejas).
    if (!famEsNuevo) glbs = glbs.filter((g) => g.modifiedTime && Date.parse(g.modifiedTime) >= CUTOFF);
    const product = productOf(products, fam);
    for (const g of glbs) {
      // clave estable a partir del nombre del archivo
      const stem = g.name.replace(/\.glb$/i, "");
      const sufijo = stem.includes(" - ") ? stem.split(" - ").slice(1).join(" - ") : "";
      const fileKey = sufijo ? `${fam}__${safe(sufijo)}.glb` : `${fam}.glb`;
      if (manifest.some((m) => m.file === fileKey) || nuevos.some((m) => m.file === fileKey)) {
        if (fams.has(fam)) continue; // ya estaba de alta
        continue;
      }
      if (fams.has(fam) && !sufijo) continue; // archivo base de un SKU ya presente

      // solo damos de alta archivos de SKUs nuevos o variantes nuevas de hoy
      const already = manifest.some((m) => m.driveId === g.id);
      if (already) continue;

      let img: string | null = null;
      let url: string | null = null;
      let variant: string | null = null;
      let name = fam;
      if (product) {
        name = product.title;
        url = `https://northdeco.com/products/${product.handle}`;
        img = product.images?.[0]?.src ?? null;
        const variantSku = sufijo && /^ND-/i.test(sufijo) ? sufijo : sufijo ? `${fam}-${sufijo}` : fam;
        const v = variantOf(product, variantSku.replace(/\s+/g, "-"));
        if (v) {
          variant = v.title !== "Default Title" ? v.title : null;
          url = `https://northdeco.com/products/${product.handle}?variant=${v.id}`;
          if (v.featured_image?.src) img = v.featured_image.src;
        } else if (sufijo) {
          variant = sufijo.replace(/^ND-\d+-/i, "").replace(/#\d+$/, "").replace(/-/g, " ");
        }
      } else if (sufijo) {
        variant = sufijo.replace(/^ND-\d+-/i, "").replace(/#\d+$/, "").replace(/-/g, " ");
      }

      nuevos.push({
        file: fileKey,
        fam,
        name,
        status: "listo",
        driveId: g.id,
        modifiedTime: g.modifiedTime,
        img,
        url,
        variant,
      });
    }
  }

  nuevos.sort((a, b) => a.fam.localeCompare(b.fam) || a.file.localeCompare(b.file));
  for (const n of nuevos) {
    console.log(
      `➕ ${n.fam} · ${n.name}${n.variant ? ` [${n.variant}]` : ""} ${n.img ? "📷" : "sin-foto"} ${n.url ? "🔗" : ""}`,
    );
  }

  fs.writeFileSync(MANIFEST, JSON.stringify([...manifest, ...nuevos]) + "\n");
  console.log(`\nManifest: ${manifest.length} existentes + ${nuevos.length} nuevas = ${manifest.length + nuevos.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
