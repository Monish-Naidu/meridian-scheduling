import { Router } from "express";
import type { AppDeps } from "../deps";
import { listClinics, listProvidersByClinic } from "../db/repo";

export function clinicsRouter({ db }: AppDeps): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    const clinics = listClinics(db).map((clinic) => ({
      ...clinic,
      providers: listProvidersByClinic(db, clinic.id).map((p) => ({
        id: p.id,
        name: p.name,
        specialty: p.specialty,
        workStart: p.workStart,
        workEnd: p.workEnd,
        workDays: p.workDays,
        slotMinutes: p.slotMinutes,
      })),
    }));
    res.json({ clinics });
  });
  return router;
}
