// Pre-update summary (PRD §36): given the current installed pack (or null)
// and the new pack's manifest, decide what the install will do and produce
// a human-readable summary for the user to review BEFORE applying.

export const UPDATE_KINDS = Object.freeze(["new", "update", "downgrade", "no-change"]);

export function planUpdate(currentPack, newManifest) {
  if (!newManifest || typeof newManifest !== "object") {
    throw new TypeError("newManifest required");
  }
  if (!currentPack) {
    return {
      kind: "new",
      newId: newManifest.id,
      newVersion: newManifest.version,
      summary: `Install ${newManifest.name} v${newManifest.version}`,
    };
  }
  if (currentPack.id !== newManifest.id) {
    return {
      kind: "new",
      newId: newManifest.id,
      newVersion: newManifest.version,
      summary: `Install ${newManifest.name} v${newManifest.version} (unrelated to ${currentPack.id})`,
    };
  }
  const cmp = compareSemver(newManifest.version, currentPack.version);
  if (cmp === 0) {
    return {
      kind: "no-change",
      newId: newManifest.id,
      newVersion: newManifest.version,
      summary: `${newManifest.name} v${newManifest.version} is already installed`,
    };
  }
  if (cmp > 0) {
    return {
      kind: "update",
      currentVersion: currentPack.version,
      newVersion: newManifest.version,
      summary: `Update ${newManifest.name}: v${currentPack.version} → v${newManifest.version}`,
    };
  }
  return {
    kind: "downgrade",
    currentVersion: currentPack.version,
    newVersion: newManifest.version,
    summary: `Downgrade ${newManifest.name}: v${currentPack.version} → v${newManifest.version}`,
  };
}

function compareSemver(a, b) {
  const parse = (v) => (/^(\d+)\.(\d+)\.(\d+)/.exec(String(v)) || []).slice(1, 4).map((x) => +x);
  const [aM, aN, aP] = parse(a);
  const [bM, bN, bP] = parse(b);
  return (aM * 1e6 + aN * 1e3 + aP) - (bM * 1e6 + bN * 1e3 + bP);
}
