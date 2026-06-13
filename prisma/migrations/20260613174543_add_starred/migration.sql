-- AlterTable
ALTER TABLE "File" ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false;
