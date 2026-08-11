import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLifecycleAction } from "../src/lib/scan-lifecycle.js";
import { STATES } from "../src/lib/state-machine.js";

test("entering AccountScanActive -> seed", () => {
  assert.equal(scanLifecycleAction({ state: STATES.GBF_IDLE }, { state: STATES.ACCOUNT_SCAN_ACTIVE }), "seed");
  assert.equal(scanLifecycleAction({ state: STATES.DISABLED }, { state: STATES.ACCOUNT_SCAN_ACTIVE }), "seed");
});

test("leaving AccountScanActive (any exit) -> clear", () => {
  assert.equal(scanLifecycleAction({ state: STATES.ACCOUNT_SCAN_ACTIVE }, { state: STATES.GBF_IDLE }), "clear");
  assert.equal(scanLifecycleAction({ state: STATES.ACCOUNT_SCAN_ACTIVE }, { state: STATES.DISABLED }), "clear");
});

test("all other transitions -> none", () => {
  assert.equal(scanLifecycleAction({ state: STATES.GBF_IDLE }, { state: STATES.RAID_SESSION_ACTIVE }), "none");
  assert.equal(scanLifecycleAction({ state: STATES.DISABLED }, { state: STATES.GBF_IDLE }), "none");
  assert.equal(scanLifecycleAction({ state: STATES.ACCOUNT_SCAN_ACTIVE }, { state: STATES.ACCOUNT_SCAN_ACTIVE }), "none");
});

test("robust to missing state fields", () => {
  assert.equal(scanLifecycleAction(null, null), "none");
  assert.equal(scanLifecycleAction(null, { state: STATES.ACCOUNT_SCAN_ACTIVE }), "seed");
});
