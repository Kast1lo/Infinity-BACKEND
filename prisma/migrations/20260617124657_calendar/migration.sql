-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "date" DATE;

-- CreateTable
CREATE TABLE "CalendarTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarTask_userId_date_idx" ON "CalendarTask"("userId", "date");

-- CreateIndex
CREATE INDEX "Note_userId_date_idx" ON "Note"("userId", "date");

-- AddForeignKey
ALTER TABLE "CalendarTask" ADD CONSTRAINT "CalendarTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
