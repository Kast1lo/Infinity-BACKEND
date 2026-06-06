-- ============================================================
-- Добавление модели Project + миграция существующих задач/колонок
-- в проект "Мои задачи" для каждого пользователя.
-- ============================================================

-- 1. User: счётчики AI-генераций
ALTER TABLE "User" ADD COLUMN "aiCallsToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "aiCallsResetAt" TIMESTAMP(3);

-- 2. Project: новая таблица
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_userId_idx" ON "Project"("userId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. TaskColumn / Task: добавляем nullable projectId (заполним ниже)
ALTER TABLE "TaskColumn" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task"       ADD COLUMN "projectId" TEXT;

-- 4. Backfill: для каждого юзера, у которого есть колонки или задачи,
--    создаём проект "Мои задачи" и привязываем к нему его колонки и задачи.
DO $$
DECLARE
    u RECORD;
    new_project_id TEXT;
BEGIN
    FOR u IN
        SELECT DISTINCT user_id FROM (
            SELECT "userId" AS user_id FROM "TaskColumn"
            UNION
            SELECT "userId" AS user_id FROM "Task"
        ) all_users
    LOOP
        new_project_id := gen_random_uuid()::TEXT;

        INSERT INTO "Project" ("id", "name", "description", "userId", "createdAt", "updatedAt")
        VALUES (new_project_id, 'Мои задачи', 'Перенесено автоматически', u.user_id, NOW(), NOW());

        UPDATE "TaskColumn" SET "projectId" = new_project_id WHERE "userId" = u.user_id;
        UPDATE "Task"       SET "projectId" = new_project_id WHERE "userId" = u.user_id;
    END LOOP;
END $$;

-- 5. Делаем projectId обязательным
ALTER TABLE "TaskColumn" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Task"       ALTER COLUMN "projectId" SET NOT NULL;

-- 6. Снимаем старый FK и индексы по userId на TaskColumn, удаляем колонку
ALTER TABLE "TaskColumn" DROP CONSTRAINT "TaskColumn_userId_fkey";
DROP INDEX "TaskColumn_userId_idx";
DROP INDEX "TaskColumn_userId_order_idx";
ALTER TABLE "TaskColumn" DROP COLUMN "userId";

-- 7. Новые индексы
CREATE INDEX "TaskColumn_projectId_idx" ON "TaskColumn"("projectId");
CREATE INDEX "TaskColumn_projectId_order_idx" ON "TaskColumn"("projectId", "order");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- 8. Новые FK constraints
ALTER TABLE "TaskColumn" ADD CONSTRAINT "TaskColumn_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
