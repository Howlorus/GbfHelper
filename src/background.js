// Service worker: wires the pure state machine to chrome APIs.
// Persistence: chrome.storage.session — cleared on browser restart, so the
// machine always boots to Disabled (§43 "no session auto-resumes").

import { STATES, reduce, initialState, isSessionActive, sessionMeta, EVENTS } from "./lib/state-machine.js";
import { urlMatchesAllowlist } from "./lib/host-check.js";
import { CaptureRegistry } from "./lib/capture-registry.js";
import { acceptPayload, initialProgress } from "./lib/scan-progress.js";
import { parsePayload } from "./lib/parsers/index.js";
import "./lib/parsers/characters.js";
import "./lib/parsers/weapons.js";
import "./lib/parsers/summons.js";
import "./lib/parsers/teams.js";
import { buildInventoryContent } from "./lib/inventory-commit.js";
import { scanLifecycleAction } from "./lib/scan-lifecycle.js";
import { IndexedDBRepository } from "./lib/repositories/idb.js";
import { STORE_NAMES } from "./lib/stores.js";
import { wrapEnvelope } from "./lib/envelope.js";
import { wrapWithValidation, CorruptionError } from "./lib/corruption.js";
import { prepareInstall, installPack } from "./lib/packs/install.js";
import { planUpdate } from "./lib/update-center/plan.js";
import { getPack, listPacks } from "./lib/packs/registry.js";

const repo = wrapWithValidation(new IndexedDBRepository({ stores: STORE_NAMES, version: 1 }));

const BADGE_BG = "#e0a020";
const BADGE_FG = "#101010";

const STATE_KEY = "state";
const SCAN_PROGRESS_KEY = "scanProgress";
const SCAN_BUFFER_KEY = "scanBuffer";

function initialScanBuffer() {
  return { characters: [], weapons: [], summons: [], teams: [], parserStatus: {}, warnings: [] };
}

// One registry per service-worker lifetime. When the SW dies, in-memory
// adapters die with it (there is no live buffer to leak). When a session
// ends via any path, detachAll is invoked before dispatch returns.
export const captureRegistry = new CaptureRegistry();

let allowlistPromise = null;
function loadAllowlist() {
  if (!allowlistPromise) {
    allowlistPromise = fetch(chrome.runtime.getURL("src/data/host-allowlist.json"))
      .then((r) => r.json())
      .catch((err) => { allowlistPromise = null; throw err; });
  }
  return allowlistPromise;
}

async function getState() {
  const { [STATE_KEY]: s } = await chrome.storage.session.get(STATE_KEY);
  return s || initialState();
}

async function setState(next) {
  await chrome.storage.session.set({ [STATE_KEY]: next });
}

async function dispatch(action) {
  const current = await getState();
  const next = reduce(current, action);
  if (next === current) return current;
  await setState(next);
  if (next.state !== current.state) {
    if (isSessionActive(current) && !isSessionActive(next)) {
      const { results } = await captureRegistry.detachAll();
      const failures = results.filter((r) => !r.ok).length;
      if (failures) console.warn(`[GBF Copilot] ${failures} adapter(s) failed to detach`);
    }
    const lifecycle = scanLifecycleAction(current, next);
    if (lifecycle === "seed") {
      await chrome.storage.session.set({
        [SCAN_PROGRESS_KEY]: initialProgress(),
        [SCAN_BUFFER_KEY]: initialScanBuffer(),
      });
    } else if (lifecycle === "clear") {
      await chrome.storage.session.remove([SCAN_PROGRESS_KEY, SCAN_BUFFER_KEY]);
    }
    await updateBadge(next);
  }
  return next;
}

async function updateBadge(state) {
  const meta = sessionMeta(state);
  if (!meta) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "GBF Copilot" });
    return;
  }
  await chrome.action.setBadgeText({ text: meta.badge });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: BADGE_FG });
  }
  const on = state.tabTitle ? ` on ${state.tabTitle}` : "";
  await chrome.action.setTitle({ title: `GBF Copilot — ${meta.kind}${on}` });
}

// Sync badge with persisted state on every service-worker cold start.
getState().then(updateBadge).catch((err) =>
  console.warn("[GBF Copilot] initial badge sync failed:", err));

// Extension update / reload / install: never carry a session across the boundary.
chrome.runtime.onInstalled.addListener(async () => {
  await captureRegistry.detachAll();
  await chrome.storage.session.remove(STATE_KEY);
  await updateBadge(initialState());
});

// Browser cold start: storage.session is already empty, but be explicit.
chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.remove(STATE_KEY);
  await updateBadge(initialState());
});

// Best-effort teardown when Chrome decides to unload the SW.
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    // fire-and-forget: onSuspend gives us no time for awaits.
    captureRegistry.detachAll().catch(() => {});
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port?.name?.startsWith("capture:")) return;
  const adapterId = port.name;
  try {
    captureRegistry.register(adapterId, () => new Promise((resolve) => {
      try { port.postMessage({ type: "STOP_CAPTURE" }); } catch {}
      try { port.disconnect(); } catch {}
      resolve();
    }));
  } catch (err) {
    console.warn(`[GBF Copilot] adapter register failed:`, err);
    try { port.disconnect(); } catch {}
    return;
  }
  port.onDisconnect.addListener(() => {
    if (captureRegistry.has(adapterId)) captureRegistry.unregister(adapterId);
  });
  port.onMessage.addListener((msg) => {
    if (msg?.type === "PAYLOAD" && msg.payload) {
      onCapturePayload(msg.payload).catch((err) =>
        console.warn("[GBF Copilot] scan sink failed:", err));
    }
  });
});

async function commitInventory() {
  const state = await getState();
  if (state.state !== STATES.ACCOUNT_SCAN_ACTIVE) {
    return { ok: false, error: "no active scan session" };
  }
  try {
    const { [SCAN_BUFFER_KEY]: buffer } = await chrome.storage.session.get(SCAN_BUFFER_KEY);
    const now = Date.now();
    const extensionVersion = chrome.runtime.getManifest().version;
    const content = buildInventoryContent(buffer);

    // Atomic transaction: archive the current "current" record as "previous",
    // then write the new commit. Any throw aborts the whole write.
    await repo.transaction(["inventory"], async (tx) => {
      const previous = await tx.get("inventory", "current");
      if (previous) {
        await tx.put("inventory", wrapEnvelope({ ...previous, id: "previous" }, {
          now, extensionVersion, previous,
        }));
      }
      const record = wrapEnvelope({ id: "current", ...content }, {
        schemaVersion: 1, extensionVersion, now, previous,
      });
      await tx.put("inventory", record);
    });

    await dispatch({ type: EVENTS.STOP_SESSION });
    return { ok: true, completeness: content.completeness, committedAt: now };
  } catch (err) {
    console.warn("[GBF Copilot] commit failed:", err);
    return { ok: false, error: String(err?.message || err) };
  }
}

async function planUpdateFor(rawFiles) {
  const prepared = await prepareInstall(rawFiles);
  if (!prepared.ok) return { ok: false, errors: prepared.errors };
  const manifest = prepared.bundle["manifest.json"];
  const kindToStore = { gameData: "gameData", strategy: "strategy", terminology: "terminology" };
  const packKind = kindToStore[manifest.kind];
  const currentPack = packKind ? await getPack(repo, packKind, manifest.id) : null;
  return { ok: true, plan: planUpdate(currentPack, manifest), manifest };
}

async function applyUpdate(rawFiles) {
  const prepared = await prepareInstall(rawFiles);
  if (!prepared.ok) return { ok: false, errors: prepared.errors };
  try {
    const now = Date.now();
    const extensionVersion = chrome.runtime.getManifest().version;
    // installPack writes transactionally — a mid-write failure rolls back
    // the whole install via the repo's transaction abort semantics (§43).
    const record = await installPack(repo, prepared.bundle, { wrapEnvelope, now, extensionVersion });
    return { ok: true, installed: { id: record.id, name: record.name, version: record.version, kind: record.kind } };
  } catch (err) {
    console.warn("[GBF Copilot] pack install failed:", err);
    return { ok: false, error: String(err?.message || err) };
  }
}

async function onCapturePayload(payload) {
  const state = await getState();
  if (state.state !== STATES.ACCOUNT_SCAN_ACTIVE) return; // AC4

  const store = await chrome.storage.session.get([SCAN_PROGRESS_KEY, SCAN_BUFFER_KEY]);
  const nextProgress = acceptPayload(store[SCAN_PROGRESS_KEY], payload);

  // Parse into records and append to the appropriate purpose bucket.
  const buffer = store[SCAN_BUFFER_KEY] || initialScanBuffer();
  const { records, warnings, status } = parsePayload(payload.purpose, payload.body);
  if (buffer[payload.purpose]) {
    buffer[payload.purpose] = buffer[payload.purpose].concat(records);
  }
  buffer.parserStatus = { ...buffer.parserStatus, [payload.purpose]: status };
  if (warnings.length) buffer.warnings = buffer.warnings.concat(warnings.map((w) => `${payload.purpose}: ${w}`));

  await chrome.storage.session.set({
    [SCAN_PROGRESS_KEY]: nextProgress,
    [SCAN_BUFFER_KEY]: buffer,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_STATE") {
        sendResponse(await getState());
      } else if (msg?.type === "DISPATCH" && msg.action) {
        sendResponse(await dispatch(msg.action));
      } else if (msg?.type === "COMMIT_INVENTORY") {
        sendResponse(await commitInventory());
      } else if (msg?.type === "GET_INVENTORY") {
        try {
          sendResponse(await repo.get("inventory", "current"));
        } catch (err) {
          sendResponse(err instanceof CorruptionError
            ? { error: "inventory is corrupt", details: String(err.message) }
            : { error: String(err?.message || err) });
        }
      } else if (msg?.type === "GET_STRATEGY_PACKS") {
        try {
          sendResponse((await repo.list("strategyPacks")).filter((p) => p.active !== false));
        } catch (err) {
          sendResponse({ error: String(err?.message || err) });
        }
      } else if (msg?.type === "PLAN_UPDATE") {
        sendResponse(await planUpdateFor(msg.rawFiles));
      } else if (msg?.type === "APPLY_UPDATE") {
        sendResponse(await applyUpdate(msg.rawFiles));
      } else if (msg?.type === "LIST_ALL_PACKS") {
        try {
          sendResponse(await listPacks(repo));
        } catch (err) {
          sendResponse({ error: String(err?.message || err) });
        }
      } else {
        sendResponse({ error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ error: String(err?.message || err) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getState();
  if (isSessionActive(s) && s.tabId === tabId) {
    await dispatch({ type: EVENTS.TAB_CLOSED, tabId });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const s = await getState();
  if (!isSessionActive(s) || s.tabId !== tabId) return;
  try {
    const allowlist = await loadAllowlist();
    const stillGbf = urlMatchesAllowlist(changeInfo.url, allowlist);
    if (!stillGbf) {
      await dispatch({ type: EVENTS.TAB_NAVIGATED_AWAY, tabId });
    }
  } catch (err) {
    console.warn("[GBF Copilot] allowlist load failed on nav:", err);
    await dispatch({ type: EVENTS.TAB_NAVIGATED_AWAY, tabId });
  }
});
