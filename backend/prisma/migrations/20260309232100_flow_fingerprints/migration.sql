-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "fingerprint" JSONB;

-- AlterTable
ALTER TABLE "FlowRun" ADD COLUMN     "fingerprint" JSONB;
