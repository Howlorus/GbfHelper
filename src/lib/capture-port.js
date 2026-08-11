// Capture Port contract — every backend adapter (DevTools, Debugger, Page
// Observation) implements this shape. Kept pure: no chrome.* imports so the
// domain layer can depend on it safely.

// Verbs the adapter MUST expose.
export const PORT_METHODS = Object.freeze(["attach", "detach"]);

// Verbs an adapter must NEVER expose. Enforced by tests: the adapter object
// literally lacks these methods, so no code path can call them via the Port.
// Passive observation only (PRD §7.3, §2 prohibitions).
export const FORBIDDEN_METHODS = Object.freeze([
  "simulateInput",
  "mutateDom",
  "modifyRequest",
  "sendRequest",
  "replay",
  "click",
  "typeText",
  "dispatchInput",
]);

export function assertPort(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("adapter must be an object");
  }
  if (typeof adapter.id !== "string" || !adapter.id) {
    throw new TypeError("adapter.id must be a non-empty string");
  }
  for (const m of PORT_METHODS) {
    if (typeof adapter[m] !== "function") {
      throw new TypeError(`adapter.${m} must be a function`);
    }
  }
  for (const forbidden of FORBIDDEN_METHODS) {
    if (adapter[forbidden] !== undefined) {
      throw new TypeError(`adapter must not expose '${forbidden}' (passive observation only)`);
    }
  }
  return true;
}
