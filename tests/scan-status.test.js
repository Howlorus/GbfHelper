import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, computeCategoryStatus, computeReport } from "../src/lib/scan-status.js";

function bufferFactory() {
  const b = { parserStatus: {}, warnings: [] };
  for (const c of CATEGORIES) b[c] = [];
  return b;
}

test("empty buffer yields Partial 'not started' per category and overall Partial", () => {
  const rep = computeReport(bufferFactory());
  for (const cat of CATEGORIES) {
    assert.equal(rep.perCategory[cat].status, "Partial");
    assert.equal(rep.perCategory[cat].reason, "not started");
  }
  assert.equal(rep.overall, "Partial");
});

test("all records observed with parserStatus Complete -> category Complete", () => {
  const b = bufferFactory();
  b.characters = [{ completeness: "observed" }, { completeness: "observed" }];
  b.parserStatus.characters = "Complete";
  const s = computeCategoryStatus(b, "characters");
  assert.equal(s.status, "Complete");
});

test("even one partial record -> category Partial (never mislabel as Complete)", () => {
  const b = bufferFactory();
  b.characters = [{ completeness: "observed" }, { completeness: "partial" }];
  b.parserStatus.characters = "Complete";
  const s = computeCategoryStatus(b, "characters");
  assert.equal(s.status, "Partial");
});

test("parserStatus Inconsistent -> Inconsistent with a reason from warnings", () => {
  const b = bufferFactory();
  b.characters = [];
  b.parserStatus.characters = "Inconsistent";
  b.warnings = ["characters: json parse failed: Unexpected token"];
  const s = computeCategoryStatus(b, "characters");
  assert.equal(s.status, "Inconsistent");
  assert.ok(s.reason.includes("json parse failed"));
});

test("parserStatus Unsupported -> Failed", () => {
  const b = bufferFactory();
  b.parserStatus.characters = "Unsupported";
  const s = computeCategoryStatus(b, "characters");
  assert.equal(s.status, "Failed");
});

test("parser matched but zero records -> Filtered", () => {
  const b = bufferFactory();
  b.characters = [];
  b.parserStatus.characters = "Filtered";
  const s = computeCategoryStatus(b, "characters");
  assert.equal(s.status, "Filtered");
});

test("overall report is the worst per-category status", () => {
  const b = bufferFactory();
  b.characters = [{ completeness: "observed" }];
  b.parserStatus.characters = "Complete";
  // weapons Inconsistent -> whole report Inconsistent
  b.weapons = [];
  b.parserStatus.weapons = "Inconsistent";
  b.warnings = ["weapons: bad shape"];
  const rep = computeReport(b);
  assert.equal(rep.overall, "Inconsistent");
});

test("Complete is never returned without positive evidence (records + parserStatus)", () => {
  const b = bufferFactory();
  b.characters = [{ completeness: "observed" }];
  // No parserStatus set
  const s = computeCategoryStatus(b, "characters");
  assert.notEqual(s.status, "Complete");
});
