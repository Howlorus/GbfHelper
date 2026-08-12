// Terminology aliases (PRD §16.3). A terminology pack ships an aliases.json
// file: a flat array of { entityId, entityKind, language, text, aliasType,
// confidence } entries. resolveAlias maps free-text (Japanese, community
// abbreviations, nicknames) back to canonical entity ids.

export const ENTITY_KINDS = Object.freeze(["character", "weapon", "summon", "raid", "mechanic"]);
export const ALIAS_TYPES = Object.freeze(["official", "community", "abbreviation", "nickname", "search"]);
export const CONFIDENCES = Object.freeze(["high", "medium", "low"]);

export function validateAliases(entries) {
  if (!Array.isArray(entries)) return { ok: false, errors: ["aliases.json must be an array"] };
  const errs = [];
  entries.forEach((e, i) => {
    if (!e || typeof e !== "object") { errs.push(`row ${i}: not an object`); return; }
    if (typeof e.entityId !== "string" || !e.entityId) errs.push(`row ${i}: entityId required`);
    if (!ENTITY_KINDS.includes(e.entityKind)) errs.push(`row ${i}: entityKind must be one of ${ENTITY_KINDS.join("|")}`);
    if (typeof e.language !== "string" || !e.language) errs.push(`row ${i}: language required`);
    if (typeof e.text !== "string" || !e.text) errs.push(`row ${i}: text required`);
    if (!ALIAS_TYPES.includes(e.aliasType)) errs.push(`row ${i}: aliasType invalid`);
    if (!CONFIDENCES.includes(e.confidence)) errs.push(`row ${i}: confidence invalid`);
  });
  return errs.length ? { ok: false, errors: errs } : { ok: true };
}

// Deterministic resolver. Case-insensitive match by default; language filter
// optional. Returns candidates ordered by confidence high -> low, then by
// aliasType (official beats community beats abbreviation, etc.).
export function resolveAlias(text, entries, { language } = {}) {
  if (typeof text !== "string" || !text.trim() || !Array.isArray(entries)) return [];
  const q = text.trim().toLowerCase();
  const CONF_RANK = { high: 0, medium: 1, low: 2 };
  const TYPE_RANK = { official: 0, community: 1, abbreviation: 2, nickname: 3, search: 4 };
  const hits = [];
  for (const e of entries) {
    if (!e || typeof e.text !== "string") continue;
    if (language && e.language !== language) continue;
    if (e.text.toLowerCase() === q) {
      hits.push({
        entityId: e.entityId,
        entityKind: e.entityKind,
        language: e.language,
        aliasType: e.aliasType,
        confidence: e.confidence,
      });
    }
  }
  hits.sort((a, b) => (CONF_RANK[a.confidence] - CONF_RANK[b.confidence])
    || (TYPE_RANK[a.aliasType] - TYPE_RANK[b.aliasType]));
  return hits;
}
