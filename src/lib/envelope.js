// Record envelope per PRD §42. Every persisted record carries these fields
// so migrations, provenance, and downstream Epics can trust their inputs.
//
// The envelope is expressed as reserved keys on the record itself (no
// nested "envelope" object) so IndexedDB range queries stay simple.

export const ENVELOPE_KEYS = Object.freeze([
  "id",
  "schemaVersion",
  "extensionVersion",
  "gameDataVersion",
  "strategyPackVersion",
  "raidPlanVersion",
  "calibrationVersion",
  "createdAt",
  "updatedAt",
  "provenance",
  "status",
  "contentHash",
]);

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
    gameDataVersion: meta.gameDataVersion ?? record.gameDataVersion ?? null,
    strategyPackVersion: meta.strategyPackVersion ?? record.strategyPackVersion ?? null,
    raidPlanVersion: meta.raidPlanVersion ?? record.raidPlanVersion ?? null,
    calibrationVersion: meta.calibrationVersion ?? record.calibrationVersion ?? null,
    createdAt: previous?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
    provenance: meta.provenance ?? record.provenance ?? "unknown",
    status: meta.status ?? record.status ?? "active",
    contentHash: meta.contentHash ?? record.contentHash ?? null,
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

export function needsMigration(record, targetSchemaVersion) {
  if (!record) return false;
  return record.schemaVersion !== targetSchemaVersion;
}
