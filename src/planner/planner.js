import { matchStrategy, READINESS } from "../lib/planner/matcher.js";
import { missingReport } from "../lib/planner/missing-report.js";
import { proposeSubstitutions } from "../lib/planner/substitution.js";
import { OBJECTIVES, defaultObjective, weightsFor, metricSign } from "../lib/optimization/objectives.js";

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

// ---- US-14-03 objective picker + weights display (auditable) --------------

const OBJECTIVE_KEY = "optimizationObjective";

async function loadObjective() {
  try {
    const { [OBJECTIVE_KEY]: obj } = await chrome.storage.local.get(OBJECTIVE_KEY);
    return obj || defaultObjective();
  } catch { return defaultObjective(); }
}

async function saveObjective(id) {
  await chrome.storage.local.set({ [OBJECTIVE_KEY]: id });
}

function renderWeights(objectiveId) {
  const weights = weightsFor(objectiveId);
  const table = document.getElementById("weights-table");
  table.textContent = "";
  const rows = Object.entries(weights).sort(([a], [b]) => a.localeCompare(b));
  for (const [metric, weight] of rows) {
    const row = document.createElement("div");
    row.className = "weight-row";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = metric;
    const v = document.createElement("span");
    const sign = metricSign(metric);
    v.className = "v " + (weight === 0 ? "zero" : sign > 0 ? "pos" : "neg");
    const arrow = sign > 0 ? "↑" : sign < 0 ? "↓" : "·";
    v.textContent = `${arrow} ${weight}`;
    v.title = sign > 0 ? "more is better" : sign < 0 ? "less is better" : "not weighted by this objective";
    row.appendChild(k);
    row.appendChild(v);
    table.appendChild(row);
  }
}

// ---- US-14-04 proposals surface -------------------------------------------

async function loadProposals() {
  // No live source yet — waits on §49 event parsers. When one lands, it will
  // publish proposals via a background handler and this call will return them.
  const res = await send({ type: "LIST_PROPOSALS" });
  return Array.isArray(res) ? res : [];
}

function renderProposals(proposals) {
  const list = document.getElementById("proposal-list");
  const empty = document.getElementById("empty-proposals");
  list.textContent = "";
  if (!proposals.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  for (const p of proposals) {
    const li = document.createElement("li");
    li.className = "proposal-card";
    const dim = document.createElement("div");
    dim.className = "dim";
    dim.textContent = p.dimension;
    const h = document.createElement("h4");
    h.textContent = summarizeChanges(p.changedFields);
    const impact = document.createElement("p");
    impact.className = "impact";
    impact.textContent = `Expected impact: ${p.expectedImpact?.assessment || "InsufficientData"} · confidence ${p.confidence || "?"}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const accept = mkBtn("Accept as variant", () => decide(p, "accepted"));
    accept.className = "primary";
    const reject = mkBtn("Reject", () => decide(p, "rejected"));
    const compare = mkBtn("Compare", () => runCompare(p));
    actions.append(accept, reject, compare);
    li.append(dim, h, impact, actions);
    list.appendChild(li);
  }
}

function mkBtn(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function summarizeChanges(changedFields = []) {
  if (!changedFields.length) return "(no changes)";
  return changedFields.map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join(" · ");
}

async function decide(proposal, decision) {
  const res = await send({ type: decision === "accepted" ? "ACCEPT_PROPOSAL" : "REJECT_PROPOSAL", proposal });
  if (res?.error) alert(res.error);
  renderProposals(await loadProposals());
}

async function runCompare(proposal) {
  const res = await send({ type: "COMPARE_PROPOSAL", proposal });
  if (res?.error) { alert(res.error); return; }
  const changed = Object.entries(res.fields || {}).filter(([, v]) => !v.same);
  const lines = changed.length
    ? changed.map(([f, v]) => `${f}: ${JSON.stringify(v.a)} → ${JSON.stringify(v.b)}`).join("\n")
    : "No changes.";
  alert(`Compare (${res.changedCount} changed):\n${lines}`);
}

async function initOptim() {
  const select = document.getElementById("objective-select");
  for (const o of OBJECTIVES) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  }
  const current = await loadObjective();
  select.value = current;
  renderWeights(current);
  select.addEventListener("change", async () => {
    await saveObjective(select.value);
    renderWeights(select.value);
    renderProposals(await loadProposals());
  });
  renderProposals(await loadProposals());
}

init()
  .then(initOptim)
  .catch((err) => {
    document.getElementById("empty").hidden = false;
    document.getElementById("empty-msg").textContent = `Planner init failed: ${err?.message || err}`;
  });
