// S-20 / CCR-08: independent records retain every test reference and refusal check.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SECURITY_DOC, SECURITY_RECORDS, securityInvariantProblems } from "../scripts/gates/security-invariants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const records = readdirSync(`${root}${SECURITY_RECORDS}`).filter(name => /^S-.*\.md$/.test(name)).map(name => SECURITY_RECORDS + name);
const FILES = [...readdirSync(`${root}tests`).map(name => `tests/${name}`), ...records, SECURITY_DOC, "package.json", ".github/workflows/ci.yml"];
const sourceCache = new Map<string, string | null>();
const read = (file: string): string | null => {
  if (!sourceCache.has(file)) { try { sourceCache.set(file, readFileSync(`${root}${file}`, "utf8")); } catch { sourceCache.set(file, null); } }
  return sourceCache.get(file)!;
};
const real = { files: FILES, read };
const altered = (changes: Record<string, string | null>, extraFiles: string[] = []) => ({
  files: [...FILES.filter(file => changes[file] !== null), ...extraFiles],
  read: (file: string) => file in changes ? changes[file]! : read(file),
});
const packageJson = JSON.parse(read("package.json")!) as { scripts: Record<string, string> };
const extra = `${SECURITY_RECORDS}S-extra.md`;
const row = (cells: string) => altered({ [extra]: `| S-extra | ${cells} |\n` }, [extra]);
const namedEntry = "`tests/security-invariants-local-entry.test.ts`「a mutation without the Origin, the token or the one-time key is refused before any handler runs」";
const nobodyWrote = ["a", "title", "nobody", "wrote", "twice"].join(" ");

test("S-20 the table is checked: each way it can stop being true is caught", () => {
  assert.deepEqual(securityInvariantProblems(real), [], "the repository as it is");
  assert.ok(records.length >= 20, "the document has its records");
  const expectProblem = (what: string, snapshot: ReturnType<typeof altered>, pattern: RegExp) => {
    const problems = securityInvariantProblems(snapshot);
    assert.ok(problems.some(problem => pattern.test(problem)), `${what}: ${JSON.stringify(problems)}`);
  };
  expectProblem("the document is gone", altered({ [SECURITY_DOC]: null }), /is missing/);
  expectProblem("a row names no test", row("an invariant with nothing behind it | somewhere | |"), /S-extra names no test/);
  expectProblem("a row names a missing test", row("x | y | `tests/no-such-file.test.ts` |"), /tests\/no-such-file\.test\.ts, which does not exist/);
  let count = 0;
  for (const file of records) {
    const text = read(file)!;
    for (const match of text.split("\n").filter(line => /^\| S-/.test(line)).join("\n").matchAll(/「([^」]+)」/g)) {
      count++;
      expectProblem(`「${match[1]}」 was renamed`, altered({ [file]: text.replace(match[0], `「${nobodyWrote}」`) }), new RegExp(`names 「${nobodyWrote}」`));
    }
  }
  assert.ok(count >= 50, "all title fragments retain mutation coverage");
  const unscheduled = "tests/rss-custom-feeds.test.ts";
  const unscheduledTitle = "this test exists in the snapshot";
  expectProblem("a CI test that CI does not run", altered({
    [extra]: `| S-extra | x | y | \`${unscheduled}\`「${unscheduledTitle}」 | |\n`,
    [unscheduled]: `import test from "node:test";\ntest("${unscheduledTitle}", () => {});\n`,
  }, [extra, unscheduled]), /do not run it/);
  const duplicate = `${SECURITY_RECORDS}S-duplicate.md`;
  expectProblem("an ID is used twice", altered({ [duplicate]: read(`${SECURITY_RECORDS}S-06.md`)! }, [duplicate]), /S-06 is on two rows/);
  expectProblem("filename and ID differ", altered({ [`${SECURITY_RECORDS}S-07.md`]: read(`${SECURITY_RECORDS}S-06.md`)! }), /must match its filename/);
  expectProblem("empty record", altered({ [`${SECURITY_RECORDS}S-07.md`]: "# S-07\n" }), /expected exactly one/);
  expectProblem("an unmapped invariant test", altered({ "tests/security-invariants-extra.test.ts": "" }, ["tests/security-invariants-extra.test.ts"]), /security-invariants-extra\.test\.ts is named by no row/);
  const trimmed = { ...packageJson, scripts: { ...packageJson.scripts, "test:security": packageJson.scripts["test:security"]!.replace(" tests/memory-service.test.ts", "") } };
  expectProblem("a test removed from test:security", altered({ "package.json": JSON.stringify(trimmed) }), /tests\/memory-service\.test\.ts as run by CI/);
  const independent = row(`new boundary | code | ${namedEntry} |`);
  assert.deepEqual(securityInvariantProblems(independent), [], "semantic IDs need no shared sequence");
});

const unnamed = `${namedEntry}; \`tests/memory-service.test.ts\``;
for (const [label, column, ci, local] of [
  ["a missing CI title", "CI", unnamed, ""],
  ["a missing local title", "local", "", unnamed],
  ["an empty title", "CI", `${unnamed}「」`, ""],
  ["a title of only whitespace", "local", "", `${unnamed}「   」`],
]) {
  test(`NSEC-02 rejects ${label} beside a named test`, () => {
    assert.deepEqual(securityInvariantProblems(row(`new boundary | code | ${ci} | ${local}`)), [
      `${extra}:1: S-extra lists tests/memory-service.test.ts in the ${column} column without a non-blank test title fragment`,
    ]);
  });
}

test("NSEC-03 each title fragment in one reference must be present", () => {
  assert.deepEqual(securityInvariantProblems(row(`new boundary | code | | ${namedEntry}「a refused mutation does not use up its key」`)), []);
  assert.deepEqual(securityInvariantProblems(row(`new boundary | code | | ${namedEntry}「${nobodyWrote}」`)), [
    `${extra}:1: S-extra names 「${nobodyWrote}」 in tests/security-invariants-local-entry.test.ts, which says nothing of the sort`,
  ]);
});
