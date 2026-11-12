// The order of golden Home versions, for the replay and the gate: `<main>-dev.<n>` comes before `<main>`, and a golden is named by its version.
export const GOLDEN_HOMES_DIRECTORY = "tests/fixtures/golden-homes";

export function versionsNewestLast(names) {
  const parts = name => { const [main, dev] = name.split("-dev."); return [...main.split(".").map(Number), dev === undefined ? Infinity : Number(dev)]; };
  return [...names].sort((a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}

/**
 * A Home-relative path, or a pattern with `*` for one path segment, as an exactly anchored RegExp: the readings that say where a golden's
 * store or file sits, and the replay deciding which store a recorded path belongs to, agree on this one spelling. Both separators are read
 * because the replay writes its patterns with `path.join`.
 */
export function relativePathPattern(location) {
  const body = location.split(/[\\/]/u).map(part => part === "*" ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("/");
  return new RegExp(`^${body}$`, "u");
}
