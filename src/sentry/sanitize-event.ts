import type { ErrorEvent } from "@sentry/node";

const SENSITIVE_KEYS = new Set([
  "birthdate",
  "dateofbirth",
  "dob",
  "email",
  "emailaddress",
  "familyname",
  "firstname",
  "fullname",
  "givenname",
  "lastname",
  "mobilenumber",
  "mobile",
  "patientbirthdate",
  "patientdateofbirth",
  "patientdob",
  "patientdisplayname",
  "patientemail",
  "patientfamilyname",
  "patientfirstname",
  "patientfullname",
  "patientgivenname",
  "patientlastname",
  "patientname",
  "patientphone",
  "phone",
  "phonenumber",
  "telephone",
  "telecom",
]);
const PATIENT_NAME_KEYS = new Set(["family", "given", "name", "prefix", "suffix", "text", "username"]);
const ALWAYS_REMOVED_KEYS = new Set(["user"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const REDACTED = "[Filtered]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPatientContextKey(normalizedKey: string): boolean {
  return normalizedKey === "person" || normalizedKey === "user" || normalizedKey.startsWith("patient");
}

function isPatientResource(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(
    ([key, child]) => normalizeKey(key) === "resourcetype" && typeof child === "string" && child.toLowerCase() === "patient",
  );
}

function isSensitiveKey(key: string, patientContext: boolean): boolean {
  return SENSITIVE_KEYS.has(key) || (patientContext && PATIENT_NAME_KEYS.has(key));
}

function collectSensitiveValues(
  value: unknown,
  values = new Set<string>(),
  patientContext = false,
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveValues(item, values, patientContext);
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const patientObject = patientContext || isPatientResource(object);
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizeKey(key);
      const childPatientContext = patientObject || isPatientContextKey(normalizedKey);
      if (isSensitiveKey(normalizedKey, patientObject)) {
        collectStrings(child, values);
      } else {
        collectSensitiveValues(child, values, childPatientContext);
      }
    }
  }
  return values;
}

function collectStrings(value: unknown, values: Set<string>): void {
  if (typeof value === "string" && value.length > 1) {
    values.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, values);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectStrings(child, values);
  }
}

function redactString(value: string, sensitiveValues: Set<string>): string {
  let redacted = value.replace(EMAIL_PATTERN, REDACTED);
  for (const sensitiveValue of sensitiveValues) {
    const escaped = sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "gi"), REDACTED);
  }
  return redacted;
}

function sanitizeValue(value: unknown, sensitiveValues: Set<string>, patientContext = false): unknown {
  if (typeof value === "string") return redactString(value, sensitiveValues);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, sensitiveValues, patientContext));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const patientObject = patientContext || isPatientResource(object);
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => {
          const normalizedKey = normalizeKey(key);
          return !ALWAYS_REMOVED_KEYS.has(normalizedKey) && !isSensitiveKey(normalizedKey, patientObject);
        })
        .map(([key, child]) => [
          key,
          sanitizeValue(child, sensitiveValues, patientObject || isPatientContextKey(normalizeKey(key))),
        ]),
    );
  }
  return value;
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  const sensitiveValues = collectSensitiveValues(event);
  const sanitized = sanitizeValue(event, sensitiveValues) as ErrorEvent;
  if (sanitized.request) {
    sanitized.request = {
      method: sanitized.request.method,
      url: sanitized.request.url?.split("?")[0],
    };
  }
  sanitized.user = undefined;
  return sanitized;
}
