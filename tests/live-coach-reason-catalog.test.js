// US-11-06 AC3 CI check: scan the whole live-coach codebase for any
// `reasonKey: "..."` literal and fail if it isn't declared in reasons.js.
// This is the "as any / string coercion bypass" scanner the story mandates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { REASON_KEYS } from "../src/lib/live-coach/reasons.js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const TARGETS = [
  join(ROOT, "src/lib/live-coach"),
  join(ROOT, "src/live-coach"),
];

async function walk(dir) {
  try {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(p)));
      else out.push(p);
    }
    return out;
  } catch { return []; }
}

// Match:  reasonKey: "foo"   reasonKey: 'foo'   reasonKey:"foo"
const LITERAL_KEY = /reasonKey\s*:\s*['"]([^'"]+)['"]/g;

test("no free-form reasonKey literals in live-coach code (US-11-06 AC3)", async () => {
  const files = [];
  for (const dir of TARGETS) files.push(...await walk(dir));
  const jsFiles = files.filter((f) => extname(f) === ".js");

  const offenders = [];
  for (const file of jsFiles) {
    if (file.endsWith("reasons.js")) continue; // definitions live here
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(LITERAL_KEY)) {
      const literal = m[1];
      if (!REASON_KEYS.has(literal)) {
        offenders.push(`${file}: reasonKey "${literal}" not in catalog`);
      }
    }
  }
  assert.equal(offenders.length, 0, `Free-form reasonKey literals found:\n${offenders.join("\n")}`);
});
