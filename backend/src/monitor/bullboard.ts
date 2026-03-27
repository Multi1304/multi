import express from "express";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { automationQueue } from "../queues/automation.queue";
import { QueueService } from "../services/queue.service";
import { sensitiveSurfaceGuard } from "../middleware/sensitiveSurface";
import { ipAllowlistGuard } from "../middleware/ipAllowlist";

export function mountBullBoard(app: express.Express) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [ 
      new BullMQAdapter(automationQueue as any) as any,
      new BullMQAdapter(QueueService.sessionQueue as any) as any
    ],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    sensitiveSurfaceGuard('Bull Board'),
    ipAllowlistGuard('sensitive', 'Bull Board'),
    serverAdapter.getRouter()
  );
}
