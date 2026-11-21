// The Home directories the upgrade renames (packages/storage `HOME_LAYOUT_MOVES`; `tests/home-layout-moves.test.ts` holds the two lists
// equal). A golden made before a rename holds the old name; the replay upgrades it to the new one, so the gates read a path held under `from`
// as also held under `to`. The gates read text and run before anything is built, so they keep their own copy instead of importing storage.
export const HOME_LAYOUT_MOVES = Object.freeze([Object.freeze({ from: "feed", to: "security" })]);

/** `held` and, when it sits under a renamed directory, the same path under that directory's current name. */
export function withCurrentLayout(held) {
  const moved = HOME_LAYOUT_MOVES.find(({ from }) => held === from || held.startsWith(`${from}/`));
  return moved ? [held, moved.to + held.slice(moved.from.length)] : [held];
}
