// Gate: the security invariants document names tests that exist (specs/archive/repository-anti-corruption §4.18, W2-19).
//
// docs/system/security-invariants/ holds one row per invariant (`| S-01 | … |`), with the code that holds it and the
// tests that assert its refusal. A table of promises is only worth what is behind it, so this reads the table and checks that
//   - stable numeric or semantic IDs are unique and match their independent filename;
//   - every row names at least one test, and every test file it names exists;
//   - each test file reference in either column has a non-blank title fragment (`tests/x.test.ts`「first」「second」…);
//   - every title fragment occurs in its named file, so a renamed or deleted test cannot leave the row pointing at nothing;
//   - the tests in the CI column are run by CI: the file is named (or matched by a glob) in the root package.json scripts
//     `test:security` or `test:contracts`, or in .github/workflows/ci.yml, or it is an entry of the product subset that Verify runs
//     (tests/ci-product-subset.txt, read the way its runner reads it) and is not in tests/quarantine.json; a subset plan with a problem
//     of its own counts for nothing here;
//   - every tests/security-invariants-*.test.ts or .e2e.test.ts file is named by some row, so a new invariant test cannot sit outside
//     the table, and a tree with such a test and no document is the document having been deleted;
//   - every `.ts` file the code column names in backticks (`path.ts` or `path.ts:12`; the line is not checked) is a tracked file,
//     written in full from the repository root: a short name, a path out of the root or a file of the same name elsewhere is reported
//     with the record, line and text. Upstream sources are Markdown links, and history is said in words, not as a code path.
// Not read: whether a named test asserts anything about its row. That is review; the tests themselves are mutation-verified
// (tests/security-invariants-doc.test.ts) and each states the refusal it checks.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isMainScript } from "../script-paths.mjs";
import { LIST_FILE, QUARANTINE_FILE, parseList, parseQuarantine } from "../ci-product-subset/plan.mjs";
export const SECURITY_RECORDS = "docs/system/security-invariants/";
export const SECURITY_DOC = "docs/system/SECURITY-INVARIANTS.md";
const ROW = /^\|\s*(S-(?:\d+|[a-z][a-z0-9-]*))\s*\|/;
// A file in backticks, then the whole run of 「…」 title fragments that follows it (none, one or several).
const TEST_REFERENCE = /`(tests\/[^`\s]+\.test\.(?:ts|mjs))`([\s\S]*?)(?=`tests\/[^`\s]+\.test\.(?:ts|mjs)`|$)/g;
const EXPECTED_COLUMNS = 5;
const CODE_COLUMN = 2;
const CI_COLUMN = 3;
const LOCAL_COLUMN = 4;

/** A test of the security table's own: its tests named `security-invariants-<slug>`, in the plain or the browser form. */
const SECURITY_TEST = /^tests\/security-invariants-[a-z0-9-]+(?:\.e2e)?\.test\.ts$/;
/** A `.ts` path in backticks, with an optional line or range; what has a space in it is a phrase, not a path. */
const CODE_PATH = /`([^`\s]+\.ts)(?::\d+(?:[-–]\d+)?)?`/g;
const DARWIN_HEADER = /^\/\/ @requires-platform darwin\r?$/u;
const DARWIN_MENTION = /\b(?:darwin|mac|macOnly|darwinOnly)\b/;
const DARWIN_SKIP_TEXT = /process\.platform\s*!==?\s*["']darwin["']|platform\(\)\s*!==?\s*["']darwin["']/;

/** Cached per-file darwin-skip analysis so repeated mutation calls in self-tests stay O(1). */
const darwinAnalysisCache = new Map();

function analyzeDarwinSkips(file, source) {
  const cached = darwinAnalysisCache.get(file);
  if (cached && cached.source === source) return cached.analysis;
  const firstLine = source.split("\n", 1)[0] ?? "";
  const hasHeader = DARWIN_HEADER.test(firstLine);
  if (!hasHeader && !DARWIN_MENTION.test(source)) {
    const analysis = { allDarwin: false, tests: [] };
    darwinAnalysisCache.set(file, { source, analysis });
    return analysis;
  }
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const darwinOpts = new Set();
  const isDarwinSkipExpr = (node) => DARWIN_SKIP_TEXT.test(node.getText(sf));
  const visitDecl = (node) => {
    if (ts.isImportSpecifier(node)) {
      const imported = (node.propertyName ?? node.name).text;
      const local = node.name.text;
      const mod = node.parent?.parent?.parent?.moduleSpecifier?.text ?? "";
      if ((imported === "mac" || imported === "macOnly" || imported === "darwinOnly") && mod.includes("fixtures/")) {
        darwinOpts.add(local);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isDarwinSkipExpr(node.initializer)) {
      darwinOpts.add(node.name.text);
    }
    ts.forEachChild(node, visitDecl);
  };
  visitDecl(sf);
  const tests = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isTest = (ts.isIdentifier(callee) && callee.text === "test")
        || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "test" && callee.name.text === "only");
      if (isTest && node.arguments.length >= 2) {
        const titleArg = node.arguments[0];
        let title = "";
        if (ts.isStringLiteral(titleArg) || ts.isNoSubstitutionTemplateLiteral(titleArg)) title = titleArg.text;
        else if (ts.isTemplateExpression(titleArg)) title = titleArg.head.text + titleArg.templateSpans.map((span) => `\${...}${span.literal.text}`).join("");
        let darwinSkipped = hasHeader;
        if (!darwinSkipped && node.arguments.length >= 3) {
          const opt = node.arguments[1];
          if (ts.isIdentifier(opt) && darwinOpts.has(opt.text)) darwinSkipped = true;
          else if (isDarwinSkipExpr(opt)) darwinSkipped = true;
          else if (ts.isObjectLiteralExpression(opt)) {
            for (const prop of opt.properties) {
              if (ts.isSpreadAssignment(prop) && ts.isIdentifier(prop.expression) && darwinOpts.has(prop.expression.text)) darwinSkipped = true;
              if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === "skip") {
                if (isDarwinSkipExpr(prop.initializer) || (ts.isIdentifier(prop.initializer) && darwinOpts.has(prop.initializer.text))) darwinSkipped = true;
              }
            }
          }
        }
        tests.push({ title, raw: titleArg.getText(sf), darwinSkipped });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const allDarwin = hasHeader || (tests.length > 0 && tests.every((entry) => entry.darwinSkipped));
  const analysis = { allDarwin, tests };
  darwinAnalysisCache.set(file, { source, analysis });
  return analysis;
}

function isFragmentDarwinOnly(analysis, fragment) {
  if (analysis.allDarwin) return true;
  const matched = analysis.tests.filter((entry) => entry.title.includes(fragment) || entry.raw.includes(fragment));
  return matched.length > 0 && matched.every((entry) => entry.darwinSkipped);
}

/** Test file tokens actually executed by blocking `runs-on: macos-*` jobs in `.github/workflows/ci.yml`. */
function extractMacosCiTokens(ciYml, packageScripts) {
  const jobsStart = ciYml.indexOf("\njobs:\n");
  if (jobsStart === -1) return [];
  const body = ciYml.slice(jobsStart + 1);
  const headers = [...body.matchAll(/^  ([a-z0-9-]+):\s*$/gm)];
  const blocks = new Map();
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length;
    blocks.set(headers[i][1], body.slice(start, end));
  }
  const verifyBlock = blocks.get("verify") ?? "";
  const verifyNeedsMatch = /^    needs:\s*\[([^\]]+)\]/m.exec(verifyBlock);
  const verifyNeeds = new Set((verifyNeedsMatch?.[1] ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  const tokens = [];
  for (const [name, block] of blocks) {
    if (!verifyNeeds.has(name)) continue;
    if (!/^    runs-on:\s*macos/m.test(block)) continue;
    if (/^    continue-on-error:\s*true\b/m.test(block)) continue;
    tokens.push(...testTokens(block));
    for (const match of block.matchAll(/\bpnpm(?:\s+run)?\s+([A-Za-z0-9:_-]+)/g)) {
      const scriptName = match[1];
      if (Object.hasOwn(packageScripts, scriptName)) tokens.push(...testTokens(String(packageScripts[scriptName] ?? "")));
    }
  }
  return tokens;
}

/** The product subset files whose result Verify counts: listed and not quarantined, from a plan that is itself in order. */
function productSubsetFiles(snapshot) {
  const list = snapshot.read(LIST_FILE), quarantine = snapshot.read(QUARANTINE_FILE);
  if (list === null || quarantine === null) return new Set();
  const plan = parseList(list), held = parseQuarantine(quarantine);
  if (plan.problems.length || held.problems.length) return new Set();
  const quarantined = new Set(held.entries.map(entry => entry.file));
  return new Set(plan.entries.map(entry => entry.file).filter(file => !quarantined.has(file)));
}

function references(cell) {
  return [...cell.matchAll(TEST_REFERENCE)].map((match) => ({ file: match[1], fragments: [...match[2].matchAll(/「([^」]+)」/g)].map((fragment) => fragment[1]) }));
}

/** Words of a package.json script or a workflow that name test files: `tests/foo.test.ts`, `tests/action-*.test.ts`. */
function testTokens(text) {
  return [...text.matchAll(/tests\/[A-Za-z0-9_.*\-/]+\.test\.(?:ts|mjs)/g)].map((match) => match[0]);
}
function covers(tokens, file) {
  return tokens.some((token) => token === file || (token.includes("*") && new RegExp(`^${token.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(file)));
}

export function securityInvariantProblems(snapshot) {
  const text = snapshot.read(SECURITY_DOC);
  const records = snapshot.files.filter(file => file.startsWith(SECURITY_RECORDS) && file !== `${SECURITY_RECORDS}README.md`);
  // A tree with no security-invariants test at all (the scratch repositories the other gates' tests build) has nothing to map;
  // a tree with tests and no document is the document having been deleted.
  const hasTests = snapshot.files.some((name) => SECURITY_TEST.test(name));
  if (text === null) return hasTests ? [`${SECURITY_DOC} is missing: it maps every security invariant to its code and its tests`] : [];
  const problems = [];
  const files = new Set(snapshot.files);
  let packageScripts = {};
  try { packageScripts = JSON.parse(snapshot.read("package.json") ?? "{}").scripts ?? {}; } catch { problems.push("package.json cannot be read"); }
  const subset = productSubsetFiles(snapshot);
  const ciYml = snapshot.read(".github/workflows/ci.yml") ?? "";
  const macosCiTokens = extractMacosCiTokens(ciYml, packageScripts);
  const ciTokens = [...testTokens(String(packageScripts["test:security"] ?? "")), ...macosCiTokens, ...testTokens(String(packageScripts["test:contracts"] ?? "")), ...testTokens(ciYml)];
  const named = new Set(), sources = new Map();
  const ids = [];
  if (text.split("\n").some(line => ROW.test(line))) problems.push(`${SECURITY_DOC}: invariant rows belong in independent ${SECURITY_RECORDS} files`);
  for (const file of records) {
    if (!new RegExp(`^${SECURITY_RECORDS}S-(?:\\d+|[a-z][a-z0-9-]*)\\.md$`).test(file)) problems.push(`${file}: invalid record filename`);
    const lines = (snapshot.read(file) ?? "").split("\n");
    if (lines.filter(line => ROW.test(line)).length !== 1) problems.push(`${file}: expected exactly one invariant row`);
    lines.forEach((line, index) => {
    const row = line.match(ROW);
    if (!row) return;
    const where = `${file}:${index + 1}`;
    const id = row[1];
    if (`${id}.md` !== path.posix.basename(file)) problems.push(`${where}: ${id} must match its filename`);
    if (ids.includes(id)) problems.push(`${where}: ${id} is on two rows`);
    ids.push(id);
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== EXPECTED_COLUMNS) {
      problems.push(`${where}: ${id} row must have exactly ${EXPECTED_COLUMNS} columns (found ${cells.length}; escape or reword any '|' inside cells)`);
      return;
    }
    for (const [, code] of (cells[CODE_COLUMN] ?? "").matchAll(CODE_PATH)) {
      if (!files.has(code)) problems.push(`${where}: ${id} names \`${code}\` in its code column, which is not a tracked file written from the repository root`);
    }
    const ci = references(cells[CI_COLUMN] ?? ""), local = references(cells[LOCAL_COLUMN] ?? "");
    if (!ci.length && !local.length) problems.push(`${where}: ${id} names no test`);
    for (const [column, list] of [["CI", ci], ["local", local]]) {
      for (const { file, fragments } of list) {
        named.add(file);
        if (!files.has(file)) { problems.push(`${where}: ${id} names ${file}, which does not exist`); continue; }
        if (!fragments.some(fragment => fragment.trim().length > 0)) problems.push(`${where}: ${id} lists ${file} in the ${column} column without a non-blank test title fragment`);
        if (!sources.has(file)) sources.set(file, snapshot.read(file) ?? "");
        const source = sources.get(file);
        const darwinAnalysis = column === "CI" ? analyzeDarwinSkips(file, source) : null;
        for (const fragment of fragments) {
          if (!source.includes(fragment)) {
            problems.push(`${where}: ${id} names 「${fragment}」 in ${file}, which says nothing of the sort`);
          } else if (column === "CI" && isFragmentDarwinOnly(darwinAnalysis, fragment) && !covers(macosCiTokens, file)) {
            problems.push(`${where}: ${id} lists ${file}「${fragment}」 as run by CI, but it is darwin-only (skipped on Linux) and no blocking macOS job in .github/workflows/ci.yml runs ${file}`);
          }
        }
        if (column === "CI" && !covers(ciTokens, file) && !subset.has(file)) problems.push(`${where}: ${id} lists ${file} as run by CI, but package.json test:security / test:contracts, ci.yml and the product subset (unquarantined) do not run it`);
      }
    }
  });
  }
  if (!ids.length) problems.push(`${SECURITY_DOC} has no invariant record`);
  for (const file of snapshot.files.filter((name) => SECURITY_TEST.test(name))) {
    if (!named.has(file)) problems.push(`${file} is named by no row of ${SECURITY_DOC}; add the invariant it holds, or the row that cites it`);
  }
  return problems;
}

if (isMainScript(import.meta.url)) {
  if (process.argv.slice(2).join(" ") !== "--report") { console.error("usage: security-invariants.mjs --report"); process.exitCode = 2; }
  else {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    console.log("| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |\n| --- | --- | --- | --- | --- |");
    for (const file of readdirSync(path.join(root, SECURITY_RECORDS)).filter(file => /^S-.*\.md$/.test(file)).sort()) {
      console.log(readFileSync(path.join(root, SECURITY_RECORDS, file), "utf8").split("\n").filter(line => ROW.test(line)).join("\n"));
    }
  }
}
