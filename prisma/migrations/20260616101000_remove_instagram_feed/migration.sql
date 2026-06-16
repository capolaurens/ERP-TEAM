/*
  Warnings:

  - You are about to drop the `InstagramPost` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "InstagramPost" DROP CONSTRAINT "InstagramPost_createdById_fkey";

-- DropTable
DROP TABLE "InstagramPost";
