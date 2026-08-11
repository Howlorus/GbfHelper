// Pure reducer over sanitized capture payloads during an Account Scan.
// Only tracks counts and last-observed metadata — no field extraction here
// (that lands in US-02-02..05).

export const SCAN_PURPOSES = Object.freeze(["characters", "weapons", "summons", "teams"]);

export function initialProgress() {
  const counts = {};
  for (const p of SCAN_PURPOSES) counts[p] = 0;
  return { purposeCounts: counts, lastObserved: null, startedAt: null };
}

export function acceptPayload(progress, payload) {
  const p = progress || initialProgress();
  if (!payload || typeof payload !== "object") return p;
  if (!SCAN_PURPOSES.includes(payload.purpose)) return p; // outside scan surface
  const nextCounts = { ...p.purposeCounts, [payload.purpose]: (p.purposeCounts[payload.purpose] || 0) + 1 };
  const ts = Number.isFinite(payload.receivedAt) ? payload.receivedAt : Date.now();
  return {
    purposeCounts: nextCounts,
    lastObserved: {
      url: typeof payload.url === "string" ? payload.url : "",
      purpose: payload.purpose,
      timestamp: ts,
    },
    startedAt: p.startedAt || ts,
  };
}

// UI-facing status per category. Refined in US-02-07 (Complete / Partial / …).
export function statusFor(progress, purpose) {
  const n = progress?.purposeCounts?.[purpose] || 0;
  return n === 0 ? "not started" : "in progress";
}
