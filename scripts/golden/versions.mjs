// The order of golden Home versions, for the replay and the gate: `<main>-dev.<n>` comes before `<main>`, and a golden is named by its version.
export const GOLDEN_HOMES_DIRECTORY = "tests/fixtures/golden-homes";

export function versionsNewestLast(names) {
  const parts = name => { const [main, dev] = name.split("-dev."); return [...main.split(".").map(Number), dev === undefined ? Infinity : Number(dev)]; };
  return [...names].sort((a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}
