import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkArtifactsOwnership, checkMigratedGoalsCommandOwnership, checkMigratedGovernanceOwnership, checkPrivateWorkContextOwnership,
  checkRuntimeHostOwnership, hasImportFrom, hasInCode, hasInText, matchesInCode } from "../scripts/check-package-boundaries.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const read = file => readFileSync(path.join(repository, file), "utf8");
const errorsOf = result => Array.isArray(result) ? result : result.errors;

/** Runs one section's check on the real tree with one file's text replaced (the check is synchronous, so the swap lasts one call). */
function checkWith(check, file, text) {
  const readFileSync = fs.readFileSync, target = path.join(repository, file);
  fs.readFileSync = (candidate, ...rest) => String(candidate) === target ? text : readFileSync(candidate, ...rest);
  try { return errorsOf(check(repository)); } finally { fs.readFileSync = readFileSync; }
}

const quoted = needle => JSON.stringify(needle);
const regexSource = needle => needle.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&");
const templated = needle => needle.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
/** The ways a text stands in for the code that is not there: gone, then written again where no code is. */
const stand = {
  "a line comment": needle => `\n// ${needle}\n`,
  "a block comment": needle => `\n/* ${needle} */\n`,
  "a string": needle => `\nconst standIn = ${quoted(needle)};\n`,
  "a regular expression": needle => `\nconst standIn = /${regexSource(needle)}/;\n`,
  "template text": needle => `\nconst standIn = \`${templated(needle)}\`;\n`,
};
const without = (source, needle) => source.split(needle).join("");

// One row for each way a "must contain" is read: a name or syntax (`code`), a text that is the content (`text`), an import (`import`),
// a pattern (`pattern`). The `needle` is in the file as it stands.
const ROWS = [
  { check: checkMigratedGoalsCommandOwnership, file: "plugins/native/goals/src/goal-tree-fact-materializer.ts", needle: "this.createIntent(", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "apps/local-host/src/installer/home-release.ts", needle: "skillMethodsDirectory", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "tests/goals-query-module.test.ts", needle: "goals.query.readGoal", kind: "code" },
  { check: checkMigratedGovernanceOwnership, file: "plugins/native/goals/src/contract/governance-collaboration.ts", needle: "interface GovernanceQueryApi", kind: "code" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/index.ts", needle: "class ArtifactsModule", kind: "code" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/repository.ts", needle: "export const ARTIFACT_TABLES", kind: "code" },
  { check: checkPrivateWorkContextOwnership, file: "modules/private-work-context/src/index.ts", needle: "createRuntimeContextModule", kind: "code" },
  { check: checkRuntimeHostOwnership, file: "horizontal/runtime-host/src/index.ts", needle: "MolisWorkPtyHost", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "apps/local-host/src/installer/home-release.ts", needle: '"molis-work-plugin-goals"', kind: "text" },
  { check: checkMigratedGovernanceOwnership, file: "tests/governance-collaboration-module.test.ts", needle: "runtime_dialogue", kind: "text" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/service.ts", needle: "artifacts.artifact.version_not_increasing", kind: "text" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/repository.ts", needle: "PRIMARY KEY (artifact_id, version)", kind: "text" },
  { check: checkArtifactsOwnership, file: "tests/artifacts-module.test.ts", needle: "opaque content, scope and producer binding", kind: "text" },
  { check: checkRuntimeHostOwnership, file: "packages/contracts/src/services/runtime-host.ts", needle: 'maturity: "partial"', kind: "text" },
  { check: checkMigratedGoalsCommandOwnership, file: "tests/planning-engine.test.ts", needle: 'from "./fixtures/goals-modules.js"', kind: "import" },
  { check: checkRuntimeHostOwnership, file: "apps/local-host/src/pty-socket.ts", needle: 'from "@molis-ai/molis-work-service-runtime-host"', kind: "import" },
  { check: checkRuntimeHostOwnership, file: "apps/local-host/src/web-request.ts", needle: 'from "@molis-ai/molis-work-service-runtime-host"', kind: "import" },
];

test("RAC-2010 the Goals, Governance, Artifacts, Private Work Context and Runtime Host checks accept the tree as it is", () => {
  for (const check of new Set(ROWS.map(row => row.check))) assert.deepEqual(errorsOf(check(repository)), [], check.name);
  for (const row of ROWS) assert.ok(read(row.file).includes(row.needle), `${row.file} has ${row.needle}`);
});

for (const row of ROWS) test(`RAC-2011 ${row.check.name}: ${row.needle} in ${path.basename(row.file)} is a ${row.kind} requirement that taking it out refuses`, () => {
  assert.ok(checkWith(row.check, row.file, without(read(row.file), row.needle)).length > 0);
});

for (const row of ROWS.filter(({ kind }) => kind !== "text")) test(`RAC-2012 ${row.check.name}: ${row.needle} written only in a comment, a string, a regular expression or template text no longer stands in for the ${row.kind}`, () => {
  const source = without(read(row.file), row.needle);
  for (const [name, write] of Object.entries(stand)) assert.ok(checkWith(row.check, row.file, source + write(row.needle)).length > 0, `${row.needle} as ${name}`);
});

for (const row of ROWS.filter(({ kind }) => kind === "text")) test(`RAC-2013 ${row.check.name}: ${row.needle} is content, so a string or template that holds it counts and a comment or a regular expression does not`, () => {
  const source = without(read(row.file), row.needle);
  for (const name of ["a line comment", "a block comment", "a regular expression"]) assert.ok(checkWith(row.check, row.file, source + stand[name](row.needle)).length > 0, `${row.needle} as ${name}`);
  for (const name of ["a string", "template text"]) {
    // The text may be one that a string alone cannot hold (the quotes are part of it); only the ones a string can hold are tried.
    if (!row.needle.includes('"') && !row.needle.includes("${")) assert.deepEqual(checkWith(row.check, row.file, source + stand[name](row.needle)), [], `${row.needle} as ${name}`);
  }
});

test("RAC-2014 an import is the statement, written with double quotes: the same words in a comment, a string or single quotes are not", () => {
  const specifier = "@molis-ai/molis-work-service-runtime-host", real = `import { x } from "${specifier}";\n`;
  assert.ok(hasImportFrom(real, specifier));
  assert.ok(hasImportFrom(`import type { x } from "${specifier}"\n`, specifier));
  assert.ok(hasImportFrom(`export * from "${specifier}";\n`, specifier));
  assert.ok(hasImportFrom(`import {\n  a,\n  b,\n} from "${specifier}";\n`, specifier));
  for (const text of [
    `// import { x } from "${specifier}";\n`,
    `/* import { x } from "${specifier}"; */\n`,
    `const text = 'import { x } from "${specifier}"';\n`,
    `const text = \`import { x } from "${specifier}"\`;\n`,
    `import { x } from '${specifier}';\n`,
    `import { x } from "${specifier}-other";\n`,
    `import "${specifier}";\n`,
    `const x = import("${specifier}");\n`,
    "",
  ]) assert.equal(hasImportFrom(text, specifier), false, text);
});

test("RAC-2015 the pattern for the Goals Manifest's tables is read on the code: a comment that shows it does not stand in", () => {
  const file = "plugins/native/goals/src/manifest.ts", source = read(file);
  const found = /databases:\s*\{\s*project:\s*GOALS_PROJECT_DATABASE\s*(?:,\s*home:\s*GOALS_HOME_DATABASE\s*)?\}/u.exec(source);
  assert.ok(found, "the Manifest declares its tables as it did");
  for (const name of ["a line comment", "a block comment", "a string", "template text"]) {
    assert.ok(checkWith(checkMigratedGoalsCommandOwnership, file, without(source, found[0]) + stand[name](found[0])).length > 0, name);
  }
  const pattern = /databases:\s*\{\s*project:\s*GOALS_PROJECT_DATABASE\s*\}/u;
  assert.equal(matchesInCode("const manifest = { databases: { project: GOALS_PROJECT_DATABASE } };", pattern), true);
  assert.equal(matchesInCode("const manifest = { databases: { project: /* x */ GOALS_PROJECT_DATABASE } };", pattern), false);
  assert.equal(matchesInCode("// databases: { project: GOALS_PROJECT_DATABASE }", pattern), false);
});

test("RAC-2016 code beside a literal still counts, and the code inside a template's ${ … } is code", () => {
  assert.equal(hasInCode('const name = "x"; this.createIntent(name);', "this.createIntent("), true);
  assert.equal(hasInCode("const text = `a ${this.createIntent(1)} b`;", "this.createIntent("), true);
  assert.equal(hasInCode("const text = `a ${\"this.createIntent(\"} b`;", "this.createIntent("), false);
  assert.equal(hasInCode("const text = /this\\.createIntent\\(/u; // this.createIntent(", "this.createIntent("), false);
  assert.equal(hasInText('const text = "artifacts.artifact.hash_mismatch";', "artifacts.artifact.hash_mismatch"), true);
  assert.equal(hasInText("const text = `CREATE TABLE IF NOT EXISTS ${t.identities}`;", "CREATE TABLE IF NOT EXISTS ${t.identities}"), true);
  assert.equal(hasInText("// artifacts.artifact.hash_mismatch\n/* artifacts.artifact.hash_mismatch */", "artifacts.artifact.hash_mismatch"), false);
  assert.equal(hasInText("const text = /artifacts.artifact.hash_mismatch/u;", "artifacts.artifact.hash_mismatch"), false);
});

test("RAC-2017 nothing is accepted that the plain text check refused: every helper needs the text to be in the file as well", () => {
  const files = ROWS.map(row => read(row.file));
  let seed = 20261029, tried = 0;
  const next = limit => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
  for (let round = 0; round < 600; round += 1) {
    const source = files[next(files.length)], start = next(Math.max(1, source.length - 40)), needle = source.slice(start, start + 3 + next(37));
    for (const has of [hasInCode, hasInText]) {
      if (has(source, needle)) assert.ok(source.includes(needle), needle);
      if (has(source.slice(0, start), needle)) assert.ok(source.slice(0, start).includes(needle), needle);
      tried += 1;
    }
  }
  assert.equal(tried, 1200);
  // Blanking turns a comment into as many spaces as it is long, so a needle of spaces could be "found" where the file has a comment; the plain check on the file still refuses it.
  assert.equal(hasInCode("x/**/y", "x    y"), false);
  assert.equal(hasInText("x/**/y", "x    y"), false);
  assert.equal(matchesInCode("x/**/y", /x {4}y/u), false);
});
