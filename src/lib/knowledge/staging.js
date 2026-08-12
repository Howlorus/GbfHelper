// Knowledge import pipeline (§17). Content flows through a staging store
// before it can influence anything — unreviewed claims never reach Live
// Coach (§17.1). This module is pure: it defines the shape + transitions.

// §17.3 review statuses.
export const REVIEW_STATUS = Object.freeze([
  "unreviewed", "machineExtracted", "userReviewed", "communityVerified",
  "conflicting", "outdated", "archived",
]);

// §17 pipeline stages.
export const IMPORT_STAGES = Object.freeze([
  "sourceSelected", "retrieved", "sanitized", "extracted", "translated",
  "structured", "provenanced", "dedupChecked", "conflictChecked",
  "reviewed", "activated",
]);

// Legal status transitions (§17.3). Everything else refused.
const TRANSITIONS = {
  unreviewed: ["machineExtracted", "userReviewed", "archived"],
  machineExtracted: ["userReviewed", "conflicting", "archived"],
  userReviewed: ["communityVerified", "conflicting", "outdated", "archived"],
  communityVerified: ["conflicting", "outdated", "archived"],
  conflicting: ["userReviewed", "archived"],
  outdated: ["archived"],
  archived: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Staged claim record shape.
export function buildStagedClaim({ claimId, sourceId, kind, language, extract, translation = null, structured = null, importedAt = Date.now(), reviewStatus = "machineExtracted" }) {
  if (!claimId) throw new TypeError("claimId required");
  if (!sourceId) throw new TypeError("sourceId required");
  if (!REVIEW_STATUS.includes(reviewStatus)) throw new TypeError(`reviewStatus must be one of ${REVIEW_STATUS.join("|")}`);
  return {
    id: `staging:${claimId}`,
    claimId,
    sourceId,
    kind: kind || "unknown",
    language: language || "unknown",
    extract: String(extract || ""),
    translation,
    structured,
    reviewStatus,
    importedAt,
  };
}

// US-05-06 rich source metadata (§17.2 full field set).
export function buildSourceMetadata({
  claimId, title, author = null, url, language,
  publicationDate = null, importDate = Date.now(), verificationDate = null,
  raid = null, objective = null, element = null, requiredResources = [],
  extractionMethod = "manual", reviewStatus = "unreviewed",
  validityPeriod = null, knowledgeVersion = "0",
}) {
  if (!claimId || !title || !url || !language) {
    throw new TypeError("claimId, title, url, language required");
  }
  if (!REVIEW_STATUS.includes(reviewStatus)) throw new TypeError("bad reviewStatus");
  return {
    claimId, title, author, url, language,
    publicationDate, importDate, verificationDate,
    raid, objective, element, requiredResources: [...requiredResources],
    extractionMethod, reviewStatus, validityPeriod, knowledgeVersion,
  };
}

// US-05-04 pipeline planner: enumerate the stages a candidate must clear.
// Pure — the caller executes each stage against real IO.
export function planImport(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("candidate required");
  if (!candidate.url) throw new TypeError("candidate.url required");
  return {
    sourceUrl: candidate.url,
    stages: [...IMPORT_STAGES],
    startState: "sourceSelected",
    terminal: ["activated", "archived"],
  };
}
