import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { getProviderSlots } from "../domain/appointments";
import { parseOrThrow } from "../validate";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD") });

export function providersRouter({ db, now }: AppDeps): Router {
  const router = Router();
  router.get("/:id/slots", (req, res) => {
    const { id } = parseOrThrow(paramsSchema, req.params);
    const { date } = parseOrThrow(querySchema, req.query);
    res.json(getProviderSlots(db, id, date, now()));
  });
  return router;
}
