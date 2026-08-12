// US-08-05 Setup Fingerprint + US-08-06 invalidation (PRD §24, §42).
// A fingerprint uniquely identifies a measurement context — samples with
// different fingerprints must NEVER be merged into the same aggregate.
//
// ponytail: fingerprint id is the canonical JSON, not sha256. Equality checks
// are string-equal; the "hash" would only make ids shorter, at the cost of a
// crypto import. Keep it lazy.

// §24 fields the fingerprint depends on. Order fixed for stability.
export const FINGERPRINT_FIELDS = Object.freeze([
  "party", "characterProgression", "grid", "weaponProgression",
  "summons", "summonProgression", "supportSummon",
  "mainClass", "classSkills", "raidBonus", "gameDataVersion",
]);

function canonicalize(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonicalize(v[k]);
    return out;
  }
  return v;
}

// Normalize a fingerprint object: pick only known fields, sort deeply.
export function normalizeFingerprint(fields) {
  if (!fields || typeof fields !== "object") throw new TypeError("fields object required");
  const norm = {};
  for (const key of FINGERPRINT_FIELDS) norm[key] = canonicalize(fields[key] ?? null);
  return norm;
}

// The fingerprint id — deterministic, stable across sessions.
export function fingerprintId(fields) {
  return JSON.stringify(normalizeFingerprint(fields));
}

export function fingerprintsEqual(a, b) {
  return fingerprintId(a) === fingerprintId(b);
}

// US-08-05 AC3: which fields changed between two fingerprints. Empty list
// means the setup is identical.
export function diffFingerprint(oldFp, newFp) {
  const a = normalizeFingerprint(oldFp);
  const b = normalizeFingerprint(newFp);
  const changed = [];
  for (const k of FINGERPRINT_FIELDS) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  return changed;
}

// US-08-06: calibration status vocabulary. Never a boolean valid/invalid —
// consumers must be able to explain WHY a calibration was hidden (§7.4).
export const CALIBRATION_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  STALE: "stale-fingerprint",       // player changed a fingerprint field
  INVALIDATED: "invalidated-pack",  // game-data pack bumped
});

// AC1: on pack bump, mark affected calibrations invalidated. Never delete —
// retained for history (§35.1 critical tier); E13 can wipe on demand.
export function invalidateOnPackBump(calibrations, { newGameDataVersion }) {
  if (!Array.isArray(calibrations)) return [];
  if (!newGameDataVersion) throw new TypeError("newGameDataVersion required");
  return calibrations.map((c) => {
    if (!c || c.status === CALIBRATION_STATUS.INVALIDATED) return c;
    const cv = c.fingerprintFields?.gameDataVersion ?? null;
    if (cv && cv !== newGameDataVersion) {
      return { ...c, status: CALIBRATION_STATUS.INVALIDATED, invalidatedAt: Date.now(), invalidatedBy: "gameData-bump" };
    }
    return c;
  });
}

// AC2: player changed a fingerprint field mid-session. Mark stale, surface
// re-run option (UI concern). Pure marker here.
export function markStale(calibration, changedFields) {
  return {
    ...calibration,
    status: CALIBRATION_STATUS.STALE,
    staleAt: Date.now(),
    staleFields: [...changedFields],
  };
}

// AC3: consumers (E11/E14) call this before trusting a calibration.
// Returns null when the calibration cannot be trusted — callers surface
// "Insufficient data" (§33) rather than a stale point value.
export function activeAggregate(calibration) {
  if (!calibration) return null;
  if (calibration.status !== CALIBRATION_STATUS.COMPLETED) return null;
  return calibration.aggregate ?? null;
}
