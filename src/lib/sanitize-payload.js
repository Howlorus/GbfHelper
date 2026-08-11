// Sanitization pipeline for observed payloads (PRD §41.2, stages 1-3 + 5).
//
//   endpoint allowlist -> content validation -> size limit -> credential
//   removal -> [field allowlist + minimization + normalization: per-endpoint,
//   delivered by domain US-02-* and US-09-*].
//
// Returns a sanitized payload object, or null to drop the observation.

export const MAX_BODY_BYTES = 512 * 1024; // 512 KiB per payload safety cap

export function matchEndpoint(url, allowlist) {
  if (!url || !allowlist || !Array.isArray(allowlist.endpoints)) return null;
  return allowlist.endpoints.find(
    (e) => typeof e.pathPattern === "string" && url.pathname.startsWith(e.pathPattern)
  ) || null;
}

export function sanitizePayload(raw, endpointAllowlist) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.url !== "string") return null;

  let url;
  try { url = new URL(raw.url); } catch { return null; }

  // Stage 1: endpoint allowlist.
  const endpoint = matchEndpoint(url, endpointAllowlist);
  if (!endpoint) return null;

  // Stage 2: content validation — body must be a string (raw response body).
  const bodyStr = typeof raw.body === "string" ? raw.body : "";
  // Stage 3: size limit.
  if (bodyStr.length > MAX_BODY_BYTES) return null;

  // Stage 5: credential removal — headers are never propagated. We literally
  // do not copy the headers field: caller-provided auth headers cannot leak
  // through this function's output.
  return {
    url: url.origin + url.pathname, // strip query + fragment for provenance
    method: (raw.method || "GET").toUpperCase(),
    purpose: endpoint.purpose,
    body: bodyStr,
    receivedAt: Number.isFinite(raw.receivedAt) ? raw.receivedAt : Date.now(),
  };
}
