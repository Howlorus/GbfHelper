// Pack install pipeline (PRD §18): retrieve -> verify checksum -> validate
// schema -> declarative-only check (already in manifest validation) ->
// transactional install -> activate.
//
// Pure module. The service worker composes this with a real repository
// and SubtleCrypto for hashing.

import { validateManifestBundle } from "./manifest.js";

// Compute sha256 hex over a UTF-8 encoding of the given string.
export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify that every declared checksum matches the actual file content.
// `files` is { [filename]: rawString } (undigested); `checksums` from manifest.
export async function verifyChecksums(files, checksums) {
  const errors = [];
  for (const [filename, expected] of Object.entries(checksums || {})) {
    if (!Object.hasOwn(files, filename)) {
      errors.push(`checksum declared for missing file: ${filename}`);
      continue;
    }
    const actual = await sha256Hex(files[filename]);
    if (actual !== expected.toLowerCase()) {
      errors.push(`checksum mismatch: ${filename}`);
    }
  }
  return errors;
}

// Prepare an install: parse files, run schema validation, verify checksums.
// Returns { ok, bundle?, errors }.
export async function prepareInstall(rawFiles) {
  const errors = [];
  // Stage 0: refuse non-declarative files BEFORE parsing them (defense in
  // depth on §41.4 — a .js file can't be valid JSON but we should never
  // even attempt to parse it).
  for (const name of Object.keys(rawFiles || {})) {
    if (/\.(m?js|wasm|html|htm)$/i.test(name)) {
      errors.push(`non-declarative file forbidden: ${name}`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const bundle = {};
  for (const [name, raw] of Object.entries(rawFiles || {})) {
    try {
      bundle[name] = JSON.parse(raw);
    } catch (err) {
      errors.push(`${name}: not valid JSON (${err.message})`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const schema = validateManifestBundle(bundle);
  if (!schema.ok) return { ok: false, errors: schema.errors };

  const checksumErrors = await verifyChecksums(rawFiles, bundle["checksums.json"]);
  if (checksumErrors.length) return { ok: false, errors: checksumErrors };

  return { ok: true, bundle };
}

// Given a repository + a validated bundle, install the pack transactionally
// into the appropriate store. Any throw rolls back the whole write.
export async function installPack(repo, bundle, { wrapEnvelope, now = Date.now(), extensionVersion = "0.0.0" }) {
  const m = bundle["manifest.json"];
  const store = storeForKind(m.kind);
  const record = wrapEnvelope({
    id: m.id,
    name: m.name,
    version: m.version,
    kind: m.kind,
    active: true,
    installedAt: now,
    files: filesWithoutChecksums(bundle),
  }, { schemaVersion: m.schemaVersion, extensionVersion, now });
  await repo.transaction([store], async (tx) => {
    await tx.put(store, record);
  });
  return record;
}

function storeForKind(kind) {
  switch (kind) {
    case "gameData": return "gameData";
    case "strategy": return "strategyPacks";
    case "terminology": return "terminologyPacks";
    case "ai": return "gameData"; // AI pack co-located for now; separate store later
    default: throw new Error(`unknown pack kind: ${kind}`);
  }
}

function filesWithoutChecksums(bundle) {
  const out = {};
  for (const [name, content] of Object.entries(bundle)) {
    if (name === "checksums.json" || name === "manifest.json") continue;
    out[name] = content;
  }
  return out;
}
