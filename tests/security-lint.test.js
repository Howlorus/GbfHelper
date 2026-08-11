import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const SRC = join(ROOT, "src");
const MANIFEST = join(ROOT, "manifest.json");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const FORBIDDEN_JS = [
  { pattern: /\.innerHTML\s*=/g, why: ".innerHTML= (write) parses HTML — use textContent or renderText" },
  { pattern: /\.outerHTML\s*=/g, why: ".outerHTML= parses HTML — use replaceWith with sanitized nodes" },
  { pattern: /\binsertAdjacentHTML\s*\(/g, why: "insertAdjacentHTML parses HTML — build nodes and appendChild instead" },
  { pattern: /\bdocument\.write\s*\(/g, why: "document.write is banned" },
  { pattern: /\beval\s*\(/g, why: "eval is banned (CSP would refuse it anyway)" },
  { pattern: /\bnew\s+Function\s*\(/g, why: "new Function is banned (CSP would refuse it anyway)" },
];

const ALLOW_MARKER = "gbf-lint-allow";

test("no forbidden DOM/JS patterns in src/**/*.js (allow with // gbf-lint-allow: <reason>)", async () => {
  const files = (await walk(SRC)).filter((f) => extname(f) === ".js");
  const findings = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const { pattern, why } of FORBIDDEN_JS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          findings.push(`${file}:${i + 1}  ${why}\n    ${line.trim()}`);
        }
      }
    });
  }
  assert.equal(findings.length, 0, `Forbidden patterns:\n${findings.join("\n")}`);
});

test("no inline <script> in extension HTML (every <script> must have src=)", async () => {
  const html = (await walk(SRC)).filter((f) => extname(f) === ".html");
  const findings = [];
  for (const file of html) {
    const text = await readFile(file, "utf8");
    const tags = text.match(/<script\b[^>]*>/gi) || [];
    for (const tag of tags) {
      if (!/\bsrc\s*=/.test(tag)) {
        findings.push(`${file}: inline script tag  ${tag}`);
      }
    }
  }
  assert.equal(findings.length, 0, `Inline scripts:\n${findings.join("\n")}`);
});

test("no inline event handlers (on*=) in extension HTML", async () => {
  const html = (await walk(SRC)).filter((f) => extname(f) === ".html");
  const findings = [];
  for (const file of html) {
    const text = await readFile(file, "utf8");
    // Match on-handlers on any element. Attribute names: onclick, onload, etc.
    const matches = text.match(/\s(on[a-z]+)\s*=/gi) || [];
    if (matches.length > 0) {
      findings.push(`${file}: inline handlers ${matches.join(", ")}`);
    }
  }
  assert.equal(findings.length, 0, `Inline handlers:\n${findings.join("\n")}`);
});

test("manifest CSP forbids inline scripts, eval, and remote script origins", async () => {
  const m = JSON.parse(await readFile(MANIFEST, "utf8"));
  const csp = m.content_security_policy?.extension_pages;
  assert.ok(csp, "manifest.content_security_policy.extension_pages must be declared");

  const scriptSrc = /script-src\s+([^;]+);/i.exec(csp)?.[1] || "";
  assert.ok(/\bself\b/.test(scriptSrc), "script-src must include 'self'");
  assert.ok(!/unsafe-inline/i.test(scriptSrc), "script-src must not include 'unsafe-inline'");
  assert.ok(!/unsafe-eval/i.test(scriptSrc), "script-src must not include 'unsafe-eval'");
  assert.ok(!/https?:/i.test(scriptSrc), "script-src must not allow remote http(s) origins");

  const objectSrc = /object-src\s+([^;]+);/i.exec(csp)?.[1] || "";
  assert.ok(/\bself\b/.test(objectSrc), "object-src must be 'self' (default) or tighter");

  const connectSrc = /connect-src\s+([^;]+);/i.exec(csp)?.[1] || "";
  assert.ok(connectSrc, "connect-src must be declared to bound outbound requests");
  assert.ok(!/\*/.test(connectSrc), "connect-src must not be wildcard");
});
