import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { maintainMcp } from "./fixtures/mcp-grants-maintenance.mjs";

const grants = [true, false].map((enabled, index) => ({ client_id: `client-${index}`, project_id: index === 0 ? "project" : null,
  capability_id: "artifacts.read", version: 1, provider_id: "io.molis.work.artifacts", permissions: ["artifacts:read"], enabled }));
function fixture(t: test.TestContext, value: unknown = { version: 2, action_grants: grants }) {
  const root = fs.mkdtempSync(join(tmpdir(), "mcp-maintenance-")), home = join(root, "home"), file = join(home, "config", "mcp-tools.json"), backup = join(root, "old-mcp-tools.json");
  fs.mkdirSync(join(home, "config"), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { home, file, backup };
}
test("RAC-2324 MCP maintenance lists without writes, preserves every authority field, reads v3 through its owner and repeats byte for byte", async t => {
  const f = fixture(t), bytes = fs.readFileSync(f.file);
  assert.deepEqual(await maintainMcp(f.file, undefined), { version: 2, grants: 2, enabled: 1, clients: 2, changed: false });
  assert.deepEqual(fs.readFileSync(f.file), bytes);
  assert.equal((await maintainMcp(f.file, f.backup, true)).changed, true);
  assert.deepEqual(fs.readFileSync(f.backup), bytes);
  const actual = await readMcpToolPreference(f.home);
  assert.deepEqual(actual.action_grants.map(({ generation, ...row }) => row), grants);
  assert.ok(actual.action_grants.every(row => row.generation.length > 0));
  assert.equal(new Set(actual.action_grants.map(row => row.generation)).size, 2);
  const after = fs.readFileSync(f.file);
  assert.equal((await maintainMcp(f.file, undefined, true)).changed, false);
  assert.deepEqual(fs.readFileSync(f.file), after);
});
test("RAC-2324 invalid shape, version or duplicate authority refuses before any source change", async t => {
  for (const value of [{ version: 1, action_grants: grants }, { version: 2, action_grants: [grants[0], grants[0]] },
    { version: 2, action_grants: [{ ...grants[0], extra: true }] }, { version: 2, action_grants: [{ ...grants[0], enabled: "false" }] }]) {
    const f = fixture(t, value), bytes = fs.readFileSync(f.file);
    await assert.rejects(maintainMcp(f.file, f.backup, true));
    assert.deepEqual(fs.readFileSync(f.file), bytes); assert.equal(fs.existsSync(f.backup), false);
  }
});
test("RAC-2324 publication failure keeps the source unchanged and the original outside the Home", async t => {
  const f = fixture(t), bytes = fs.readFileSync(f.file), rename = fs.renameSync;
  fs.renameSync = () => { throw new Error("injected publication failure"); };
  try { await assert.rejects(maintainMcp(f.file, f.backup, true), /injected publication failure/u); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(f.file), bytes); assert.deepEqual(fs.readFileSync(f.backup), bytes);
  assert.deepEqual(fs.readdirSync(join(f.home, "config")), ["mcp-tools.json"]);
});
