import type Database from "better-sqlite3";
import { CLINICS, PATIENTS, PROVIDERS } from "./seed-data";

export function seed(db: Database.Database, options: { reset?: boolean } = {}): void {
  const run = db.transaction(() => {
    if (options.reset) {
      db.exec("DELETE FROM appointments; DELETE FROM providers; DELETE FROM patients; DELETE FROM clinics;");
      db.exec("DELETE FROM sqlite_sequence WHERE name = 'appointments'");
    }
    const insertClinic = db.prepare(
      "INSERT INTO clinics (id, name, city, timezone, epic_location_id) VALUES (@id, @name, @city, @timezone, @epicLocationId)",
    );
    const insertProvider = db.prepare(
      `INSERT INTO providers (id, clinic_id, name, specialty, epic_practitioner_id, work_start, work_end, work_days, slot_minutes)
       VALUES (@id, @clinicId, @name, @specialty, @epicPractitionerId, @workStart, @workEnd, @workDays, @slotMinutes)`,
    );
    const insertPatient = db.prepare(
      `INSERT INTO patients (id, first_name, last_name, email, phone, date_of_birth, epic_patient_id)
       VALUES (@id, @firstName, @lastName, @email, @phone, @dateOfBirth, @epicPatientId)`,
    );
    for (const clinic of CLINICS) insertClinic.run(clinic);
    for (const provider of PROVIDERS) insertProvider.run({ ...provider, workDays: provider.workDays.join(",") });
    for (const patient of PATIENTS) insertPatient.run(patient);
  });
  run();
}
