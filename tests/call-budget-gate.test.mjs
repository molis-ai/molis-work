import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const health = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));

test("BCC-01 and BCC-02 · health rejects new context calls and a loosened request budget", t => {
  const root = mkdtempSync(join(tmpdir(), "molis-call-budget-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, content) => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=Gates", "-c", "user.email=gates@example.invalid", ...args],
    { cwd: root, encoding: "utf8", stdio: "pipe" });
  const gate = (...args) => {
    const result = spawnSync(process.execPath, [health, "--root", root, "--base", "main", ...args], { encoding: "utf8" });
    return { status: result.status, text: result.stdout + result.stderr };
  };
  const path = "apps/local-host/src/route.ts";
  const limits = "tooling/gates/call-budget.json";
  const inert = `import { localWebActionContext as buildContext } from "./local-web-actions.js";
interface Host { localPersonContext(): void; }
const documentation = "localWebActionContext()";
// localPersonContext()
`;
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", '{"file":500,"classLines":300,"classMethods":40,"functionLines":150,"vendoredPrologueSdk":2}');
  put(path, inert + "buildContext();\n");
  put(limits, '{"projectBrief":{"discover":4,"sqliteOpens":10},"sideFileSources":{"discover":1}}');
  git("add", ".");
  git("commit", "-qm", "baseline");
  git("checkout", "-qb", "change");

  const report = gate("--report", "--json");
  assert.equal(report.status, 0, report.text);
  assert.deepEqual(JSON.parse(report.text).head.localWebContextCalls, { [path]: 1 });

  put(path, inert + "buildContext();\nhost[\"localPersonContext\"]?.();\n");
  put("apps/local-host/src/new-route.ts", "localWebActionContext();\n");
  put(limits, '{"projectBrief":{"discover":5}}');
  git("add", ".");
  for (const args of [[], ["--update"]]) {
    const rejected = gate(...args);
    assert.equal(rejected.status, 1, rejected.text);
    assert.match(rejected.text, /local Web context calls in apps\/local-host\/src\/route\.ts 1 → 2/u);
    assert.match(rejected.text, /local Web context calls in apps\/local-host\/src\/new-route\.ts 0 → 1/u);
    assert.match(rejected.text, /projectBrief\.discover grew 4 → 5/u);
    assert.match(rejected.text, /removed counter projectBrief\.sqliteOpens/u);
    assert.match(rejected.text, /removed scenario sideFileSources/u);
  }

  git("rm", "-f", "apps/local-host/src/new-route.ts");
  put(path, inert);
  put(limits, '{"projectBrief":{"discover":3,"sqliteOpens":10},"sideFileSources":{"discover":1}}');
  const tightened = gate();
  assert.equal(tightened.status, 0, tightened.text);

  git("rm", "-f", limits);
  const missing = gate();
  assert.equal(missing.status, 1, missing.text);
  assert.match(missing.text, /call-budget\.json is missing/u);
});
