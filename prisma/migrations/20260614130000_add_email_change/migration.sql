-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "emailChangeCode" TEXT,
ADD COLUMN     "emailChangeCodeExpiresAt" TIMESTAMP(3);
