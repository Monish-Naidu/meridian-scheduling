import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../deps";
import { bookAppointment, cancelAppointment } from "../domain/appointments";
import { HttpError } from "../errors";
import { parseOrThrow } from "../validate";

const bookSchema = z.object({
  providerId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  start: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  reason: z.string().max(500).optional(),
});

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

export function appointmentsRouter({ db, logger, now }: AppDeps): Router {
  const router = Router();
  const log = logger.child({ component: "appointments" });

  router.post("/", (req, res) => {
    const input = parseOrThrow(bookSchema, req.body);
    try {
      const appointment = bookAppointment(db, input, now());
      log.info("appointment booked", {
        requestId: res.locals.requestId,
        appointmentId: appointment.id,
        providerId: appointment.providerId,
        patientId: appointment.patientId,
        startUtc: appointment.startUtc,
      });
      res.status(201).json({ appointment });
    } catch (err) {
      if (err instanceof HttpError && err.code === "APPOINTMENT_OVERLAP") {
        log.warn("booking rejected: overlap", {
          requestId: res.locals.requestId,
          providerId: input.providerId,
          start: input.start,
        });
      }
      throw err;
    }
  });

  router.delete("/:id", (req, res) => {
    const { id } = parseOrThrow(paramsSchema, req.params);
    const appointment = cancelAppointment(db, id, now());
    log.info("appointment cancelled", { requestId: res.locals.requestId, appointmentId: id });
    res.json({ appointment });
  });

  return router;
}
