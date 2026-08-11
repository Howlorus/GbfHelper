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
