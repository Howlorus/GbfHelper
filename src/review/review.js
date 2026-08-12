function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

const CATEGORY_CLASS = {
  SetupFailure: "setup", RotationFailure: "rotation", ExecutionFailure: "execution",
  PredictionFailure: "prediction", ObservationFailure: "observation", VarianceIssue: "variance",
};

function fmtDate(ms) { return new Date(ms).toLocaleString(); }
function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60); const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

async function loadRuns() {
  const list = await send({ type: "LIST_RUNS" });
  const empty = document.getElementById("empty");
  const emptyMsg = document.getElementById("empty-msg");
  const ul = document.getElementById("run-list");
  ul.textContent = "";
  if (!Array.isArray(list) || list.length === 0) {
    empty.hidden = false;
    emptyMsg.textContent = "No runs yet. Start a Raid Session with DevTools open on the GBF tab.";
    return;
  }
  empty.hidden = true;
  const sorted = list.slice().sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  for (const run of sorted) {
    const li = document.createElement("li");
    li.className = "run-item";
    li.dataset.runId = run.id;
    const raid = document.createElement("div"); raid.className = "raid";
    raid.textContent = run.raidId || run.tabTitle || "Unknown raid";
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = `${fmtDate(run.startedAt)} · ${fmtDuration(run.durationMs || 0)} · ${run.turns ?? "?"} turn(s) · ended: ${run.endReason || "?"}`;
    li.append(raid, meta);
    li.addEventListener("click", () => selectRun(run.id));
    ul.appendChild(li);
  }
}

async function selectRun(runId) {
  for (const li of document.querySelectorAll(".run-item")) {
    li.classList.toggle("selected", li.dataset.runId === runId);
  }
  const res = await send({ type: "DIAGNOSE_RUN", runId });
  const detail = document.getElementById("detail");
  detail.hidden = false;
  detail.textContent = "";
  if (!res?.run) {
    detail.textContent = res?.error || "Run not found.";
    return;
  }
  const { run, diagnosis } = res;
  const h = document.createElement("h2");
  h.textContent = run.raidId || run.tabTitle || "Unknown raid";
  const dl = document.createElement("dl");
  for (const [label, value] of [
    ["Started", fmtDate(run.startedAt)],
    ["Duration", fmtDuration(run.durationMs || 0)],
    ["Turns", run.turns ?? "—"],
    ["End reason", run.endReason],
    ["Final state quality", run.finalStateQuality ?? "—"],
    ["Event count", run.eventCount],
  ]) {
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = String(value);
    dl.append(dt, dd);
  }
  const diag = document.createElement("div"); diag.className = "diag";
  const catBadge = document.createElement("h3");
  catBadge.textContent = `Diagnosis: ${diagnosis.category} (${diagnosis.confidence})`;
  const expl = document.createElement("p");
  expl.textContent = diagnosis.explanation;
  const evUl = document.createElement("ul");
  for (const ev of diagnosis.evidence) {
    const li = document.createElement("li"); li.textContent = ev; evUl.appendChild(li);
  }
  const action = document.createElement("div"); action.className = "action";
  action.textContent = `Suggested: ${diagnosis.suggestedAction}`;
  diag.append(catBadge, expl, evUl, action);
  detail.append(h, dl, diag);
}

loadRuns().catch((err) => {
  document.getElementById("empty").hidden = false;
  document.getElementById("empty-msg").textContent = `Failed to load runs: ${err?.message || err}`;
});
