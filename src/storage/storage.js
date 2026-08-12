function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

async function refresh() {
  const { stats, quota } = await send({ type: "GET_STORAGE_STATS" });
  const q = document.getElementById("quota");
  if (quota && Number.isFinite(quota.usage) && Number.isFinite(quota.quota)) {
    const pct = ((quota.usage / quota.quota) * 100).toFixed(1);
    q.textContent = `Used ${fmtBytes(quota.usage)} of ${fmtBytes(quota.quota)} (${pct}%)`;
  } else {
    q.textContent = "Storage quota not reported by this browser";
  }
  const body = document.getElementById("stats-body");
  body.textContent = "";
  for (const [store, info] of Object.entries(stats)) {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td"); nameTd.textContent = store;
    const tierTd = document.createElement("td"); tierTd.className = "tier"; tierTd.dataset.tier = info.tier || "";
    tierTd.textContent = info.tier || "—";
    const countTd = document.createElement("td"); countTd.className = "count";
    countTd.textContent = info.count == null ? "error" : String(info.count);
    tr.append(nameTd, tierTd, countTd);
    body.appendChild(tr);
  }
}

function confirmDestructive({ title, body, requireTyped }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("confirm-dialog");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-body").textContent = body;
    const label = document.getElementById("confirm-input-label");
    const input = document.getElementById("confirm-input");
    const ok = document.getElementById("confirm-ok");
    label.hidden = !requireTyped;
    input.value = "";
    ok.disabled = requireTyped;
    input.oninput = () => { ok.disabled = requireTyped && input.value !== "DELETE"; };
    dlg.returnValue = "";
    dlg.showModal();
    // Default focus on Cancel (safer)
    document.getElementById("confirm-cancel").focus();
    dlg.addEventListener("close", () => resolve({
      ok: dlg.returnValue === "confirm",
      confirmation: requireTyped ? input.value : "",
    }), { once: true });
  });
}

async function onQuickCleanup() {
  const notice = document.getElementById("cleanup-notice");
  notice.className = "notice"; notice.textContent = "Cleaning…";
  const res = await send({ type: "QUICK_CLEANUP" });
  const freedStores = (res?.stores || []).length;
  notice.className = "notice ok";
  notice.textContent = `Cleared ${freedStores} rebuildable store(s). Your account, plans, notes are untouched.`;
  await refresh();
}

async function onWipeAll() {
  const decision = await confirmDestructive({
    title: "Delete ALL local data",
    body: "This clears every store, including your account scan, raid plans, notes, calibration, and settings. There is no undo without a prior backup.",
    requireTyped: true,
  });
  if (!decision.ok) return;
  const notice = document.getElementById("cleanup-notice");
  notice.className = "notice"; notice.textContent = "Wiping…";
  const res = await send({ type: "WIPE_ALL", confirmation: decision.confirmation });
  notice.className = res?.ok !== false ? "notice ok" : "notice err";
  notice.textContent = res?.ok !== false ? "All local data deleted." : `Refused: ${res.error}`;
  await refresh();
}

async function onBackup() {
  const bundle = await send({ type: "BUILD_BACKUP" });
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gbf-copilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  const notice = document.getElementById("backup-notice");
  notice.className = "notice ok"; notice.textContent = "Backup downloaded.";
}

async function onRestoreFile(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  let bundle;
  try { bundle = JSON.parse(text); }
  catch (err) {
    const notice = document.getElementById("backup-notice");
    notice.className = "notice err"; notice.textContent = `Not a valid JSON file: ${err.message}`;
    return;
  }
  const decision = await confirmDestructive({
    title: "Restore backup",
    body: "This will merge (or replace) records from the backup into your local stores. Existing envelope-less records will refuse the transaction.",
    requireTyped: false,
  });
  if (!decision.ok) { evt.target.value = ""; return; }
  const notice = document.getElementById("backup-notice");
  notice.className = "notice"; notice.textContent = "Restoring…";
  const res = await send({ type: "RESTORE_BACKUP", bundle, replace: false });
  notice.className = res?.ok ? "notice ok" : "notice err";
  notice.textContent = res?.ok ? `Restored ${res.restoredStores.length} store(s).` : `Restore failed: ${res?.error || "unknown"}`;
  evt.target.value = "";
  await refresh();
}

document.getElementById("quick-btn").addEventListener("click", onQuickCleanup);
document.getElementById("wipe-btn").addEventListener("click", onWipeAll);
document.getElementById("backup-btn").addEventListener("click", onBackup);
document.getElementById("restore-btn").addEventListener("click", () => document.getElementById("restore-file").click());
document.getElementById("restore-file").addEventListener("change", onRestoreFile);

refresh().catch((err) => {
  document.getElementById("cleanup-notice").textContent = `Init failed: ${err?.message || err}`;
});
