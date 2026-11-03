// Gate: a library whose version changed has a line in the maintenance list (specs/BACKLOG.md BL-157, spec §12.4 RAC-13).
//
// Every Home library has one current version, and a build refuses any other (docs/releases/CHECKLIST.md §3). So when a
// PR changes a version, its disposition must be recorded before a Home can open with the new build.
// On 2026-10-13 Pages went from 1 to 2 without one, and it was found only by checking the real Home by hand on 10-17.
// This gate turns that into a rule:
//
//   With --base: read the 版本 column of the table under「## 3. 各库版本表」in docs/releases/CHECKLIST.md on the head
//   and on the merge-base. Each row is keyed by its 位置 cell. A row whose version differs (up or down) must have a row in
//   the「库版本维护清单」table of docs/system/CONTRACT-CHANGES.md「存储版本变更登记」with the same 位置 and `old → new`.
//   A row that is new on the head (a library new to Home, built from its baseline on first open) or gone from it needs none.
//   Without --base: only that both tables can be read.
//
// Reading the checklist table instead of the code is sound because scripts/verify-release-versions.mjs fails CI when a
// row and its definition in the code differ.
//
// THE ENTRY FORMAT. Only the table that follows the line starting with「**库版本维护清单**」inside「存储版本变更登记」counts (from the
// heading「### 存储版本变更登记」to the next heading); the same words in prose anywhere else do not. The table has the columns 位置
// and 版本: 位置 is the checklist's 位置 cell, in backticks, exactly; 版本 is `<old> → <new>`, two numbers and the arrow →.
//
// FAIL CLOSED. A table or list that cannot be found or read, on either side it is needed (the checklist on the head and
// on the merge-base, the list on the head), is an error that ends the run with exit 2, never a pass. The gate applies as
// soon as the checklist is on either side, so deleting it (or the registration document) on the head fails too; a
// repository without a checklist on both sides (the scratch repositories and layout copies of the other gate tests, some
// of which carry PACKAGE-BOUNDARIES.md for its package table) is not gated.
//
// KNOWN GAPS. A 位置 renamed in the same PR reads as one row gone and one new row, so it passes. It compares with the
// merge-base, not with the build installed in a Home: several PRs' changes add up, and that comparison is the first item of
// CHECKLIST §4.3, done by hand before a release. It does not check that the maintenance the row describes was done.
export const CHECKLIST_FILE = "docs/releases/CHECKLIST.md";
export const SPEC_FILE = "docs/system/CONTRACT-CHANGES.md";
const LIST_MARKER = "**库版本维护清单**";

// A read failure is an Error marked `storeVersionsUnreadable`, so the caller can tell it from a bug and exit 2.
const unreadable = (message) => { throw Object.assign(new Error(message), { storeVersionsUnreadable: true }); };

const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
// The table that starts at the first line beginning with "|" from `start`, up to `end`: its header and its rows.
function tableAfter(lines, start, end, where) {
  let index = start;
  while (index < end && !lines[index].startsWith("|")) index++;
  if (index >= end) unreadable(`${where}: no table`);
  const header = cells(lines[index]);
  if (!/^[-|:\s]+$/.test(lines[index + 1] ?? "")) unreadable(`${where}: the table has no separator line under its header`);
  const rows = [];
  for (index += 2; index < end && lines[index].startsWith("|"); index++) rows.push({ line: index + 1, cells: cells(lines[index]) });
  return { header, rows };
}
const column = (header, name, where) => {
  const at = header.indexOf(name);
  if (at < 0) unreadable(`${where}: the table has no column ${name}`);
  return at;
};

/** The 版本 of each library in the checklist's §3 table, keyed by its 位置 cell. */
export function checklistVersions(text, where = CHECKLIST_FILE) {
  if (typeof text !== "string") unreadable(`${where}: missing`);
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => /^## 3\. 各库版本表\s*$/.test(line));
  if (heading < 0) unreadable(`${where}: no heading「## 3. 各库版本表」`);
  let end = lines.findIndex((line, index) => index > heading && /^## /.test(line));
  if (end < 0) end = lines.length;
  const { header, rows } = tableAfter(lines, heading + 1, end, `${where} §3`);
  const place = column(header, "位置", `${where} §3`), version = column(header, "版本", `${where} §3`);
  if (rows.length === 0) unreadable(`${where} §3: the table has no rows`);
  const versions = new Map();
  for (const row of rows) {
    const key = row.cells[place], value = row.cells[version];
    if (!key || !/^\d+$/.test(value ?? "")) unreadable(`${where}:${row.line}: a row needs a 位置 and a whole-number 版本`);
    versions.set(key, Number(value));
  }
  return versions;
}

/** The rows under「存储版本变更登记」in CONTRACT-CHANGES.md, as `位置 → [old, new]` pairs. */
export function maintenanceEntries(text, where = SPEC_FILE) {
  if (typeof text !== "string") unreadable(`${where}: missing`);
  const lines = text.split("\n");
  const section = lines.findIndex((line) => /^### 存储版本变更登记\s*$/.test(line));
  if (section < 0) unreadable(`${where}: no heading「### 存储版本变更登记」`);
  let end = lines.findIndex((line, index) => index > section && /^#{1,3} /.test(line));
  if (end < 0) end = lines.length;
  const marker = lines.findIndex((line, index) => index > section && index < end && line.startsWith(LIST_MARKER));
  if (marker < 0) unreadable(`${where}「存储版本变更登记」: no line starting with ${LIST_MARKER}`);
  const { header, rows } = tableAfter(lines, marker + 1, end, `${where}「存储版本变更登记」${LIST_MARKER}`);
  const place = column(header, "位置", `${where}「存储版本变更登记」`), version = column(header, "版本", `${where}「存储版本变更登记」`);
  return rows.map((row) => {
    const key = /^`([^`]+)`$/.exec(row.cells[place] ?? ""), change = /^(\d+) → (\d+)$/.exec(row.cells[version] ?? "");
    if (!key || !change) unreadable(`${where}:${row.line}: a row of the maintenance list needs 位置 in backticks and 版本 as \`<old> → <new>\``);
    return { place: key[1], from: Number(change[1]), to: Number(change[2]) };
  });
}

/**
 * What the gate finds. `read(file)` gives the head's text or null; `readBase(file)` the merge-base's (absent without --base).
 * It applies when the checklist is on either side.
 * Throws an Error marked `storeVersionsUnreadable` when something it needs cannot be read; returns the problems otherwise.
 */
export function storeVersionProblems({ read, readBase }) {
  const checklist = read(CHECKLIST_FILE), spec = read(SPEC_FILE);
  const baseChecklist = readBase ? readBase(CHECKLIST_FILE) : null;
  if (checklist === null && baseChecklist === null) return [];
  const head = checklistVersions(checklist);
  const entries = maintenanceEntries(spec);
  if (!readBase) return [];
  const base = checklistVersions(baseChecklist, `merge-base:${CHECKLIST_FILE}`);
  const problems = [];
  for (const [cell, version] of head) {
    const before = base.get(cell);
    if (before === undefined || before === version) continue;
    const place = cell.replace(/^`|`$/g, "");
    if (!entries.some((entry) => entry.place === place && entry.from === before && entry.to === version)) {
      problems.push(`${CHECKLIST_FILE}: ${cell} went from ${before} to ${version}; add the row \`${place}\` | ${before} → ${version} to the 库版本维护清单 in ${SPEC_FILE}「存储版本变更登记」(which commit changed it, how a Home in use is brought to it)`);
    }
  }
  return problems;
}
