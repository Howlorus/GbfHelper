import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifestBundle, PACK_KINDS } from "../src/lib/packs/manifest.js";

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
  const r = validateManifestBundle(goodStrategyBundle());
  assert.equal(r.ok, true);
});

test("missing manifest.json or checksums.json is refused", () => {
  const bundle = goodStrategyBundle();
  delete bundle["manifest.json"];
  const r = validateManifestBundle(bundle);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("manifest.json")));
});

test("bad semver in manifest.version is refused", () => {
  const bundle = goodStrategyBundle();
  bundle["manifest.json"].version = "one";
  const r = validateManifestBundle(bundle);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("semver")));
});

test("unknown pack kind is refused", () => {
  const bundle = goodStrategyBundle();
  bundle["manifest.json"].kind = "bogus";
  const r = validateManifestBundle(bundle);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("kind")));
});

test("strategy pack missing a required §18.2 file is refused", () => {
  const bundle = goodStrategyBundle();
  delete bundle["rotations.json"];
  const r = validateManifestBundle(bundle);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("rotations.json")));
});

test("non-declarative files (.js, .wasm, .html) are refused (§41.4)", () => {
  const b1 = goodStrategyBundle(); b1["helper.js"] = "console.log(1)";
  assert.equal(validateManifestBundle(b1).ok, false);
  const b2 = goodStrategyBundle(); b2["macro.wasm"] = "";
  assert.equal(validateManifestBundle(b2).ok, false);
  const b3 = goodStrategyBundle(); b3["view.html"] = "<html/>";
  assert.equal(validateManifestBundle(b3).ok, false);
});

test("checksums must be 64-char hex sha256", () => {
  const bundle = goodStrategyBundle();
  bundle["checksums.json"] = { "raid.json": "not a hash" };
  const r = validateManifestBundle(bundle);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("sha256")));
});

test("non-strategy pack kinds do not require strategy files", () => {
  for (const kind of PACK_KINDS.filter((k) => k !== "strategy")) {
    const bundle = {
      "manifest.json": { id: `x.${kind}`, name: kind, version: "1.0.0", kind, schemaVersion: 1 },
      "checksums.json": { "data.json": validSha },
      "data.json": {},
    };
    const r = validateManifestBundle(bundle);
    assert.equal(r.ok, true, `${kind} bundle should be accepted: ${JSON.stringify(r.errors)}`);
  }
});
