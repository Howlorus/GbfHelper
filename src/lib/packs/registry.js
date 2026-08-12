// Pack registry: lifecycle (remove / (de)activate) + queries.
// All operations are §7.6-safe: only pack stores are ever touched.

import { wrapEnvelope } from "../envelope.js";

const PACK_STORES = ["gameData", "strategyPacks", "terminologyPacks"];
const KIND_TO_STORE = { gameData: "gameData", strategy: "strategyPacks", terminology: "terminologyPacks" };

export function storeForKind(kind) {
  const s = KIND_TO_STORE[kind];
  if (!s) throw new Error(`unknown pack kind: ${kind}`);
  return s;
}

export async function removePack(repo, kind, id) {
  await repo.delete(storeForKind(kind), id);
}

export async function setPackActive(repo, kind, id, active) {
  const store = storeForKind(kind);
  await repo.transaction([store], async (tx) => {
    const rec = await tx.get(store, id);
    if (!rec) throw new Error(`pack not found: ${store}/${id}`);
    await tx.put(store, wrapEnvelope({ ...rec, active }, {
      now: Date.now(), previous: rec,
      schemaVersion: rec.schemaVersion, extensionVersion: rec.extensionVersion,
    }));
  });
}

export async function listPacks(repo, { kind, active } = {}) {
  const stores = kind ? [storeForKind(kind)] : PACK_STORES;
  const out = [];
  for (const s of stores) {
    for (const p of await repo.list(s)) {
      if (active !== undefined && p.active !== active) continue;
      out.push(p);
    }
  }
  return out;
}

export async function getPack(repo, kind, id) {
  return repo.get(storeForKind(kind), id);
}
