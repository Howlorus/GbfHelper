// Forward-only migration engine per PRD §42. Reverse migrations are
// unimplemented until a real downgrade path is needed. Rollback on failure
// comes from the repository transaction (§43).

export class MigrationRegistry {
  #steps = new Map();

  register(from, to, forward) {
    if (to !== from + 1) throw new Error("migrations must be forward, adjacent steps (from + 1)");
    if (typeof forward !== "function") throw new TypeError("forward must be a function");
    const key = `${from}->${to}`;
    if (this.#steps.has(key)) throw new Error(`migration ${key} already registered`);
    this.#steps.set(key, { from, to, forward });
  }

  plan(currentVersion, targetVersion) {
    if (currentVersion === targetVersion) return [];
    if (currentVersion > targetVersion) throw new Error(`downgrade not supported (v${currentVersion} -> v${targetVersion})`);
    const steps = [];
    for (let v = currentVersion; v < targetVersion; v++) {
      const step = this.#steps.get(`${v}->${v + 1}`);
      if (!step) throw new Error(`no migration between v${v} and v${v + 1}`);
      steps.push(step);
    }
    return steps;
  }

  applyAll(record, steps) {
    return steps.reduce((r, s) => ({ ...s.forward(r), schemaVersion: s.to }), record);
  }
}

export async function migrate(repository, stores, targetVersion, registry) {
  return repository.transaction(stores, async (tx) => {
    for (const store of stores) {
      for (const rec of await tx.list(store)) {
        const cv = rec.schemaVersion ?? 1;
        if (cv === targetVersion) continue;
        await tx.put(store, registry.applyAll(rec, registry.plan(cv, targetVersion)));
      }
    }
  });
}
