ALTER TABLE "ProxyPool"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "rotationStrategy" TEXT NOT NULL DEFAULT 'ROUND_ROBIN';

ALTER TABLE "ProxyEndpoint"
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "isp" TEXT,
  ADD COLUMN IF NOT EXISTS "carrier" TEXT,
  ADD COLUMN IF NOT EXISTS "asn" TEXT,
  ADD COLUMN IF NOT EXISTS "endpointType" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastLatencyMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "failureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

UPDATE "ProxyPool"
SET "rotationStrategy" = COALESCE("rotationStrategy", 'ROUND_ROBIN')
WHERE "rotationStrategy" IS NULL;

UPDATE "ProxyEndpoint"
SET "isActive" = true
WHERE "isActive" IS NULL;

UPDATE "ProxyEndpoint"
SET "failureCount" = 0
WHERE "failureCount" IS NULL;

CREATE INDEX IF NOT EXISTS "ProxyEndpoint_poolId_status_idx" ON "ProxyEndpoint"("poolId", "status");
CREATE INDEX IF NOT EXISTS "ProxyEndpoint_country_city_idx" ON "ProxyEndpoint"("country", "city");
