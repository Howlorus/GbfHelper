import { registerParser } from "./index.js";

registerParser("teams", {
  listKey: "list",
  fields: {
    partyId: "id",
    party: "chara",
    backline: "sub",
    mainClass: "job",
    classSkills: "job_skills",
    grid: "weapon",
    mainSummon: "main_summon",
    subSummons: "sub_summons",
  },
});
