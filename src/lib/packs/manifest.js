// Pack manifest schema (PRD §18.2). A pack is delivered as a bundle of
// declarative JSON files — no executable code allowed. This module validates
// the SHAPE of a candidate bundle before any install step runs.
//
// The bundle is represented as { [filename]: parsedJson } — callers unzip /
// read the files first, then hand the map to validateManifestBundle.

export const REQUIRED_FILES = Object.freeze([
  "manifest.json",
  "checksums.json",
]);

// Strategy pack files (§18.2). Absence is allowed only for non-strategy packs
// (Game Data / Terminology / AI) — the manifest declares its `kind`.
export const STRATEGY_PACK_FILES = Object.freeze([
  "raid.json",
  "strategies.json",
  "rotations.json",
  "substitutions.json",
  "rules.json",
  "sources.json",
  "migrations.json",
]);

export const PACK_KINDS = Object.freeze(["gameData", "strategy", "terminology", "ai"]);

export function validateManifestBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, errors: ["bundle must be an object mapping filename -> parsed JSON"] };
  }

  for (const f of REQUIRED_FILES) {
    if (!Object.hasOwn(bundle, f)) errors.push(`missing required file: ${f}`);
  }
  if (errors.length) return { ok: false, errors };

  const manifest = bundle["manifest.json"];
  errors.push(...validateManifest(manifest));

  const checksums = bundle["checksums.json"];
  errors.push(...validateChecksums(checksums));

  if (manifest?.kind === "strategy") {
    for (const f of STRATEGY_PACK_FILES) {
      if (!Object.hasOwn(bundle, f)) errors.push(`strategy pack missing: ${f}`);
    }
  }

  // Refuse any file that looks executable — belt and suspenders on §41.4.
  for (const name of Object.keys(bundle)) {
    if (/\.(m?js|wasm|html|htm)$/i.test(name)) {
      errors.push(`non-declarative file forbidden: ${name}`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== "object") return ["manifest.json is not an object"];
  if (typeof m.id !== "string" || !m.id) errs.push("manifest.id must be a non-empty string");
  if (typeof m.name !== "string" || !m.name) errs.push("manifest.name must be a non-empty string");
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version)) errs.push("manifest.version must be semver (e.g. 1.0.0)");
  if (!PACK_KINDS.includes(m.kind)) errs.push(`manifest.kind must be one of: ${PACK_KINDS.join(", ")}`);
  if (typeof m.schemaVersion !== "number") errs.push("manifest.schemaVersion must be a number");
  if (m.requiredExtensionVersion && typeof m.requiredExtensionVersion !== "string") {
    errs.push("manifest.requiredExtensionVersion must be a string (semver range)");
  }
  return errs;
}

function validateChecksums(c) {
  if (!c || typeof c !== "object") return ["checksums.json must be an object mapping filename -> sha256 hex"];
  const errs = [];
  for (const [filename, hash] of Object.entries(c)) {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash)) {
      errs.push(`checksums.json: ${filename} is not a valid 64-char hex sha256`);
    }
  }
  return errs;
}
