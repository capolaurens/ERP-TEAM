-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "scheduledAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramPost_order_idx" ON "InstagramPost"("order");

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
