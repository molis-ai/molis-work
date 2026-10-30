import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKSPACE_PACKAGES } from "../scripts/workspace-packages.mjs";
import {
  checkPackageOwners,
  CODING_REVIEWER,
  GATE_PATHS,
  LEAD,
  MATURITY_COLUMN,
  MATURITY_WORDS,
  maturityErrors,
  NO_OWNER,
  OWNER_COLUMN,
  ownerErrors,
  packageOwner,
  PLATFORM_REVIEWERS,
  REGISTRATION_PATTERN,
  renderCodeowners,
  renderSsot,
} from "../scripts/package-owners.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const codeowners = () => read(".github/CODEOWNERS");
const ssot = () => read("docs/SSOT-MATRIX.md");
const errorsFor = (overrides) => ownerErrors({ codeowners: codeowners(), ssot: ssot(), packages: WORKSPACE_PACKAGES, ...overrides }).join("\n");
const rowFor = (text, packagePath) => text.split("\n").find((line) => line.startsWith(`| \`${packagePath}\` |`));
const reviewedBy = (handle) => WORKSPACE_PACKAGES.filter((item) => item.owner.handles.includes(handle)).map((item) => item.path).sort();

test("the committed CODEOWNERS and the SSOT 归属 column are what the owner rules produce", () => {
  assert.deepEqual(checkPackageOwners(root, WORKSPACE_PACKAGES), []);
  assert.equal(codeowners(), renderCodeowners(WORKSPACE_PACKAGES));
  // Regenerating the SSOT changes nothing, so a `--write` run never rewrites other cells.
  assert.equal(renderSsot(ssot(), WORKSPACE_PACKAGES), ssot());
});

test("the lead answers for every package; the second reviewer also for Coding, Agent Host, Jelly, Shelf and Diff", () => {
  assert.deepEqual(reviewedBy(LEAD), WORKSPACE_PACKAGES.map((item) => item.path).sort());
  assert.deepEqual(reviewedBy(CODING_REVIEWER), [
    "horizontal/agent-host", "modules/shelf", "plugins/native/coding", "plugins/native/diff", "plugins/native/jelly", "plugins/native/shelf",
  ]);
  const rules = codeowners().split("\n").filter((line) => line && !line.startsWith("#"));
  assert.equal(rules[0], `* ${LEAD}`);
  // The last matching line wins, so the gate lines come after every package line and name the lead alone.
  const gateRules = rules.slice(-GATE_PATHS.length);
  assert.deepEqual(gateRules, GATE_PATHS.map((gatePath) => `/${gatePath} ${LEAD}`));
  for (const rule of rules.slice(1)) {
    const [pattern] = rule.split(" ");
    const [before, after] = pattern.split("/*/");
    const matches = after === undefined ? [pattern]
      : fs.readdirSync(new URL(`..${before}/`, import.meta.url)).map((name) => `${before}/${name}/${after}`);
    assert.ok(matches.some((match) => fs.existsSync(new URL(`..${match}`, import.meta.url))), `${pattern} exists`);
  }
});

test("W5-02: a built-in plugin's registration asks the platform's reviewers too, also where the package has its own", () => {
  const rules = codeowners().split("\n").filter((line) => line && !line.startsWith("#"));
  const at = rules.indexOf(`/${REGISTRATION_PATTERN} ${PLATFORM_REVIEWERS.join(" ")}`);
  assert.ok(at > 0, "the pattern line is there");
  const packageLines = rules.filter((rule) => rule.split(" ")[0].endsWith("/") && !GATE_PATHS.some((gatePath) => rule.startsWith(`/${gatePath} `)));
  assert.ok(packageLines.length > 0 && packageLines.every((rule) => rules.indexOf(rule) < at), "after the package lines, so it wins over them");
  for (const item of WORKSPACE_PACKAGES.filter((entry) => entry.path.startsWith("plugins/native/") && entry.owner.handles.some((handle) => handle !== LEAD))) {
    const own = rules.find((rule) => rule.startsWith(`/${item.path}/src/registration.ts `));
    assert.ok(own && rules.indexOf(own) > at, `${item.path} has its own registration line after the pattern`);
    for (const handle of [...item.owner.handles, ...PLATFORM_REVIEWERS]) assert.ok(own.split(" ").includes(handle), `${item.path}: ${handle}`);
  }
});

test("every role comes from the package kind, with the shared core of docs/prompts/repository-anti-corruption.md §4.7", () => {
  const roleOf = (packagePath) => WORKSPACE_PACKAGES.find((item) => item.path === packagePath).owner.role;
  for (const packagePath of ["packages/contracts", "packages/kernel", "apps/local-host", "apps/workbench", "horizontal/agent-host"]) {
    assert.equal(roleOf(packagePath), "共享核心", packagePath);
  }
  assert.equal(roleOf("plugins/native/todo"), "内置插件");
  assert.throws(() => packageOwner("plugins/native/x", "unknown-kind"), /no owner role/);
});

test("the owner check rejects a CODEOWNERS that drifted from the rules", () => {
  const text = codeowners();
  assert.equal(errorsFor({}), "");
  // The second reviewer dropped from Coding.
  assert.match(errorsFor({ codeowners: text.replace(`/plugins/native/coding/ ${LEAD} ${CODING_REVIEWER}`, `/plugins/native/coding/ ${LEAD}`) }), /CODEOWNERS differs/);
  // A hand-added rule, a gate line widened to the second reviewer, a missing trailing newline.
  assert.match(errorsFor({ codeowners: `${text}/apps/cli/ @someone\n` }), /CODEOWNERS differs/);
  assert.match(errorsFor({ codeowners: text.replace(`/tooling/gates/ ${LEAD}`, `/tooling/gates/ ${LEAD} ${CODING_REVIEWER}`) }), /CODEOWNERS differs/);
  assert.match(errorsFor({ codeowners: text.trimEnd() }), /CODEOWNERS differs/);
});

test("the owner check rejects a SSOT whose 归属 column drifted from the rules", () => {
  const text = ssot();
  const row = rowFor(text, "plugins/native/jelly");
  const cell = `内置插件：${LEAD}、${CODING_REVIEWER}`;
  assert.ok(row.endsWith(`| ${cell} |`), row);
  // A changed cell.
  assert.match(errorsFor({ ssot: text.replace(row, row.replace(cell, `内置插件：${LEAD}`)) }), /归属 of `plugins\/native\/jelly` is/);
  // A row without the column (a new row written by hand).
  assert.match(errorsFor({ ssot: text.replace(row, row.slice(0, row.lastIndexOf("|", row.length - 3) + 1)) }), /row has 5 cells/);
  // The column gone from a table header.
  assert.match(errorsFor({ ssot: text.replace(`| 迁移 / 实现 Goal | ${OWNER_COLUMN} |`, "| 迁移 / 实现 Goal |") }), /has no "归属" column/);
  // A package without a row, and a package with two.
  assert.match(errorsFor({ ssot: text.replace(`${row}\n`, "") }), /package plugins\/native\/jelly must have exactly one row, found 0/);
  assert.match(errorsFor({ ssot: text.replace(row, `${row}\n${row}`) }), /package plugins\/native\/jelly must have exactly one row, found 2/);
  // A row that names two paths cannot carry one owner.
  assert.match(errorsFor({ ssot: text.replace(row, row.replace("| `plugins/native/jelly` |", "| `plugins/native/jelly`、`plugins/native/cognia` |")) }), /exactly one path/);
  // A row for a package that does not exist yet must say so.
  const absent = rowFor(text, "plugins/native/actions");
  assert.ok(absent.endsWith(`| ${NO_OWNER} |`), absent);
  assert.match(errorsFor({ ssot: text.replace(absent, absent.replace(`| ${NO_OWNER} |`, `| 内置插件：${LEAD} |`)) }), /归属 of `plugins\/native\/actions`/);
});

test("W5-15: the 包成熟度 column carries the registry's words from the four-word vocabulary", () => {
  const text = ssot();
  const errors = (mutated) => maturityErrors({ ssot: mutated, packages: WORKSPACE_PACKAGES }).join("\n");
  assert.equal(errors(text), "");
  assert.deepEqual(MATURITY_WORDS, ["production", "experimental", "slice", "absent"]);
  const shelf = rowFor(text, "modules/shelf");
  assert.match(errors(text.replace(shelf, shelf.replace("`slice`", "`production`"))), /包成熟度 of modules\/shelf is "production", the registry says "slice"/);
  // The retired migration words are not accepted, even when they name no live package.
  assert.match(errors(text.replace(shelf, shelf.replace("`slice`", "`partial`"))), /包成熟度 of modules\/shelf is "partial"/);
  // Every target path without a package yet says absent, and nothing else.
  const absent = rowFor(text, "packages/exchange");
  assert.match(errors(text.replace(absent, absent.replace("`absent`", "`slice`"))), /包成熟度 of packages\/exchange is "slice", the registry says "absent"/);
  // A cell without a word in backticks is a hand edit, not a value.
  assert.match(errors(text.replace(shelf, shelf.replace("`slice`", "slice"))), /names no word in backticks, expected "slice"/);
  // A target row inside a package follows that package: apps/workbench/src/functions carries apps/workbench's word.
  const functions = rowFor(text, "apps/workbench/src/functions");
  assert.match(errors(text.replace(functions, functions.replace("`production`", "`slice`"))), /包成熟度 of apps\/workbench\/src\/functions is "slice", the registry says "production"/);
  // The column itself must stay in every package table.
  assert.match(errors(text.replace(`| ${MATURITY_COLUMN} | 迁移 / 实现 Goal |`, "| 迁移 / 实现 Goal |")), /has no "包成熟度" column/);
});

test("a package added to the workspace needs a SSOT row, and a row inside a package takes its owner", () => {
  const added = { path: "plugins/native/probe", kind: "native-plugin", owner: packageOwner("plugins/native/probe", "native-plugin") };
  assert.match(
    ownerErrors({ codeowners: renderCodeowners([...WORKSPACE_PACKAGES, added]), ssot: ssot(), packages: [...WORKSPACE_PACKAGES, added] }).join("\n"),
    /package plugins\/native\/probe must have exactly one row, found 0/,
  );
  // `--write` fills the column for a row written without it.
  const row = `| \`plugins/native/probe\` | 探针 | 来源 | \`partial\` | 目标 |`;
  const written = renderSsot(ssot().replace(rowFor(ssot(), "plugins/native/todo"), `${rowFor(ssot(), "plugins/native/todo")}\n${row}`), [...WORKSPACE_PACKAGES, added]);
  assert.ok(rowFor(written, "plugins/native/probe").endsWith(`| 内置插件：${LEAD} |`));
  assert.equal(rowFor(ssot(), "apps/workbench/src/functions").split("|").at(-2).trim(), "共享核心：@yijunw0212");
});

test("the command checks without arguments and exits 0 on the committed files", () => {
  const result = spawnSync(process.execPath, ["scripts/package-owners.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`owners ok: ${WORKSPACE_PACKAGES.length} packages`));
});
