// Per-file counts of the old names and of the empty catches in browser programs (specs/repository-anti-corruption §4.13 /
// §4.16, slice W1-04). Each rule counts per file and may only fall; a file with no record starts at 0, so new code starts
// clean. The counts of empty catch blocks and `as unknown as` casts in TypeScript code moved to the static checks (W1-09:
// scripts/gates/lint.mjs, tooling/gates/lint/*.grit), which report the same sites file by file; this file keeps what a
// linter cannot see. scripts/check-health-gates.mjs turns every rule here into a metric that behaves exactly like the
// compatibility markers: it measures the head and the merge-base with this same code, so a change of definition needs no
// re-baselining, and --update cannot launder growth.
//
// COUNTING DEFINITIONS. This header is the one place they are written down (tooling/gates/README.md repeats them for readers).
//
// Which files: the TypeScript sources under apps, horizontal, modules, packages, plugins, server and tooling (not tests,
// fixtures, dist or .d.ts), the entry's isSource. Both rules read sources only, because a test names things as fixtures.
//
// emptyCatchesInScripts An empty `catch` clause (no statement, no comment: `catch {}`, `catch (error) { }`, the shape the
//                       static check molis/no-empty-catch reports in real code) found in the text of string and template
//                       literals of the SOURCES. The host serves browser programs (the workbench, the plugin client scripts) as template literals; neither the
//                       TypeScript checker nor a linter looks inside them, and 137 of the 141 empty catches the survey
//                       found sit there. They are INCLUDED here, under their own counter so that moving a program out of a
//                       template literal into real TypeScript moves the count from one counter to the other. The shape is
//                       `catch`, optionally `( … )`, `{`, nothing but whitespace, `}`.
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
//                       spelling `board-id` (the CLI flag before #287) and every file that is not one of the sources above,
//                       such as examples/draft-goal.json and examples/leaf-goal.json, which still carry `"board_id"` and are
//                       shipped through the root package.json `files`. Closing it needs a rule per file type, not a regex.
//                       What the baseline keeps today (tooling/gates/baseline.json, oldNames): the key-derivation
//                       salt `goalboard-feed-secretstore-v1` in packages/storage/src/adapters/file-secret-store.ts (its code
//                       comment: changing the string would invalidate existing ciphertext), the local function
//                       `checkGoalBoard` in apps/local-host/src/project-capabilities.ts, and two unused `_boardId` names in
//                       plugins/native/goals/src (a destructuring rename in document-collection.ts, a parameter in
//                       goal-tree-materialization-order.ts). Each stays in the baseline like any other count; it can only fall.
import ts from "typescript";

const CATCH_SHAPE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const OLD_PRODUCT_NAME = /goalboard/gi;
const OLD_ID_NAME = /(?<![A-Za-z])(?:board_ids?|boardIds?)(?![a-z])|(?<![A-Z])BoardIds?(?![a-z])|(?<![A-Z])BOARD_IDS?(?![A-Z])/g;

const IS_STRING_LIKE = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

/** Counts one file. `text` is the whole file; `inSource` is false for tests. Exported for the tests of the definitions. */
export const countFile = (file, text, { inSource = false } = {}) => {
  const counts = { emptyCatchesInScripts: 0, oldNames: 0 };
  if (!inSource) return counts;
  counts.oldNames = (text.match(OLD_PRODUCT_NAME) ?? []).length + (text.match(OLD_ID_NAME) ?? []).length;
  // Parse only the files whose text can hold the shape.
  if (!/\bcatch\b/.test(text)) return counts;
  const visit = (node) => {
    if (IS_STRING_LIKE(node)) counts.emptyCatchesInScripts += (node.text.match(CATCH_SHAPE) ?? []).length;
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  return counts;
};

// One pass over a snapshot serves both rules.
const passes = new WeakMap();
const measureSnapshot = (snapshot, { isSource }) => {
  let result = passes.get(snapshot);
  if (result) return result;
  result = { emptyCatchesInScripts: {}, oldNames: {} };
  for (const file of snapshot.files) {
    if (!isSource(file)) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    for (const [rule, count] of Object.entries(countFile(file, text, { inSource: true }))) if (count) result[rule][file] = count;
  }
  passes.set(snapshot, result);
  return result;
};

/**
 * The rules, in the shape the entry turns into metrics. `measure(snapshot, scope)` returns { file: count } for a snapshot
 * (a file list plus a reader) and the entry's `isSource` predicate.
 */
export const SOURCE_COUNT_RULES = [
  { id: "emptyCatchesInScripts", title: "Empty catch blocks (browser scripts in string and template literals)", summary: "empty catches in scripts", what: "empty catch blocks in a browser script",
    hint: "handle the error, or say in a comment inside the block why ignoring it is safe" },
  { id: "oldNames", title: "Old names (goalboard, board_id) in sources", summary: "old names", what: "uses of an old name (goalboard, board_id)",
    hint: "use Molis Work and project_id; a kept constant belongs in the baseline, not in new code" },
].map((rule) => ({ ...rule, measure: (snapshot, scope) => measureSnapshot(snapshot, scope)[rule.id] }));
