-- AlterTable
ALTER TABLE "File" ADD COLUMN     "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sharePasswordHash" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);
