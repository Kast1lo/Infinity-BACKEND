-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sharePasswordHash" TEXT,
ADD COLUMN     "shareSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Folder_shareSlug_key" ON "Folder"("shareSlug");
