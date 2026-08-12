import { matchStrategy, READINESS } from "../lib/planner/matcher.js";
import { missingReport } from "../lib/planner/missing-report.js";
import { proposeSubstitutions } from "../lib/planner/substitution.js";

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

let cached = null;
async function loadState() {
  if (cached) return cached;
  const [inventory, packs] = await Promise.all([
    send({ type: "GET_INVENTORY" }),
    send({ type: "GET_STRATEGY_PACKS" }),
  ]);
  cached = { inventory, packs: Array.isArray(packs) ? packs : [] };
  return cached;
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
        <span class="role">${escapeHtml(it.role || "—")}</span>
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
      ${renderSubstitutions(strategy, missing, inventory)}
    </article>
  `;
}

async function runMatch() {
  const { inventory, packs } = await loadState();
  const packId = document.getElementById("pack-select").value;
  const pack = packs.find((p) => p.id === packId);
  const results = document.getElementById("results");
  results.hidden = false;
  if (!pack) { results.textContent = "No strategy pack selected."; return; }
  const strategy = pack.strategy || { requirements: {}, substitutions: [] };
  results.innerHTML = renderPackResult(pack, strategy, inventory); // gbf-lint-allow: innerHTML composed from escapeHtml'd substrings via a fixed template
}

async function init() {
  const { inventory, packs } = await loadState();
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("empty-msg");
  const controls = document.getElementById("controls");

  if (!inventory) {
    empty.hidden = false;
    emptyMsg.textContent = "Scan your account first (popup → Scan Account → Save & stop).";
    return;
  }
  if (!packs.length) {
    empty.hidden = false;
    emptyMsg.textContent = "No strategy pack installed. Install one from the Update Center (E12).";
    return;
  }

  const select = document.getElementById("pack-select");
  for (const p of packs) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name || p.id} (${p.version || "?"})`;
    select.appendChild(opt);
  }
  controls.hidden = false;
  document.getElementById("match-btn").addEventListener("click", runMatch);
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
