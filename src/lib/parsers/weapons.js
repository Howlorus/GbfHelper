// PLACEHOLDER weapon field map — feasibility slice (§49 Q1) pins the exact
// source keys. §13.2 target fields: game id, instance id, level, skill
// level, uncap, awakening, quantity, equipped state, completeness.

import { registerParser } from "./index.js";

registerParser("weapons", {
  listKey: "list",
  fields: {
    id: "id",             // game (catalog) id
    instanceId: "wid",    // per-owned instance id
    level: "level",
    skillLevel: "skill_level",
    uncap: "evolution",
    awakening: "awakening_lv",
    quantity: "count",
    equipped: "equipped",
  },
});
