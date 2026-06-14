-- AlterTable: Robokassa card binding fields on User
ALTER TABLE "User" ADD COLUMN     "cardBound" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN     "cardLast4" TEXT;
ALTER TABLE "User" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN     "recurringParentInvId" INTEGER;

-- CreateTable
CREATE TABLE "Payment" (
    "invId" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isRecurringInit" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("invId")
);

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
