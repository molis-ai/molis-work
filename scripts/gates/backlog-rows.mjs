import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainScript } from "../script-paths.mjs";
export const BACKLOG_RECORDS = "specs/backlog/";
// Gate: specs/BACKLOG.md lists only what is not done (specs/archive/repository-anti-corruption §4.12; the file's own rule: "做完一条就
// 删掉它，在提交说明里写编号。不改编号，不复用编号。").
//
// A row (a table line that starts with a BL-nnn id) is a done row when a cell is struck through (~~text~~) or says the work
// is complete: 已完成, 已实现, 已做完, 已关闭, 完成, done. A row waiting for the user's own trial sits under "待你验收" and
// does not say any of these. An id used on two rows is an error too: ids are never reused. A row has the eight columns of
// specs/BACKLOG.md; its source, priority and owner are what make it something somebody can pick up, so none may be empty.
// Not read (scripts/gates/README.md, 门禁读不到的): a row that says it in other words ("已修复（#300）", "已合入 main"). Under "待你验收"
// a row is finished work waiting for the user's trial, so "已合入 main" is a normal status there and cannot be a rule.
const ROW = /^\|\s*(BL-(?:\d+|[a-z][a-z0-9-]*))\s*\|/;
const DONE_CELL = /^(?:已完成|已实现|已做完|已关闭|完成|done)(?![一-龥a-z])/i;
const COLUMNS = 8, PRIORITIES = ["高", "中", "低"];

export function backlogProblems(snapshot) {
  const text = snapshot.read("specs/BACKLOG.md");
  if (text === null) return [];
  const problems = [];
  const seen = new Map();
  if (text.split("\n").some(line => ROW.test(line))) problems.push("specs/BACKLOG.md: move item rows into independent specs/backlog/ files");
  const records = snapshot.files.filter(file => file.startsWith(BACKLOG_RECORDS) && file !== `${BACKLOG_RECORDS}README.md`);
  for (const file of records) {
    if (!new RegExp(`^${BACKLOG_RECORDS}BL-(?:\\d+|[a-z][a-z0-9-]*)\\.md$`).test(file)) problems.push(`${file}: invalid record filename`);
    const lines = (snapshot.read(file) ?? "").split("\n");
    if (lines.filter(line => ROW.test(line)).length !== 1) problems.push(`${file}: expected exactly one backlog row`);
    lines.forEach((line, index) => {
    const row = line.match(ROW);
    if (!row) return;
    const id = row[1];
    const where = `${file}:${index + 1}`;
    if (`${id}.md` !== path.posix.basename(file)) problems.push(`${where}: ${id} must match its filename`);
    if (seen.has(id)) problems.push(`${where}: ${id} is on two rows (first at line ${seen.get(id)}); ids are not reused`);
    else seen.set(id, index + 1);
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());
    if (cells.some((cell) => /~~[^~]+~~/.test(cell))) problems.push(`${where}: ${id} is struck through; a finished item is deleted, with its id in the commit message`);
    else if (cells.some((cell) => DONE_CELL.test(cell))) problems.push(`${where}: ${id} says it is done; delete the row, with its id in the commit message`);
    if (cells.length !== COLUMNS) problems.push(`${where}: ${id} has ${cells.length} columns; a row has ${COLUMNS}`);
    else {
      const [, , source, , , , priority, owner] = cells;
      if (!source) problems.push(`${where}: ${id} has no source`);
      if (!owner) problems.push(`${where}: ${id} has no owner`);
      if (!PRIORITIES.includes(priority)) problems.push(`${where}: ${id} has priority "${priority}", which is not 高, 中 or 低`);
    }
  });
  }
  return problems;
}

if (isMainScript(import.meta.url)) {
  if (process.argv.slice(2).join(" ") !== "--report") { console.error("usage: backlog-rows.mjs --report"); process.exitCode = 2; }
  else {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    for (const file of readdirSync(path.join(root, BACKLOG_RECORDS)).filter(file => /^BL-.*\.md$/.test(file)).sort()) {
      console.log(readFileSync(path.join(root, BACKLOG_RECORDS, file), "utf8").trim());
      console.log("");
    }
  }
}
