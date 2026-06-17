-- CreateEnum
CREATE TYPE "ModelPhase" AS ENUM ('MESH', 'TEXTURE', 'DONE');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PHASE_CHANGED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "changesRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientApprovedAt" TIMESTAMP(3),
ADD COLUMN     "clientApprovedById" TEXT,
ADD COLUMN     "meshApprovedAt" TIMESTAMP(3),
ADD COLUMN     "meshApprovedById" TEXT,
ADD COLUMN     "phase" "ModelPhase" NOT NULL DEFAULT 'MESH',
ADD COLUMN     "textureApprovedAt" TIMESTAMP(3),
ADD COLUMN     "textureApprovedById" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "phase" "ModelPhase";

-- CreateTable
CREATE TABLE "ModelImage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "phase" "ModelPhase" NOT NULL DEFAULT 'MESH',
    "kind" TEXT NOT NULL DEFAULT 'progress',
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelImage_taskId_idx" ON "ModelImage"("taskId");

-- CreateIndex
CREATE INDEX "Task_phase_idx" ON "Task"("phase");

-- AddForeignKey
ALTER TABLE "ModelImage" ADD CONSTRAINT "ModelImage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
