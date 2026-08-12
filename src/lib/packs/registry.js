// Pack registry: lifecycle (remove / (de)activate) + queries.
// All operations are §7.6-safe: they only touch pack stores.

import { wrapEnvelope } from "../envelope.js";

const PACK_STORES = ["gameData", "strategyPacks", "terminologyPacks"];

export function storeForKind(kind) {
  switch (kind) {
    case "gameData": return "gameData";
    case "strategy": return "strategyPacks";
    case "terminology": return "terminologyPacks";
    case "ai": return "gameData";
    default: throw new Error(`unknown pack kind: ${kind}`);
  }
}

export async function removePack(repo, kind, id) {
  const store = storeForKind(kind);
  await repo.delete(store, id);
}

export async function setPackActive(repo, kind, id, active) {
  const store = storeForKind(kind);
  await repo.transaction([store], async (tx) => {
    const rec = await tx.get(store, id);
    if (!rec) throw new Error(`pack not found: ${store}/${id}`);
    await tx.put(store, wrapEnvelope({ ...rec, active }, {
      now: Date.now(),
      previous: rec,
      schemaVersion: rec.schemaVersion,
      extensionVersion: rec.extensionVersion,
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

// Simple semver-lite compatibility: "min:MAJOR.MINOR.PATCH" or "MAJOR.MINOR.PATCH"
// means "current must be >= that version". No full range grammar (yet).
export function isCompatible(manifest, currentExtensionVersion) {
  const req = manifest?.requiredExtensionVersion;
  if (!req) return { ok: true };
  const [reqMaj, reqMin, reqPatch] = parseSemver(req.replace(/^min:/, ""));
  const [curMaj, curMin, curPatch] = parseSemver(currentExtensionVersion);
  if (reqMaj == null) return { ok: false, reason: `invalid requiredExtensionVersion: ${req}` };
  const cur = curMaj * 1e6 + curMin * 1e3 + curPatch;
  const need = reqMaj * 1e6 + reqMin * 1e3 + reqPatch;
  return cur >= need ? { ok: true } : { ok: false, reason: `requires >= ${req}, running ${currentExtensionVersion}` };
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  return m ? [+m[1], +m[2], +m[3]] : [null, null, null];
}
