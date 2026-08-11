// PLACEHOLDER team field map — feasibility slice (§49 Q1) pins the exact
// source keys. §13.4 target fields: party, backline, class, class skills,
// weapon grid, main summon, sub summons.

import { registerParser } from "./index.js";

registerParser("teams", {
  listKey: "list",
  fields: {
    partyId: "id",
    party: "chara",           // frontline characters
    backline: "sub",           // backline characters
    mainClass: "job",
    classSkills: "job_skills",
    grid: "weapon",
    mainSummon: "main_summon",
    subSummons: "sub_summons",
  },
});
