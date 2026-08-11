// End-to-end test of the §41.2 sanitization pipeline:
//   endpoint allowlist -> content validation -> size limit -> credential
//   removal -> field allowlist (parser field-map) -> record.
// A hostile field injected into a raw payload MUST NOT reach a persisted
// record. This test cements the guarantee across sanitize + parser layers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePayload } from "../src/lib/sanitize-payload.js";
import { parsePayload } from "../src/lib/parsers/index.js";
import "../src/lib/parsers/characters.js";
import "../src/lib/parsers/weapons.js";
import "../src/lib/parsers/summons.js";
import "../src/lib/parsers/teams.js";

const ALLOWLIST = {
  schemaVersion: 1,
  endpoints: [
    { pathPattern: "/npc/", purpose: "characters" },
    { pathPattern: "/weapon/", purpose: "weapons" },
    { pathPattern: "/summon/", purpose: "summons" },
    { pathPattern: "/party/", purpose: "teams" },
  ],
};

function pipeline(raw) {
  const sanitized = sanitizePayload(raw, ALLOWLIST);
  if (!sanitized) return null;
  const parsed = parsePayload(sanitized.purpose, sanitized.body);
  return { sanitized, parsed };
}

test("hostile top-level fields on records are dropped by the parser field-map", () => {
  const body = JSON.stringify({
    list: [{
      id: 1, name: "Zeta", element: 3, rarity: 4, level: 100, evolution: 5,
      // hostile injections below — must NOT appear in the output record
      password: "hunter2",
      session_token: "abcdef",
      xss: "<script>alert(1)</script>",
      __proto__: { polluted: true },
    }],
  });
  const { parsed } = pipeline({
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    body,
  });
  const record = parsed.records[0];
  assert.ok(record);
  assert.equal(record.password, undefined);
  assert.equal(record.session_token, undefined);
  assert.equal(record.xss, undefined);
  assert.equal(record.polluted, undefined);
  // The known fields ARE preserved.
  assert.equal(record.name, "Zeta");
});

test("headers on the raw payload never propagate through sanitize", () => {
  const s = sanitizePayload({
    url: "https://game.granbluefantasy.jp/weapon/list",
    method: "GET",
    body: "{}",
    requestHeaders: [{ name: "cookie", value: "secret=1" }],
    responseHeaders: [{ name: "set-cookie", value: "x=y" }],
    authorization: "Bearer sk-XXX",
  }, ALLOWLIST);
  assert.ok(s);
  const keys = Object.keys(s).join(",").toLowerCase();
  assert.ok(!keys.includes("header"));
  assert.ok(!keys.includes("auth"));
  assert.ok(!keys.includes("cookie"));
});

test("body larger than the configured cap is dropped before parsing", () => {
  const huge = "{" + "\"x\":\"" + "a".repeat(600 * 1024) + "\"}";
  const s = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list",
    method: "GET",
    body: huge,
  }, ALLOWLIST);
  assert.equal(s, null);
});

test("payload from an unlisted endpoint is dropped before parsing", () => {
  const s = sanitizePayload({
    url: "https://game.granbluefantasy.jp/quest/index",
    method: "GET",
    body: JSON.stringify({ list: [{ id: 1 }] }),
  }, ALLOWLIST);
  assert.equal(s, null);
});

test("query and fragment are stripped from the URL before persistence", () => {
  const s = sanitizePayload({
    url: "https://game.granbluefantasy.jp/npc/list?userId=999&auth=abc#hash",
    method: "GET",
    body: "{}",
  }, ALLOWLIST);
  assert.equal(s.url, "https://game.granbluefantasy.jp/npc/list");
});

test("parsers never accept purposes outside the endpoint allowlist purposes", () => {
  const r = parsePayload("payments", "{}");
  assert.equal(r.status, "Unsupported");
  assert.equal(r.records.length, 0);
});
