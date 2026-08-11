import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES, EVENTS, initialState, reduce, isSessionActive,
} from "../src/lib/state-machine.js";

const clock = () => 1;

test("initial state is Disabled with no tab", () => {
  const s = initialState();
  assert.equal(s.state, STATES.DISABLED);
  assert.equal(s.tabId, null);
  assert.equal(s.tabTitle, null);
});

test("Disabled + WAKE_IF_GBF(onGbf=true) -> GbfIdle carries tab metadata", () => {
  const s = reduce(initialState(),
    { type: EVENTS.WAKE_IF_GBF, onGbf: true, tabId: 42, tabTitle: "Granblue Fantasy" },
    { now: clock });
  assert.equal(s.state, STATES.GBF_IDLE);
  assert.equal(s.tabId, 42);
  assert.equal(s.tabTitle, "Granblue Fantasy");
});

test("Disabled + WAKE_IF_GBF(onGbf=false) is a no-op", () => {
  const s = reduce(initialState(), { type: EVENTS.WAKE_IF_GBF, onGbf: false }, { now: clock });
  assert.equal(s.state, STATES.DISABLED);
});

test("Disabled refuses START_ACCOUNT_SCAN (session start without wake)", () => {
  const s = reduce(initialState(), { type: EVENTS.START_ACCOUNT_SCAN, tabId: 42 }, { now: clock });
  assert.equal(s.state, STATES.DISABLED);
});

test("Disabled allows START_KNOWLEDGE_UPDATE (no GBF tab required)", () => {
  const s = reduce(initialState(), { type: EVENTS.START_KNOWLEDGE_UPDATE }, { now: clock });
  assert.equal(s.state, STATES.KNOWLEDGE_UPDATE_ACTIVE);
  assert.equal(s.tabId, null);
});

test("GbfIdle + START_ACCOUNT_SCAN -> AccountScanActive with tab", () => {
  const idle = { state: STATES.GBF_IDLE, tabId: 42, tabTitle: "GBF", since: 1 };
  const s = reduce(idle, { type: EVENTS.START_ACCOUNT_SCAN }, { now: clock });
  assert.equal(s.state, STATES.ACCOUNT_SCAN_ACTIVE);
  assert.equal(s.tabId, 42);
});

test("GbfIdle + START_CALIBRATION_SESSION -> CalibrationSessionActive", () => {
  const idle = { state: STATES.GBF_IDLE, tabId: 42, since: 1 };
  const s = reduce(idle, { type: EVENTS.START_CALIBRATION_SESSION }, { now: clock });
  assert.equal(s.state, STATES.CALIBRATION_SESSION_ACTIVE);
});

test("GbfIdle + START_RAID_SESSION -> RaidSessionActive", () => {
  const idle = { state: STATES.GBF_IDLE, tabId: 42, since: 1 };
  const s = reduce(idle, { type: EVENTS.START_RAID_SESSION }, { now: clock });
  assert.equal(s.state, STATES.RAID_SESSION_ACTIVE);
});

test("GbfIdle + START_KNOWLEDGE_UPDATE -> KnowledgeUpdateActive (drops tab)", () => {
  const idle = { state: STATES.GBF_IDLE, tabId: 42, since: 1 };
  const s = reduce(idle, { type: EVENTS.START_KNOWLEDGE_UPDATE }, { now: clock });
  assert.equal(s.state, STATES.KNOWLEDGE_UPDATE_ACTIVE);
  assert.equal(s.tabId, null);
});

test("GbfIdle + GBF_TAB_LOST -> Disabled", () => {
  const idle = { state: STATES.GBF_IDLE, tabId: 42, since: 1 };
  const s = reduce(idle, { type: EVENTS.GBF_TAB_LOST }, { now: clock });
  assert.equal(s.state, STATES.DISABLED);
  assert.equal(s.tabId, null);
});

test("tab-scoped SessionActive + STOP_SESSION -> GbfIdle (retains tab)", () => {
  for (const active of [STATES.ACCOUNT_SCAN_ACTIVE, STATES.CALIBRATION_SESSION_ACTIVE, STATES.RAID_SESSION_ACTIVE]) {
    const s = reduce({ state: active, tabId: 42, tabTitle: "GBF", since: 1 },
      { type: EVENTS.STOP_SESSION }, { now: clock });
    assert.equal(s.state, STATES.GBF_IDLE);
    assert.equal(s.tabId, 42);
  }
});

test("KnowledgeUpdateActive + STOP_SESSION -> Disabled (no GBF context to return to)", () => {
  const s = reduce({ state: STATES.KNOWLEDGE_UPDATE_ACTIVE, tabId: null, since: 1 },
    { type: EVENTS.STOP_SESSION }, { now: clock });
  assert.equal(s.state, STATES.DISABLED);
});

test("SessionActive + TAB_CLOSED (matching tab) -> GbfIdle and clears tab", () => {
  const s = reduce({ state: STATES.ACCOUNT_SCAN_ACTIVE, tabId: 42, tabTitle: "GBF", since: 1 },
    { type: EVENTS.TAB_CLOSED, tabId: 42 }, { now: clock });
  assert.equal(s.state, STATES.GBF_IDLE);
  assert.equal(s.tabId, null);
});

test("SessionActive + TAB_CLOSED (different tab) is a no-op", () => {
  const s = reduce({ state: STATES.ACCOUNT_SCAN_ACTIVE, tabId: 42, since: 1 },
    { type: EVENTS.TAB_CLOSED, tabId: 99 }, { now: clock });
  assert.equal(s.state, STATES.ACCOUNT_SCAN_ACTIVE);
});

test("SessionActive + TAB_NAVIGATED_AWAY (matching tab) -> GbfIdle", () => {
  const s = reduce({ state: STATES.RAID_SESSION_ACTIVE, tabId: 42, since: 1 },
    { type: EVENTS.TAB_NAVIGATED_AWAY, tabId: 42 }, { now: clock });
  assert.equal(s.state, STATES.GBF_IDLE);
});

test("SessionActive refuses concurrent START_X (no session-to-session hop)", () => {
  const s = reduce({ state: STATES.ACCOUNT_SCAN_ACTIVE, tabId: 42, since: 1 },
    { type: EVENTS.START_RAID_SESSION, tabId: 42 }, { now: clock });
  assert.equal(s.state, STATES.ACCOUNT_SCAN_ACTIVE);
});

test("isSessionActive matches every session state and nothing else", () => {
  for (const st of [
    STATES.ACCOUNT_SCAN_ACTIVE, STATES.CALIBRATION_SESSION_ACTIVE,
    STATES.RAID_SESSION_ACTIVE, STATES.KNOWLEDGE_UPDATE_ACTIVE,
  ]) {
    assert.equal(isSessionActive({ state: st }), true);
  }
  assert.equal(isSessionActive({ state: STATES.DISABLED }), false);
  assert.equal(isSessionActive({ state: STATES.GBF_IDLE }), false);
  assert.equal(isSessionActive(null), false);
});

test("reduce is total: unknown event on any state is a no-op", () => {
  for (const st of Object.values(STATES)) {
    const cs = { state: st, tabId: 42, since: 1 };
    const s = reduce(cs, { type: "MADE_UP_EVENT" }, { now: clock });
    assert.equal(s.state, st);
  }
});
