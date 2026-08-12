// Migration engine per PRD §42: deterministic, tested, transactional,
// reversible, snapshot-preceded. The "snapshot" is provided by the
// repository transaction — abort restores the pre-transaction state.

export class MigrationRegistry {
  #migrations = new Map();

  register(from, to, forward, reverse = null) {
    if (typeof forward !== "function") throw new TypeError("forward must be a function");
    if (reverse !== null && typeof reverse !== "function") throw new TypeError("reverse must be a function or null");
    if (Math.abs(to - from) !== 1) throw new Error("migrations must be adjacent-version steps");
    const key = keyOf(Math.min(from, to), Math.max(from, to));
    if (this.#migrations.has(key)) throw new Error(`migration ${key} already registered`);
    this.#migrations.set(key, { from: Math.min(from, to), to: Math.max(from, to), forward, reverse });
  }

  plan(currentVersion, targetVersion) {
    if (currentVersion === targetVersion) return [];
    const steps = [];
    let v = currentVersion;
    const goForward = currentVersion < targetVersion;
    while (v !== targetVersion) {
      const nextV = goForward ? v + 1 : v - 1;
      const step = this.#migrations.get(keyOf(Math.min(v, nextV), Math.max(v, nextV)));
      if (!step) throw new Error(`no migration between v${v} and v${nextV}`);
      steps.push({ ...step, direction: goForward ? "forward" : "reverse" });
      v = nextV;
    }
    return steps;
  }

  applyStep(record, step) {
    if (step.direction === "forward") {
      return { ...step.forward(record), schemaVersion: step.to };
    }
    if (!step.reverse) {
      throw new Error(`no reverse migration for v${step.from}<->v${step.to}`);
    }
    return { ...step.reverse(record), schemaVersion: step.from };
  }

  applyAll(record, steps) {
    return steps.reduce((r, s) => this.applyStep(r, s), record);
  }
}

function keyOf(from, to) { return `${from}<->${to}`; }

// Migrate every record in `stores` to the target schemaVersion. Runs inside
// a single repository transaction — any throw aborts the whole apply,
// leaving the store in its pre-migration state.
export async function migrate(repository, stores, targetVersion, registry) {
  return repository.transaction(stores, async (tx) => {
    for (const store of stores) {
      const all = await tx.list(store);
      for (const rec of all) {
        const cv = rec.schemaVersion ?? 1;
        if (cv === targetVersion) continue;
        const steps = registry.plan(cv, targetVersion);
        const migrated = registry.applyAll(rec, steps);
        await tx.put(store, migrated);
      }
    }
  });
}
