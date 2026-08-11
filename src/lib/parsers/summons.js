// PLACEHOLDER summon field map — feasibility slice (§49 Q1) pins the exact
// source keys. §13.3 target fields: game id, instance id, level, uncap,
// quantity, equipped state.

import { registerParser } from "./index.js";

registerParser("summons", {
  listKey: "list",
  fields: {
    id: "id",
    instanceId: "sid",
    level: "level",
    uncap: "evolution",
    quantity: "count",
    equipped: "equipped",
  },
});
