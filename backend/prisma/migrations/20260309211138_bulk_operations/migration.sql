-- DropIndex
DROP INDEX "TaskBatch_tenantId_idx";

-- CreateTable
CREATE TABLE "BulkOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkOperation_tenantId_idx" ON "BulkOperation"("tenantId");

-- CreateIndex
CREATE INDEX "BulkOperation_status_idx" ON "BulkOperation"("status");

-- AddForeignKey
ALTER TABLE "BulkOperation" ADD CONSTRAINT "BulkOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
