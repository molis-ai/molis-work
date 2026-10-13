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
  NO_OWNER,
  OWNER_COLUMN,
  ownerErrors,
  packageOwner,
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
    assert.ok(fs.existsSync(new URL(`..${pattern}`, import.meta.url)), `${pattern} exists`);
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
