// Service worker: wires the pure state machine to chrome APIs.
// Persistence: chrome.storage.session — cleared on browser restart, so the
// machine always boots to Disabled (§43 "no session auto-resumes").

import { reduce, initialState, isSessionActive, EVENTS } from "./lib/state-machine.js";
import { urlMatchesAllowlist } from "./lib/host-check.js";

const STATE_KEY = "state";

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
    console.log("[GBF Copilot] state:", current.state, "->", next.state, "on", action.type);
  }
  return next;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_STATE") {
        sendResponse(await getState());
      } else if (msg?.type === "DISPATCH" && msg.action) {
        sendResponse(await dispatch(msg.action));
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
