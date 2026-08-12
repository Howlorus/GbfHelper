// Pack install pipeline (PRD §18). Pure — SW composes with a real repo.

import { validateManifestBundle } from "./manifest.js";
import { storeForKind } from "./registry.js";

export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyChecksums(files, checksums) {
  const errors = [];
  for (const [filename, expected] of Object.entries(checksums || {})) {
    if (!Object.hasOwn(files, filename)) {
      errors.push(`checksum declared for missing file: ${filename}`);
      continue;
    }
    if (await sha256Hex(files[filename]) !== expected.toLowerCase()) {
      errors.push(`checksum mismatch: ${filename}`);
    }
  }
  return errors;
}

// Bundle size cap (§41.6 pack security — size-limited).
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024; // 4 MiB

export async function prepareInstall(rawFiles) {
  const errors = [];
  // Stage 0: refuse non-declarative files by extension BEFORE parsing.
  for (const name of Object.keys(rawFiles || {})) {
    if (/\.(m?js|wasm|html|htm)$/i.test(name)) {
      errors.push(`non-declarative file forbidden: ${name}`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Stage 0.5: bundle size cap.
  let total = 0;
  for (const raw of Object.values(rawFiles || {})) total += (raw ?? "").length;
  if (total > MAX_BUNDLE_BYTES) return { ok: false, errors: [`bundle exceeds size cap (${total} > ${MAX_BUNDLE_BYTES} bytes)`] };

  const bundle = {};
  for (const [name, raw] of Object.entries(rawFiles || {})) {
    try { bundle[name] = JSON.parse(raw); }
    catch (err) { errors.push(`${name}: not valid JSON (${err.message})`); }
  }
  if (errors.length) return { ok: false, errors };

  const schema = validateManifestBundle(bundle);
  if (!schema.ok) return { ok: false, errors: schema.errors };

  const checksumErrors = await verifyChecksums(rawFiles, bundle["checksums.json"]);
  if (checksumErrors.length) return { ok: false, errors: checksumErrors };

  return { ok: true, bundle };
}

export async function installPack(repo, bundle, { wrapEnvelope, now = Date.now(), extensionVersion = "0.0.0" }) {
  const m = bundle["manifest.json"];
  const store = storeForKind(m.kind);
  const record = wrapEnvelope({
    id: m.id, name: m.name, version: m.version, kind: m.kind, active: true,
  }, { schemaVersion: m.schemaVersion, extensionVersion, now });
  await repo.transaction([store], async (tx) => { await tx.put(store, record); });
  return record;
}
