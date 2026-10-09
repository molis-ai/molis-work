// Gate: the security invariants document names tests that exist (specs/repository-anti-corruption §4.18, W2-19).
//
// docs/system/SECURITY-INVARIANTS.md is a table: one row per invariant (`| S-01 | … |`), with the code that holds it and the
// tests that assert its refusal. A table of promises is only worth what is behind it, so this reads the table and checks that
//   - the row ids are S-01, S-02, … in order, each once;
//   - every row names at least one test, and every test file it names exists;
//   - every test named with a title fragment (`tests/x.test.ts`「fragment」) has that fragment in the file, so a renamed or
//     deleted test cannot leave the row pointing at nothing;
//   - the tests in the CI column are run by CI: the file is named (or matched by a glob) in the root package.json scripts
//     `test:security` or `test:contracts`, or in .github/workflows/ci.yml;
//   - every tests/security-invariants-*.test.ts file is named by some row, so a new invariant test cannot sit outside the table.
// Not read: whether a named test asserts anything about its row. That is review; the tests themselves are mutation-verified
// (tests/security-invariants-doc.test.ts) and each states the refusal it checks.
export const SECURITY_DOC = "docs/system/SECURITY-INVARIANTS.md";
const ROW = /^\|\s*(S-\d+)\s*\|/;
const TEST_REFERENCE = /`(tests\/[^`\s]+\.test\.(?:ts|mjs))`(?:「([^」]+)」)?/g;
const CI_COLUMN = 3;
const LOCAL_COLUMN = 4;

function references(cell) {
  return [...cell.matchAll(TEST_REFERENCE)].map((match) => ({ file: match[1], fragment: match[2] ?? null }));
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
  // A tree with no security-invariants test at all (the scratch repositories the other gates' tests build) has nothing to map;
  // a tree with tests and no document is the document having been deleted.
  const hasTests = snapshot.files.some((name) => /^tests\/security-invariants-[a-z0-9-]+\.test\.ts$/.test(name));
  if (text === null) return hasTests ? [`${SECURITY_DOC} is missing: it maps every security invariant to its code and its tests`] : [];
  const problems = [];
  const files = new Set(snapshot.files);
  let packageScripts = {};
  try { packageScripts = JSON.parse(snapshot.read("package.json") ?? "{}").scripts ?? {}; } catch { problems.push("package.json cannot be read"); }
  const ciTokens = [...testTokens(String(packageScripts["test:security"] ?? "")), ...testTokens(String(packageScripts["test:contracts"] ?? "")), ...testTokens(snapshot.read(".github/workflows/ci.yml") ?? "")];
  const named = new Set();
  const ids = [];
  text.split("\n").forEach((line, index) => {
    const row = line.match(ROW);
    if (!row) return;
    const where = `${SECURITY_DOC}:${index + 1}`;
    const id = row[1];
    if (ids.includes(id)) problems.push(`${where}: ${id} is on two rows`);
    ids.push(id);
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const ci = references(cells[CI_COLUMN] ?? ""), local = references(cells[LOCAL_COLUMN] ?? "");
    if (!ci.length && !local.length) problems.push(`${where}: ${id} names no test`);
    for (const [column, list] of [["CI", ci], ["local", local]]) {
      for (const { file, fragment } of list) {
        named.add(file);
        if (!files.has(file)) { problems.push(`${where}: ${id} names ${file}, which does not exist`); continue; }
        if (fragment !== null && !(snapshot.read(file) ?? "").includes(fragment)) problems.push(`${where}: ${id} names 「${fragment}」 in ${file}, which says nothing of the sort`);
        if (column === "CI" && !covers(ciTokens, file)) problems.push(`${where}: ${id} lists ${file} as run by CI, but package.json test:security / test:contracts and ci.yml do not run it`);
      }
    }
  });
  ids.forEach((id, index) => { if (id !== `S-${String(index + 1).padStart(2, "0")}`) problems.push(`${SECURITY_DOC}: the ids are ${ids.join(", ")}; they run S-01, S-02, … in order, and an id is never reused`); });
  if (!ids.length) problems.push(`${SECURITY_DOC} has no invariant row (| S-01 | … |)`);
  for (const file of snapshot.files.filter((name) => /^tests\/security-invariants-[a-z0-9-]+\.test\.ts$/.test(name))) {
    if (!named.has(file)) problems.push(`${file} is named by no row of ${SECURITY_DOC}; add the invariant it holds, or the row that cites it`);
  }
  return problems;
}
