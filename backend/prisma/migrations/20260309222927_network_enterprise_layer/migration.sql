-- CreateEnum
CREATE TYPE "ProxyRotationStrategy" AS ENUM ('ROUND_ROBIN', 'RANDOM', 'STICKY_PER_PROFILE');

-- CreateEnum
CREATE TYPE "WebRTCPolicy" AS ENUM ('DEFAULT', 'DISABLE', 'FAKE_LOCAL', 'FAKE_PUBLIC');

-- CreateEnum
CREATE TYPE "TimezonePolicy" AS ENUM ('AUTO', 'FIXED');

-- CreateEnum
CREATE TYPE "IPRotationStrategy" AS ENUM ('NONE', 'PER_TASK', 'PER_ACCOUNT', 'PER_RUN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'AMAZON', 'GMAIL', 'LINKEDIN', 'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TWITTER_X', 'REDDIT', 'PINTEREST', 'DISCORD', 'TWITCH', 'OTHER');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "proxyEndpointId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "fingerprintPresetId" TEXT,
ADD COLUMN     "networkPolicyId" TEXT,
ADD COLUMN     "proxyPoolId" TEXT;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "fingerprintPresetId" TEXT,
ADD COLUMN     "ipRotationStrategy" "IPRotationStrategy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "networkPolicyId" TEXT,
ADD COLUMN     "proxyPoolId" TEXT;

-- CreateTable
CREATE TABLE "ProxyPool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rotationStrategy" "ProxyRotationStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyEndpoint" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "country" TEXT,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dnsPrimary" TEXT,
    "dnsSecondary" TEXT,
    "webrtcPolicy" "WebRTCPolicy" NOT NULL DEFAULT 'DEFAULT',
    "timezonePolicy" "TimezonePolicy" NOT NULL DEFAULT 'AUTO',
    "timezoneValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FingerprintPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'OTHER',
    "userAgent" TEXT NOT NULL,
    "screenResolution" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "platformOS" TEXT NOT NULL,
    "hardwareConcurrency" INTEGER,
    "deviceMemory" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FingerprintPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProxyPool_tenantId_idx" ON "ProxyPool"("tenantId");

-- CreateIndex
CREATE INDEX "ProxyEndpoint_poolId_idx" ON "ProxyEndpoint"("poolId");

-- CreateIndex
CREATE INDEX "NetworkPolicy_tenantId_idx" ON "NetworkPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "FingerprintPreset_tenantId_idx" ON "FingerprintPreset"("tenantId");

-- AddForeignKey
ALTER TABLE "ProxyPool" ADD CONSTRAINT "ProxyPool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyEndpoint" ADD CONSTRAINT "ProxyEndpoint_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ProxyPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkPolicy" ADD CONSTRAINT "NetworkPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FingerprintPreset" ADD CONSTRAINT "FingerprintPreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_proxyPoolId_fkey" FOREIGN KEY ("proxyPoolId") REFERENCES "ProxyPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_networkPolicyId_fkey" FOREIGN KEY ("networkPolicyId") REFERENCES "NetworkPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_fingerprintPresetId_fkey" FOREIGN KEY ("fingerprintPresetId") REFERENCES "FingerprintPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_proxyEndpointId_fkey" FOREIGN KEY ("proxyEndpointId") REFERENCES "ProxyEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_proxyPoolId_fkey" FOREIGN KEY ("proxyPoolId") REFERENCES "ProxyPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_networkPolicyId_fkey" FOREIGN KEY ("networkPolicyId") REFERENCES "NetworkPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_fingerprintPresetId_fkey" FOREIGN KEY ("fingerprintPresetId") REFERENCES "FingerprintPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
