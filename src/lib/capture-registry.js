// In-memory registry of active capture adapters, owned by the service worker.
// Any state transition SessionActive -> non-active MUST call detachAll();
// detach also fires on chrome.runtime.onInstalled / onStartup as a safety net.
//
// The registry is cleared BEFORE awaiting adapter detach callbacks: this
// guarantees no code can register a new adapter mid-shutdown, and no adapter
// callback can prevent siblings from running (errors are logged, swallowed).

export class CaptureRegistry {
  #adapters = new Map();

  get size() { return this.#adapters.size; }

  has(id) { return this.#adapters.has(id); }

  register(id, detach) {
    if (typeof id !== "string" || !id) throw new Error("adapter id must be a non-empty string");
    if (typeof detach !== "function") throw new Error("detach must be a function");
    if (this.#adapters.has(id)) throw new Error(`adapter '${id}' is already registered`);
    this.#adapters.set(id, detach);
  }

  unregister(id) {
    return this.#adapters.delete(id);
  }

  async detachAll({ onError } = {}) {
    const started = Date.now();
    const snapshot = [...this.#adapters.entries()];
    this.#adapters.clear();
    const results = await Promise.all(snapshot.map(async ([id, fn]) => {
      try { await fn(); return { id, ok: true }; }
      catch (err) {
        if (onError) onError(id, err);
        else console.warn(`[GBF Copilot] detach '${id}' failed:`, err);
        return { id, ok: false, err };
      }
    }));
    return { durationMs: Date.now() - started, results };
  }
}
