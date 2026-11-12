// S-20 / CCR-08: independent records retain every test reference and refusal check.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SECURITY_DOC, SECURITY_RECORDS, securityInvariantProblems } from "../scripts/gates/security-invariants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const records = readdirSync(`${root}${SECURITY_RECORDS}`).filter(name => /^S-.*\.md$/.test(name)).map(name => SECURITY_RECORDS + name);
// The tracked tree, as the health gate reads it: the code column is checked against every tracked file.
const FILES = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }).split("\0").filter(Boolean);
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

test("B27G-01 the code column names tracked files written from the root, whatever has the same name elsewhere", () => {
  const record = `${SECURITY_RECORDS}S-65.md`, text = read(record)!;
  const named = "packages/plugin-sandbox/src/materials.ts";
  assert.ok(text.includes("`" + named + "`") && FILES.includes("plugins/native/coding/src/materials.ts"), "the fixture names a file whose name another package shares");
  const reported = (snapshot: ReturnType<typeof altered>, code: string) =>
    assert.ok(securityInvariantProblems(snapshot).some(problem => problem.startsWith(`${record}:`) && problem.includes(`names \`${code}\` in its code column`)), code);
  reported({ files: FILES.filter(file => file !== named), read }, named);
  reported(altered({ [record]: text.replace("`" + named + "`", "`materials.ts`") }), "materials.ts");
  reported(altered({ [record]: text.replace("`" + named + "`", "`../packages/plugin-sandbox/src/materials.ts:12`") }), "../packages/plugin-sandbox/src/materials.ts");
  reported(altered({ [record]: text.replace("`" + named + "`", "`plugin-sandbox/src/materials.ts`") }), "plugin-sandbox/src/materials.ts");
  assert.deepEqual(securityInvariantProblems(altered({ [record]: text.replace("`" + named + "`", "`" + named + ":40-52`") })), [], "a line range is not checked");
  const upstream = read(`${SECURITY_RECORDS}S-38.md`)!;
  assert.match(upstream, /\[packages\/sdk\/src\/host\/plugin\/node-command-env\.ts\]\(https:\/\/github\.com\//, "an upstream source is a link, not a code path");
});

test("B27G-02 a browser security test is mapped like any other, and its tree without the table is the table deleted", () => {
  const e2e = "tests/security-invariants-extra.e2e.test.ts";
  const title = "an extra browser refusal is asserted";
  const source = `import test from "node:test";\ntest("${title}", () => {});\n`;
  const only = { files: [e2e], read: (file: string) => file === e2e ? source : null };
  assert.deepEqual(securityInvariantProblems(only), [`${SECURITY_DOC} is missing: it maps every security invariant to its code and its tests`]);
  const unmapped = altered({ [e2e]: source }, [e2e]);
  assert.ok(securityInvariantProblems(unmapped).some(problem => problem === `${e2e} is named by no row of ${SECURITY_DOC}; add the invariant it holds, or the row that cites it`));
  const mapped = altered({ [e2e]: source, [extra]: `| S-extra | x | code | | \`${e2e}\`「${title}」 |\n` }, [e2e, extra]);
  assert.deepEqual(securityInvariantProblems(mapped), [], "named by a row, with its real title, in the local column");
});

test("B27G-03 an unquarantined entry of a valid product subset plan is CI evidence; leaving the list or entering quarantine is not", () => {
  const list = read("tests/ci-product-subset.txt")!, quarantine = read("tests/quarantine.json")!;
  const settled = "tests/web-mutation-key-settle.test.ts";
  assert.ok(list.split("\n").includes(settled) && !(packageJson.scripts["test:security"] ?? "").includes(settled), "S-03 cites it through the subset alone");
  const notRun = /S-03 lists tests\/web-mutation-key-settle\.test\.ts as run by CI/;
  const problems = (changes: Record<string, string | null>) => securityInvariantProblems(altered(changes));
  assert.ok(problems({ "tests/ci-product-subset.txt": list.split("\n").filter(line => line !== settled).join("\n") }).some(problem => notRun.test(problem)), "left the list");
  const held = JSON.parse(quarantine) as { entries: unknown[] };
  held.entries.push({ file: settled, owner: "@example", since: "2026-11-01", expires: "2026-11-20", reason: "fixture: a flaky refusal seen in the Linux probe" });
  assert.ok(problems({ "tests/quarantine.json": JSON.stringify(held) }).some(problem => notRun.test(problem)), "quarantined");
  assert.ok(problems({ "tests/ci-product-subset.txt": `${list}\nnot a test path\n` }).some(problem => notRun.test(problem)), "a plan with a problem of its own counts for nothing");
});
