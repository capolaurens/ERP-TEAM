-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "referenceUrl" TEXT;
