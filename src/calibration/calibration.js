// US-08-02 guided execution UI. The Lab observes; the player executes.
// AC1 session-active → step card; AC2 mark-done → advance + log; AC3
// state-quality warn banner (§31.1).

import { FINGERPRINT_FIELDS } from "../lib/calibration/fingerprint.js";
import { getProtocol, listProtocols } from "../lib/calibration/protocol.js";
import { buildSample, qualifies } from "../lib/calibration/sampling.js";
import { aggregate, CONFIDENCE } from "../lib/calibration/aggregate.js";
import { STATE_QUALITY } from "../lib/battle/state-model.js";

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

// ---- state ----
let sessionSnapshot = null;         // live calibrationSession from storage.session
let finalizedResult = null;         // set once user hits Finalize
let history = [];                   // completed calibrations from repo

// ---- boot ----
async function init() {
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target?.id === "sample-value") addSample();
  });
  document.getElementById("start-btn").addEventListener("click", startProtocol);
  document.getElementById("advance-btn").addEventListener("click", advanceStep);
  document.getElementById("add-sample-btn").addEventListener("click", addSample);
  document.getElementById("finalize-btn").addEventListener("click", finalize);
  document.getElementById("quit-btn").addEventListener("click", quitSession);
  document.getElementById("new-run-btn").addEventListener("click", newRun);

  buildFingerprintForm();
  populateProtocols();
  await refresh();

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "session" && ch.calibrationSession) refresh();
    if (area === "session" && ch.state) refresh();
  });
}

function buildFingerprintForm() {
  const grid = document.getElementById("fp-grid");
  for (const key of FINGERPRINT_FIELDS) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const lab = document.createElement("span");
    lab.className = "field-label";
    lab.textContent = humanFieldName(key);
    const input = document.createElement("input");
    input.type = "text";
    input.name = `fp-${key}`;
    input.id = `fp-${key}`;
    input.placeholder = examplePlaceholder(key);
    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);
  }
}

function humanFieldName(k) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
function examplePlaceholder(k) {
  const p = {
    party: "char.a, char.b, char.c, char.d",
    grid: "wep.1, wep.2, …",
    summons: "sum.a, sum.b",
    characterProgression: "e.g. all M9",
    weaponProgression: "e.g. all uncapped",
    summonProgression: "e.g. all 4*",
    supportSummon: "sum.support",
    mainClass: "class.tank",
    classSkills: "skill.1, skill.2",
    raidBonus: "wind, none, …",
    gameDataVersion: "1.0.0",
  };
  return p[k] || "";
}

function readFingerprintForm() {
  const fp = {};
  for (const key of FINGERPRINT_FIELDS) {
    const v = document.getElementById(`fp-${key}`)?.value?.trim() || "";
    if (key === "party" || key === "grid" || key === "summons" || key === "classSkills") {
      fp[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      fp[key] = v;
    }
  }
  return fp;
}

function writeFingerprintForm(fp) {
  if (!fp) return;
  for (const key of FINGERPRINT_FIELDS) {
    const el = document.getElementById(`fp-${key}`);
    if (!el) continue;
    const v = fp[key];
    el.value = Array.isArray(v) ? v.join(", ") : (v || "");
  }
}

function populateProtocols() {
  const select = document.getElementById("protocol-select");
  select.textContent = "";
  for (const p of listProtocols()) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (min ${p.minSamples})`;
    select.appendChild(opt);
  }
  select.addEventListener("change", updateProtocolMeta);
  updateProtocolMeta();
}

function updateProtocolMeta() {
  const id = document.getElementById("protocol-select").value;
  const p = getProtocol(id);
  const meta = document.getElementById("protocol-meta");
  meta.textContent = p ? `${p.purpose} · metric: ${p.metric} · min samples: ${p.minSamples}` : "";
}

// ---- lifecycle ----
async function refresh() {
  const state = await send({ type: "GET_STATE" });
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("empty-msg");
  const pickPanel = document.getElementById("pick-panel");
  const runPanel = document.getElementById("run-panel");
  const resultPanel = document.getElementById("result-panel");

  history = await send({ type: "LIST_CALIBRATIONS" }) || [];
  if (!Array.isArray(history)) history = [];
  renderHistory();

  const active = state?.state === "CalibrationSessionActive";
  if (!active && !finalizedResult) {
    empty.hidden = false;
    emptyMsg.textContent = "No calibration session running. Open the extension popup on a GBF tab and click Calibration Lab to start one.";
    pickPanel.hidden = true;
    runPanel.hidden = true;
    resultPanel.hidden = true;
    return;
  }

  if (finalizedResult) {
    empty.hidden = true;
    pickPanel.hidden = true;
    runPanel.hidden = true;
    resultPanel.hidden = false;
    renderResult(finalizedResult);
    return;
  }

  sessionSnapshot = await send({ type: "GET_CALIBRATION_SESSION" });
  empty.hidden = true;
  resultPanel.hidden = true;

  if (!sessionSnapshot || !sessionSnapshot.protocolId) {
    pickPanel.hidden = false;
    runPanel.hidden = true;
  } else {
    pickPanel.hidden = true;
    runPanel.hidden = false;
    renderRun(sessionSnapshot);
  }
}

async function startProtocol() {
  const protocolId = document.getElementById("protocol-select").value;
  if (!getProtocol(protocolId)) return;
  const fp = readFingerprintForm();
  const res = await send({ type: "SET_CALIBRATION_PROTOCOL", protocolId, fingerprintFields: fp });
  if (res?.error) alert(res.error);
  await refresh();
}

async function advanceStep() {
  await send({ type: "ADVANCE_CALIBRATION_STEP" });
  await refresh();
}

async function addSample() {
  const valEl = document.getElementById("sample-value");
  const value = Number(valEl.value);
  if (!Number.isFinite(value)) {
    valEl.focus();
    return;
  }
  const stateQuality = document.getElementById("sample-quality").value;
  const notes = document.getElementById("sample-notes").value || null;
  await send({ type: "ADD_CALIBRATION_SAMPLE", value, stateQuality, notes });
  valEl.value = "";
  document.getElementById("sample-notes").value = "";
  await refresh();
  valEl.focus();
}

async function finalize() {
  const res = await send({ type: "FINALIZE_CALIBRATION" });
  if (res?.error) { alert(res.error); return; }
  finalizedResult = res?.record || null;
  await refresh();
}

async function quitSession() {
  if (!confirm("Discard this calibration session? Samples collected so far will be lost.")) return;
  await send({ type: "DISPATCH", action: { type: "STOP_SESSION" } });
  finalizedResult = null;
  sessionSnapshot = null;
  await refresh();
}

async function newRun() {
  finalizedResult = null;
  sessionSnapshot = null;
  // The previous session was already stopped by finalize. User must click
  // Calibration Lab in the popup again to start a new session.
  await refresh();
}

// ---- render ----
function renderRun(s) {
  const protocol = getProtocol(s.protocolId);
  writeFingerprintForm(s.fingerprintFields);

  document.getElementById("run-protocol-name").textContent = protocol?.name || s.protocolId;
  document.getElementById("run-fp").textContent = fingerprintChip(s.fingerprintFields);
  document.getElementById("step-count").textContent = String(protocol?.steps?.length || 1);
  document.getElementById("step-index").textContent = String(
    Math.min((s.currentStepIndex ?? 0) + 1, protocol?.steps?.length || 1),
  );
  const stepText = protocol?.steps?.[s.currentStepIndex] || "All steps done. Add remaining samples and finalize.";
  document.getElementById("step-text").textContent = stepText;
  document.getElementById("metric-name").textContent = protocol?.metric || "value";
  const isLast = (s.currentStepIndex ?? 0) >= (protocol?.steps?.length || 1) - 1;
  document.getElementById("advance-btn").disabled = isLast;

  renderSamples(s.samples || [], protocol);
  const anyBadQuality = (s.samples || []).some((x) => x.stateQuality !== STATE_QUALITY.SYNCHRONIZED);
  document.getElementById("quality-warn").hidden = !anyBadQuality;

  const preview = safeAggregate(s.samples || [], protocol);
  const label = preview ? preview.confidence : CONFIDENCE.INSUFFICIENT_DATA;
  document.getElementById("live-conf-label").textContent = label;
  document.getElementById("finalize-btn").disabled = !preview || preview.confidence === CONFIDENCE.INSUFFICIENT_DATA;
}

function safeAggregate(samples, protocol) {
  if (!protocol || !samples.length) return null;
  try { return aggregate(samples, { protocol }); } catch { return null; }
}

function renderSamples(samples, protocol) {
  const body = document.getElementById("samples-body");
  body.textContent = "";
  document.getElementById("samples-summary").textContent =
    `${samples.filter(qualifies).length} qualified · ${samples.length} total`;
  if (!samples.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No samples yet.";
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  // Flag outliers using primary-aggregate view.
  const flagged = protocol
    ? aggregate(samples, { protocol }).outliers
    : [];
  const outlierTs = new Set(flagged.map((s) => s.ts));
  samples.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.appendChild(td(String(i + 1)));
    tr.appendChild(td(String(s.value)));
    const q = td(s.stateQuality);
    q.className = `quality-${s.stateQuality}`;
    tr.appendChild(q);
    const o = td(outlierTs.has(s.ts) ? "yes" : "—");
    o.className = outlierTs.has(s.ts) ? "outlier-yes" : "outlier-no";
    tr.appendChild(o);
    tr.appendChild(td(s.notes || ""));
    const cell = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.className = "secondary";
    btn.title = "Remove this sample";
    btn.addEventListener("click", () => removeSample(s.ts));
    cell.appendChild(btn);
    tr.appendChild(cell);
    body.appendChild(tr);
  });
}

function td(text) {
  const c = document.createElement("td");
  c.textContent = text;
  return c;
}

async function removeSample(ts) {
  await send({ type: "REMOVE_CALIBRATION_SAMPLE", ts });
  await refresh();
}

function renderResult(record) {
  const protocol = getProtocol(record.protocolId);
  document.getElementById("result-name").textContent = `Calibration complete — ${protocol?.name || record.protocolId}`;
  const badge = document.getElementById("result-confidence");
  badge.textContent = record.aggregate.confidence;

  const facts = document.getElementById("result-facts");
  facts.textContent = "";
  const rows = [
    ["Metric", protocol?.metric || "—"],
    ["Samples", `${record.aggregate.primaryCount} primary · ${record.aggregate.outlierCount} outlier · ${record.aggregate.sampleCount} total`],
    ["Range", record.aggregate.min == null ? "—" : `${fmt(record.aggregate.min)} … ${fmt(record.aggregate.max)}`],
    ["Median (P25 · P75)", record.aggregate.median == null ? "—" : `${fmt(record.aggregate.median)}  (${fmt(record.aggregate.p25)} · ${fmt(record.aggregate.p75)})`],
    ["Mean", record.aggregate.mean == null ? "—" : fmt(record.aggregate.mean)],
    ["Variance", fmt(record.aggregate.variance)],
    ["Confidence", record.aggregate.confidence],
    ["Recommendation", record.aggregate.recommendation],
    ["Fingerprint", fingerprintChip(record.fingerprintFields)],
    ["Calibration version", record.calibrationVersion || "1"],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = String(v);
    facts.appendChild(dt);
    facts.appendChild(dd);
  }
  document.getElementById("result-note").textContent =
    "Never fabricated — this record ties to the fingerprint above. If any field changes, the calibration becomes stale.";
}

function renderHistory() {
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  list.textContent = "";
  const rows = history
    .filter((h) => h && h.id)
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
    .slice(0, 20);
  if (!rows.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  for (const c of rows) {
    const li = document.createElement("li");
    li.className = "history-item";
    const proto = getProtocol(c.protocolId);
    const main = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = proto?.name || c.protocolId;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${new Date(c.endedAt || 0).toLocaleString()} · ${c.aggregate?.confidence || "?"} · ${c.aggregate?.primaryCount ?? 0} samples`;
    main.appendChild(title);
    main.appendChild(meta);
    const status = document.createElement("span");
    status.className = `status-${c.status}`;
    status.textContent = c.status;
    li.appendChild(main);
    li.appendChild(status);
    list.appendChild(li);
  }
}

function fingerprintChip(fp) {
  if (!fp) return "no fingerprint";
  const summary = [];
  if (fp.mainClass) summary.push(fp.mainClass);
  if (fp.raidBonus) summary.push(`bonus:${fp.raidBonus}`);
  if (fp.gameDataVersion) summary.push(`gd:${fp.gameDataVersion}`);
  return summary.join(" · ") || "unspecified";
}

function fmt(v) {
  if (v == null) return "—";
  if (typeof v !== "number") return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3);
}

init().catch((err) => {
  const empty = document.getElementById("empty");
  empty.hidden = false;
  document.getElementById("empty-msg").textContent = `Calibration Lab init failed: ${err?.message || err}`;
});
