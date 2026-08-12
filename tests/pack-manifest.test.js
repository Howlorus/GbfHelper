import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifestBundle } from "../src/lib/packs/manifest.js";

const validSha = "a".repeat(64);

function goodStrategyBundle() {
  return {
    "manifest.json": { id: "gbf.bahamut-proud.dark", name: "Bahamut Proud+ Dark", version: "1.0.0", kind: "strategy", schemaVersion: 1 },
    "checksums.json": { "raid.json": validSha, "strategies.json": validSha },
    "raid.json": { id: "bahamut-proud" },
    "strategies.json": [],
    "rotations.json": [],
    "substitutions.json": [],
    "rules.json": [],
    "sources.json": [],
    "migrations.json": [],
  };
}

test("well-formed strategy bundle is accepted", () => {
  assert.equal(validateManifestBundle(goodStrategyBundle()).ok, true);
});

test("missing manifest.json is refused", () => {
  const b = goodStrategyBundle(); delete b["manifest.json"];
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("manifest.json")));
});

test("bad semver in manifest.version is refused", () => {
  const b = goodStrategyBundle(); b["manifest.json"].version = "one";
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("semver")));
});

test("unknown pack kind is refused", () => {
  const b = goodStrategyBundle(); b["manifest.json"].kind = "bogus";
  assert.equal(validateManifestBundle(b).ok, false);
});

test("strategy pack missing a required §18.2 file is refused", () => {
  const b = goodStrategyBundle(); delete b["rotations.json"];
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("rotations.json")));
});

test("checksums must be 64-char hex sha256", () => {
  const b = goodStrategyBundle(); b["checksums.json"] = { "raid.json": "not a hash" };
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("sha256")));
});

test("non-strategy pack kinds do not require strategy files", () => {
  for (const kind of ["gameData", "terminology"]) {
    const bundle = {
      "manifest.json": { id: `x.${kind}`, name: kind, version: "1.0.0", kind, schemaVersion: 1 },
      "checksums.json": { "data.json": validSha },
      "data.json": {},
    };
    assert.equal(validateManifestBundle(bundle).ok, true);
  }
});

test("deep scan refuses javascript: URI in a JSON string value", () => {
  const b = goodStrategyBundle();
  b["strategies.json"] = [{ helpUrl: "javascript:alert(1)" }];
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /javascript: URI/.test(e)));
});

test("deep scan refuses <script> tag in a JSON string value", () => {
  const b = goodStrategyBundle();
  b["sources.json"] = [{ description: "see <script>evil()</script>" }];
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /<script> tag/.test(e)));
});

test("deep scan refuses on*= event handler in a JSON string value", () => {
  const b = goodStrategyBundle();
  b["rules.json"] = [{ description: "<div onclick=\"alert(1)\">" }];
  const r = validateManifestBundle(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /event handler/.test(e)));
});
