import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/lib/sanitize.js";

test("escapes the five html entity characters", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml(`hello & 'world' "quoted"`),
    "hello &amp; &#39;world&#39; &quot;quoted&quot;");
});

test("nothing to escape passes through", () => {
  assert.equal(escapeHtml("plain text 123"), "plain text 123");
});

test("null and undefined -> empty string, not the literal 'null'", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("coerces numbers to string", () => {
  assert.equal(escapeHtml(42), "42");
});

test("hostile javascript: URL is escaped in text (attributes are a separate concern)", () => {
  // renderText targets textContent so a "javascript:" URL never becomes an href.
  // But escapeHtml on the string itself still returns the escaped form.
  assert.equal(escapeHtml('javascript:alert(1)'), "javascript:alert(1)");
});
