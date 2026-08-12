// Integration test that documents the §7.7 human-approval flow.
// A "proposal" is just a partial content object; how the user reacts to it
// routes through the existing repository primitives:
//
//   Accept        -> saveNewVersion(planId, { ...currentContent, ...proposal,
//                                              changeSource: "proposal-accepted" })
//   Reject        -> no-op (or archivePlan of the proposal source; not this flow)
//   Save-as-variant -> duplicatePlan(planId, { newPlanId }), then
//                      saveNewVersion(newPlanId, { ...variant, ...proposal })
//   Revert        -> revertToVersion(planId, targetVersion)
//
// No new module is shipped: the audit chain (changeSource + previousVersion)
// is on every record already. This test cements the flow so a refactor
// cannot break the pattern silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/lib/repositories/in-memory.js";
import { STORE_NAMES } from "../src/lib/stores.js";
import { wrapWithValidation } from "../src/lib/corruption.js";
import { saveNewVersion, duplicatePlan, revertToVersion, getCurrentPlan, listVersions } from "../src/lib/raid-plan/repository.js";

function newRepo() { return wrapWithValidation(new InMemoryRepository(STORE_NAMES)); }
const baseInput = { planId: "plan-1", raidId: "bahamut-proud", element: "dark", objective: "first-clear" };

test("accept a proposal -> new version whose changeSource identifies the origin", async () => {
  const repo = newRepo();
  await saveNewVersion(repo, { ...baseInput, party: ["char.zeta"] });
  const current = await getCurrentPlan(repo, "plan-1");
  const proposal = { rotation: ["skill-a", "skill-b"] };
  const accepted = await saveNewVersion(repo, {
    ...stripStorage(current),
    ...proposal,
    changeSource: "proposal-accepted",
  });
  assert.equal(accepted.raidPlanVersion, 2);
  assert.deepEqual(accepted.rotation, ["skill-a", "skill-b"]);
  assert.equal(accepted.changeSource, "proposal-accepted");
  assert.equal(accepted.previousVersion, 1);
});

test("save-as-variant -> duplicate + apply proposal to a NEW family", async () => {
  const repo = newRepo();
  await saveNewVersion(repo, { ...baseInput, party: ["char.zeta"] });
  await duplicatePlan(repo, "plan-1", { newPlanId: "plan-1-variant" });
  const proposal = { rotation: ["risky-a"] };
  const variant = await saveNewVersion(repo, {
    ...stripStorage(await getCurrentPlan(repo, "plan-1-variant")),
    ...proposal,
  });
  const original = await getCurrentPlan(repo, "plan-1");
  assert.deepEqual(original.rotation, []); // untouched
  assert.deepEqual(variant.rotation, ["risky-a"]);
  assert.equal(variant.planId, "plan-1-variant");
});

test("reject a proposal -> nothing happens on the current plan", async () => {
  const repo = newRepo();
  await saveNewVersion(repo, baseInput);
  const before = await listVersions(repo, "plan-1");
  // Simulate reject: the UI simply does not call saveNewVersion.
  const after = await listVersions(repo, "plan-1");
  assert.equal(after.length, before.length);
});

test("revert -> a new version with the target's content and a citing changeSource", async () => {
  const repo = newRepo();
  await saveNewVersion(repo, { ...baseInput, objective: "first-clear" });
  await saveNewVersion(repo, { ...baseInput, objective: "safe-solo" });
  const reverted = await revertToVersion(repo, "plan-1", 1);
  assert.equal(reverted.objective, "first-clear");
  assert.match(reverted.changeSource, /reverted-from-v1/);
  assert.equal(reverted.raidPlanVersion, 3);
  const versions = await listVersions(repo, "plan-1");
  assert.equal(versions.length, 3, "revert appends, does not delete");
});

function stripStorage(rec) {
  const { id, raidPlanVersion, createdAt, updatedAt, previousVersion, ...rest } = rec;
  return rest;
}
