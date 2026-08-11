import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePayload, MAX_BODY_BYTES } from "../src/lib/sanitize-payload.js";

const ALLOWLIST = {
  schemaVersion: 1,
  endpoints: [
    { pathPattern: "/npc/", purpose: "characters" },
    { pathPattern: "/weapon/", purpose: "weapons" },
  ],
};

test("sanitizes an allowed request, dropping query and fragment", () => {
  const out = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list?page=1#top",
    method: "get",
    body: '{"list":[{"id":1}]}',
    receivedAt: 42,
  }, ALLOWLIST);
  assert.deepEqual(out, {
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    purpose: "characters",
    body: '{"list":[{"id":1}]}',
    receivedAt: 42,
  });
});

test("output NEVER carries request or response headers (credential removal, §41.1)", () => {
  const out = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    body: "{}",
    requestHeaders: [{ name: "Cookie", value: "session=secret" }],
    responseHeaders: [{ name: "Set-Cookie", value: "x=y" }],
    authorization: "Bearer super-secret",
  }, ALLOWLIST);
  assert.ok(out);
  assert.equal(out.requestHeaders, undefined);
  assert.equal(out.responseHeaders, undefined);
  assert.equal(out.authorization, undefined);
  // Body is untouched — domain will parse (US-02-XX).
  assert.equal(out.body, "{}");
});

test("drops URLs not on the endpoint allowlist", () => {
  const out = sanitizePayload({
    url: "https://game.granbluefantasy.jp/quest/index",
    method: "GET",
    body: "{}",
  }, ALLOWLIST);
  assert.equal(out, null);
});

test("drops payloads exceeding the size limit", () => {
  const out = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    body: "x".repeat(MAX_BODY_BYTES + 1),
  }, ALLOWLIST);
  assert.equal(out, null);
});

test("drops malformed URLs, non-strings, missing fields", () => {
  assert.equal(sanitizePayload({ url: "not a url", body: "" }, ALLOWLIST), null);
  assert.equal(sanitizePayload({ url: 42, body: "" }, ALLOWLIST), null);
  assert.equal(sanitizePayload({}, ALLOWLIST), null);
  assert.equal(sanitizePayload(null, ALLOWLIST), null);
});

test("drops when allowlist is empty or malformed", () => {
  const raw = { url: "https://game.granbluefantasy.jp/npc/list", body: "{}" };
  assert.equal(sanitizePayload(raw, {}), null);
  assert.equal(sanitizePayload(raw, { endpoints: [] }), null);
  assert.equal(sanitizePayload(raw, null), null);
});

test("normalizes method to uppercase and defaults missing method to GET", () => {
  const a = sanitizePayload({ url: "https://game.granbluefantasy.jp/npc/x", method: "post", body: "" }, ALLOWLIST);
  assert.equal(a.method, "POST");
  const b = sanitizePayload({ url: "https://game.granbluefantasy.jp/npc/x", body: "" }, ALLOWLIST);
  assert.equal(b.method, "GET");
});

test("purpose tag comes from the matched endpoint, not the raw payload", () => {
  const spoofed = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    body: "{}",
    purpose: "banking",
  }, ALLOWLIST);
  assert.equal(spoofed.purpose, "characters");
});

test("body defaults to empty string when not a string", () => {
  const a = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/x",
    method: "GET",
    body: { evil: "object" },
  }, ALLOWLIST);
  assert.equal(a.body, "");
});
