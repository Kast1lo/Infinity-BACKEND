-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_fileId_idx" ON "TaskAttachment"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_taskId_fileId_key" ON "TaskAttachment"("taskId", "fileId");

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
