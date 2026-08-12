// US-05-08 cross-language dedup (PRD §16.5). Pure. Never merges — only links.
// Signals, strongest first:
//   1. same (kind, canonicalId)                     → Confirmed
//   2. same YouTube videoId                         → Confirmed (same-video derivation)
//   3. same (kind) + alias-index maps text → same id → Uncertain (heuristic)
// Different setups for the same objective are NOT linked (AC3).

const YT = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

function videoId(claim) {
  const url = claim?.source?.url || claim?.url;
  return typeof url === "string" ? url.match(YT)?.[1] ?? null : null;
}

function aliasCanonical(claim, aliasIndex) {
  if (!aliasIndex || !claim?.text) return null;
  const hit = aliasIndex.get(claim.text.trim().toLowerCase());
  return hit && hit.entityKind === claim.kind ? hit.entityId : null;
}

export function findDuplicates(claims, { aliasIndex } = {}) {
  if (!Array.isArray(claims)) return [];
  const links = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]; const b = claims[j];
      if (!a || !b) continue;
      if (a.kind && a.kind === b.kind && a.canonicalId && a.canonicalId === b.canonicalId) {
        links.push({ keep: a, drop: b, reason: "same-canonical", confidence: "Confirmed" });
        continue;
      }
      const va = videoId(a); const vb = videoId(b);
      if (va && va === vb) {
        links.push({ keep: a, drop: b, reason: "same-video", videoId: va, confidence: "Confirmed" });
        continue;
      }
      if (aliasIndex && a.kind && a.kind === b.kind) {
        const ca = aliasCanonical(a, aliasIndex);
        const cb = aliasCanonical(b, aliasIndex);
        if (ca && ca === cb) {
          links.push({ keep: a, drop: b, reason: "alias-match", canonicalId: ca, confidence: "Uncertain" });
        }
      }
    }
  }
  return links;
}

// ponytail: aliasIndex is caller-built (Map<lowercased text, {entityId, entityKind}>).
// Building it here would duplicate resolveAlias.
export function buildAliasIndex(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  for (const e of entries) {
    if (!e?.text || !e.entityId || !e.entityKind) continue;
    map.set(e.text.trim().toLowerCase(), { entityId: e.entityId, entityKind: e.entityKind });
  }
  return map;
}
