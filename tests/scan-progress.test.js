import { test } from "node:test";
import assert from "node:assert/strict";
import { initialProgress, acceptPayload } from "../src/lib/scan-progress.js";
import { CATEGORIES } from "../src/lib/scan-status.js";

test("initialProgress has zero counts across all categories", () => {
  const p = initialProgress();
  for (const c of CATEGORIES) assert.equal(p.purposeCounts[c], 0);
  assert.equal(p.lastObserved, null);
  assert.equal(p.startedAt, null);
});

test("acceptPayload increments the matching purpose and tracks last observation", () => {
  const p = acceptPayload(initialProgress(), {
    url: "https://game.granbluefantasy.jp/npc/list", purpose: "characters", receivedAt: 100,
  });
  assert.equal(p.purposeCounts.characters, 1);
  assert.equal(p.purposeCounts.weapons, 0);
  assert.deepEqual(p.lastObserved, { url: "https://game.granbluefantasy.jp/npc/list", purpose: "characters", timestamp: 100 });
  assert.equal(p.startedAt, 100);
});

test("silently drops payloads whose purpose is outside the scan surface", () => {
  const p = acceptPayload(initialProgress(), { url: "x", purpose: "battle events", receivedAt: 1 });
  assert.deepEqual(p, initialProgress());
});

test("handles missing / malformed payloads without crashing", () => {
  const base = initialProgress();
  assert.deepEqual(acceptPayload(base, null), base);
  assert.deepEqual(acceptPayload(base, "not an object"), base);
  assert.deepEqual(acceptPayload(base, {}), base);
  assert.deepEqual(acceptPayload(base, { purpose: 42 }), base);
});

test("startedAt is set on the first accepted payload and preserved thereafter", () => {
  const p1 = acceptPayload(initialProgress(), { url: "x", purpose: "characters", receivedAt: 100 });
  const p2 = acceptPayload(p1, { url: "y", purpose: "weapons", receivedAt: 200 });
  assert.equal(p2.startedAt, 100);
  assert.equal(p2.lastObserved.timestamp, 200);
});
