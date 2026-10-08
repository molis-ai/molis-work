// Gate: the number of review screenshots and design references tracked under .impeccable/ only falls (specs/
// repository-anti-corruption §4.12, decision 22: keep what a current spec, document or test points at; the rest leaves the
// tree, history untouched).
//
// Counted per group: the folder two levels under a .impeccable/ folder (.impeccable/review/<set>, .impeccable/mocks/<set>),
// the folder itself for anything shallower, wherever the .impeccable/ folder is (the root one and the few nested ones). A
// group may only lose files and a group with no record starts at 0, so replacing a screenshot in place is fine and adding
// one, or a new set, is not. New evidence is written to the ignored .impeccable/qa/review/ unless a test is told to refresh
// the in-repo set (MOLIS_WORK_REVIEW_EVIDENCE=1, tests/fixtures/review-evidence.ts).
export const impeccableGroup = (file) => {
  const parts = file.split("/");
  const at = parts.indexOf(".impeccable");
  if (at === -1) return null;
  const below = parts.length - at - 1; // path segments after .impeccable, the file name included
  return parts.slice(0, at + 1 + Math.min(2, Math.max(0, below - 1))).join("/");
};

function measure(snapshot) {
  const groups = {};
  for (const file of snapshot.files) {
    const group = impeccableGroup(file);
    if (group !== null) groups[group] = (groups[group] ?? 0) + 1;
  }
  return groups;
}

export const impeccableFiles = {
  id: "impeccableFiles",
  baselineKey: "impeccableGroups",
  totalKey: "impeccableFiles",
  measure,
  grewWhat: "tracked files under .impeccable",
  grewHint: "write review evidence to the ignored .impeccable/qa/review/ (the default), and delete sets no current spec, document or test points at",
  title: "Files under .impeccable (per group)",
  unit: { many: "groups", one: "group" },
  summary: (groups) => `${Object.values(groups).reduce((sum, count) => sum + count, 0)} .impeccable files`,
};
