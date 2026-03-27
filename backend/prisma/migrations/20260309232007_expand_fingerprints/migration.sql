-- AlterTable
ALTER TABLE "FingerprintPreset" ADD COLUMN     "audio" JSONB,
ADD COLUMN     "canvas" JSONB,
ADD COLUMN     "clientRects" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fonts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plugins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webgl" JSONB,
ADD COLUMN     "webview" BOOLEAN NOT NULL DEFAULT false;
