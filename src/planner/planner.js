import { matchStrategy, READINESS } from "../lib/planner/matcher.js";
import { missingReport } from "../lib/planner/missing-report.js";
import { proposeSubstitutions } from "../lib/planner/substitution.js";

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

async function loadState() {
  const [inventory, packs] = await Promise.all([
    send({ type: "GET_INVENTORY" }),
    send({ type: "GET_STRATEGY_PACKS" }),
  ]);
  return { inventory, packs: Array.isArray(packs) ? packs : [] };
}

function stateClass(state) {
  if (state === READINESS.READY_NOW) return "ok";
  if (state === READINESS.UNKNOWN) return "bad";
  return "warn";
}

function renderDimensionList(title, items) {
  const li = items.map((it) => `
    <li class="dim-item">
      <span>
        <span class="role">${escapeHtml(it.role || it.name || "—")}</span>
        <span class="entity">${escapeHtml(it.entityId || "")}</span>
      </span>
      <span class="state ${stateClass(it.state)}">${escapeHtml(it.state)}</span>
    </li>
  `).join("");
  return `<div class="dim-block"><h3>${escapeHtml(title)}</h3><ul class="dim-list">${li}</ul></div>`;
}

function renderSubstitutions(strategy, missing, inventory) {
  const proposals = [];
  for (const item of missing.perCategory.characters || []) {
    const subs = proposeSubstitutions(strategy.substitutions || [], item.role, inventory);
    if (subs.length) proposals.push({ role: item.role, subs });
  }
  if (!proposals.length) return "";
  const cards = proposals.map((p) => `
    <div class="sub-card">
      <span class="id">${escapeHtml(p.role)} candidates</span>
      ${p.subs.map((s) => `
        <div class="sub-card">
          <span class="id">${escapeHtml(s.entityId)}</span>
          <span class="conf">${escapeHtml(s.confidence)}</span>
          <span class="cover">Covers: ${s.covers.map(escapeHtml).join(", ") || "—"}</span>
          ${s.notCovered.length ? `<span class="uncovered">Not covered: ${s.notCovered.map(escapeHtml).join(", ")}</span>` : ""}
          ${s.adaptation ? `<span class="adapt">Adaptation: ${escapeHtml(s.adaptation)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `).join("");
  return `<div class="subs"><h3>Substitutions</h3>${cards}</div>`;
}

function renderPackResult(pack, strategy, inventory) {
  const match = matchStrategy(inventory, strategy);
  const missing = missingReport(match);
  const overallClass = match.overall === READINESS.READY_NOW ? "ready" : match.overall === READINESS.UNKNOWN ? "blocked" : "";
  return `
    <article class="pack-result">
      <h2>${escapeHtml(pack.name || pack.id)}</h2>
      <p class="overall ${overallClass}">${match.overall} · ${missing.total} unmet</p>
      ${renderDimensionList("Characters", match.dimensions.characters)}
      ${renderDimensionList("Weapons", match.dimensions.weapons)}
      ${renderDimensionList("Summons", match.dimensions.summons)}
      ${renderDimensionList("Classes", match.dimensions.classes)}
      ${renderSubstitutions(strategy, missing, inventory)}
    </article>
  `;
}

async function runMatch() {
  const { inventory, packs } = await loadState();
  const packEl = document.getElementById("pack-select");
  const compareMode = document.getElementById("results").classList.contains("compare-mode");
  const chosen = [...packEl.selectedOptions].map((o) => o.value);
  const results = document.getElementById("results");
  results.hidden = false;
  const parts = [];
  for (const packId of chosen.slice(0, compareMode ? 2 : 1)) {
    const pack = packs.find((p) => p.id === packId);
    if (!pack) continue;
    // Strategy template lives in the pack's strategies.json / substitutions.json.
    // For now the pack record must carry them as fields (E12 orchestrates loading).
    const strategy = pack.strategy || { requirements: {}, substitutions: [] };
    parts.push(renderPackResult(pack, strategy, inventory));
  }
  results.innerHTML = parts.join("") || "<p class='empty'>No strategies matched.</p>"; // gbf-lint-allow: innerHTML composed from escapeHtml'd substrings via a fixed template
}

async function init() {
  const { inventory, packs } = await loadState();
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("empty-msg");
  const controls = document.getElementById("controls");

  if (!inventory) {
    empty.hidden = false;
    emptyMsg.textContent = "Scan your account first (popup -> Scan Account -> Save & stop).";
    return;
  }
  if (!packs.length) {
    empty.hidden = false;
    emptyMsg.textContent = "No strategy pack installed. Install a pack via the Update Center (coming in E12).";
    return;
  }

  const select = document.getElementById("pack-select");
  select.multiple = true;
  select.size = Math.min(6, Math.max(2, packs.length));
  for (const p of packs) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name || p.id} (${p.version || "?"})`;
    select.appendChild(opt);
  }
  controls.hidden = false;

  document.getElementById("match-btn").addEventListener("click", runMatch);
  document.getElementById("compare-btn").addEventListener("click", () => {
    const results = document.getElementById("results");
    results.classList.toggle("compare-mode");
    runMatch();
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

init().catch((err) => {
  document.getElementById("empty").hidden = false;
  document.getElementById("empty-msg").textContent = `Planner init failed: ${err?.message || err}`;
});
