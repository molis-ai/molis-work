// Which tests a change touches, and whether it is big enough that the related tests are not the end of it. It takes the change
// set, the test index and the workspace packages, reads the READMEs and the changed files, runs nothing, and returns data
// (scripts/affected-tests.mjs prints it).
//
// The rule it encodes (user, 2026-10-03; docs/system/PARALLEL-DEVELOPMENT.md section 6):
//   a package's source        its README's "改动后必跑", plus the tests that read or call it (`git grep -l <name> tests`)
//   a file with `L()` text    plus tests/i18n.test.ts
//   a route                   plus the tests that read that route (the routes a changed line names, and in a route file the route
//                             a changed hunk is inside), unless more than the symbol limit read it
//   the UI                    plus the browser tests (the README's "界面改动加跑"), run in a serial slot
//   shared core, the assembly of the host or the shell, storage or migration, three or more packages, deleting a block of old code
//                             the full suite is recommended (`node scripts/run-tests.mjs`, about 77 minutes)
// "Reads or calls it" is read from the tests, tier by tier, narrowest first; each selected test carries the reasons.
import { devRequirementsSection } from "../package-dev-requirements.mjs";
import {
  CHINESE_LITERAL, COMMON_SYMBOLS, DICTIONARY_FILE, FULL_REGRESSION, GENERIC_STEMS, I18N_TEST, LIMITS, PRODUCT_SOURCE,
  ROUTE_FILE, TRANSLATOR_CALL, UI,
} from "./rules.mjs";
import { packageOf, readText } from "./repository.mjs";
import { TEST_FILE } from "./index.mjs";
import { holdsSchema, schemaChanged } from "./storage.mjs";

const TEST_PATH = /tests\/[^\s`，、；）)（(]+\.test\.(?:ts|mjs)/g;
/** The labelled lines of a 开发要求 section that are not lists of tests. */
const PLAIN_LABELS = ["负责", "不负责", "公开入口", "依赖", "不变量", "相关手册"];
/** A test that reads the changed file itself, as opposed to the package around it. */
const DIRECT = new Set(["reads-file", "named-for-file", "uses-name", "route"]);
const SOURCE_FILE = /\.(?:ts|mts|tsx|js|mjs|cjs)$/;
const isDocument = (file) => /\.md$/.test(file) || /^(?:docs|specs)\//.test(file);
const isTestSide = (file) => file.startsWith("tests/");
const PRODUCT_AREA = /^(?:apps|horizontal|modules|packages|plugins|server|tooling)\//;
const isComment = (line) => /^\s*(?:\/\/|\/?\*)/.test(line);
/** The changed lines that are code: a route or a Chinese sentence in a comment is not shown to anyone. */
const codeLines = (change) => [...change.added, ...change.removed].filter((line) => !isComment(line));
export const sample = (items, count = 4) => (items.length > count ? `${items.slice(0, count).join(", ")} and ${items.length - count} more` : items.join(", "));

/** The names a source file exports (declarations and `export { … }` lists); what a test would import from it. */
export function exportedNames(text) {
  const names = new Set();
  for (const match of text.matchAll(/^[ \t]*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|abstract\s+class|const|let|var|enum|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of text.matchAll(/\bexport\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** `/api/projects/${id}/brief` and `/api/projects/:id/brief` both become ["/api/projects/", "/brief"]: the fixed pieces of a route. */
export function routeChunks(route) {
  const chunks = route.split(/[?#]/)[0].split(/\$\{[^}]*\}|:[A-Za-z_]\w*|\([^)]*\)|\[[^\]]*\]|\\.|[*+?|^$]/).map((chunk) => chunk.trim()).filter((chunk) => chunk.replace(/\//g, "").length >= 2);
  return chunks.some((chunk) => chunk.length >= 6) ? chunks : [];
}

/** The routes one line names: any "/api/…" or "/__…", and in files that serve routes any literal "/x/y". */
function routesOfLine(line, routeFile) {
  const text = line.replace(/\\\//g, "/");
  const candidates = [...text.matchAll(/\/(?:api|__[a-z]+)(?:\/[^\s"'`),;]*)?/g)].map((match) => match[0]);
  if (routeFile) candidates.push(...[...text.matchAll(/["'`](\/[a-z][\w-]*(?:\/[^"'`\s]*)?)["'`]/g)].map((match) => match[1]));
  return candidates.map((route) => ({ route, chunks: routeChunks(route) })).filter((item) => item.chunks.length);
}

const indentOf = (line) => /^\s*/.exec(line)[0].length;

/**
 * Routes named in the changed lines, and in a route file the route each changed place is inside: editing the body of a handler
 * changes what its route does, though the line that names the route is not among the changed ones. That route is on the nearest
 * enclosing line above the hunk (`change.hunks`, new file coordinates; `text` is the file as it is now): the nearest line above that
 * is indented less than the changed lines and names a route, within `LIMITS.routeScanLines` lines. A path in the response or in a
 * sibling line is at the same indentation and does not count; a helper at the top level of the file is inside no route. A deletion
 * is inside the block of the line before it.
 */
export function routesIn(change, text = "") {
  const found = new Map();
  if (!PRODUCT_AREA.test(change.path)) return [];
  const routeFile = ROUTE_FILE.test(change.path);
  const take = (hits) => { for (const item of hits) found.set(item.chunks.join("\u0000"), item); };
  for (const line of codeLines(change)) take(routesOfLine(line, routeFile));
  if (routeFile && text && change.hunks?.length) {
    const lines = text.split("\n");
    for (const hunk of change.hunks) {
      if (hunk.count === 0 && hunk.start === 0) continue;   // taken out above the first line
      const first = Math.min(Math.max(hunk.start, 1), lines.length), deletion = hunk.count === 0;
      // A deletion sits after line `first`, which can be the line that names the route (the first line of its body was deleted).
      let ceiling = deletion ? indentOf(lines[first - 1]) + 1 : Math.min(...lines.slice(first - 1, first - 1 + hunk.count).filter((line) => line.trim() !== "").map(indentOf));
      for (let number = deletion ? first : first - 1; number >= Math.max(1, first - LIMITS.routeScanLines); number--) {
        const line = lines[number - 1];
        if (line.trim() === "" || isComment(line) || indentOf(line) >= ceiling) continue;
        ceiling = indentOf(line);
        const hits = routesOfLine(line, routeFile);
        if (hits.length) { take(hits); break; }
      }
    }
  }
  return [...found.values()];
}

/** The tests a package README lists: the unconditional "改动后必跑", the unconditional "界面改动加跑", and the scoped extras. */
export function readmeTests(root, item) {
  const result = { mustRun: [], ui: [], extras: [] };
  const section = item?.readme ? devRequirementsSection(readText(root, item.readme)) : undefined;
  if (!section) return result;
  for (const line of section.split("\n")) {
    const label = /^- ([^：\n]+)：/.exec(line)?.[1];
    if (!label || PLAIN_LABELS.includes(label)) continue;
    // "改到分栏窗格再加跑 tests/x": what follows 再加跑 is for that area only.
    const [first, ...conditional] = line.split(/再加跑|再跑/);
    const unconditional = first.match(TEST_PATH) ?? [];
    if (label === "改动后必跑") result.mustRun.push(...unconditional);
    else if (label.startsWith("界面改动加跑")) result.ui.push(...unconditional);
    else if (unconditional.length) result.extras.push({ label, tests: unconditional });
    for (const part of conditional) {
      const tests = part.match(TEST_PATH) ?? [];
      if (tests.length) result.extras.push({ label: `${label}（条件）`, tests });
    }
  }
  return result;
}

const isUi = (change, item) => !isDocument(change.path) && !isTestSide(change.path)
  && ((item && UI.packages.includes(item.dir)) || UI.files.test(change.path) || (PRODUCT_AREA.test(change.path) && codeLines(change).some((line) => UI.lines.test(line))));
const showsText = (change) => PRODUCT_SOURCE.test(change.path)
  && (DICTIONARY_FILE.test(change.path) || codeLines(change).some((line) => TRANSLATOR_CALL.test(line) || CHINESE_LITERAL.test(line)));
const isProductCode = (change) => PRODUCT_SOURCE.test(change.path) && !/(?:^|\/)tests?\/|\.test\.(?:ts|mts)$/.test(change.path);
/**
 * A change to stored data: the storage package, a file named for a migration, a changed line that calls or versions a baseline, or
 * a source file whose schema is another one than at the base (storage.mjs). With no base to compare (named files) a file that holds a
 * schema counts as changed in full.
 */
const touchesStorage = (root, change, item) => {
  if (item && FULL_REGRESSION.storagePackages.includes(item.dir)) return true;
  if (!isProductCode(change)) return false;
  if (FULL_REGRESSION.storageFiles.test(change.path) || codeLines(change).some((line) => FULL_REGRESSION.storageLines.test(line))) return true;
  const now = readText(root, change.path);   // "" for a deleted file
  if (typeof change.before === "string") return schemaChanged(change.before, now);
  return change.added.length > 0 && holdsSchema(now);
};
const codeLineCount = (lines) => lines.filter((line) => line.trim() !== "" && !isComment(line)).length;

/**
 * @param {object} input
 * @param {string} input.root
 * @param {Array} input.changes       readChanges / namedChanges
 * @param {Array} input.packages      discoverPackages
 * @param {object} input.index        buildTestIndex
 * @param {object} [input.options]    wide, packageLimit, symbolLimit, readmeExtras, full
 */
export function selectAffected({ root, changes, packages, index, options = {} }) {
  const packageLimit = options.packageLimit ?? LIMITS.packageTests, symbolLimit = options.symbolLimit ?? LIMITS.symbolTests;
  const selected = new Map();        // test file -> { file, kind, marks, reasons }
  const direct = new Map();          // changed code file -> test files that read it itself (not only the package around it)
  const notes = [];
  const note = (text) => { if (!notes.includes(text)) notes.push(text); };

  const add = (file, code, detail, source) => {
    const test = index.byFile.get(file);
    if (!test) return false;
    if (!selected.has(file)) selected.set(file, { file, kind: test.kind, marks: test.marks, reasons: [] });
    const { reasons } = selected.get(file);
    if (!reasons.some((reason) => reason.code === code && reason.detail === detail)) reasons.push({ code, detail });
    if (source && DIRECT.has(code) && direct.has(source)) direct.get(source).add(file);
    return true;
  };

  const codeChanges = changes.filter((change) => !isDocument(change.path) && !isTestSide(change.path));
  for (const change of codeChanges) direct.set(change.path, new Set());
  const nameStem = (file) => file.split("/").pop().replace(/\.(?:test|e2e)\b.*$|\.[^.]+$/, "");

  // Tests named for a thing: `tests/todo-actions.test.ts` for `todo` and `actions`, `tests/todo.e2e.test.ts` for `todo`.
  const testsNamed = (stem) => index.tests.filter((test) => {
    const base = nameStem(test.file);
    return base === stem || base.startsWith(`${stem}-`) || base.startsWith(`${stem}.`);
  });

  // ---- tier 1: the test itself, and what reads the changed file ------------------------------------------------------------
  // A test whose own file names the path reads it. A test that gets it from a helper reads it only as far as the helper is
  // about it: when dozens of tests share a fixture that happens to import the file, they start the whole host, not this file.
  const throughHelpers = (readers, label) => {
    const shared = [...readers].filter(([, match]) => match.via);
    const helpers = [...new Set(shared.map(([, match]) => match.via))];
    const keep = options.wide || shared.length <= symbolLimit;
    if (!keep) note(`${label}: ${shared.length} tests reach it only through shared helpers (${sample(helpers, 3)}); not selected, --wide selects them`);
    return keep;
  };
  for (const change of changes) {
    if (TEST_FILE.test(change.path) && change.status !== "D") add(change.path, "changed", "the test file itself", change.path);
    for (const target of [change.path, change.from].filter(Boolean)) {
      const readers = index.referencing(target);
      const helperKept = isTestSide(change.path) || throughHelpers(readers, target);
      for (const [test, match] of readers) {
        if (test === change.path || (match.via && !helperKept)) continue;
        const code = isTestSide(change.path) ? "uses-changed-helper" : match.ref === target ? "reads-file" : "reads-folder";
        add(test, code, match.ref === target ? target : `${target} (the test names the folder ${match.ref})`, change.path);
      }
    }
  }

  // ---- per package: README, files, names ------------------------------------------------------------------------------------
  const changedPackages = new Map();   // package -> its code changes
  for (const change of codeChanges) {
    const item = packageOf(packages, change.path) ?? (change.from ? packageOf(packages, change.from) : null);
    if (item) changedPackages.set(item, [...(changedPackages.get(item) ?? []), change]);
  }

  for (const [item, own] of changedPackages) {
    const readme = readmeTests(root, item);
    const ui = own.some((change) => isUi(change, item));
    for (const file of readme.mustRun) for (const change of own) add(file, "readme", `${item.dir} 改动后必跑`, change.path);
    if (ui) for (const file of readme.ui) for (const change of own) add(file, "readme-ui", `${item.dir} 界面改动加跑`, change.path);
    for (const extra of readme.extras) {
      if (options.readmeExtras) for (const file of extra.tests) for (const change of own) add(file, "readme-extra", `${item.dir} ${extra.label}`, change.path);
      else note(`${item.dir} README ${extra.label}: ${sample(extra.tests, 6)} (not selected; run them when your change is in that area, or pass --readme-extras)`);
    }

    // The package as a whole: tests that import it or are named for it, unless it is imported so widely that this says nothing.
    const whole = new Set([...index.importing(item.name), ...testsNamed(item.dir.split("/").pop()).map((test) => test.file)]);
    if (options.wide || whole.size <= packageLimit) {
      for (const file of whole) for (const change of own) add(file, "package", item.dir, change.path);
    } else {
      note(`${item.dir}: ${whole.size} tests import it or are named for it, so only the ones that read the changed files or names are selected (--wide selects all ${whole.size})`);
      if (ui) for (const test of testsNamed(item.dir.split("/").pop())) if (test.kind === "browser") for (const change of own) add(test.file, "package-ui", `${item.dir} browser test of the same name`, change.path);
    }
  }

  const touchingCache = new Map();
  const packageTests = (item) => {
    if (!touchingCache.has(item)) touchingCache.set(item, new Set([...index.importing(item.name), ...index.underFolder(item.dir)]));
    return touchingCache.get(item);
  };

  // ---- tier 2: tests named for the file, tests that mention what it exports ---------------------------------------------------
  const tooCommon = new Map();
  for (const change of codeChanges) {
    const item = packageOf(packages, change.path);
    const stem = nameStem(change.path);
    const stems = [...(GENERIC_STEMS.has(stem) ? [] : [stem]), ...(item ? [`${item.dir.split("/").pop()}-${stem}`] : [])].filter((value) => value.length >= LIMITS.symbolLength);
    for (const value of stems) {
      const named = testsNamed(value);
      if (named.length <= symbolLimit) for (const test of named) add(test.file, "named-for-file", value, change.path);
    }

    // The names the file exports, among the tests that touch its package at all: `readText` in a test of another package is another readText.
    if (!SOURCE_FILE.test(change.path) || !item) continue;
    const touching = packageTests(item);
    const text = `${change.status === "D" ? "" : readText(root, change.path)}\n${change.removed.join("\n")}`;
    for (const name of exportedNames(text)) {
      if (name.length < LIMITS.symbolLength || COMMON_SYMBOLS.has(name.toLowerCase())) continue;
      const found = [...index.mentioning(name)].filter(([test]) => touching.has(test));
      const own = found.filter(([, via]) => !via).length, shared = found.length - own;
      if (own > symbolLimit) { tooCommon.set(change.path, [...(tooCommon.get(change.path) ?? []), `${name} (${own})`]); continue; }
      for (const [test, via] of found) if (!via || options.wide || shared <= symbolLimit) add(test, "uses-name", name, change.path);
    }
  }

  // ---- rules about what the change does ---------------------------------------------------------------------------------------
  for (const change of codeChanges) {
    if (showsText(change)) add(I18N_TEST, "text", `${change.path} has text people read`, change.path);
    // A route read by more tests than the symbol limit is a common piece of a path (`/projects/`, `/health`), not a route they read.
    const crowded = [];
    for (const { route, chunks } of routesIn(change, change.status === "D" ? "" : readText(root, change.path))) {
      const readers = [...index.containingAll(chunks)];
      if (!options.wide && readers.length > symbolLimit) { crowded.push(`${route} (${readers.length})`); continue; }
      for (const test of readers) add(test, "route", route, change.path);
    }
    if (crowded.length) note(`${change.path}: routes mentioned by more than ${symbolLimit} tests are too common to tell their readers apart, not selected (${sample(crowded, 3)}); --wide selects them`);
  }

  // ---- things the diff cannot say are covered ---------------------------------------------------------------------------------
  const uncovered = [...direct].filter(([file, tests]) => SOURCE_FILE.test(file) && tests.size === 0 && changes.find((change) => change.path === file)?.status !== "D").map(([file]) => file);
  for (const [file, names] of tooCommon) if (direct.get(file)?.size === 0) note(`${file}: the names it exports are mentioned by too many tests to tell readers apart (${sample(names, 3)})`);

  // ---- when the related tests are not enough ----------------------------------------------------------------------------------
  const full = [];
  const group = (rule, label, files) => { if (files.length) full.push({ rule, detail: `${label}: ${sample(files)}` }); };
  group("shared-core", "shared core (contracts, kernel, modules)", codeChanges.filter((change) => {
    const item = packageOf(packages, change.path);
    return item && (FULL_REGRESSION.corePackages.includes(item.dir) || FULL_REGRESSION.corePackagePrefixes.some((prefix) => item.dir.startsWith(prefix)));
  }).map((change) => change.path));
  group("assembly", "assembly of the host or the workbench shell", codeChanges.filter((change) => FULL_REGRESSION.assemblyFiles.includes(change.path)).map((change) => change.path));
  const storage = codeChanges.filter((change) => touchesStorage(root, change, packageOf(packages, change.path))).map((change) => change.path);
  group("storage", "storage or migration", storage);
  if (changedPackages.size >= FULL_REGRESSION.packageSpan) full.push({ rule: "spans-packages", detail: `${changedPackages.size} packages changed (${FULL_REGRESSION.packageSpan} or more): ${sample([...changedPackages.keys()].map((item) => item.dir))}` });
  const deleted = codeChanges.filter((change) => change.status === "D" && SOURCE_FILE.test(change.path) && packageOf(packages, change.path));
  // Code lines taken out of one file and not put back in it; a deleted file counts with all its lines.
  const shrunk = codeChanges.filter((change) => isProductCode(change)).map((change) => ({ path: change.path, lines: codeLineCount(change.removed) - codeLineCount(change.added) })).filter((entry) => entry.lines > 0);
  const takenOut = shrunk.reduce((total, entry) => total + entry.lines, 0);
  const blocks = [];
  if (deleted.length >= FULL_REGRESSION.deletedSourceFiles) blocks.push(`${deleted.length} source files deleted (${FULL_REGRESSION.deletedSourceFiles} or more): ${sample(deleted.map((change) => change.path))}`);
  if (takenOut >= FULL_REGRESSION.deletedCodeLines) blocks.push(`${takenOut} code lines taken out of ${shrunk.length} file${shrunk.length === 1 ? "" : "s"} (${FULL_REGRESSION.deletedCodeLines} or more): ${sample(shrunk.sort((left, right) => right.lines - left.lines).map((entry) => `${entry.path} -${entry.lines}`), 3)}`);
  // A move made with a plain `mv` reads as a deletion plus new untracked files until git knows both paths; say so when that could be the case.
  const unstaged = codeChanges.filter((change) => change.untracked && change.status === "A" && SOURCE_FILE.test(change.path) && packageOf(packages, change.path));
  if (blocks.length && unstaged.length) blocks.push(`${unstaged.length} new source file${unstaged.length === 1 ? " is" : "s are"} untracked (${sample(unstaged.map((change) => change.path), 2)}): if these were moved with a plain mv, git cannot tell a move from a deletion until it is staged; run git add -A and ask again`);
  if (blocks.length) full.push({ rule: "deletes-code", detail: blocks.join("; ") });
  if (options.full) full.push({ rule: "requested", detail: "asked for with --full (end of a phase, or related tests failed unexpectedly after a merge)" });

  const uiFiles = codeChanges.filter((change) => isUi(change, packageOf(packages, change.path))).map((change) => change.path);
  const order = (left, right) => left.file.localeCompare(right.file);
  return {
    tests: [...selected.values()].sort(order),
    full,
    ui: uiFiles,
    storage,
    uncovered,
    notes,
    packages: [...changedPackages.keys()].map((item) => item.dir),
  };
}
