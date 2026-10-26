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
// fixtures, dist or .d.ts), the entry's isSource. These rules read sources only, because a test names things as fixtures.
//
// rawFetchInScripts     Calls in executable browser programs, not words in a string: bare/member/computed fetch, local
//                      aliases (including assignment/destructuring/bind), call/apply. browser-programs.mjs expands named
//                      SCRIPT/CLIENT declarations, inline HTML scripts, constant concatenations/joins and function ASTs
//                      used by toString. Relative/workspace imports retain original source attribution. Typed browser
//                      entry dependencies include Workbench terminal-client and its terminal modules. Three exact
//                      transport roles in ui-host admit only one original call site per role, not a directory. Unknown
//                      recognized program syntax is a failure, never zero. Workbench is absolutely zero, including update;
//                      plugin and other browser sites are per-file ratchets. See browser-fetch.mjs and the CLI tests.
//
// emptyCatchesInScripts An empty `catch` clause (no statement, no comment: `catch {}`, `catch (error) { }`, the shape the
//                       static check molis/no-empty-catch reports in real code) found in the text of string and template
//                       literals of the SOURCES. The host serves browser programs (the workbench, the plugin client scripts) as template literals; neither the
//                       TypeScript checker nor a linter looks inside them, and 137 of the 141 empty catches the survey
//                       found sit there. They are INCLUDED here, under their own counter so that moving a program out of a
//                       template literal into real TypeScript moves the count from one counter to the other. The shape is
//                       `catch`, optionally `( … )`, `{`, nothing but whitespace, `}`.
// scriptConstants       A browser program kept as text in a constant (spec §3 R-07, roadmap W4-04): a variable whose name ends
//                       in `_SCRIPT` and whose value is a string or template literal (also in parentheses, with `as const`,
//                       or a `+` of such pieces). These are the programs no type checker reads; moving one to TypeScript that
//                       a bundler builds (as Forms did, plugins/native/form/src/browser/) takes it off this count. A `_SCRIPT`
//                       value computed any other way (a function call, a file read) is not counted: it is no longer text here.
// oldNames              In sources: the old product name, `goalboard` as ONE word in any case (GoalBoard, goalboard-v1-demo,
//                       GOALBOARD_HOME), and the old id name for the project id: board_id, boardId, BoardId, BOARD_ID,
//                       plural too, as a whole name or the tail of a longer one (conflicting_board_id, existingBoardId,
//                       CONFLICTING_BOARD_ID) but not inside another word (dashboard_id, dashboardId, DASHBOARD_ID,
//                       KEYBOARD_IDS). Only these two spellings are counted. `goal-board` (the kanban view's
//                       `.goal-board-switch` class and CSS container name) is not the old name and is not counted.
//                       GOALS_BOARDS_SQL (the DDL of the per-project `boards` table) is not counted either, but not
//                       because it is the view: it is one of the other "Board as the project" names (getBoard,
//                       initializeBoard, ...) that docs/system/GLOSSARY.md R-A1 lists for renaming (roadmap W5-14 carries
//                       the renames); this rule neither sees nor guards them. Tests are out of scope: they name old names to assert that
//                       they are refused. Within a TypeScript source the count reads the plain text, so a comment or a string
//                       counts like code. Not seen, so a return would not be caught (a known limit, not a decision): the kebab
//                       spelling `board-id` (the CLI flag before #287) and every file that is not one of the sources above
//                       (JSON examples, shell and Rust files). Closing it needs a rule per file type, not a regex.
//                       What the baseline keeps today (tooling/gates/baseline.json, oldNames): the key-derivation
//                       salt `goalboard-feed-secretstore-v1` in packages/storage/src/adapters/file-secret-store.ts (its code
//                       comment: changing the string would invalidate existing ciphertext). The two unused `_boardId` names that
//                       plugins/native/goals/src once had are gone (W5-14). That count stays in the baseline like any other; it can only fall.
import ts from "typescript";
import { browserFetchScan, browserFetchProblems } from "./browser-fetch.mjs";

const CATCH_SHAPE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const OLD_PRODUCT_NAME = /goalboard/gi;
const OLD_ID_NAME = /(?<![A-Za-z])(?:board_ids?|boardIds?)(?![a-z])|(?<![A-Z])BoardIds?(?![a-z])|(?<![A-Z])BOARD_IDS?(?![A-Z])/g;

const SCRIPT_NAME = /_SCRIPT$/;
const scriptText = (node) => {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return true;
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && scriptText(node.left) && scriptText(node.right);
};

const IS_STRING_LIKE = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

/** Counts one file. `text` is the whole file; `inSource` is false for tests. Exported for the tests of the definitions. */
export const countFile = (file, text, { inSource = false } = {}) => {
  const counts = { emptyCatchesInScripts: 0, oldNames: 0, scriptConstants: 0 };
  if (!inSource) return counts;
  counts.oldNames = (text.match(OLD_PRODUCT_NAME) ?? []).length + (text.match(OLD_ID_NAME) ?? []).length;
  // Parse only the files whose text can hold one of the shapes.
  const catches = /\bcatch\b/.test(text), scripts = text.includes("_SCRIPT");
  if (!catches && !scripts) return counts;
  const visit = (node) => {
    if (catches && IS_STRING_LIKE(node)) counts.emptyCatchesInScripts += (node.text.match(CATCH_SHAPE) ?? []).length;
    if (scripts && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && SCRIPT_NAME.test(node.name.text) && node.initializer && scriptText(node.initializer)) {
      counts.scriptConstants += 1;
    }
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
  result = { emptyCatchesInScripts: {}, oldNames: {}, scriptConstants: {} };
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
export const SOURCE_COUNT_RULES = [...[
  { id: "emptyCatchesInScripts", title: "Empty catch blocks (browser scripts in string and template literals)", summary: "empty catches in scripts", what: "empty catch blocks in a browser script",
    hint: "handle the error, or say in a comment inside the block why ignoring it is safe" },
  { id: "oldNames", title: "Old names (goalboard, board_id) in sources", summary: "old names", what: "uses of an old name (goalboard, board_id)",
    hint: "use Molis Work and project_id; a kept constant belongs in the baseline, not in new code" },
  { id: "scriptConstants", title: "Browser programs kept as text in *_SCRIPT constants", summary: "script text constants", what: "browser programs kept as text in a *_SCRIPT constant",
    hint: "write the program as TypeScript and bundle it (plugins/native/form/src/browser/ is the sample); a new one starts at 0" },
].map((rule) => ({ ...rule, measure: (snapshot, scope) => measureSnapshot(snapshot, scope)[rule.id] })),
  { id: "rawFetchInScripts", title: "Raw fetch calls in executable browser programs", summary: "raw browser fetch calls",
    what: "raw fetch calls in a browser program", hint: "use the public UiRequest; Workbench is zero and plugin counts may only fall",
    measure: (snapshot, { isSource }) => browserFetchScan(snapshot, isSource).counts, absolute: browserFetchProblems },
];
