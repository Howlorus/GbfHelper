// PLACEHOLDER character field map — feasibility slice (§49 Q1) will pin the
// exact source keys against real GBF payloads. §13.1 defines the target
// fields; the source keys here are best guesses based on GBF conventions.

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
