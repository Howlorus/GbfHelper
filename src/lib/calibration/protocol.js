// US-08-01 test protocol library (PRD §22.1). Declarative — the extension
// instructs, the player executes (§2, AC3: never simulate input).
//
// ponytail: static registry. Protocols could ship in packs later (US-08-01
// note) — until then, a frozen array is the whole "library". Adding a
// protocol means adding a row here, nothing else.

const P = (id, name, metric, minSamples, purpose, steps) => Object.freeze({
  id, name, metric, minSamples, purpose, steps: Object.freeze(steps.slice()),
});

export const PROTOCOLS = Object.freeze([
  P("normal-attack", "Normal Attack", "damage", 10,
    "Measure per-hit normal-attack damage on a single Trial target.",
    ["Enter Trial Battle with target dummy.", "Cast no skills; auto-attack for 3 turns.", "Mark done after 3 turns."]),
  P("multi-attack", "Multi-Attack Rate", "hitCount", 20,
    "Measure DA/TA activation rate under a fixed grid.",
    ["Enter Trial Battle.", "Auto-attack for 20 turns (no skills).", "Mark done after 20 turns."]),
  P("charge-attack", "Charge Attack", "damage", 10,
    "Measure charge-attack damage under a fixed buff/no-buff condition.",
    ["Fill charge bar via normal attacks.", "Trigger charge attack.", "Mark done after each CA lands."]),
  P("full-chain", "Full Chain Burst", "damage", 5,
    "Measure full-chain burst damage from 4 characters.",
    ["Fill all four charge bars.", "Trigger full chain.", "Mark done after chain resolves."]),
  P("skill-damage", "Skill Damage", "damage", 10,
    "Measure single-skill damage.",
    ["Select skill under test.", "Cast on target.", "Mark done after skill lands."]),
  P("hit-counts", "Hit Counts", "hitCount", 15,
    "Verify per-attack hit counts (multi-hit skills, chains).",
    ["Execute the attack/skill.", "Record observed hit count.", "Mark done."]),
  P("buff-sequence", "Buff Sequence Impact", "damageDelta", 10,
    "Compare damage under buff-A vs buff-A+B.",
    ["Cast baseline buff set, attack.", "Add one additional buff, attack.", "Mark done after paired samples."]),
  P("healing", "Healing", "heal", 10,
    "Measure heal amount from skill or CA under fixed HP-missing.",
    ["Reduce HP by known amount.", "Trigger heal.", "Mark done after heal lands."]),
  P("charge-generation", "Charge Generation", "chargeBar", 10,
    "Measure charge-bar gain per normal attack / skill.",
    ["Note starting charge %.", "Perform action under test.", "Record delta; mark done."]),
  P("damage-cap", "Damage Cap", "damage", 10,
    "Find effective damage cap under current setup.",
    ["Stack damage-amp buffs.", "Trigger the largest-hit action available.", "Mark done after 10 samples plateau."]),
  P("dispel", "Dispel Capacity", "dispelCount", 10,
    "Measure how many buffs a dispel action removes.",
    ["Ensure target has ≥3 buffs.", "Trigger dispel.", "Record buffs removed; mark done."]),
  P("defense", "Defense / Mitigation", "damageTaken", 10,
    "Measure incoming damage under a fixed mitigation set.",
    ["Wait for target's attack.", "Record damage taken.", "Mark done."]),
  P("omen-coverage", "Omen Coverage", "omensAvoided", 10,
    "Verify which omens are cleared by the current rotation.",
    ["Trigger the omen scenario.", "Apply rotation.", "Record omens resolved vs missed."]),
  P("rotation-compare", "Rotation Comparison", "damage", 20,
    "Compare two rotations, paired.",
    ["Run rotation A for N turns.", "Reset; run rotation B for N turns.", "Mark done after both sides."]),
]);

const BY_ID = new Map(PROTOCOLS.map((p) => [p.id, p]));

export function listProtocols() { return PROTOCOLS; }
export function getProtocol(id) { return BY_ID.get(id) || null; }
