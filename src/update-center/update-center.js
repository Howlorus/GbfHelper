function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r)));
}

async function refreshInstalled() {
  const list = await send({ type: "LIST_ALL_PACKS" });
  const ul = document.getElementById("installed-list");
  const empty = document.getElementById("installed-empty");
  ul.textContent = "";
  const packs = Array.isArray(list) ? list : [];
  if (packs.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;
  for (const p of packs) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "id";
    name.textContent = p.name || p.id;
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = p.kind || "";
    const version = document.createElement("span");
    version.className = "version";
    version.textContent = `v${p.version || "?"}`;
    li.append(name, kind, version);
    ul.appendChild(li);
  }
}

let latestBundle = null;

async function readFiles(files) {
  const out = {};
  for (const f of files) out[f.name] = await f.text();
  return out;
}

async function onFilesSelected(evt) {
  const preview = document.getElementById("preview");
  const apply = document.getElementById("apply-btn");
  const notice = document.getElementById("notice");
  notice.textContent = ""; notice.className = "notice";
  apply.hidden = true; latestBundle = null;

  const files = [...(evt.target.files || [])];
  if (!files.length) { preview.hidden = true; return; }

  const rawFiles = await readFiles(files);
  const result = await send({ type: "PLAN_UPDATE", rawFiles });
  if (!result?.ok) {
    preview.hidden = false;
    preview.className = "preview error";
    preview.textContent = "";
    const p = document.createElement("p");
    p.textContent = "Bundle refused:";
    preview.appendChild(p);
    const ul = document.createElement("ul");
    for (const err of result?.errors || [result?.error || "unknown error"]) {
      const li = document.createElement("li"); li.textContent = err; ul.appendChild(li);
    }
    preview.appendChild(ul);
    return;
  }
  latestBundle = rawFiles;
  preview.hidden = false;
  preview.className = "preview";
  preview.textContent = "";
  const kind = document.createElement("span");
  kind.className = `kind ${result.plan.kind}`;
  kind.textContent = result.plan.kind;
  const summary = document.createElement("p");
  summary.textContent = result.plan.summary;
  preview.append(kind, summary);
  apply.hidden = false;
  apply.disabled = result.plan.kind === "no-change";
}

async function onApply() {
  if (!latestBundle) return;
  const apply = document.getElementById("apply-btn");
  const notice = document.getElementById("notice");
  apply.disabled = true;
  notice.className = "notice"; notice.textContent = "Installing…";
  const res = await send({ type: "APPLY_UPDATE", rawFiles: latestBundle });
  if (res?.ok) {
    notice.className = "notice ok";
    notice.textContent = `Installed ${res.installed.name} v${res.installed.version}.`;
    latestBundle = null;
    document.getElementById("preview").hidden = true;
    document.getElementById("file-input").value = "";
    apply.hidden = true;
    await refreshInstalled();
  } else {
    notice.className = "notice err";
    notice.textContent = "Install failed. Previous state is unchanged. " + (res?.errors ? res.errors.join(" · ") : res?.error || "");
    apply.disabled = false;
  }
}

document.getElementById("file-input").addEventListener("change", onFilesSelected);
document.getElementById("apply-btn").addEventListener("click", onApply);
refreshInstalled().catch((err) => {
  document.getElementById("notice").textContent = `Failed to load installed packs: ${err?.message || err}`;
});
