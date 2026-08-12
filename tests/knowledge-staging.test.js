import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition, buildStagedClaim, buildSourceMetadata, planImport,
  REVIEW_STATUS, IMPORT_STAGES,
} from "../src/lib/knowledge/staging.js";
import { findDuplicates, buildAliasIndex } from "../src/lib/knowledge/dedup.js";
import { detectConflicts } from "../src/lib/knowledge/conflict.js";
import { validateYouTubeSource, parseYouTubeUrl } from "../src/lib/knowledge/youtube.js";

// --- staging ---------------------------------------------------------------

test("canTransition allows §17.3 legal moves and refuses everything else", () => {
  assert.equal(canTransition("unreviewed", "machineExtracted"), true);
  assert.equal(canTransition("machineExtracted", "userReviewed"), true);
  assert.equal(canTransition("userReviewed", "communityVerified"), true);
  assert.equal(canTransition("archived", "userReviewed"), false);
  assert.equal(canTransition("unreviewed", "activated"), false); // not in table
  assert.equal(canTransition("nope", "userReviewed"), false);
});

test("buildStagedClaim rejects missing required fields", () => {
  assert.throws(() => buildStagedClaim({}), /claimId/);
  assert.throws(() => buildStagedClaim({ claimId: "c1" }), /sourceId/);
  assert.throws(
    () => buildStagedClaim({ claimId: "c1", sourceId: "s1", reviewStatus: "bogus" }),
    /reviewStatus/,
  );
});

test("buildStagedClaim fills defaults for optional fields", () => {
  const c = buildStagedClaim({ claimId: "c1", sourceId: "s1", extract: "hello" });
  assert.equal(c.id, "staging:c1");
  assert.equal(c.kind, "unknown");
  assert.equal(c.language, "unknown");
  assert.equal(c.reviewStatus, "machineExtracted");
  assert.ok(REVIEW_STATUS.includes(c.reviewStatus));
});

test("buildSourceMetadata requires the §17.2 core fields", () => {
  assert.throws(() => buildSourceMetadata({}), /required/);
  const m = buildSourceMetadata({ claimId: "c1", title: "T", url: "http://x", language: "en" });
  assert.equal(m.author, null);
  assert.deepEqual(m.requiredResources, []);
});

test("planImport enumerates all §17 stages and refuses malformed input", () => {
  assert.throws(() => planImport(null), /candidate/);
  assert.throws(() => planImport({}), /url/);
  const p = planImport({ url: "http://x" });
  assert.deepEqual(p.stages, [...IMPORT_STAGES]);
  assert.equal(p.startState, "sourceSelected");
  assert.ok(p.terminal.includes("activated"));
  assert.ok(p.terminal.includes("archived"));
});

// --- dedup (US-05-08) ------------------------------------------------------

test("findDuplicates links same (kind, canonicalId) as Confirmed", () => {
  const claims = [
    { kind: "character", canonicalId: "char.zeta", text: "Zeta", language: "en" },
    { kind: "character", canonicalId: "char.zeta", text: "ゼタ", language: "ja" },
  ];
  const links = findDuplicates(claims);
  assert.equal(links.length, 1);
  assert.equal(links[0].reason, "same-canonical");
  assert.equal(links[0].confidence, "Confirmed");
});

test("findDuplicates links same YouTube videoId (same-video derivation, AC2)", () => {
  const claims = [
    { kind: "rotation", source: { url: "https://www.youtube.com/watch?v=abcDEF12345" }, text: "part 1" },
    { kind: "rotation", source: { url: "https://youtu.be/abcDEF12345" }, text: "part 2" },
  ];
  const links = findDuplicates(claims);
  assert.equal(links.length, 1);
  assert.equal(links[0].reason, "same-video");
  assert.equal(links[0].videoId, "abcDEF12345");
});

test("findDuplicates does NOT merge different setups for same objective (AC3)", () => {
  const claims = [
    { kind: "team", canonicalId: "team.wind.A", text: "wind A", objective: "faa-ex" },
    { kind: "team", canonicalId: "team.wind.B", text: "wind B", objective: "faa-ex" },
  ];
  assert.deepEqual(findDuplicates(claims), []);
});

test("findDuplicates alias-match returns Uncertain (heuristic)", () => {
  const idx = buildAliasIndex([
    { entityId: "char.zeta", entityKind: "character", text: "Zeta" },
    { entityId: "char.zeta", entityKind: "character", text: "ゼタ" },
  ]);
  const claims = [
    { kind: "character", text: "Zeta" },
    { kind: "character", text: "ゼタ" },
  ];
  const links = findDuplicates(claims, { aliasIndex: idx });
  assert.equal(links.length, 1);
  assert.equal(links[0].reason, "alias-match");
  assert.equal(links[0].confidence, "Uncertain");
});

test("findDuplicates handles empty / bad input without throwing", () => {
  assert.deepEqual(findDuplicates(null), []);
  assert.deepEqual(findDuplicates([]), []);
  assert.deepEqual(findDuplicates([null, undefined]), []);
});

// --- conflict (US-05-09) ---------------------------------------------------

test("detectConflicts flags mismatched values for same (kind, canonicalId, dimension)", () => {
  const claims = [
    { id: "a", kind: "weapon", canonicalId: "wep.dagger", dimension: "grid-slot", value: 3 },
    { id: "b", kind: "weapon", canonicalId: "wep.dagger", dimension: "grid-slot", value: 4 },
  ];
  const c = detectConflicts(claims);
  assert.equal(c.length, 1);
  assert.equal(c[0].dimension, "grid-slot");
  assert.equal(c[0].reviewStatus, "conflicting");
});

test("detectConflicts ignores same value across sources (no false conflict)", () => {
  const claims = [
    { kind: "weapon", canonicalId: "wep.dagger", dimension: "grid-slot", value: 3 },
    { kind: "weapon", canonicalId: "wep.dagger", dimension: "grid-slot", value: 3 },
  ];
  assert.deepEqual(detectConflicts(claims), []);
});

test("detectConflicts ignores different dimensions (orthogonal claims)", () => {
  const claims = [
    { kind: "weapon", canonicalId: "wep.dagger", dimension: "grid-slot", value: 3 },
    { kind: "weapon", canonicalId: "wep.dagger", dimension: "awakening", value: "stamina" },
  ];
  assert.deepEqual(detectConflicts(claims), []);
});

test("detectConflicts compares object values structurally, not by reference", () => {
  const claims = [
    { kind: "team", canonicalId: "team.wind", dimension: "party", value: { front: ["a", "b"] } },
    { kind: "team", canonicalId: "team.wind", dimension: "party", value: { front: ["a", "b"] } },
  ];
  assert.deepEqual(detectConflicts(claims), []);
});

test("detectConflicts never merges into an averaged claim (§7.8)", () => {
  const claims = [
    { kind: "raid", canonicalId: "faa", dimension: "hp", value: 1_000_000_000 },
    { kind: "raid", canonicalId: "faa", dimension: "hp", value: 1_100_000_000 },
  ];
  const c = detectConflicts(claims);
  assert.equal(c.length, 1);
  assert.equal(c[0].a.value, 1_000_000_000);
  assert.equal(c[0].b.value, 1_100_000_000);
});

// --- youtube (US-05-10) ----------------------------------------------------

test("parseYouTubeUrl accepts canonical + short + embed forms", () => {
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=abcDEF12345"), "abcDEF12345");
  assert.equal(parseYouTubeUrl("https://youtu.be/abcDEF12345"), "abcDEF12345");
  assert.equal(parseYouTubeUrl("https://www.youtube.com/embed/abcDEF12345"), "abcDEF12345");
  assert.equal(parseYouTubeUrl("https://youtube.com/watch?feature=share&v=abcDEF12345"), "abcDEF12345");
});

test("parseYouTubeUrl rejects non-YouTube URLs", () => {
  assert.equal(parseYouTubeUrl("https://vimeo.com/12345"), null);
  assert.equal(parseYouTubeUrl("not a url"), null);
  assert.equal(parseYouTubeUrl(""), null);
  assert.equal(parseYouTubeUrl(null), null);
});

test("validateYouTubeSource requires url, publicationDate, author", () => {
  const r = validateYouTubeSource({ url: "https://vimeo.com/12345" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /youtube/.test(e)));
  assert.ok(r.errors.some((e) => /publicationDate/.test(e)));
  assert.ok(r.errors.some((e) => /author/.test(e)));
});

test("validateYouTubeSource rejects full-video storage (§17.4)", () => {
  const r = validateYouTubeSource({
    url: "https://youtu.be/abcDEF12345",
    publicationDate: "2026-01-01", author: "someone",
    videoFile: new Uint8Array([1, 2, 3]),
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /forbidden/.test(e)));
});

test("validateYouTubeSource accepts a well-formed metadata bundle with fragments", () => {
  const r = validateYouTubeSource({
    url: "https://www.youtube.com/watch?v=abcDEF12345",
    publicationDate: "2026-01-01",
    author: "someone",
    fragments: [{ timestampSec: 30, text: "burst turn 1" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.videoId, "abcDEF12345");
});

test("validateYouTubeSource rejects malformed fragments", () => {
  const r = validateYouTubeSource({
    url: "https://youtu.be/abcDEF12345",
    publicationDate: "2026-01-01",
    author: "someone",
    fragments: [{ timestampSec: -1, text: "" }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /timestampSec/.test(e)));
  assert.ok(r.errors.some((e) => /text/.test(e)));
});
