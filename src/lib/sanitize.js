// Safe rendering helpers. Every render of user-supplied or source-derived
// text MUST go through renderText or textContent. See US-01-06.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Assign text safely to an element. Uses textContent, which does not parse
// HTML: markup like "<script>alert(1)</script>" renders as literal characters.
export function renderText(el, s) {
  if (el) el.textContent = String(s ?? "");
}
