// Exact-origin + path-prefix match against a versioned allowlist.
// Uses URL parsing to defeat look-alike spoofs (e.g. "game.granbluefantasy.jp.evil.com"
// or "game-granbluefantasy.jp").

export function urlMatchesAllowlist(urlString, allowlist) {
  if (typeof urlString !== "string" || !allowlist || !Array.isArray(allowlist.hosts)) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  return allowlist.hosts.some((h) =>
    parsed.origin === h.origin && parsed.pathname.startsWith(h.pathPrefix || "/")
  );
}
