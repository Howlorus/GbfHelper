// Popup: dormant view for US-01-01. No permissions used, no messages sent to
// the service worker. Tab-awareness (US-01-02) and session actions (later)
// wire in from their own US.

const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = "v" + chrome.runtime.getManifest().version;

const openOptions = document.getElementById("open-options");
if (openOptions) {
  openOptions.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}
