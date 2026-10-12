// Turning decisions into text. An edit replaces a range of a file's text; edits only change a specifier's characters, an
// imported name (`X` → `Y as X` when an entry exports the declaration under another name) or insert ` type`, never a line break,
// so every cited line number in the docs (47 lines cite tests/…:N) stays where it is. verifyEdits re-reads the result.
import { parseImports } from "./parse.mjs";

/** The edits of one planned action: the specifier, and the renamed elements when the entry exports a name differently. */
export function editsOfAction(action) {
  const { ref, specifier, renames = [], rule } = action;
  const edits = [{ start: ref.imp.start + 1, end: ref.imp.end - 1, text: specifier, rule }];
  for (const { element, exported } of renames) {
    if (exported === element.imported) continue;
    if (element.prop) edits.push({ start: element.prop[0], end: element.prop[1], text: exported, rule });
    else edits.push({ start: element.name[0], end: element.name[1], text: element.binding ? `${exported}: ${element.imported}` : `${exported} as ${element.imported}`, rule });
  }
  return edits;
}

/** ` type` after the `import` / `export` keyword: the declaration is then type-only for the syntax as it already is for the compiler. */
export const typeKeywordEdit = (imp) => ({ start: imp.keywordEnd, end: imp.keywordEnd, text: " type", rule: "R5" });

/** Applies non-overlapping edits to a text. */
export function applyEdits(text, edits) {
  let out = text;
  let limit = Infinity;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > limit) throw new Error(`overlapping edits at offset ${edit.start}`);
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    limit = edit.start;
  }
  return out;
}

/**
 * Re-reads a rewritten file and compares it with the original, import by import: the same imports in the same order on the same
 * lines, binding the same local names, type-only only where R5 says so, and a changed specifier only where the plan changed it.
 * `planned` maps an import's index to { specifier?, r5? }.
 */
export function verifyEdits(file, oldImports, newText, planned) {
  const now = parseImports(file, newText, { deep: true, detail: true });
  if (now.length !== oldImports.length) return [`${file}: ${oldImports.length} imports became ${now.length}`];
  const problems = [];
  oldImports.forEach((before, index) => {
    const after = now[index];
    const change = planned.get(index);
    const where = `${file}:${before.line}`;
    if (after.form !== before.form || after.line !== before.line) problems.push(`${where}: the import moved or changed form`);
    if (after.spec !== (change?.specifier ?? before.spec)) problems.push(`${where}: expected ${change?.specifier ?? before.spec}, found ${after.spec}`);
    if (after.typeOnly !== (before.typeOnly || Boolean(change?.r5))) problems.push(`${where}: type-only changed from ${before.typeOnly} to ${after.typeOnly}`);
    const locals = (record) => (record.names ?? []).map((element) => element.local).join(",");
    if (locals(before) !== locals(after)) problems.push(`${where}: the names bound here changed (${locals(before)} → ${locals(after)})`);
    if ((before.names?.length ?? -1) !== (after.names?.length ?? -1)) problems.push(`${where}: the list of names changed length`);
  });
  return problems;
}
