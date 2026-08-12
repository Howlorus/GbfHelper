// Pack manifest schema (PRD §18.2). Bundle is { [filename]: parsedJson }.

const REQUIRED_FILES = ["manifest.json", "checksums.json"];
const STRATEGY_PACK_FILES = ["raid.json", "strategies.json", "rotations.json", "substitutions.json", "rules.json", "sources.json", "migrations.json"];
const PACK_KINDS = ["gameData", "strategy", "terminology"];

export function validateManifestBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object") return { ok: false, errors: ["bundle must be an object"] };

  for (const f of REQUIRED_FILES) {
    if (!Object.hasOwn(bundle, f)) errors.push(`missing required file: ${f}`);
  }
  if (errors.length) return { ok: false, errors };

  errors.push(...validateManifest(bundle["manifest.json"]));
  errors.push(...validateChecksums(bundle["checksums.json"]));
  errors.push(...scanForExecutableContent(bundle));

  if (bundle["manifest.json"]?.kind === "strategy") {
    for (const f of STRATEGY_PACK_FILES) {
      if (!Object.hasOwn(bundle, f)) errors.push(`strategy pack missing: ${f}`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== "object") return ["manifest.json is not an object"];
  if (typeof m.id !== "string" || !m.id) errs.push("manifest.id must be a non-empty string");
  if (typeof m.name !== "string" || !m.name) errs.push("manifest.name must be a non-empty string");
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version)) errs.push("manifest.version must be semver");
  if (!PACK_KINDS.includes(m.kind)) errs.push(`manifest.kind must be one of: ${PACK_KINDS.join(", ")}`);
  if (typeof m.schemaVersion !== "number") errs.push("manifest.schemaVersion must be a number");
  return errs;
}

function validateChecksums(c) {
  if (!c || typeof c !== "object") return ["checksums.json must be an object"];
  const errs = [];
  for (const [name, hash] of Object.entries(c)) {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash)) {
      errs.push(`checksums.json: ${name} is not a valid 64-char hex sha256`);
    }
  }
  return errs;
}

// Deep scan of parsed JSON for executable payloads embedded as strings
// inside otherwise-declarative fields (§41.4, §41.5).
function scanForExecutableContent(bundle) {
  const errs = [];
  const patterns = [
    { rx: /^javascript:/i, why: "javascript: URI" },
    { rx: /^data:.*script/i, why: "data: URI with script MIME" },
    { rx: /<script\b/i, why: "<script> tag string" },
    { rx: /\son[a-z]+\s*=\s*["']/i, why: "inline on*= event handler" },
  ];
  function scan(node, path) {
    if (typeof node === "string") {
      for (const { rx, why } of patterns) {
        if (rx.test(node)) { errs.push(`executable payload (${why}) at ${path || "<root>"}`); return; }
      }
    } else if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) scan(node[i], `${path}[${i}]`);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) scan(v, path ? `${path}.${k}` : k);
    }
  }
  for (const [name, doc] of Object.entries(bundle)) {
    if (name === "checksums.json") continue;
    scan(doc, name);
  }
  return errs;
}
