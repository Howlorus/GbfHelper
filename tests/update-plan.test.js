import { test } from "node:test";
import assert from "node:assert/strict";
import { planUpdate } from "../src/lib/update-center/plan.js";

const newManifest = { id: "gbf.bp.dark", name: "BP Dark", version: "1.1.0" };

test("null current pack -> new install", () => {
  const p = planUpdate(null, newManifest);
  assert.equal(p.kind, "new");
  assert.match(p.summary, /Install BP Dark v1.1.0/);
});

test("same version -> no-change", () => {
  const p = planUpdate({ id: newManifest.id, version: "1.1.0", name: "BP Dark" }, newManifest);
  assert.equal(p.kind, "no-change");
});

test("higher new version -> update with from/to", () => {
  const p = planUpdate({ id: newManifest.id, version: "1.0.0", name: "BP Dark" }, newManifest);
  assert.equal(p.kind, "update");
  assert.equal(p.currentVersion, "1.0.0");
  assert.equal(p.newVersion, "1.1.0");
  assert.match(p.summary, /v1.0.0.*v1.1.0/);
});

test("lower new version -> downgrade (surfaced, not blocked)", () => {
  const p = planUpdate({ id: newManifest.id, version: "2.0.0", name: "BP Dark" }, newManifest);
  assert.equal(p.kind, "downgrade");
  assert.match(p.summary, /Downgrade/);
});
