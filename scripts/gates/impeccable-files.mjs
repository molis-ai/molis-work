// Health gate: tracked files under any `.impeccable/` directory may only decrease, counted per review group (specs/
// repository-anti-corruption §1, decision 2026-10-08 "评审截图与根目录材料"; the retention rule is
// docs/system/REPOSITORY-HYGIENE.md).
//
// `.impeccable/` holds review screenshots and design notes. Only the ones a current spec, doc or test names stay. The count
// is kept per group, the same way compat markers are kept per file: a group may only lose files and a group with no record
// starts at 0, so
//   - refreshing the committed evidence (MOLIS_WORK_REVIEW_EVIDENCE=1) rewrites existing files and does not add any,
//   - a new screenshot, a new review set or a new design note fails, and
//   - moving a file from one set to another fails too (the other set grew), so removing files in one place never pays
//     for adding them somewhere else.
// The count is taken from the tracked file list, so it is the same on the working tree and on the merge-base, and the gate
// needs no text.
//
// This module is plugged into the METRICS list of scripts/check-health-gates.mjs, which hands it the `perFile` helper (the
// comparison with the reference and the old-shape check of tooling/gates/baseline.json are the ones the other per-file
// counts use).

/**
 * The group a tracked path is counted in, wherever its `.impeccable/` folder is (the repository root one, or one nested in
 * a directory such as docs/design/<name>/ or plugins/native/plugin-builder/): the set folder two levels below
 * `.impeccable/` (`.impeccable/review/<set>`, `.impeccable/mocks/<set>`), the folder one level below for a file directly in
 * it (`.impeccable/review`, `.impeccable/surfaces`), and `.impeccable` itself for its own files. Files deeper inside a set
 * count in the set. Returns null for a path that is not under a `.impeccable/` folder; a name that merely contains the word
 * (`docs/notes.impeccable.md`, `.impeccable-notes/`) is not one.
 */
export const impeccableGroup = (file) => {
  const parts = file.split("/");
  const at = parts.indexOf(".impeccable");
  if (at === -1 || at === parts.length - 1) return null;
  const folders = parts.length - 1 - (at + 1); // directories between `.impeccable` and the file name
  return parts.slice(0, at + 1 + Math.min(folders, 2)).join("/");
};

const sumOf = (groups) => Object.values(groups).reduce((sum, count) => sum + count, 0);

export function createImpeccableMetric({ perFile }) {
  return {
    id: "impeccable",
    measure(snapshot) {
      const groups = {};
      for (const file of snapshot.files) {
        const group = impeccableGroup(file);
        if (group !== null) groups[group] = (groups[group] ?? 0) + 1;
      }
      return groups;
    },
    toBaseline: (groups) => ({ impeccableFiles: sumOf(groups), impeccableGroups: groups }),
    fromBaseline: (json) => perFile.fromBaseline(json, "impeccableGroups"),
    grew: perFile.grew("tracked files under .impeccable", "keep only what a current spec, doc or test names; new evidence goes to the ignored .impeccable/qa/review/, and a set that really is cited needs the gate itself changed in review (docs/system/REPOSITORY-HYGIENE.md)"),
    lowered: perFile.lowered,
    lines(head, ref, { top }) {
      const rows = Object.entries(head).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const out = [`Tracked .impeccable files: ${sumOf(head)} in ${rows.length} groups${ref ? `, base ${sumOf(ref)}` : ""}`, `  ${"count".padStart(5)}${ref ? "   base" : ""}  group`];
      for (const [group, count] of rows.slice(0, top)) out.push(`  ${String(count).padStart(5)}${ref ? String(ref[group] ?? "new").padStart(7) : ""}  ${group}`);
      if (top && rows.length > top) out.push(`  … ${rows.length - top} more (omit --top to see all)`);
      return out;
    },
    summary: (groups) => `${sumOf(groups)} .impeccable files`,
  };
}
