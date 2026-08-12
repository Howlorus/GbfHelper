import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSources, citeSource, REVIEW_STATUSES } from "../src/lib/knowledge/citations.js";

const zetaClaim = {
  claimId: "claim.zeta.dispel",
  title: "Zeta as a dispeller in wind teams",
  author: "gbfwiki",
  url: "https://gbf.wiki/Zeta",
  language: "en",
  publicationDate: "2025-01-15",
  importDate: "2026-06-01",
  verificationDate: "2026-08-01",
  raid: "bahamut-proud",
  objective: "solo-first-clear",
  element: "wind",
  requiredResources: ["Zeta.5*.uncap5"],
  extractionMethod: "manual",
  reviewStatus: "userReviewed",
  validityPeriod: "2026Q3",
  knowledgeVersion: "1.0.0",
};

test("validateSources accepts a well-formed source", () => {
  assert.equal(validateSources([zetaClaim]).ok, true);
});

test("validateSources rejects missing required fields with per-row errors", () => {
  const r = validateSources([{ claimId: "", title: "", url: "", language: "", reviewStatus: "" }]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /claimId/.test(e)));
  assert.ok(r.errors.some((e) => /url/.test(e)));
});

test("validateSources rejects unknown reviewStatus values", () => {
  const bad = { ...zetaClaim, reviewStatus: "totally-legit" };
  const r = validateSources([bad]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /reviewStatus/.test(e)));
});

test("validateSources refuses duplicate claim ids", () => {
  const r = validateSources([zetaClaim, zetaClaim]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate claimId/.test(e)));
});

test("citeSource returns the full §17.2 bundle for a known claim", () => {
  const c = citeSource("claim.zeta.dispel", [zetaClaim]);
  assert.equal(c.provenance, "cited");
  assert.equal(c.title, zetaClaim.title);
  assert.equal(c.reviewStatus, "userReviewed");
  assert.deepEqual(c.requiredResources, ["Zeta.5*.uncap5"]);
});

test("citeSource preserves the reviewStatus so callers can degrade on outdated sources", () => {
  const outdated = { ...zetaClaim, reviewStatus: "outdated" };
  assert.equal(citeSource(outdated.claimId, [outdated]).reviewStatus, "outdated");
});

test("citeSource returns a 'no provenance' stub for unknown claims (never fabricated)", () => {
  const stub = citeSource("does.not.exist", [zetaClaim]);
  assert.equal(stub.provenance, "none");
  assert.equal(stub.claimId, "does.not.exist");
  assert.equal(stub.reviewStatus, "unreviewed");
  assert.equal(stub.title, undefined);
});

test("citeSource returns the 'no provenance' stub for empty / invalid inputs", () => {
  assert.equal(citeSource("x", null).provenance, "none");
  assert.equal(citeSource("", [zetaClaim]).provenance, "none");
});

test("REVIEW_STATUSES covers §17.3", () => {
  for (const s of ["unreviewed", "machineExtracted", "userReviewed", "communityVerified", "conflicting", "outdated", "archived"]) {
    assert.ok(REVIEW_STATUSES.includes(s));
  }
});
