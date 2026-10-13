// Gate: specs/BACKLOG.md lists only what is not done (specs/repository-anti-corruption §4.12; the file's own rule: "做完一条就
// 删掉它，在提交说明里写编号。不改编号，不复用编号。").
//
// A row (a table line that starts with a BL-nnn id) is a done row when a cell is struck through (~~text~~) or says the work
// is complete: 已完成, 已实现, 已做完, 已关闭, 完成, done. A row waiting for the user's own trial sits under "待你验收" and
// does not say any of these. An id used on two rows is an error too: ids are never reused.
// Not read (scripts/gates/README.md, 门禁读不到的): a row that says it in other words ("已修复（#300）", "已合入 main"). Under "待你验收"
// a row is finished work waiting for the user's trial, so "已合入 main" is a normal status there and cannot be a rule.
const ROW = /^\|\s*(BL-\d+)\s*\|/;
const DONE_CELL = /^(?:已完成|已实现|已做完|已关闭|完成|done)(?![一-龥a-z])/i;

export function backlogProblems(snapshot) {
  const text = snapshot.read("specs/BACKLOG.md");
  if (text === null) return [];
  const problems = [];
  const seen = new Map();
  text.split("\n").forEach((line, index) => {
    const row = line.match(ROW);
    if (!row) return;
    const id = row[1];
    const where = `specs/BACKLOG.md:${index + 1}`;
    if (seen.has(id)) problems.push(`${where}: ${id} is on two rows (first at line ${seen.get(id)}); ids are not reused`);
    else seen.set(id, index + 1);
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.some((cell) => /~~[^~]+~~/.test(cell))) problems.push(`${where}: ${id} is struck through; a finished item is deleted, with its id in the commit message`);
    else if (cells.some((cell) => DONE_CELL.test(cell))) problems.push(`${where}: ${id} says it is done; delete the row, with its id in the commit message`);
  });
  return problems;
}
