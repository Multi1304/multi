-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "tenantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "password", "tenantId") SELECT "createdAt", "email", "id", "password", "tenantId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "JobLog_accountId_idx" ON "JobLog"("accountId");

-- CreateIndex
CREATE INDEX "JobLog_type_idx" ON "JobLog"("type");

-- CreateIndex
CREATE INDEX "Account_profileId_idx" ON "Account"("profileId");

-- CreateIndex
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- CreateIndex
CREATE INDEX "Profile_tenantId_idx" ON "Profile"("tenantId");
