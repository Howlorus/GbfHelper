import { test } from "node:test";
import assert from "node:assert/strict";
import { STATES, sessionMeta } from "../src/lib/state-machine.js";

test("sessionMeta returns null for non-session states", () => {
  assert.equal(sessionMeta({ state: STATES.DISABLED }), null);
  assert.equal(sessionMeta({ state: STATES.GBF_IDLE }), null);
  assert.equal(sessionMeta(null), null);
  assert.equal(sessionMeta(undefined), null);
});

test("sessionMeta returns { kind, category, badge } for each session state", () => {
  const scan = sessionMeta({ state: STATES.ACCOUNT_SCAN_ACTIVE });
  assert.deepEqual(scan, { kind: "Account Scan", category: "inventory", badge: "SCAN" });

  const cal = sessionMeta({ state: STATES.CALIBRATION_SESSION_ACTIVE });
  assert.equal(cal.kind, "Calibration Session");
  assert.equal(cal.badge, "CAL");

  const raid = sessionMeta({ state: STATES.RAID_SESSION_ACTIVE });
  assert.equal(raid.kind, "Raid Session");
  assert.equal(raid.badge, "RAID");

  const upd = sessionMeta({ state: STATES.KNOWLEDGE_UPDATE_ACTIVE });
  assert.equal(upd.kind, "Knowledge Update");
  assert.equal(upd.badge, "UPD");
});

test("all badge labels fit Chrome's 4-character limit", () => {
  for (const st of Object.values(STATES)) {
    const m = sessionMeta({ state: st });
    if (m) assert.ok(m.badge.length <= 4, `badge too long: ${m.badge}`);
  }
});
