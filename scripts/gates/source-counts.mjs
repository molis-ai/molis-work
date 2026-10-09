// Per-file counts of what a minimal lint rule set would flag, and of the old names (specs/repository-anti-corruption
// §4.13 / §4.16, slice W1-04). Each rule counts per file and may only fall; a file with no record starts at 0, so new
// code starts clean. scripts/check-health-gates.mjs turns every rule here into a metric that behaves exactly like the
// compatibility markers: it measures the head and the merge-base with this same code, so a change of definition needs no
// re-baselining, and --update cannot launder growth.
//
// COUNTING DEFINITIONS. This header is the one place they are written down (tooling/gates/README.md repeats them for readers).
//
// Which files: the TypeScript sources under apps, horizontal, modules, packages, plugins, server and tooling (not tests,
// fixtures, dist or .d.ts) and every .ts, .mts and .mjs file under tests/ at any depth, fixtures and helpers included
// (the entry's isTestFile, which the test-import count uses as well). Two rules read sources only, because a test names
// things as fixtures: emptyCatchesInScripts and oldNames.
//
// emptyCatches          A `catch` clause whose block holds no statement and no comment: `catch {}`, `catch (error) { }`.
//                       A block with a comment is a decision somebody wrote down ("the file may not exist yet") and is not
//                       counted; a block with any statement is handled, however little it does. Not counted: a promise's
//                       `.catch(() => {})` (a callback, not a catch clause) and `finally`. Found in the syntax tree, so only
//                       real code counts, never a comment or a string.
// emptyCatchesInScripts The same shape, found in the text of string and template literals of the SOURCES. The host serves
//                       browser programs (the workbench, the plugin client scripts) as template literals; neither the
//                       TypeScript checker nor a linter looks inside them, and 137 of the 141 empty catches the survey
//                       found sit there. They are INCLUDED here, under their own counter so that moving a program out of a
//                       template literal into real TypeScript moves the count from one counter to the other. The shape is
//                       `catch`, optionally `( … )`, `{`, nothing but whitespace, `}`.
// unknownCasts          A double assertion through unknown: `value as unknown as Target`, `(value as unknown) as Target`,
//                       and the angle-bracket form `<Target><unknown>value`. Not counted: a single `as unknown`, and
//                       `as any as Target`. Tests are included: the number the program tracks (spec §9.3, R-12) includes them.
// oldNames              In sources: the old product name, `goalboard` as ONE word in any case (GoalBoard, goalboard-v1-demo,
//                       GOALBOARD_HOME), and the old id name for the project id: board_id, boardId, BoardId, BOARD_ID,
//                       plural too, as a whole name or the tail of a longer one (conflicting_board_id, existingBoardId,
//                       CONFLICTING_BOARD_ID) but not inside another word (dashboard_id, dashboardId, DASHBOARD_ID,
//                       KEYBOARD_IDS). Only these two spellings are counted. `goal-board` (the kanban view's
//                       `.goal-board-switch` class and CSS container name) is not the old name and is not counted.
//                       GOAL_BOARDS_SCHEMA_SQL (the DDL of the per-project `boards` table) is not counted either, but not
//                       because it is the view: it is one of the other "Board as the project" names (getBoard,
//                       initializeBoard, ...) that docs/system/GLOSSARY.md R-A1 lists for renaming (roadmap W5-14 carries
//                       the renames); this rule neither sees nor guards them. Tests are out of scope: they name old names to assert that
//                       they are refused. Within a TypeScript source the count reads the plain text, so a comment or a string
//                       counts like code. Not seen, so a return would not be caught (a known limit, not a decision): the kebab
//                       spelling `board-id` (the CLI flag before #287) and every file that is not one of the sources above
//                       (JSON examples, shell and Rust files). Closing it needs a rule per file type, not a regex.
//                       What the baseline keeps today (tooling/gates/baseline.json, oldNames): the key-derivation
//                       salt `goalboard-feed-secretstore-v1` in packages/storage/src/adapters/file-secret-store.ts (its code
//                       comment: changing the string would invalidate existing ciphertext), and two unused `_boardId` names in
//                       plugins/native/goals/src (a destructuring rename in document-collection.ts, a parameter in
//                       goal-tree-materialization-order.ts). Each stays in the baseline like any other count; it can only fall.
import ts from "typescript";

const CATCH_SHAPE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const OLD_PRODUCT_NAME = /goalboard/gi;
const OLD_ID_NAME = /(?<![A-Za-z])(?:board_ids?|boardIds?)(?![a-z])|(?<![A-Z])BoardIds?(?![a-z])|(?<![A-Z])BOARD_IDS?(?![A-Z])/g;

const IS_STRING_LIKE = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
const isUnknownKeyword = (type) => type.kind === ts.SyntaxKind.UnknownKeyword;
const unwrap = (node) => { while (ts.isParenthesizedExpression(node)) node = node.expression; return node; };

/** Counts one file. `text` is the whole file; `inSource` is false for tests. Exported for the tests of the definitions. */
export const countFile = (file, text, { inSource = false } = {}) => {
  const counts = { emptyCatches: 0, emptyCatchesInScripts: 0, unknownCasts: 0, oldNames: 0 };
  if (inSource) counts.oldNames = (text.match(OLD_PRODUCT_NAME) ?? []).length + (text.match(OLD_ID_NAME) ?? []).length;
  // Parse only the files that can hold a catch clause or a cast through unknown.
  const mayCatch = /\bcatch\b/.test(text);
  const mayCast = /\bas\s+unknown\b|<\s*unknown\s*>/.test(text);
  if (!mayCatch && !mayCast) return counts;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (mayCatch && ts.isCatchClause(node) && node.block.statements.length === 0
      && !/\S/.test(text.slice(node.block.getStart(source) + 1, node.block.getEnd() - 1))) counts.emptyCatches++;
    else if (mayCatch && inSource && IS_STRING_LIKE(node)) counts.emptyCatchesInScripts += (node.text.match(CATCH_SHAPE) ?? []).length;
    else if (mayCast && ts.isAsExpression(node)) {
      const inner = unwrap(node.expression);
      if (ts.isAsExpression(inner) && isUnknownKeyword(inner.type)) counts.unknownCasts++;
    } else if (mayCast && ts.isTypeAssertionExpression(node)) {
      const inner = unwrap(node.expression);
      if (ts.isTypeAssertionExpression(inner) && isUnknownKeyword(inner.type)) counts.unknownCasts++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts;
};

// One pass over a snapshot serves all four rules.
const passes = new WeakMap();
const measureSnapshot = (snapshot, { isSource, isTestFile }) => {
  let result = passes.get(snapshot);
  if (result) return result;
  result = { emptyCatches: {}, emptyCatchesInScripts: {}, unknownCasts: {}, oldNames: {} };
  for (const file of snapshot.files) {
    const inSource = isSource(file);
    if (!inSource && !isTestFile(file)) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    for (const [rule, count] of Object.entries(countFile(file, text, { inSource }))) if (count) result[rule][file] = count;
  }
  passes.set(snapshot, result);
  return result;
};

/**
 * The rules, in the shape the entry turns into metrics. `measure(snapshot, scope)` returns { file: count } for a snapshot
 * (a file list plus a reader) and the entry's `isSource` / `isTestFile` predicates.
 */
export const SOURCE_COUNT_RULES = [
  { id: "emptyCatches", title: "Empty catch blocks (TypeScript code)", summary: "empty catches", what: "empty catch blocks",
    hint: "handle the error, or say in a comment inside the block why ignoring it is safe" },
  { id: "emptyCatchesInScripts", title: "Empty catch blocks (browser scripts in string and template literals)", summary: "empty catches in scripts", what: "empty catch blocks in a browser script",
    hint: "handle the error, or say in a comment inside the block why ignoring it is safe" },
  { id: "unknownCasts", title: "`as unknown as` casts", summary: "unknown casts", what: "`as unknown as` casts",
    hint: "type the value, narrow it, or validate it instead of asserting through unknown" },
  { id: "oldNames", title: "Old names (goalboard, board_id) in sources", summary: "old names", what: "uses of an old name (goalboard, board_id)",
    hint: "use Molis Work and project_id; a kept constant belongs in the baseline, not in new code" },
].map((rule) => ({ ...rule, measure: (snapshot, scope) => measureSnapshot(snapshot, scope)[rule.id] }));
