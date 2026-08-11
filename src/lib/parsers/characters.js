import { registerParser } from "./index.js";

registerParser("characters", {
  listKey: "list",
  fields: {
    id: "id",
    name: "name",
    element: "element",
    rarity: "rarity",
    level: "level",
    uncap: "evolution",
    transcendence: "arousal_lv",
    awakening: "awakening_lv",
    ring: "ring",
    empLevel: "emp_level",
  },
});
