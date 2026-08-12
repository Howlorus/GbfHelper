// US-11-01 flow + US-11-02 compact overlay UX (§34.4).
// The overlay is a Chrome popup window. It reads battle state from
// chrome.storage.session, runs the rules-engine + advice pipeline in-page
// (pure — no side effects), and shows the resulting five §34.4 fields.
//
// - Position + size persisted per-user in chrome.storage.local (AC2/AC3).
// - Alt+O toggles collapse/expand without stealing focus (AC4).
// - CSS handles prefers-reduced-motion (AC5).
// - When state quality < Synchronized, the four content fields dim and
//   only the Synchronization field is emphasized (AC6, US-11-05).

import { evaluate } from "../lib/live-coach/rules-engine.js";
import { buildAdvice } from "../lib/live-coach/advice.js";
import { initialStabilizer, updateStabilizer } from "../lib/live-coach/suspend.js";
import { STATE_QUALITY, computeStateQuality } from "../lib/battle/state-model.js";

const OVERLAY_PREFS_KEY = "liveCoachOverlayPrefs";
const BATTLE_STATE_KEY = "battleState";
const STATE_KEY = "state";

let stabilizer = initialStabilizer();
let latestRules = [];

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

async function loadRules() {
  const packs = await send({ type: "GET_STRATEGY_PACKS" });
  if (!Array.isArray(packs)) return [];
  // Rules live at pack.strategy.rules — a Strategy Pack ships a rules array.
  const rules = [];
  for (const p of packs) {
    for (const r of p?.strategy?.rules || []) {
      // Rules from packs are declarative — we can't ship arbitrary code across
      // extension boundaries safely. Compile them here into { when, produce }
      // closures. Only whitelisted operators are supported.
      const compiled = compileDeclarativeRule(r, { packId: p.id, packVersion: p.version });
      if (compiled) rules.push(compiled);
    }
  }
  return rules;
}

// ponytail: rules are declarative JSON, not JS. This compiler covers the
// smallest set that would let a first Strategy Pack emit advice — extend
// only when a real pack demands it.
function compileDeclarativeRule(r, { packId, packVersion }) {
  if (!r || typeof r !== "object" || !r.id || !r.reasonKey) return null;
  const priority = r.priority || "normal";
  const confidence = r.confidence || "Uncertain";
  const cond = r.when || {};
  return {
    id: r.id, priority, packId, packVersion,
    when(state) {
      if (cond.stateQualityAtLeast && !qualityAtLeast(state?.stateQuality, cond.stateQualityAtLeast)) return false;
      if (cond.turnEquals != null && state?.turn !== cond.turnEquals) return false;
      if (cond.bossPhaseIn && !cond.bossPhaseIn.includes(state?.boss?.phase)) return false;
      if (cond.always === true) return true;
      // No positive gate → match by default when other gates pass (empty when).
      return true;
    },
    produce(state) {
      return {
        action: r.action || null,
        reasonKey: r.reasonKey,
        reasonParams: fillReasonParams(r.reasonParams || {}, state),
        confidence,
        uncertainty: r.uncertainty || null,
        expirationTicks: r.expirationTicks || null,
      };
    },
  };
}

function qualityAtLeast(actual, required) {
  const rank = { Synchronized: 3, PartiallySynchronized: 2, Stale: 1, Conflicting: 0 };
  return (rank[actual] ?? 0) >= (rank[required] ?? 0);
}

// Replace `{fromState:"path.to.value"}` params by reading state at that path.
function fillReasonParams(template, state) {
  const out = {};
  for (const [k, v] of Object.entries(template)) {
    if (v && typeof v === "object" && typeof v.fromState === "string") {
      out[k] = readPath(state, v.fromState);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function readPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), obj);
}

// ---- render ---------------------------------------------------------------

function setField(id, text) {
  document.getElementById(id).textContent = String(text ?? "—");
}

function render(advice) {
  document.body.dataset.suspended = advice.suspended ? "true" : "false";
  setField("next-threat", advice.nextThreat ?? "—");
  setField("action", advice.action ?? "—");
  setField("reason", advice.reason);
  setField("confidence", advice.confidence);
  const syncEl = document.getElementById("synchronization");
  syncEl.textContent = advice.synchronization;
  syncEl.className = "value " + syncClass(advice.synchronization);
}

function syncClass(q) {
  if (q === STATE_QUALITY.SYNCHRONIZED) return "sync-ok";
  if (q === STATE_QUALITY.PARTIALLY_SYNCHRONIZED) return "sync-warn";
  return "sync-bad";
}

// ---- tick -----------------------------------------------------------------

async function tick() {
  const [{ [STATE_KEY]: state }, { [BATTLE_STATE_KEY]: battle }] = await Promise.all([
    chrome.storage.session.get(STATE_KEY),
    chrome.storage.session.get(BATTLE_STATE_KEY),
  ]);
  const active = state?.state === "RaidSessionActive";
  if (!active) {
    render({
      suspended: true,
      nextThreat: null, action: null,
      reason: "Guidance suspended: no active raid session.",
      confidence: "InsufficientData",
      synchronization: "Idle",
    });
    return;
  }

  const quality = battle?.stateQuality || computeStateQuality(battle || null);
  stabilizer = updateStabilizer(stabilizer, quality);
  const rulesOutput = evaluate(battle || {}, latestRules, { packId: null });
  const advice = buildAdvice({
    rulesOutput,
    quality,
    stabilizer,
    nextThreat: battle?.boss?.nextOmen || null,
  });
  render(advice);
}

// ---- collapse / keyboard --------------------------------------------------

function toggleCollapsed() {
  const now = document.body.dataset.collapsed === "true";
  document.body.dataset.collapsed = now ? "false" : "true";
  savePrefs({ collapsed: !now });
}

// ---- persistence ----------------------------------------------------------

async function loadPrefs() {
  try {
    const { [OVERLAY_PREFS_KEY]: prefs } = await chrome.storage.local.get(OVERLAY_PREFS_KEY);
    return prefs || {};
  } catch { return {}; }
}
async function savePrefs(patch) {
  const cur = await loadPrefs();
  await chrome.storage.local.set({ [OVERLAY_PREFS_KEY]: { ...cur, ...patch } });
}

async function applySavedGeometry() {
  const prefs = await loadPrefs();
  if (prefs.collapsed) document.body.dataset.collapsed = "true";
  if (chrome.windows?.getCurrent && Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) {
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.windows.update(win.id, {
        left: prefs.left, top: prefs.top,
        width: prefs.width || undefined, height: prefs.height || undefined,
      });
    } catch { /* ignore — user can reposition manually */ }
  }
}

let saveGeometryTimer = null;
function scheduleGeometrySave() {
  if (!chrome.windows?.getCurrent) return;
  clearTimeout(saveGeometryTimer);
  saveGeometryTimer = setTimeout(async () => {
    try {
      const win = await chrome.windows.getCurrent();
      await savePrefs({ left: win.left, top: win.top, width: win.width, height: win.height });
    } catch { /* ignore */ }
  }, 500);
}

// ---- init -----------------------------------------------------------------

async function init() {
  await applySavedGeometry();
  latestRules = await loadRules();

  document.getElementById("stop-btn").addEventListener("click", async () => {
    await send({ type: "DISPATCH", action: { type: "STOP_SESSION" } });
  });

  window.addEventListener("keydown", (ev) => {
    // Alt+O toggle. Runs without stealing focus from the game window.
    if (ev.altKey && (ev.key === "o" || ev.key === "O")) {
      ev.preventDefault();
      toggleCollapsed();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    if (changes[BATTLE_STATE_KEY] || changes[STATE_KEY]) tick();
  });

  // Window geometry: save whenever this popup is resized/moved.
  if (chrome.windows?.onBoundsChanged) {
    chrome.windows.onBoundsChanged.addListener(scheduleGeometrySave);
  } else {
    window.addEventListener("resize", scheduleGeometrySave);
  }

  await tick();
}

init().catch((err) => {
  document.getElementById("reason").textContent =
    `Live Coach init failed: ${err?.message || err}`;
});
