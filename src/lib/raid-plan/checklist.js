// Preparation checklist (§21). Given a plan and the account inventory,
// produce a list of items each in a §21 state:
//   - ConfirmedAutomatically: plan wants X, inventory has X compatible
//   - ConfirmedManually: user flipped it themselves (stored on the plan)
//   - Unverified: plan doesn't specify what to check
//   - Incorrect: plan wants X, inventory contradicts (missing / underspec)
//   - NotObservable: the field is inherently not visible in the current
//     inventory (support summon, raid bonus)

export const CHECK_STATES = Object.freeze([
  "ConfirmedAutomatically", "ConfirmedManually", "Unverified", "Incorrect", "NotObservable",
]);

export function buildChecklist(plan, inventory) {
  const items = [];
  items.push(...checkParty(plan, inventory));
  items.push(...checkGrid(plan, inventory));
  items.push(...checkSummons(plan, inventory));
  items.push(checkClass(plan));
  items.push(checkSupportSummon(plan));
  items.push(checkRaidBonus(plan));
  return items;
}

export function summarize(items) {
  const counts = { ConfirmedAutomatically: 0, ConfirmedManually: 0, Unverified: 0, Incorrect: 0, NotObservable: 0 };
  for (const it of items) counts[it.state] = (counts[it.state] || 0) + 1;
  return counts;
}

function checkParty(plan, inv) {
  const party = plan?.party || [];
  if (party.length === 0) return [item("Party", "Unverified", "plan has no party set")];
  return party.map((charId) => {
    const owned = (inv?.characters || []).find((c) => c.id === charId);
    return owned
      ? item(`Party: ${charId}`, "ConfirmedAutomatically", "owned")
      : item(`Party: ${charId}`, "Incorrect", "not in inventory");
  });
}

function checkGrid(plan, inv) {
  const grid = plan?.grid || [];
  if (grid.length === 0) return [item("Grid", "Unverified", "plan has no grid set")];
  return grid.map((weaponId) => {
    const owned = (inv?.weapons || []).find((w) => w.id === weaponId);
    return owned
      ? item(`Grid: ${weaponId}`, "ConfirmedAutomatically", "owned")
      : item(`Grid: ${weaponId}`, "Incorrect", "not in inventory");
  });
}

function checkSummons(plan, inv) {
  const out = [];
  const main = plan?.mainSummon;
  if (main) {
    const owned = (inv?.summons || []).find((s) => s.id === main);
    out.push(owned
      ? item(`Main summon: ${main}`, "ConfirmedAutomatically", "owned")
      : item(`Main summon: ${main}`, "Incorrect", "not in inventory"));
  } else {
    out.push(item("Main summon", "Unverified", "plan has no main summon set"));
  }
  for (const sub of plan?.subSummons || []) {
    const owned = (inv?.summons || []).find((s) => s.id === sub);
    out.push(owned
      ? item(`Sub summon: ${sub}`, "ConfirmedAutomatically", "owned")
      : item(`Sub summon: ${sub}`, "Incorrect", "not in inventory"));
  }
  return out;
}

function checkClass(plan) {
  if (plan?.mainClass) return item(`Class: ${plan.mainClass}`, "Unverified", "class equip is not observable from saved teams alone");
  return item("Class", "Unverified", "plan has no class set");
}

function checkSupportSummon(plan) {
  return item("Support summon", "NotObservable", "chosen at raid start; verify manually");
}

function checkRaidBonus(plan) {
  return item("Raid bonus", "NotObservable", "verify manually before starting");
}

function item(label, state, evidence) { return { label, state, evidence }; }
