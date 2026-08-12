// Preparation checklist (§21). buildChecklist(plan, inventory) -> per-row
// { label, state, evidence } where state ∈ ConfirmedAutomatically /
// ConfirmedManually / Unverified / Incorrect / NotObservable.

export function buildChecklist(plan, inventory) {
  const items = [];
  items.push(...checkParty(plan, inventory));
  items.push(...checkGrid(plan, inventory));
  items.push(...checkSummons(plan, inventory));
  items.push(checkClass(plan));
  items.push({ label: "Support summon", state: "NotObservable", evidence: "chosen at raid start; verify manually" });
  items.push({ label: "Raid bonus", state: "NotObservable", evidence: "verify manually before starting" });
  return items;
}

function checkParty(plan, inv) {
  const party = plan?.party || [];
  if (party.length === 0) return [row("Party", "Unverified", "plan has no party set")];
  return party.map((charId) => {
    const owned = (inv?.characters || []).find((c) => c.id === charId);
    return owned
      ? row(`Party: ${charId}`, "ConfirmedAutomatically", "owned")
      : row(`Party: ${charId}`, "Incorrect", "not in inventory");
  });
}

function checkGrid(plan, inv) {
  const grid = plan?.grid || [];
  if (grid.length === 0) return [row("Grid", "Unverified", "plan has no grid set")];
  return grid.map((weaponId) => {
    const owned = (inv?.weapons || []).find((w) => w.id === weaponId);
    return owned
      ? row(`Grid: ${weaponId}`, "ConfirmedAutomatically", "owned")
      : row(`Grid: ${weaponId}`, "Incorrect", "not in inventory");
  });
}

function checkSummons(plan, inv) {
  const out = [];
  const main = plan?.mainSummon;
  if (main) {
    const owned = (inv?.summons || []).find((s) => s.id === main);
    out.push(owned
      ? row(`Main summon: ${main}`, "ConfirmedAutomatically", "owned")
      : row(`Main summon: ${main}`, "Incorrect", "not in inventory"));
  } else {
    out.push(row("Main summon", "Unverified", "plan has no main summon set"));
  }
  for (const sub of plan?.subSummons || []) {
    const owned = (inv?.summons || []).find((s) => s.id === sub);
    out.push(owned
      ? row(`Sub summon: ${sub}`, "ConfirmedAutomatically", "owned")
      : row(`Sub summon: ${sub}`, "Incorrect", "not in inventory"));
  }
  return out;
}

function checkClass(plan) {
  return plan?.mainClass
    ? row(`Class: ${plan.mainClass}`, "Unverified", "class equip is not observable from saved teams alone")
    : row("Class", "Unverified", "plan has no class set");
}

function row(label, state, evidence) { return { label, state, evidence }; }
