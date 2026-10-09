// Security invariant S-20 (docs/system/SECURITY-INVARIANTS.md): the table of invariants is true. The rule is
// scripts/gates/security-invariants.mjs (a problem rule of `pnpm health:check`); this test shows that it holds on the repository as it
// is, and that each way the table can stop being true makes it fail: a missing document, a row with no test, a test file that is
// gone, a test title that was renamed, a "runs in CI" test that CI does not run, ids out of order, and a security-invariants test file
// that no row names.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SECURITY_DOC, securityInvariantProblems } from "../scripts/gates/security-invariants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const FILES = [...readdirSync(`${root}tests`).map(name => `tests/${name}`), SECURITY_DOC, "package.json", ".github/workflows/ci.yml"];
const read = (file: string): string | null => { try { return readFileSync(`${root}${file}`, "utf8"); } catch { return null; } };
const real = { files: FILES, read };
/** The repository as it is, with some of its files read differently. */
const altered = (changes: Record<string, string | null>, extraFiles: string[] = []) => ({
  files: [...FILES.filter(file => changes[file] !== null), ...extraFiles],
  read: (file: string) => file in changes ? changes[file]! : read(file),
});
const doc = read(SECURITY_DOC)!;
const packageJson = JSON.parse(read("package.json")!) as { scripts: Record<string, string> };

test("S-20 the table is checked: each way it can stop being true is caught", () => {
  assert.deepEqual(securityInvariantProblems(real), [], "the repository as it is");
  assert.ok(doc.split("\n").filter(line => /^\| S-\d+ \|/.test(line)).length >= 20, "the document has its rows");

  const expectProblem = (what: string, snapshot: ReturnType<typeof altered>, pattern: RegExp) => {
    const problems = securityInvariantProblems(snapshot);
    assert.ok(problems.some(problem => pattern.test(problem)), `${what}: ${JSON.stringify(problems)}`);
  };
  expectProblem("the document is gone", altered({ [SECURITY_DOC]: null }), /is missing/);
  expectProblem("a row names no test", altered({ [SECURITY_DOC]: `${doc}\n| S-21 | an invariant with nothing behind it | somewhere | | |\n` }), /S-21 names no test/);
  expectProblem("a row names a test file that does not exist", altered({ [SECURITY_DOC]: `${doc}\n| S-21 | x | y | \`tests/no-such-file.test.ts\` | |\n` }), /tests\/no-such-file\.test\.ts, which does not exist/);
  expectProblem("a test title was renamed", altered({ [SECURITY_DOC]: doc.replace("「S-06 the control token is long and random」", "「S-06 a title nobody wrote」") }), /a title nobody wrote/);
  expectProblem("a CI test that CI does not run", altered({ [SECURITY_DOC]: `${doc}\n| S-21 | x | y | \`tests/rss-custom-feeds.test.ts\` | |\n`, "tests/rss-custom-feeds.test.ts": "" }, ["tests/rss-custom-feeds.test.ts"]), /do not run it/);
  expectProblem("the ids run out of order", altered({ [SECURITY_DOC]: doc.replace("| S-05 |", "| S-04 |") }), /they run S-01, S-02/);
  expectProblem("an id is used twice", altered({ [SECURITY_DOC]: doc.replace(/\| S-07 \|/, "| S-06 |") }), /S-06 is on two rows/);
  expectProblem("an invariant test file that no row names", altered({ "tests/security-invariants-extra.test.ts": "" }, ["tests/security-invariants-extra.test.ts"]), /security-invariants-extra\.test\.ts is named by no row/);
  // CI runs what the script says: take a test out of `test:security` and its row, which lists it as run by CI, is wrong.
  const trimmed = { ...packageJson, scripts: { ...packageJson.scripts, "test:security": packageJson.scripts["test:security"]!.replace(" tests/memory-service.test.ts", "") } };
  expectProblem("a test taken out of test:security", altered({ "package.json": JSON.stringify(trimmed) }), /tests\/memory-service\.test\.ts as run by CI/);
});
