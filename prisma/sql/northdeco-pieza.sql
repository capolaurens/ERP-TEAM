-- Catálogo de la galería 3D de Northdeco en BD (modelo NorthdecoPieza).
--
-- Se aplica A MANO, nunca con `prisma migrate dev`: la BD "local" de este
-- proyecto ES la de producción (DATABASE_URL apunta a Railway).
--
--   npx prisma db execute --file prisma/sql/northdeco-pieza.sql
--   npx prisma generate
--
-- TODO es IF NOT EXISTS a propósito. El contenedor ejecuta
-- `prisma migrate deploy` en cada arranque (CMD del Dockerfile) y railway.json
-- reinicia ON_FAILURE: si algún día alguien envuelve este mismo SQL en una
-- carpeta de migración, un CREATE TABLE no idempotente tumbaría el ERP entero
-- al desplegar. Así se puede aplicar por las dos vías sin romper nada.

CREATE TABLE IF NOT EXISTS "NorthdecoPieza" (
    -- Misma cadena que NorthdecoReview.file / NorthdecoComment.file: es lo que
    -- engancha el feedback del cliente. Nunca se recalcula para una pieza viva.
    "file"          TEXT NOT NULL,
    "fam"           TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'listo',
    "driveId"       TEXT NOT NULL,
    "driveName"     TEXT,
    "modifiedTime"  TIMESTAMP(3),
    -- INTEGER (no BIGINT): NextResponse.json() no serializa BigInt.
    "sizeBytes"     INTEGER,
    "img"           TEXT,
    "url"           TEXT,
    "variant"       TEXT,
    "sku"           TEXT,
    "material"      TEXT,
    "materials"     TEXT[] NOT NULL DEFAULT '{}',
    -- Ocultar en vez de borrar: borrar dejaría huérfanos los comentarios.
    "publicada"     BOOLEAN NOT NULL DEFAULT true,
    -- Orden visual explícito: sin él Postgres no garantiza orden y el catálogo
    -- se baraja entre visitas.
    "orden"         INTEGER NOT NULL DEFAULT 0,
    "creadaEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- DEFAULT además de @updatedAt para que un UPDATE en SQL crudo (o un
    -- INSERT desde psql) no deje la columna a NULL y Prisma reviente al leer.
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NorthdecoPieza_pkey" PRIMARY KEY ("file")
);

CREATE INDEX IF NOT EXISTS "NorthdecoPieza_fam_idx"
    ON "NorthdecoPieza" ("fam");

-- La consulta de la galería: publicadas, ordenadas.
CREATE INDEX IF NOT EXISTS "NorthdecoPieza_publicada_orden_idx"
    ON "NorthdecoPieza" ("publicada", "orden");
