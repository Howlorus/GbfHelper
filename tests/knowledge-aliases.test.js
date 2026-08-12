import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAliases, resolveAlias, ENTITY_KINDS } from "../src/lib/knowledge/aliases.js";

const zetaEn = { entityId: "char.zeta", entityKind: "character", language: "en", text: "Zeta", aliasType: "official", confidence: "high" };
const zetaJa = { entityId: "char.zeta", entityKind: "character", language: "ja", text: "ゼタ", aliasType: "official", confidence: "high" };
const zetaCommunity = { entityId: "char.zeta", entityKind: "character", language: "en", text: "zeta", aliasType: "community", confidence: "high" };
const bahamut = { entityId: "raid.bp", entityKind: "raid", language: "en", text: "BP", aliasType: "abbreviation", confidence: "medium" };

test("validateAliases accepts a well-formed entry set", () => {
  const r = validateAliases([zetaEn, zetaJa, bahamut]);
  assert.equal(r.ok, true);
});

test("validateAliases rejects missing / invalid fields with per-row errors", () => {
  const r = validateAliases([{ entityId: "", entityKind: "nope", language: "", text: "", aliasType: "wat", confidence: "??" }]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /entityId/.test(e)));
  assert.ok(r.errors.some((e) => /entityKind/.test(e)));
  assert.ok(r.errors.some((e) => /aliasType/.test(e)));
});

test("resolveAlias exact-match returns the entity with source-language + confidence", () => {
  const r = resolveAlias("Zeta", [zetaEn, zetaJa]);
  assert.equal(r.length, 1);
  assert.equal(r[0].entityId, "char.zeta");
  assert.equal(r[0].language, "en");
});

test("resolveAlias is case-insensitive on the query", () => {
  const r = resolveAlias("zeta", [zetaEn]);
  assert.equal(r.length, 1);
});

test("resolveAlias returns empty list for unknown terms (no fabricated match)", () => {
  const r = resolveAlias("Nobody", [zetaEn, zetaJa]);
  assert.deepEqual(r, []);
});

test("resolveAlias returns all ambiguous candidates, official ranked first", () => {
  const officialSecond = { ...zetaCommunity, aliasType: "community", confidence: "high" };
  const officialFirst = { ...zetaEn };
  const r = resolveAlias("zeta", [officialSecond, officialFirst]);
  assert.equal(r.length, 2);
  assert.equal(r[0].aliasType, "official");
  assert.equal(r[1].aliasType, "community");
});

test("resolveAlias respects the language filter", () => {
  const r = resolveAlias("ゼタ", [zetaEn, zetaJa], { language: "ja" });
  assert.equal(r.length, 1);
  assert.equal(r[0].language, "ja");
});

test("resolveAlias never fabricates a match on empty query", () => {
  assert.deepEqual(resolveAlias("", [zetaEn]), []);
  assert.deepEqual(resolveAlias("   ", [zetaEn]), []);
});

test("ENTITY_KINDS covers §16.3 target categories", () => {
  for (const k of ["character", "weapon", "summon", "raid", "mechanic"]) {
    assert.ok(ENTITY_KINDS.includes(k));
  }
});
