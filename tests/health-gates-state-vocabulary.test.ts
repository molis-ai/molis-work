import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../scripts/gates/state-vocabulary.mjs", import.meta.url));
const report = (root: string, args: string[]) => spawnSync(process.execPath, [checker, "--root", root, ...args], { encoding: "utf8" });
const vocabulary = "packages/contracts/src/platform/state-vocabulary.ts";
const families = "packages/contracts/src/platform/ui-state-rings.ts";
const document = "docs/platform/STATE-VOCABULARY.md";
const unions = "packages/contracts/src/platform/example.ts";

test("SMP-01 SMP-18 reports per-file growth, unknown families, and malformed declarations without failing the check", () => {
  const root = mkdtempSync(join(tmpdir(), "molis-state-vocabulary-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const put = (file: string, source: string) => {
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, source);
  };
  try {
    git("init", "-qb", "main");
    const sourceFile = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
    put(vocabulary, sourceFile(vocabulary).replace('installed: "idle"', 'installed: "unknown-family"'));
    put(families, sourceFile(families));
    put(document, "stale");
    put(unions, 'export type CurrentState = "before" | "after";');
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base");
    put(unions, `type HiddenStatus = "before" | "after";
      type ApprovalStatus = "pending" | "approved"; export type { ApprovalStatus };
      export type CurrentState = "before" | "after";
      export interface Example { status?: "waiting" | "done"; display: "mode" | "text" }
    `);
    const manifest = "outside.json";
    put(manifest, JSON.stringify({ plugin_id: "io.example.notes", state_machines: [{
      machine_id: "another.owner.machine", version: 1, initial: "draft", terminal: ["done"], states: { draft: "idle", done: "done" },
    }] }));
    const check = report(root, ["--base", "HEAD", "--report", "--manifest", manifest]);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /named state unions 1 → 2/);
    assert.match(check.stdout, /inline state unions 0 → 1/);
    assert.match(check.stdout, /pluginLifecycle\.installed has unknown family unknown-family/);
    assert.match(check.stdout, /outside\.json: state_machines\.declaration_invalid/);
    assert.match(check.stdout, /STATE-VOCABULARY\.md: regenerate/);
    assert.doesNotMatch(check.stdout, /HiddenStatus|Example\.display/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("SMP-17 the published vocabulary table matches the contracts data and all 21 state ring families", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const check = report(root, ["--table"]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /\| `archived` \| 已收存 \|/);
  assert.equal(check.stdout, readFileSync(join(root, document), "utf8"));
});
