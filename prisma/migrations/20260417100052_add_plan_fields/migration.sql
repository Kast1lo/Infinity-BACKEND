-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "planType" TEXT NOT NULL DEFAULT 'eternal',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "usedById" TEXT,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "googleId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationCode" TEXT,
    "verificationCodeExpiresAt" DATETIME,
    "planType" TEXT NOT NULL DEFAULT 'spark',
    "planExpiresAt" DATETIME,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenAt" DATETIME,
    "storageUsed" BIGINT NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("avatarKey", "createdAt", "email", "googleId", "id", "isVerified", "passwordHash", "updatedAt", "username", "verificationCode", "verificationCodeExpiresAt") SELECT "avatarKey", "createdAt", "email", "googleId", "id", "isVerified", "passwordHash", "updatedAt", "username", "verificationCode", "verificationCodeExpiresAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_planType_idx" ON "User"("planType");
CREATE INDEX "User_planExpiresAt_idx" ON "User"("planExpiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_usedById_key" ON "PromoCode"("usedById");

-- CreateIndex
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_usedById_idx" ON "PromoCode"("usedById");
