// All data below is fictional. Emails use example.com and phones use the reserved 555-01xx range.

export interface ClinicSeed {
  id: number;
  name: string;
  city: string;
  timezone: string;
  epicLocationId: string;
}

export interface ProviderSeed {
  id: number;
  clinicId: number;
  name: string;
  specialty: string;
  epicPractitionerId: string;
  workStart: string;
  workEnd: string;
  /** ISO weekdays: 1 = Monday ... 7 = Sunday */
  workDays: number[];
  slotMinutes: number;
}

export interface PatientSeed {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  epicPatientId: string;
}

export const CLINICS: ClinicSeed[] = [
  { id: 1, name: "Meridian Lakeshore Clinic", city: "Chicago", timezone: "America/Chicago", epicLocationId: "eLOC-CHI-001" },
  { id: 2, name: "Meridian Bayview Clinic", city: "Los Angeles", timezone: "America/Los_Angeles", epicLocationId: "eLOC-LAX-001" },
  { id: 3, name: "Meridian Hudson Clinic", city: "New York", timezone: "America/New_York", epicLocationId: "eLOC-NYC-001" },
];

export const PROVIDERS: ProviderSeed[] = [
  { id: 1, clinicId: 1, name: "Dr. Amara Okafor", specialty: "Family Medicine", epicPractitionerId: "ePRAC-1001", workStart: "08:00", workEnd: "16:00", workDays: [1, 2, 3, 4, 5], slotMinutes: 30 },
  { id: 2, clinicId: 1, name: "Dr. Daniel Reyes", specialty: "Pediatrics", epicPractitionerId: "ePRAC-1002", workStart: "10:00", workEnd: "18:00", workDays: [1, 2, 3, 4], slotMinutes: 30 },
  { id: 3, clinicId: 2, name: "Dr. Priya Raman", specialty: "Internal Medicine", epicPractitionerId: "ePRAC-2001", workStart: "09:00", workEnd: "17:00", workDays: [1, 2, 3, 4, 5], slotMinutes: 30 },
  { id: 4, clinicId: 2, name: "Dr. Marcus Chen", specialty: "Dermatology", epicPractitionerId: "ePRAC-2002", workStart: "07:00", workEnd: "13:00", workDays: [2, 3, 4, 5, 6], slotMinutes: 20 },
  { id: 5, clinicId: 3, name: "Dr. Elena Petrova", specialty: "Cardiology", epicPractitionerId: "ePRAC-3001", workStart: "09:00", workEnd: "15:00", workDays: [1, 2, 3, 4, 5], slotMinutes: 45 },
  { id: 6, clinicId: 3, name: "Dr. Samuel Brooks", specialty: "Behavioral Health", epicPractitionerId: "ePRAC-3002", workStart: "12:00", workEnd: "20:00", workDays: [1, 2, 3, 4, 5], slotMinutes: 60 },
];

export const PATIENTS: PatientSeed[] = [
  { id: 1, firstName: "Jordan", lastName: "Alvarez", email: "jordan.alvarez@example.com", phone: "+1-312-555-0101", dateOfBirth: "1986-04-12", epicPatientId: "ePAT-5001" },
  { id: 2, firstName: "Mei", lastName: "Tanaka", email: "mei.tanaka@example.com", phone: "+1-312-555-0102", dateOfBirth: "1992-09-03", epicPatientId: "ePAT-5002" },
  { id: 3, firstName: "Olivia", lastName: "Brennan", email: "olivia.brennan@example.com", phone: "+1-213-555-0103", dateOfBirth: "1975-01-27", epicPatientId: "ePAT-5003" },
  { id: 4, firstName: "Kwame", lastName: "Mensah", email: "kwame.mensah@example.com", phone: "+1-213-555-0104", dateOfBirth: "2001-06-18", epicPatientId: "ePAT-5004" },
  { id: 5, firstName: "Sofia", lastName: "Rossi", email: "sofia.rossi@example.com", phone: "+1-212-555-0105", dateOfBirth: "1968-11-30", epicPatientId: "ePAT-5005" },
  { id: 6, firstName: "Ethan", lastName: "Park", email: "ethan.park@example.com", phone: "+1-212-555-0106", dateOfBirth: "2015-03-09", epicPatientId: "ePAT-5006" },
  { id: 7, firstName: "Aisha", lastName: "Rahman", email: "aisha.rahman@example.com", phone: "+1-312-555-0107", dateOfBirth: "1999-12-21", epicPatientId: "ePAT-5007" },
  { id: 8, firstName: "Liam", lastName: "O'Connell", email: "liam.oconnell@example.com", phone: "+1-213-555-0108", dateOfBirth: "1958-07-04", epicPatientId: "ePAT-5008" },
  { id: 9, firstName: "Valentina", lastName: "Cruz", email: "valentina.cruz@example.com", phone: "+1-212-555-0109", dateOfBirth: "1983-02-14", epicPatientId: "ePAT-5009" },
  { id: 10, firstName: "Noah", lastName: "Fischer", email: "noah.fischer@example.com", phone: "+1-312-555-0110", dateOfBirth: "2010-10-10", epicPatientId: "ePAT-5010" },
];
