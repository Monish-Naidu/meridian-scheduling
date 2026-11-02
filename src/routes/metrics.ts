import { Router } from "express";
import type { AppDeps } from "../deps";

export function metricsRouter({ epic }: AppDeps): Router {
  const router = Router();
  router.get("/epic", (_req, res) => {
    res.json(epic.metrics.snapshot());
  });
  return router;
}
