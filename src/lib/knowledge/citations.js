// Source citation API (PRD §17.2). Sources ship in each Strategy Pack's
// sources.json. citeSource(claimId, sources) returns the full §17.2
// metadata bundle so recommendations can be honestly cited (§7.4).
//
// Unknown claim ids get a "no provenance" stub — NEVER a fabricated
// citation.

export const REVIEW_STATUSES = Object.freeze([
  "unreviewed", "machineExtracted", "userReviewed", "communityVerified", "conflicting", "outdated", "archived",
]);

const REQUIRED_FIELDS = ["claimId", "title", "url", "language", "reviewStatus"];

export function validateSources(entries) {
  if (!Array.isArray(entries)) return { ok: false, errors: ["sources.json must be an array"] };
  const errs = [];
  const seen = new Set();
  entries.forEach((s, i) => {
    if (!s || typeof s !== "object") { errs.push(`row ${i}: not an object`); return; }
    for (const f of REQUIRED_FIELDS) {
      if (typeof s[f] !== "string" || !s[f]) errs.push(`row ${i}: ${f} required`);
    }
    if (s.reviewStatus && !REVIEW_STATUSES.includes(s.reviewStatus)) {
      errs.push(`row ${i}: reviewStatus must be one of ${REVIEW_STATUSES.join("|")}`);
    }
    if (s.claimId) {
      if (seen.has(s.claimId)) errs.push(`row ${i}: duplicate claimId ${s.claimId}`);
      seen.add(s.claimId);
    }
  });
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

// Return the full §17.2 bundle if the claim is known, else a stub that is
// clearly marked "no provenance" so callers cannot mistake it for a real
// citation.
export function citeSource(claimId, sources) {
  if (!Array.isArray(sources) || typeof claimId !== "string" || !claimId) {
    return { claimId: String(claimId), provenance: "none", reviewStatus: "unreviewed" };
  }
  const match = sources.find((s) => s?.claimId === claimId);
  if (!match) {
    return { claimId, provenance: "none", reviewStatus: "unreviewed" };
  }
  return {
    provenance: "cited",
    claimId: match.claimId,
    title: match.title,
    author: match.author ?? null,
    url: match.url,
    language: match.language,
    publicationDate: match.publicationDate ?? null,
    importDate: match.importDate ?? null,
    verificationDate: match.verificationDate ?? null,
    raid: match.raid ?? null,
    objective: match.objective ?? null,
    element: match.element ?? null,
    requiredResources: match.requiredResources ?? [],
    extractionMethod: match.extractionMethod ?? null,
    reviewStatus: match.reviewStatus,
    validityPeriod: match.validityPeriod ?? null,
    knowledgeVersion: match.knowledgeVersion ?? null,
  };
}
