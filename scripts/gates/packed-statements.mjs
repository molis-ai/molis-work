// AST gate (Batch 100-2 / Decision 58): counts sibling statements placed on the same line inside
// a SourceFile, Block, CaseClause, DefaultClause or ModuleBlock (e.g. `a(); b();`). Replaces rigid
// 150/800-line splits that incentivized single-line statement packing. Per-file ratchet: may only fall.
import ts from "typescript";

const fileCache = new Map();

export function countPackedStatements(file, text) {
  const cached = fileCache.get(file);
  if (cached && cached.text === text) return cached.count;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let count = 0;
  const visit = (node) => {
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node) || ts.isModuleBlock(node)) {
      const { statements } = node;
      for (let i = 0; i + 1 < statements.length; i++) {
        const prevEnd = source.getLineAndCharacterOfPosition(statements[i].getEnd()).line;
        const nextStart = source.getLineAndCharacterOfPosition(statements[i + 1].getStart(source)).line;
        if (prevEnd === nextStart) count++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  fileCache.set(file, { text, count });
  return count;
}

export function measurePackedStatements(snapshot, { isSource }) {
  const counts = {};
  for (const file of snapshot.files) {
    if (!isSource(file)) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    const count = countPackedStatements(file, text);
    if (count) counts[file] = count;
  }
  return counts;
}
