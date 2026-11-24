// Per-file counts of direct ellipsis cuts, the old names and empty catches in browser programs (specs/archive/repository-anti-corruption §4.13 /
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
//                       KEYBOARD_IDS). Also retired PG-097 platform names (`MOLIS_JELLY_`, `resolveFeedSecurityDirectory`),
//                       CPK-08 deleted capability-pack symbols and `/skill-selection.(m)ts`, and WMD-13 retired Files plugin
//                       references (`io.molis.work.files` outside the S-75 reservation in `apps/local-host/src/host-plugin-ids.ts`,
//                       and any tracked file under `plugins/native/files/`). Beyond TypeScript sources, controlled non-TS
//                       files (`.rs`, `.swift`, `.sh`, `.yml`/`.yaml` except `pnpm-lock.yaml`, and `Makefile`, outside
//                       top-level `docs/`/`specs/` and any nested `tests?/`/`dist/`/`node_modules/`) are also scanned for
//                       `goalboard` and PG-097 retired names. `goal-board` (the kanban view's `.goal-board-switch` class and
//                       CSS container name)
//                       and `GOALS_BOARDS_SQL` are not counted. Tests are out of scope: they name old names to assert that
//                       they are refused. Within a guarded file the count reads the plain text, so a comment or a string
//                       counts like code. What the baseline keeps today (oldNames): nothing. The count is 0 and can only stay there.
// curveLiterals         POLISH-33 (specs/screen-polish, roadmap decision 61): a `cubic-bezier(` followed by a number, anywhere
//                       in the text of a SOURCE (code, a style in a template literal, a comment). The product's curves are
//                       written once, in the design system's baseline (`packages/design-system/resources/`, JSON, not scanned
//                       here) and reach a style as `var(--ease-…)` and a script as the computed value of that variable. The
//                       resolver that writes the function from the baseline's numbers (`cubic-bezier(${…})`) is not a literal.
//                       Tests are out of scope. Absolutely zero: a file with one fails whatever the merge-base holds.
// directEllipsisCuts    N16: a direct .slice(...) or ["slice"](...) followed by a literal … or ..., with optional
//                       whitespace before the marker. Count + and template substitutions. For +, unwrap parentheses
//                       and read a template's text before its first substitution. General slices, chained calls after
//                       slice, comments, text inside a string, and test fixtures do not count.
import ts from "typescript";
import { browserFetchScan, browserFetchProblems } from "./browser-fetch.mjs";
import { countPackedStatements, measurePackedStatements } from "./packed-statements.mjs";
export { countPackedStatements };

const CATCH_SHAPE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const OLD_PRODUCT_NAME = /goalboard/gi;
const OLD_ID_NAME = /(?<![A-Za-z])(?:board_ids?|boardIds?)(?![a-z])|(?<![A-Z])BoardIds?(?![a-z])|(?<![A-Z])BOARD_IDS?(?![A-Z])/g;
// PG-097: retired platform env/storage names that carried plugin names (formerly guarded by tests/platform-naming-pg097.test.ts).
const OLD_PLATFORM_NAME = /MOLIS_JELLY_|resolveFeedSecurityDirectory/g;
// CPK-08: deleted capability-pack symbols from specs/capability-pack/spec.md §8.
const CPK_08_DELETED = /\b(?:molis-coding-method|AgentSkillLibrary|UNREGISTERED_MODEL_CALLS|AgentRoleSkillsDeclaration|AgentSkillsCapability|agent\.skills\.(?:discover|install))\b/g;
const CPK_08_DELETED_FILE = /\/skill-selection\.m?ts$/;
// WMD-13: retired Files plugin identity (S-75 intentionally reserves it only in apps/local-host/src/host-plugin-ids.ts).
const WMD_13_DELETED_ID = /\bio\.molis\.work\.files\b/g;
const WMD_13_RESERVED_ID_FILES = new Set(["apps/local-host/src/host-plugin-ids.ts"]);
// POLISH-33: a timing curve written out with its numbers.
const CURVE_LITERAL = /cubic-bezier\(\s*[-+.\d]/gi;
const NON_TS_OLD_NAME_FILE = /^(?!docs\/|specs\/)(?!.*(?:^|\/)(?:tests?|dist|node_modules)\/)(?:.+\.(?:rs|swift|sh|ya?ml)|(?:.+\/)?Makefile)$/;

/** Controlled non-TS files and retired package paths scanned by `oldNames` (PG-097, GoalBoard, WMD-13). */
export const oldNamesWantsText = (file) =>
  file !== "pnpm-lock.yaml" && (NON_TS_OLD_NAME_FILE.test(file) || file.startsWith("plugins/native/files/"));

/** Counts retired names in a controlled non-TS file or retired package path. Exported for tests. */
export const countNonTsOldNames = (file, text) => {
  let count = 0;
  if (file.startsWith("plugins/native/files/")) {
    count += 1;
  }
  if (file !== "pnpm-lock.yaml" && NON_TS_OLD_NAME_FILE.test(file) && typeof text === "string") {
    count += (text.match(OLD_PRODUCT_NAME) ?? []).length;
    count += (text.match(OLD_PLATFORM_NAME) ?? []).length;
  }
  return count;
};

const SCRIPT_NAME = /_SCRIPT$/;
const ELLIPSIS_START = /^\s*(?:…|\.{3})/u;
const scriptText = (node) => {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return true;
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && scriptText(node.left) && scriptText(node.right);
};

const IS_STRING_LIKE = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);

function withoutParentheses(node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function directSlice(expression) {
  const node = withoutParentheses(expression);
  if (!ts.isCallExpression(node)) return false;
  const target = node.expression;
  if (ts.isPropertyAccessExpression(target)) return target.name.text === "slice";
  return ts.isElementAccessExpression(target)
    && ts.isStringLiteralLike(target.argumentExpression) && target.argumentExpression.text === "slice";
}

function startsWithEllipsis(expression) {
  const node = withoutParentheses(expression);
  if (ts.isTemplateExpression(node)) return ELLIPSIS_START.test(node.head.text);
  return ts.isStringLiteralLike(node) && ELLIPSIS_START.test(node.text);
}

/** Counts one file. `text` is the whole file; `inSource` is false for tests. Exported for the tests of the definitions. */
export const countFile = (file, text, { inSource = false } = {}) => {
  const counts = { emptyCatchesInScripts: 0, oldNames: 0, scriptConstants: 0, directEllipsisCuts: 0, curveLiterals: 0 };
  if (!inSource) {
    return counts;
  }
  counts.curveLiterals = (text.match(CURVE_LITERAL) ?? []).length;
  counts.oldNames =
    (text.match(OLD_PRODUCT_NAME) ?? []).length
    + (text.match(OLD_ID_NAME) ?? []).length
    + (text.match(OLD_PLATFORM_NAME) ?? []).length
    + (text.match(CPK_08_DELETED) ?? []).length
    + (WMD_13_RESERVED_ID_FILES.has(file) ? 0 : (text.match(WMD_13_DELETED_ID) ?? []).length)
    + (CPK_08_DELETED_FILE.test(file) ? 1 : 0)
    + (file.startsWith("plugins/native/files/") ? 1 : 0);
  // Parse only the files whose text can hold one of the shapes.
  const catches = /\bcatch\b/.test(text), scripts = text.includes("_SCRIPT"), slices = text.includes("slice");
  if (!catches && !scripts && !slices) return counts;
  const visit = (node) => {
    if (catches && IS_STRING_LIKE(node)) counts.emptyCatchesInScripts += (node.text.match(CATCH_SHAPE) ?? []).length;
    if (scripts && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && SCRIPT_NAME.test(node.name.text) && node.initializer && scriptText(node.initializer)) {
      counts.scriptConstants += 1;
    }
    if (slices && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
      && directSlice(node.left) && startsWithEllipsis(node.right)) {
      counts.directEllipsisCuts += 1;
    }
    if (slices && ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        if (directSlice(span.expression) && ELLIPSIS_START.test(span.literal.text)) counts.directEllipsisCuts += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  return counts;
};

// One pass over a snapshot serves the counters above; identical file text across head and merge-base parses once.
const passes = new WeakMap();
const fileCountCache = new Map();
const measureSnapshot = (snapshot, { isSource }) => {
  let result = passes.get(snapshot);
  if (result) return result;
  result = { emptyCatchesInScripts: {}, oldNames: {}, scriptConstants: {}, directEllipsisCuts: {}, curveLiterals: {} };
  for (const file of snapshot.files) {
    if (isSource(file)) {
      const text = snapshot.read(file);
      if (text === null) {
        continue;
      }
      const cached = fileCountCache.get(file);
      const counts = cached && cached.text === text ? cached.counts : countFile(file, text, { inSource: true });
      if (!cached || cached.text !== text) {
        fileCountCache.set(file, { text, counts });
      }
      for (const [rule, count] of Object.entries(counts)) {
        if (count) {
          result[rule][file] = count;
        }
      }
    } else if (oldNamesWantsText(file)) {
      const text = snapshot.read(file);
      const count = countNonTsOldNames(file, text);
      if (count) {
        result.oldNames[file] = count;
      }
    }
  }
  passes.set(snapshot, result);
  return result;
};

// G1 (specs/plugin-specials-demotion/spec.md §5.1, 44B): the platform names no plugin. In the platform's sources (apps, packages,
// horizontal, modules, server; the two generated plugin registries are not counted) each of these counts one: a plugin id as
// `io.molis.work.<id>`, a plugin package `@molis-ai/molis-work-plugin-<id>`, a short id as a whole quoted string, a `.<id>-…` class
// and a `data-<id>-…` attribute; a file named after a plugin (`<id>-….ts`, `<id>.ts`) counts one more. An official integration counts
// by its package `@molis-ai/molis-work-integration-<id>` and `io.molis.work.<id>` (its short ids, such as `catalog`, are platform words
// too). The ids are read from the plugin directories of the same snapshot (plugins/native, plugins/content and
// plugins/official-integrations), never written here.
const PLATFORM_SOURCE = /^(?:apps|packages|horizontal|modules|server)\//;
const GENERATED_PLUGIN_REGISTRIES = new Set(["apps/local-host/src/plugin-registry.generated.ts", "apps/workbench/src/builtin-plugins.ts"]);
const PLUGIN_PACKAGE_FILE = /^plugins\/(native|official-integrations|content)\/([a-z0-9-]+)\/package\.json$/;

/** The plugin and integration ids of a snapshot: the directory names of its packages. Exported for tests. */
export const pluginIdsOf = (files) => {
  const found = files.map((file) => PLUGIN_PACKAGE_FILE.exec(file)).filter(Boolean);
  const of = (integration) => [...new Set(found.filter((match) => (match[1] === "official-integrations") === integration).map((match) => match[2]))].sort();
  return { plugins: of(false), integrations: of(true) };
};

const namePatterns = new Map();
/** Counts the plugin names one platform source carries (G1). Exported for tests. */
export const countPlatformPluginNames = (file, text, { plugins, integrations }) => {
  if (!PLATFORM_SOURCE.test(file) || GENERATED_PLUGIN_REGISTRIES.has(file) || !plugins.length || typeof text !== "string") return 0;
  const either = (ids) => ids.map((id) => id.replace(/[-.]/g, "\\$&")).join("|");
  const key = `${plugins.join(",")};${integrations.join(",")}`, alternatives = either(plugins), all = either([...plugins, ...integrations]);
  let patterns = namePatterns.get(key);
  if (!patterns) {
    patterns = [
      new RegExp(`\\bio\\.molis\\.work\\.(?:${all})(?![a-z0-9-])`, "g"),
      new RegExp(`@molis-ai/molis-work-plugin-(?:${alternatives})(?![a-z0-9-])`, "g"),
      ...(integrations.length ? [new RegExp(`@molis-ai/molis-work-integration-(?:${either(integrations)})(?![a-z0-9-])`, "g")] : []),
      new RegExp(`(["'\`])(?:${alternatives})\\1`, "g"),
      new RegExp(`(?<![\\w.-])\\.(?:${alternatives})-[a-z]`, "g"),
      new RegExp(`\\bdata-(?:${alternatives})-[a-z]`, "g"),
    ];
    namePatterns.set(key, patterns);
  }
  const base = file.slice(file.lastIndexOf("/") + 1);
  return patterns.reduce((count, pattern) => count + (text.match(pattern) ?? []).length, 0)
    + (plugins.some((id) => base.startsWith(`${id}-`) || base.startsWith(`${id}.`)) ? 1 : 0);
};

const platformNamePasses = new WeakMap();
const measurePlatformPluginNames = (snapshot, { isSource }) => {
  let result = platformNamePasses.get(snapshot);
  if (result) return result;
  result = {};
  const ids = pluginIdsOf(snapshot.files);
  for (const file of snapshot.files) {
    if (!isSource(file) || !PLATFORM_SOURCE.test(file)) continue;
    const count = countPlatformPluginNames(file, snapshot.read(file), ids);
    if (count) result[file] = count;
  }
  platformNamePasses.set(snapshot, result);
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
  { id: "directEllipsisCuts", title: "Direct slice followed by an ellipsis in sources", summary: "direct ellipsis cuts",
    what: "direct ellipsis cuts", hint: "use cutWithEllipsis from @molis-ai/molis-work-plugin-sdk/whole-units" },
  { id: "curveLiterals", title: "Timing curves written out with their numbers in sources", summary: "curve literals",
    what: "cubic-bezier literals", hint: "use var(--ease-quint), var(--ease-spring) or var(--ease-reveal); a script reads the variable's computed value",
    absolute: (counts) => Object.entries(counts).map(([file, count]) => `curveLiterals: ${file} writes ${count} cubic-bezier literal${count === 1 ? "" : "s"}; the curves are written only in packages/design-system/resources/ — use var(--ease-quint), var(--ease-spring) or var(--ease-reveal), and in a script read the variable's computed value`) },
].map((rule) => ({ ...rule, measure: (snapshot, scope) => measureSnapshot(snapshot, scope)[rule.id] })),
  { id: "rawFetchInScripts", title: "Raw fetch calls in executable browser programs", summary: "raw browser fetch calls",
    what: "raw fetch calls in a browser program", hint: "use the public UiRequest; Workbench is zero and plugin counts may only fall",
    measure: (snapshot, { isSource }) => browserFetchScan(snapshot, isSource).counts, absolute: browserFetchProblems },
  { id: "packedStatements", title: "Multiple sibling statements packed onto one line in sources", summary: "packed statements",
    what: "multiple sibling statements on one line", hint: "put each statement on its own line instead of packing statements onto a single line",
    measure: (snapshot, scope) => measurePackedStatements(snapshot, scope) },
  { id: "platformPluginNames", title: "Plugin names in platform sources (G1)", summary: "plugin names in the platform",
    what: "plugin names in a platform source", hint: "make it a public declaration any plugin can make (specs/plugin-specials-demotion §5), or move it into the plugin",
    measure: (snapshot, scope) => measurePlatformPluginNames(snapshot, scope) },
];
