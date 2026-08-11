import { registerParser } from "./index.js";

registerParser("weapons", {
  listKey: "list",
  fields: {
    id: "id",
    instanceId: "wid",
    level: "level",
    skillLevel: "skill_level",
    uncap: "evolution",
    awakening: "awakening_lv",
    quantity: "count",
    equipped: "equipped",
  },
});
