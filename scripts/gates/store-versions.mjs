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
//   Without --base: only that both tables and the origin line can be read.
//
// Reading the checklist table instead of the code is sound because scripts/verify-release-versions.mjs fails CI when a
// row and its definition in the code differ.
//
// THE ENTRY FORMAT. Only the table that follows the line starting with「**库版本维护清单**」inside「存储版本变更登记」counts (from the
// heading「### 存储版本变更登记」to the next heading); the same words in prose anywhere else do not. The table has the columns 位置
// and 版本: 位置 is the checklist's 位置 cell, in backticks, exactly; 版本 is `<old> → <new>`, two numbers and the arrow →.
//
// AFTER THE UNIFIED ORIGIN (specs/upgrade-continuity/upgrade-chain-design.md §11.2). CHECKLIST §4 holds one line starting「统一起点登记：」,
// either「未登记」or the date and the main commit. Until it is registered the rule above is all there is: Homes are rebuilt, versions
// may be reset, and a row's 维护 cell is free text. Once it is registered, on the head or on the merge-base, a library's version comes
// with a way up:
//   - a version never goes down, whatever the list says;
//   - the row of a version that went up has `定义处#<old>→<new>` in its 维护 cell, in backticks: the checklist row's 定义处 and the
//     two numbers of the 版本 cell;
//   - that file's upgrades literal has `from: n` for each n from old to new - 1. When 定义处 is a baseline constant that means the
//     `upgrades` of that object; when it is a plain version constant (a JSON file, the catalog) or the field of a JSON file
//     (`path#schema_version`, `path#version`: these have no constant to point at), any `upgrades` array in the file.
// A step list the gate cannot read (a spread, a constant reference, a computed `from`) fails like one that is not there: whether the
// whole chain from 1 is consecutive is checked on the real values elsewhere (tests/upgrade-chain-registry.test.ts).
// A registered origin cannot go back to「未登记」.
//
// FAIL CLOSED. A table or list that cannot be found or read, on either side it is needed (the checklist on the head and
// on the merge-base, the list on the head), is an error that ends the run with exit 2, never a pass. The gate applies as
// soon as the checklist is on either side, so deleting it (or the registration document) on the head fails too; a
// repository without a checklist on both sides (the scratch repositories and layout copies of the other gate tests, some
// of which carry PACKAGE-BOUNDARIES.md for its package table) is not gated. The origin line follows the same rule on the head: no
// line, two lines, or a line in another shape exits 2. A merge-base from before the line existed counts as not registered.
//
// KNOWN GAPS. A 位置 renamed in the same PR reads as one row gone and one new row, so it passes. It compares with the
// merge-base, not with the build installed in a Home: several PRs' changes add up, and that comparison is the first item of
// CHECKLIST §4.3, done by hand before a release. It does not check that the maintenance the row describes was done.
import ts from "typescript";
import { VERSION_FIELD } from "../version-source.mjs";

export const CHECKLIST_FILE = "docs/releases/CHECKLIST.md";
export const SPEC_FILE = "docs/system/CONTRACT-CHANGES.md";
const LIST_MARKER = "**库版本维护清单**";
const ORIGIN_MARKER = "统一起点登记：";
const ORIGIN_VALUE = /^(?:未登记|\d{4}-\d{2}-\d{2}，main 提交 `[0-9a-f]{7,40}`)$/;
const UPGRADE_POINTER = /^`([^`#\s]+#[^`#\s]+)#(\d+)→(\d+)`$/;

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

function checklistTable(text, where) {
  if (typeof text !== "string") unreadable(`${where}: missing`);
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => /^## 3\. 各库版本表\s*$/.test(line));
  if (heading < 0) unreadable(`${where}: no heading「## 3. 各库版本表」`);
  let end = lines.findIndex((line, index) => index > heading && /^## /.test(line));
  if (end < 0) end = lines.length;
  return tableAfter(lines, heading + 1, end, `${where} §3`);
}

/** The 版本 of each library in the checklist's §3 table, keyed by its 位置 cell. */
export function checklistVersions(text, where = CHECKLIST_FILE) {
  const { header, rows } = checklistTable(text, where);
  const place = column(header, "位置", `${where} §3`), version = column(header, "版本", `${where} §3`);
  if (rows.length === 0) unreadable(`${where} §3: the table has no rows`);
  const versions = new Map();
  for (const row of rows) {
    const key = row.cells[place], value = row.cells[version];
    if (!key || !/^\d+$/.test(value ?? "")) unreadable(`${where}:${row.line}: a row needs a 位置 and a whole-number 版本`);
    if (versions.has(key)) unreadable(`${where}:${row.line}: the 位置 ${key} is on another row too`);
    versions.set(key, Number(value));
  }
  return versions;
}

/** The 定义处 of each library in the checklist's §3 table, keyed by its 位置 cell, without the backticks. */
function checklistDefinitions(text) {
  const { header, rows } = checklistTable(text, CHECKLIST_FILE);
  const place = column(header, "位置", `${CHECKLIST_FILE} §3`), definition = column(header, "定义处", `${CHECKLIST_FILE} §3`);
  return new Map(rows.map((row) => [row.cells[place], (row.cells[definition] ?? "").replace(/`/g, "")]));
}

/**
 * Whether the checklist's §4 records the unified origin: its one line starting「统一起点登记：」. A line in any other shape is not read as
 * either answer. `missing` is what a checklist without the line means: on the head it cannot be read, on an older merge-base it is `false`.
 */
export function originRegistered(text, where = CHECKLIST_FILE, missing = () => unreadable(`${where} §4: no line starting ${ORIGIN_MARKER}`)) {
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => /^## 4\. /.test(line));
  if (heading < 0) return missing();
  let end = lines.findIndex((line, index) => index > heading && /^## /.test(line));
  if (end < 0) end = lines.length;
  const found = lines.slice(heading + 1, end).filter((line) => line.startsWith(ORIGIN_MARKER));
  if (found.length === 0) return missing();
  if (found.length > 1) unreadable(`${where} §4: more than one line starting ${ORIGIN_MARKER}`);
  const value = found[0].slice(ORIGIN_MARKER.length).trim();
  if (!ORIGIN_VALUE.test(value)) unreadable(`${where} §4: ${found[0]} is neither 未登记 nor「<YYYY-MM-DD>，main 提交 \`<sha>\`」`);
  return value !== "未登记";
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
  const maintenance = header.indexOf("维护");
  return rows.map((row) => {
    const key = /^`([^`]+)`$/.exec(row.cells[place] ?? ""), change = /^(\d+) → (\d+)$/.exec(row.cells[version] ?? "");
    if (!key || !change) unreadable(`${where}:${row.line}: a row of the maintenance list needs 位置 in backticks and 版本 as \`<old> → <new>\``);
    return { place: key[1], from: Number(change[1]), to: Number(change[2]), maintenance: row.cells[maintenance] ?? "" };
  });
}

const unwrap = (node) => { while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression; return node; };
const upgradesOf = (object) => object.properties.find((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "upgrades");

// The `from` numbers of one `upgrades` property. Anything but an array of objects with a number literal is not readable.
function stepsOf(property) {
  const list = unwrap(property.initializer);
  if (!ts.isArrayLiteralExpression(list)) return null;
  const froms = [];
  for (const element of list.elements) {
    const step = unwrap(element);
    const from = step && ts.isObjectLiteralExpression(step) && step.properties.find((item) => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === "from");
    const value = from ? unwrap(from.initializer) : null;
    if (!value || !ts.isNumericLiteral(value)) return null;
    froms.push(Number(value.text));
  }
  return froms;
}

/** The `from` numbers the definition `name` has in `source`, or a sentence saying why they cannot be read. */
function declaredSteps(file, source, name) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declarations = [], objects = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declarations.push(node);
    if (ts.isObjectLiteralExpression(node) && upgradesOf(node)) objects.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  // A field of a JSON file (its 定义处 is `path#schema_version`) has no constant; scripts/verify-release-versions.mjs reads its number.
  if (!VERSION_FIELD.test(name) && declarations.length !== 1) return { why: `${file} has no one constant ${name}` };
  const value = declarations.length === 1 ? unwrap(declarations[0].initializer) : null;
  const owners = value && ts.isObjectLiteralExpression(value) ? [value] : objects;
  const properties = owners.map(upgradesOf).filter(Boolean);
  if (properties.length === 0) return { why: `${file}#${name} has no upgrades` };
  const lists = properties.map(stepsOf);
  if (lists.includes(null)) return { why: `the upgrades of ${file}#${name} are not an array of steps with a number literal in \`from\`` };
  return { froms: lists.flat() };
}

// What is wrong with the 维护 cell of a row whose version went up, once the origin is registered.
function upgradePointerProblems(entry, definition, read) {
  const name = `\`${entry.place}\` ${entry.from} → ${entry.to}`;
  const wanted = `\`${definition}#${entry.from}→${entry.to}\``;
  const pointer = UPGRADE_POINTER.exec(entry.maintenance);
  if (!pointer) return [`${SPEC_FILE}: the row ${name} needs ${wanted} in its 维护 cell, found「${entry.maintenance}」`];
  if (pointer[1] !== definition) return [`${SPEC_FILE}: the row ${name} points at ${pointer[1]}, but the checklist defines this library at ${definition}`];
  if (Number(pointer[2]) !== entry.from || Number(pointer[3]) !== entry.to) return [`${SPEC_FILE}: the row ${name} points at the step ${pointer[2]}→${pointer[3]}`];
  const [file, constant] = definition.split("#");
  const source = read(file);
  if (source === null) return [`${SPEC_FILE}: the row ${name} points at ${file}, which does not exist`];
  const declared = declaredSteps(file, source, constant);
  if (declared.why) return [`${SPEC_FILE}: the row ${name}: ${declared.why}`];
  const problems = [];
  for (let from = entry.from; from < entry.to; from += 1) {
    if (!declared.froms.includes(from)) problems.push(`${SPEC_FILE}: the row ${name}: ${definition} has no upgrade step with \`from: ${from}\``);
  }
  return problems;
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
  const headOrigin = originRegistered(checklist);
  if (!readBase) return [];
  const base = checklistVersions(baseChecklist, `merge-base:${CHECKLIST_FILE}`);
  const baseOrigin = originRegistered(baseChecklist, `merge-base:${CHECKLIST_FILE}`, () => false);
  const afterOrigin = headOrigin || baseOrigin;
  const definitions = afterOrigin ? checklistDefinitions(checklist) : null;
  const problems = [];
  if (baseOrigin && !headOrigin) problems.push(`${CHECKLIST_FILE} §4: the merge-base has the unified origin registered; it cannot go back to 未登记`);
  for (const [cell, version] of head) {
    const before = base.get(cell);
    if (before === undefined || before === version) continue;
    const place = cell.replace(/^`|`$/g, "");
    if (afterOrigin && version < before) {
      problems.push(`${CHECKLIST_FILE}: ${cell} went from ${before} to ${version}; after the unified origin a version does not go down`);
      continue;
    }
    const found = entries.filter((entry) => entry.place === place && entry.from === before && entry.to === version);
    if (found.length === 0) {
      const maintenance = afterOrigin ? `its upgrade step as \`${definitions.get(cell)}#${before}→${version}\`` : "which commit changed it, how a Home in use is brought to it";
      problems.push(`${CHECKLIST_FILE}: ${cell} went from ${before} to ${version}; add the row \`${place}\` | ${before} → ${version} to the 库版本维护清单 in ${SPEC_FILE}「存储版本变更登记」(${maintenance})`);
    } else if (afterOrigin) {
      // The list keeps history, so the same numbers can have an older row in prose: one row that holds up is enough, and a row
      // that points somewhere says more about what is wrong than an old one that does not.
      const pointing = found.filter((entry) => UPGRADE_POINTER.test(entry.maintenance));
      const checked = (pointing.length > 0 ? pointing : found).map((entry) => upgradePointerProblems(entry, definitions.get(cell), read));
      problems.push(...(pointing.length > 0 ? checked.flat() : checked.at(-1)));
    }
  }
  return problems;
}
