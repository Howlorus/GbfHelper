// Pure decision: on a state-machine transition, should the scan buffer
// (progress + records) be seeded, cleared, or left alone?

const SCAN = "AccountScanActive";

export function scanLifecycleAction(currentState, nextState) {
  const wasScan = currentState?.state === SCAN;
  const isScan = nextState?.state === SCAN;
  if (!wasScan && isScan) return "seed";
  if (wasScan && !isScan) return "clear";
  return "none";
}
