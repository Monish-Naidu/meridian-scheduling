import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { getVisitContext } from "../domain/visit-context";
import { parseOrThrow } from "../validate";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

export function visitsRouter({ db, epic }: AppDeps): Router {
  const router = Router();
  router.get("/:id/context", async (req, res) => {
    const { id } = parseOrThrow(paramsSchema, req.params);
    res.json(await getVisitContext(db, epic, id));
  });
  return router;
}
