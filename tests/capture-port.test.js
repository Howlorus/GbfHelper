import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPort, PORT_METHODS, FORBIDDEN_METHODS } from "../src/lib/capture-port.js";

function minimalAdapter() {
  return {
    id: "test-adapter",
    attach: async () => {},
    detach: async () => {},
  };
}

test("accepts a minimal valid adapter", () => {
  assert.equal(assertPort(minimalAdapter()), true);
});

test("rejects when id is missing or empty", () => {
  const a = minimalAdapter(); delete a.id;
  assert.throws(() => assertPort(a), /adapter\.id/);
  assert.throws(() => assertPort({ ...minimalAdapter(), id: "" }), /adapter\.id/);
});

test("rejects when attach or detach is missing", () => {
  for (const m of PORT_METHODS) {
    const a = minimalAdapter(); delete a[m];
    assert.throws(() => assertPort(a), new RegExp(`adapter\\.${m}`));
  }
});

test("rejects any adapter that exposes a forbidden mutation verb", () => {
  for (const bad of FORBIDDEN_METHODS) {
    const a = minimalAdapter();
    a[bad] = () => {};
    assert.throws(() => assertPort(a), new RegExp(`must not expose '${bad}'`));
  }
});

test("rejects non-object inputs", () => {
  for (const bad of [null, undefined, "adapter", 42, []]) {
    assert.throws(() => assertPort(bad));
  }
});
