import { CATEGORIES } from "./scan-status.js";

export function initialProgress() {
  const counts = {};
  for (const p of CATEGORIES) counts[p] = 0;
  return { purposeCounts: counts, lastObserved: null, startedAt: null };
}

export function acceptPayload(progress, payload) {
  const p = progress || initialProgress();
  if (!payload || typeof payload !== "object") return p;
  if (!CATEGORIES.includes(payload.purpose)) return p;
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
