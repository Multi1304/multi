/*
  Warnings:

  - You are about to drop the column `lastUsed` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `prefix` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ApiKey` table. All the data in the column will be lost.
  - The `detail` column on the `AuditLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `createdBy` on the `BulkOperation` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `BulkOperation` table. All the data in the column will be lost.
  - You are about to drop the column `resourceId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `FeatureFlag` table. All the data in the column will be lost.
  - You are about to drop the column `audio` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `canvas` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `clientRects` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `deviceMemory` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `fonts` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `hardwareConcurrency` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `isAiGenerated` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `platformOS` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `plugins` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `screenResolution` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `webgl` on the `FingerprintPreset` table. All the data in the column will be lost.
  - You are about to drop the column `webview` on the `FingerprintPreset` table. All the data in the column will be lost.
  - The `platform` column on the `FingerprintPreset` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `fingerprint` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `invitedBy` on the `Invitation` table. All the data in the column will be lost.
  - You are about to drop the column `attempts` on the `JobLog` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `JobLog` table. All the data in the column will be lost.
  - You are about to drop the column `output` on the `JobLog` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `JobLog` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `dnsPrimary` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `dnsSecondary` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `timezonePolicy` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `timezoneValue` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `webrtcPolicy` on the `NetworkPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `ProxyEndpoint` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `ProxyEndpoint` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProxyEndpoint` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `ProxyEndpoint` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProxyEndpoint` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProxyPool` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `ProxyPool` table. All the data in the column will be lost.
  - You are about to drop the column `rotationStrategy` on the `ProxyPool` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProxyPool` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `TaskBatch` table. All the data in the column will be lost.
  - You are about to drop the column `fingerprintPresetId` on the `TaskTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `ipRotationStrategy` on the `TaskTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `networkPolicyId` on the `TaskTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `proxyPoolId` on the `TaskTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TaskTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordChangedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetTokenExpiresAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `termsAcceptedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `FlowStep` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FlowTrigger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkerNode` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[token]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `authorId` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `flowId` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `config` to the `FingerprintPreset` table without a default value. This is not possible if the table is not empty.
  - Made the column `tenantId` on table `FingerprintPreset` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `steps` to the `Flow` table without a default value. This is not possible if the table is not empty.
  - Made the column `startedAt` on table `FlowRun` required. This step will fail if there are existing NULL values in that column.
  - Made the column `startedAt` on table `FlowRunStep` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `invitedById` to the `Invitation` table without a default value. This is not possible if the table is not empty.
  - Made the column `accountId` on table `JobLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `JobLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `tenantId` to the `ProxyEndpoint` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `TaskBatch` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `slug` to the `Tenant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Tenant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_userId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";

-- DropForeignKey
ALTER TABLE "FeatureFlag" DROP CONSTRAINT "FeatureFlag_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FingerprintPreset" DROP CONSTRAINT "FingerprintPreset_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FlowRun" DROP CONSTRAINT "FlowRun_flowId_fkey";

-- DropForeignKey
ALTER TABLE "FlowRun" DROP CONSTRAINT "FlowRun_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FlowStep" DROP CONSTRAINT "FlowStep_flowId_fkey";

-- DropForeignKey
ALTER TABLE "FlowTrigger" DROP CONSTRAINT "FlowTrigger_flowId_fkey";

-- DropForeignKey
ALTER TABLE "JobLog" DROP CONSTRAINT "JobLog_accountId_fkey";

-- DropForeignKey
ALTER TABLE "JobLog" DROP CONSTRAINT "JobLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProxyEndpoint" DROP CONSTRAINT "ProxyEndpoint_poolId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTemplate" DROP CONSTRAINT "TaskTemplate_fingerprintPresetId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTemplate" DROP CONSTRAINT "TaskTemplate_networkPolicyId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTemplate" DROP CONSTRAINT "TaskTemplate_proxyPoolId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTemplate" DROP CONSTRAINT "TaskTemplate_tenantId_fkey";

-- DropIndex
DROP INDEX "ApiKey_tenantId_idx";

-- DropIndex
DROP INDEX "AuditLog_action_idx";

-- DropIndex
DROP INDEX "BulkOperation_status_idx";

-- DropIndex
DROP INDEX "Comment_resourceId_idx";

-- DropIndex
DROP INDEX "Comment_tenantId_idx";

-- DropIndex
DROP INDEX "FlowRun_status_idx";

-- DropIndex
DROP INDEX "Invitation_email_idx";

-- DropIndex
DROP INDEX "JobLog_status_idx";

-- DropIndex
DROP INDEX "JobLog_type_idx";

-- DropIndex
DROP INDEX "ProxyEndpoint_poolId_idx";

-- DropIndex
DROP INDEX "Session_refreshToken_idx";

-- DropIndex
DROP INDEX "Tag_tenantId_idx";

-- DropIndex
DROP INDEX "Tag_tenantId_name_key";

-- DropIndex
DROP INDEX "TaskBatch_status_idx";

-- DropIndex
DROP INDEX "User_resetToken_key";

-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "lastUsed",
DROP COLUMN "prefix",
DROP COLUMN "scopes",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "detail",
ADD COLUMN     "detail" JSONB;

-- AlterTable
ALTER TABLE "BulkOperation" DROP COLUMN "createdBy",
DROP COLUMN "total",
ADD COLUMN     "totalTasks" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "type" SET DEFAULT 'CREATE',
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "resourceId",
DROP COLUMN "tenantId",
DROP COLUMN "text",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "authorId" TEXT NOT NULL,
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "flowId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "FeatureFlag" DROP COLUMN "updatedAt",
ADD COLUMN     "rules" JSONB,
ALTER COLUMN "enabled" SET DEFAULT true;

-- AlterTable
ALTER TABLE "FingerprintPreset" DROP COLUMN "audio",
DROP COLUMN "canvas",
DROP COLUMN "clientRects",
DROP COLUMN "createdAt",
DROP COLUMN "deviceMemory",
DROP COLUMN "fonts",
DROP COLUMN "hardwareConcurrency",
DROP COLUMN "isAiGenerated",
DROP COLUMN "language",
DROP COLUMN "platformOS",
DROP COLUMN "plugins",
DROP COLUMN "screenResolution",
DROP COLUMN "updatedAt",
DROP COLUMN "userAgent",
DROP COLUMN "webgl",
DROP COLUMN "webview",
ADD COLUMN     "browser" TEXT NOT NULL DEFAULT 'CHROME',
ADD COLUMN     "config" JSONB NOT NULL,
ALTER COLUMN "tenantId" SET NOT NULL,
DROP COLUMN "platform",
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'WINDOWS';

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "fingerprint",
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "steps" JSONB NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "FlowRun" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "lastScreenshot" TEXT,
ADD COLUMN     "liveStepId" TEXT,
ADD COLUMN     "logs" JSONB,
ADD COLUMN     "result" JSONB,
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "startedAt" SET NOT NULL,
ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FlowRunStep" ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "startedAt" SET NOT NULL,
ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "invitedBy",
ADD COLUMN     "invitedById" TEXT NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'OPERATOR',
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "JobLog" DROP COLUMN "attempts",
DROP COLUMN "error",
DROP COLUMN "output",
DROP COLUMN "updatedAt",
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'INFO',
ADD COLUMN     "message" TEXT,
ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "accountId" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'custom_job',
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "NetworkPolicy" DROP COLUMN "createdAt",
DROP COLUMN "dnsPrimary",
DROP COLUMN "dnsSecondary",
DROP COLUMN "timezonePolicy",
DROP COLUMN "timezoneValue",
DROP COLUMN "updatedAt",
DROP COLUMN "webrtcPolicy",
ADD COLUMN     "dnsConfig" JSONB,
ADD COLUMN     "geoRules" JSONB,
ADD COLUMN     "webrtcMode" TEXT NOT NULL DEFAULT 'ALTERED';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "platform" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "ProxyEndpoint" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "updatedAt",
ADD COLUMN     "lastCheck" TIMESTAMP(3),
ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'HTTP',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tenantId" TEXT NOT NULL,
ALTER COLUMN "poolId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProxyPool" DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "rotationStrategy",
DROP COLUMN "updatedAt",
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'RESIDENTIAL';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceInfo" JSONB,
ADD COLUMN     "token" TEXT NOT NULL,
ALTER COLUMN "refreshToken" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tag" DROP COLUMN "color",
DROP COLUMN "tenantId";

-- AlterTable
ALTER TABLE "TaskBatch" DROP COLUMN "completedAt",
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TaskTemplate" DROP COLUMN "fingerprintPresetId",
DROP COLUMN "ipRotationStrategy",
DROP COLUMN "networkPolicyId",
DROP COLUMN "proxyPoolId",
DROP COLUMN "updatedAt",
ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "plan" SET DEFAULT 'FREE';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "lastLoginAt",
DROP COLUMN "passwordChangedAt",
DROP COLUMN "resetToken",
DROP COLUMN "resetTokenExpiresAt",
DROP COLUMN "termsAcceptedAt",
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'OPERATOR';

-- DropTable
DROP TABLE "FlowStep";

-- DropTable
DROP TABLE "FlowTrigger";

-- DropTable
DROP TABLE "Subscription";

-- DropTable
DROP TABLE "WorkerNode";

-- DropEnum
DROP TYPE "IPRotationStrategy";

-- DropEnum
DROP TYPE "Platform";

-- DropEnum
DROP TYPE "ProxyRotationStrategy";

-- DropEnum
DROP TYPE "TimezonePolicy";

-- DropEnum
DROP TYPE "WebRTCPolicy";

-- CreateTable
CREATE TABLE "AccessControl" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FlowToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AccessControl_resourceId_idx" ON "AccessControl"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessControl_userId_resourceId_permission_key" ON "AccessControl"("userId", "resourceId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "_FlowToTag_AB_unique" ON "_FlowToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_FlowToTag_B_index" ON "_FlowToTag"("B");

-- CreateIndex
CREATE INDEX "Comment_flowId_idx" ON "Comment"("flowId");

-- CreateIndex
CREATE INDEX "Flow_userId_idx" ON "Flow"("userId");

-- CreateIndex
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_tenantId_idx" ON "ProxyEndpoint"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "TaskBatch_tenantId_idx" ON "TaskBatch"("tenantId");

-- CreateIndex
CREATE INDEX "TaskBatch_templateId_idx" ON "TaskBatch"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_email_fkey" FOREIGN KEY ("email") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyEndpoint" ADD CONSTRAINT "ProxyEndpoint_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ProxyPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyEndpoint" ADD CONSTRAINT "ProxyEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FingerprintPreset" ADD CONSTRAINT "FingerprintPreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessControl" ADD CONSTRAINT "AccessControl_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessControl" ADD CONSTRAINT "AccessControl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBatch" ADD CONSTRAINT "TaskBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlowToTag" ADD CONSTRAINT "_FlowToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlowToTag" ADD CONSTRAINT "_FlowToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
