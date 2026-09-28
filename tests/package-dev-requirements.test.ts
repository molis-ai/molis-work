import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDevRequirements } from "../scripts/package-dev-requirements.mjs";

const item = { path: "modules/example", name: "@molis-ai/molis-work-module-example" };
const manifest = { dependencies: { "@molis-ai/molis-work-contracts": "workspace:*", "left-pad": "1.0.0" } };
const section = (overrides: Partial<Record<string, string>> = {}) => [
  "# Example", "", "## 开发要求", "",
  `- 负责：${overrides.owns ?? "例子。"}`,
  "- 不负责：别的。",
  `- 公开入口：${overrides.entry ?? "`@molis-ai/molis-work-module-example`"}。`,
  `- 依赖：${overrides.deps ?? "`@molis-ai/molis-work-contracts`"}。`,
  "- 不变量：", ...(overrides.invariants === "" ? [] : ["  - 一条规矩。"]),
  `- 改动后必跑：\`node scripts/run-tests.mjs ${overrides.tests ?? "tests/example.test.ts"}\``,
  `- 相关手册：${overrides.docs ?? "[手册](../../docs/example.md)"}。`,
  "", "## 进一步阅读", "",
].join("\n");

function repository(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "dev-requirements-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["tests", "docs", "modules/example"]) mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, "tests/example.test.ts"), "");
  writeFileSync(join(root, "docs/example.md"), "");
  return root;
}

test("a complete section that matches package.json passes", t => {
  assert.deepEqual(checkDevRequirements(repository(t), item, section(), manifest), []);
});

test("a README without the section is reported", t => {
  assert.match(checkDevRequirements(repository(t), item, "# Example\n", manifest).join("\n"), /missing "## 开发要求"/u);
});

test("dependencies must match package.json in both directions unless the package is a composition root", t => {
  const root = repository(t);
  const stale = checkDevRequirements(root, item, section({ deps: "`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`" }), manifest);
  assert.match(stale.join("\n"), /not in package\.json: @molis-ai\/molis-work-storage/u);
  const missing = checkDevRequirements(root, item, section({ deps: "无" }), manifest);
  assert.match(missing.join("\n"), /missing @molis-ai\/molis-work-contracts/u);
  assert.deepEqual(checkDevRequirements(root, item, section({ deps: "组合根：见 package.json" }), manifest), []);
});

test("listed tests and links must exist, and at least one invariant and one test are required", t => {
  const root = repository(t);
  assert.match(checkDevRequirements(root, item, section({ tests: "tests/gone.test.ts" }), manifest).join("\n"), /missing test tests\/gone\.test\.ts/u);
  assert.match(checkDevRequirements(root, item, section({ tests: "" }), manifest).join("\n"), /lists no test file/u);
  assert.match(checkDevRequirements(root, item, section({ docs: "[手册](../../docs/gone.md)" }), manifest).join("\n"), /links missing/u);
  assert.match(checkDevRequirements(root, item, section({ invariants: "" }), manifest).join("\n"), /no invariant/u);
  assert.match(checkDevRequirements(root, item, section({ entry: "`other`" }), manifest).join("\n"), /must name/u);
});
