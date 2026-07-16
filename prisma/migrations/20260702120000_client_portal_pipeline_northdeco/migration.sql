-- Drift consolidado (aplicado previamente con `prisma db push`):
-- portal cliente (checks propios + gate) · envíos del equipo · revisión pública Northdeco

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "clientMeshAt" TIMESTAMP(3),
ADD COLUMN "clientTextureAt" TIMESTAMP(3),
ADD COLUMN "showToClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "meshSubmittedAt" TIMESTAMP(3),
ADD COLUMN "textureSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NorthdecoReview" (
    "file" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NorthdecoReview_pkey" PRIMARY KEY ("file")
);

-- CreateTable
CREATE TABLE "NorthdecoComment" (
    "id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "author" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NorthdecoComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NorthdecoComment_file_idx" ON "NorthdecoComment"("file");
