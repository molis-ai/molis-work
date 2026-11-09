// A2 measures the whole tracked Host source tree, including generated code and fixtures.
const SOURCE_EXTENSION = /\.(?:ts|mts|cts|tsx|js|mjs|cjs|jsx)$/;
export const hostLinesWantText = (file) => file.startsWith("apps/local-host/src/") && SOURCE_EXTENSION.test(file);

function measureHostLines(snapshot) {
  const files = {};
  let total = 0;
  for (const file of snapshot.files) {
    if (!hostLinesWantText(file)) continue;
    const text = snapshot.read(file);
    if (text === null) continue; // A tracked path can have been deleted in the working tree.
    const count = text === "" ? 0 : text.split("\n").length - Number(text.endsWith("\n"));
    files[file] = count;
    total += count;
  }
  return { total, files };
}

export function reportHostLines(headSnapshot, baseSnapshot, renames) {
  const head = measureHostLines(headSnapshot);
  if (!baseSnapshot) return { head, base: null, delta: null, changes: [] };

  const base = measureHostLines(baseSnapshot);
  const baseByCurrentPath = new Map();
  for (const [file, count] of Object.entries(base.files)) {
    const moved = renames.get(file) ?? file;
    const currentPath = Object.hasOwn(head.files, moved) ? moved : file;
    baseByCurrentPath.set(currentPath, { file, count });
  }
  const changes = [];
  for (const file of new Set([...Object.keys(head.files), ...baseByCurrentPath.keys()])) {
    const previous = baseByCurrentPath.get(file);
    const before = previous?.count ?? null;
    const after = head.files[file] ?? null;
    const previousFile = previous && previous.file !== file ? previous.file : null;
    if (before === after && previousFile === null) continue;
    changes.push({ file, previousFile, before, after, delta: (after ?? 0) - (before ?? 0) });
  }
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.file.localeCompare(b.file));
  return { head, base, delta: head.total - base.total, changes };
}

const signed = (delta) => delta > 0 ? `+${delta}` : String(delta);

export function hostLineSummary({ head, base, delta }) {
  const totals = base ? `${base.total} → ${head.total} (${signed(delta)})` : String(head.total);
  return `Host source lines (report only) ${totals} in ${Object.keys(head.files).length} files`;
}

export function hostLineDetails({ head, base, changes }, top) {
  const rows = base
    ? changes.map(({ file, previousFile, before, after, delta }) => {
      const name = previousFile ? `${previousFile} → ${file}` : file;
      return `  ${before ?? "new"} → ${after ?? "deleted"} (${signed(delta)})  ${name}`;
    })
    : Object.entries(head.files)
      .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
      .map(([file, count]) => `  ${count}  ${file}`);
  const shown = rows.slice(0, top);
  if (shown.length < rows.length) shown.push(`  … ${rows.length - shown.length} more (omit --top to see all)`);
  return shown;
}
