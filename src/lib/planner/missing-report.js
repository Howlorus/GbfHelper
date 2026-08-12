import { READINESS } from "./matcher.js";

export function missingReport(matchResult) {
  const perCategory = {};
  for (const [cat, dim] of Object.entries(matchResult?.dimensions || {})) {
    perCategory[cat] = dim.filter((d) => d.state !== READINESS.READY_NOW);
  }
  const total = Object.values(perCategory).reduce((s, arr) => s + arr.length, 0);
  return { perCategory, total };
}
