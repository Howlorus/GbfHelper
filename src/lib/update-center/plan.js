export function planUpdate(currentPack, newManifest) {
  if (!currentPack || currentPack.id !== newManifest.id) {
    return {
      kind: "new",
      newId: newManifest.id,
      newVersion: newManifest.version,
      summary: `Install ${newManifest.name} v${newManifest.version}`,
    };
  }
  const cmp = compareSemver(newManifest.version, currentPack.version);
  if (cmp === 0) {
    return {
      kind: "no-change",
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
