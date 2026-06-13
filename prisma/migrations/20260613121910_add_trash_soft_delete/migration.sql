-- AlterTable
ALTER TABLE "File" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "File_ownerId_deletedAt_idx" ON "File"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Folder_ownerId_deletedAt_idx" ON "Folder"("ownerId", "deletedAt");
