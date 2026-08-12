function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

function fmtTime(ms) { return new Date(ms).toLocaleTimeString(); }

function prettyBody(s) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s || ""; }
}

async function refresh() {
  const [{ feasibilityMode }, log] = await Promise.all([
    send({ type: "GET_FEASIBILITY_MODE" }),
    send({ type: "GET_DEV_CAPTURE" }),
  ]);
  document.getElementById("feasibility-toggle").checked = !!feasibilityMode;
  document.getElementById("mode-warn").hidden = !feasibilityMode;

  const list = document.getElementById("capture-list");
  list.textContent = "";
  const items = Array.isArray(log) ? log : [];
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = feasibilityMode
      ? "No payloads captured yet. Open DevTools on the GBF tab and browse to trigger requests."
      : "Feasibility mode is OFF. Turn it on above, then capture some traffic.";
    list.appendChild(p);
    return;
  }
  for (const rec of items.slice().reverse()) {
    const li = document.createElement("li");
    li.className = "capture-item";
    const head = document.createElement("div"); head.className = "head";
    const url = document.createElement("span"); url.className = "url"; url.textContent = rec.url;
    const method = document.createElement("span"); method.className = "method"; method.textContent = `${rec.method} · ${fmtTime(rec.receivedAt)}`;
    const copy = document.createElement("button"); copy.className = "copy"; copy.textContent = "Copy body";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(rec.body || "");
      copy.textContent = "Copied ✓";
      setTimeout(() => { copy.textContent = "Copy body"; }, 1500);
    });
    head.append(url, method, copy);
    const pre = document.createElement("pre");
    pre.textContent = prettyBody(rec.body);
    li.append(head, pre);
    list.appendChild(li);
  }
}

document.getElementById("feasibility-toggle").addEventListener("change", async (e) => {
  const res = await send({ type: "SET_FEASIBILITY_MODE", enabled: e.target.checked });
  const notice = document.getElementById("notice");
  notice.className = "notice ok";
  notice.textContent = res?.feasibilityMode ? "Feasibility mode ON." : "Feasibility mode OFF.";
  await refresh();
});

document.getElementById("refresh-btn").addEventListener("click", refresh);
document.getElementById("clear-btn").addEventListener("click", async () => {
  await send({ type: "CLEAR_DEV_CAPTURE" });
  await refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.devCaptureLog) refresh();
});

refresh();
