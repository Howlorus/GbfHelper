import { test } from "node:test";
import assert from "node:assert/strict";
import { urlMatchesAllowlist } from "../src/lib/host-check.js";

const ALLOWLIST = {
  schemaVersion: 1,
  hosts: [{ origin: "https://game.granbluefantasy.jp", pathPrefix: "/" }],
};

test("exact origin + path prefix match is allowed", () => {
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/", ALLOWLIST), true);
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/#quest/index/1", ALLOWLIST), true);
});

test("rejects http (scheme mismatch)", () => {
  assert.equal(urlMatchesAllowlist("http://game.granbluefantasy.jp/", ALLOWLIST), false);
});

test("rejects subdomain spoof", () => {
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp.evil.com/", ALLOWLIST), false);
});

test("rejects hyphen spoof", () => {
  assert.equal(urlMatchesAllowlist("https://game-granbluefantasy.jp/", ALLOWLIST), false);
});

test("rejects unrelated origin", () => {
  assert.equal(urlMatchesAllowlist("https://example.com/", ALLOWLIST), false);
});

test("rejects malformed URLs", () => {
  assert.equal(urlMatchesAllowlist("not a url", ALLOWLIST), false);
  assert.equal(urlMatchesAllowlist("", ALLOWLIST), false);
  assert.equal(urlMatchesAllowlist(undefined, ALLOWLIST), false);
});

test("rejects when allowlist is empty or malformed", () => {
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/", { hosts: [] }), false);
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/", {}), false);
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/", null), false);
});

test("path prefix is enforced", () => {
  const strictList = {
    schemaVersion: 1,
    hosts: [{ origin: "https://game.granbluefantasy.jp", pathPrefix: "/quest/" }],
  };
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/quest/index/1", strictList), true);
  assert.equal(urlMatchesAllowlist("https://game.granbluefantasy.jp/", strictList), false);
});
