-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowStep" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "FlowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowTrigger" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FlowTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "output" JSONB,
    "error" TEXT,

    CONSTRAINT "FlowRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flow_tenantId_idx" ON "Flow"("tenantId");

-- CreateIndex
CREATE INDEX "FlowStep_flowId_idx" ON "FlowStep"("flowId");

-- CreateIndex
CREATE INDEX "FlowTrigger_flowId_idx" ON "FlowTrigger"("flowId");

-- CreateIndex
CREATE INDEX "FlowRun_flowId_idx" ON "FlowRun"("flowId");

-- CreateIndex
CREATE INDEX "FlowRun_tenantId_idx" ON "FlowRun"("tenantId");

-- CreateIndex
CREATE INDEX "FlowRun_status_idx" ON "FlowRun"("status");

-- CreateIndex
CREATE INDEX "FlowRunStep_runId_idx" ON "FlowRunStep"("runId");

-- CreateIndex
CREATE INDEX "Comment_tenantId_idx" ON "Comment"("tenantId");

-- CreateIndex
CREATE INDEX "Comment_resourceId_idx" ON "Comment"("resourceId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowStep" ADD CONSTRAINT "FlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowTrigger" ADD CONSTRAINT "FlowTrigger_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRunStep" ADD CONSTRAINT "FlowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
