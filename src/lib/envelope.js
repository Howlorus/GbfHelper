// Record envelope per PRD §42. Kept flat (no nested "envelope" object).
// Domain code adds pack/plan/calibration version stamps as producers land.

export const REQUIRED_ENVELOPE_KEYS = Object.freeze(["id", "schemaVersion", "extensionVersion", "createdAt", "updatedAt"]);

export function wrapEnvelope(record, meta = {}) {
  if (!record || typeof record !== "object") throw new TypeError("record must be an object");
  if (record.id === undefined || record.id === null) throw new TypeError("record.id is required");
  const now = Number.isFinite(meta.now) ? meta.now : Date.now();
  const previous = meta.previous || null;
  return {
    ...record,
    schemaVersion: meta.schemaVersion ?? record.schemaVersion ?? 1,
    extensionVersion: meta.extensionVersion ?? record.extensionVersion ?? "0.0.0",
    createdAt: previous?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  };
}

export function assertEnvelope(record) {
  if (!record || typeof record !== "object") throw new TypeError("record must be an object");
  for (const k of REQUIRED_ENVELOPE_KEYS) {
    if (record[k] === undefined || record[k] === null) {
      throw new TypeError(`envelope field '${k}' is required`);
    }
  }
  return true;
}
