// The person's after-write checkers (specs/prologue-adoption §6.0p.2): PA-25, and the saving half of PA-26 and PA-28.
// Running them, the "未检查：工作区授权已撤回" observation and the `./` prefix belong to the executor (A2-2).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerList, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentHost, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

const { list, save } = agentWriteCheckerActions;
const NODE: AgentWriteChecker = { checker_id: "node-check", display_name: "Node 语法", executable: "node", args: ["--check", "{file}"], applies_to: [".js", ".mjs"] };
const KEPT = { ...NODE, cwd: ".", timeout_ms: 30_000 };
const code = (expected: string) => (error: unknown) => { assert.equal((error as { code?: unknown }).code, expected, String(error)); return true; };

/** A project on a throwaway Home with one workspace the test can authorize and take back. */
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "write-checkers-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "写后检查", actor_id: "web-user" });
  catalog.close();
  const workspace: ProjectWorkspaceRef = { workspace_id: "app", canonical_path: await realpath(home), realpath_verified: true, display_name: "app" };
  let granted: ProjectWorkspaceRef[] = [workspace];
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => granted[0] ?? null, workspacesFor: async () => granted });
  const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  const person: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["projects:settings"] };
  return {
    workspace, person,
    grant(rows: ProjectWorkspaceRef[]) { granted = rows; },
    lists: async () => ((await client.invoke(person, list, {})) as { lists: AgentWriteCheckerList[] }).lists,
    save: (input: unknown, caller: ActionCallContext = person) => client.invoke(caller, save, input as never) as Promise<AgentWriteCheckerList>,
    list: (caller: ActionCallContext) => client.invoke(caller, list, {}),
    async close() { await host.close(); await rm(home, { recursive: true, force: true }); },
  };
}

test("PA-25 the person saves a workspace's checkers from version 1 and changes them against the version read; a stale save keeps the list", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.lists(), [{ workspace_id: "app", version: 0, checkers: [] }]);
    const first = await f.save({ workspace_id: "app", expected_version: 0, checkers: [NODE] });
    assert.deepEqual(first, { workspace_id: "app", version: 1, checkers: [KEPT] }, "the defaults are kept with the list");
    const second = await f.save({ workspace_id: "app", expected_version: 1, checkers: [{ ...NODE, timeout_ms: 5_000 }] });
    assert.equal(second.version, 2);
    await assert.rejects(f.save({ workspace_id: "app", expected_version: 1, checkers: [] }), code("actions.conflict"));
    await assert.rejects(f.save({ workspace_id: "app", checkers: [] }), code("actions.input_invalid"));
    assert.deepEqual(await f.lists(), [second]);
  } finally { await f.close(); }
});

test("PA-25 no model's tool, MCP client, workflow or plugin reads or changes them, nor a person without the settings permission", { timeout: 60_000 }, async () => {
  assert.deepEqual(save.action.audiences, ["user"]);
  assert.deepEqual(save.action.permissions, ["projects:settings"]);
  assert.deepEqual(list.action.audiences, ["user"]);
  const f = await fixture();
  try {
    await f.save({ workspace_id: "app", expected_version: 0, checkers: [NODE] });
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      const caller = { ...f.person, audience };
      await assert.rejects(f.save({ workspace_id: "app", expected_version: 1, checkers: [] }, caller), code("actions.forbidden"), audience);
      await assert.rejects(f.list(caller), code("actions.forbidden"), audience);
    }
    await assert.rejects(f.save({ workspace_id: "app", expected_version: 1, checkers: [] }, { ...f.person, permissions: [] }), code("actions.forbidden"));
    assert.deepEqual(await f.lists(), [{ workspace_id: "app", version: 1, checkers: [KEPT] }]);
  } finally { await f.close(); }
});

test("PA-25 a plugin's own route reaching the Host as the plugin is refused, and a call revoked before the save writes nothing", async () => {
  const handlers = new Map<string, (source: unknown, input: unknown, invocation: unknown) => Promise<unknown>>();
  const saved: unknown[] = [];
  const store: AgentWriteCheckerStore = {
    read: async (_project, workspaceId) => ({ workspace_id: workspaceId, version: 0, checkers: [] }),
    save: async (project, workspaceId, version, checkers) => { saved.push([project, workspaceId, version]); return { workspace_id: workspaceId, version: version + 1, checkers }; },
  };
  const workspace = { workspace_id: "app", canonical_path: "/tmp/app", realpath_verified: true, display_name: "app" };
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler as never); return () => {}; } },
    { agentHost: () => new AgentHost(), projectId: () => "project", authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [] }),
      writeCheckers: async () => ({ workspaces: [workspace], store }) });
  const call = (invocation: Record<string, unknown>) => handlers.get(save.capability_id)!({}, { workspace_id: "app", expected_version: 0, checkers: [NODE] },
    { beforeEffect: async () => {}, assertAuthorityCurrent() {}, ...invocation });
  const plugin = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "install", actor_id: "web-user", assertActive() {}, declaration: { manifest: {} } };
  await assert.rejects(call({ consumer: "plugin", plugin }), code("actions.forbidden"));
  // The wrapper's own check passes; the one right before the save finds the call revoked.
  let checks = 0;
  await assert.rejects(call({ beforeEffect: async () => { if (++checks > 1) throw new Error("revoked"); } }), /revoked/);
  assert.deepEqual(saved, []);
  await call({});
  assert.deepEqual(saved, [["project", "app", 0]]);
});

test("PA-26 a list is saved only for a workspace authorized now with its real path verified, and kept while the authorization is away", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.save({ workspace_id: "elsewhere", expected_version: 0, checkers: [NODE] }), code("agent.directory_unauthorized"));
    f.grant([{ ...f.workspace, realpath_verified: false }]);
    await assert.rejects(f.save({ workspace_id: "app", expected_version: 0, checkers: [NODE] }), code("agent.directory_unauthorized"));
    assert.deepEqual(await f.lists(), []);
    f.grant([f.workspace]);
    await f.save({ workspace_id: "app", expected_version: 0, checkers: [NODE] });
    f.grant([]);
    await assert.rejects(f.save({ workspace_id: "app", expected_version: 1, checkers: [] }), code("agent.directory_unauthorized"));
    assert.deepEqual(await f.lists(), []);
    // Authorized again, the list it had is the one it has.
    f.grant([f.workspace]);
    assert.deepEqual(await f.lists(), [{ workspace_id: "app", version: 1, checkers: [KEPT] }]);
  } finally { await f.close(); }
});

test("PA-28 saving refuses {file} inside other text, twice or missing, grants, environment, an executable with a path, a space or a shell character or one the Host never runs, a time limit outside 1,000–60,000 and a working directory outside the root, with spaces around it, on a drive or in protected metadata", { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const refused: Array<[Record<string, unknown>, string]> = [
      [{ args: ["--file={file}"] }, "agent.write_checker_invalid"],
      [{ args: ["{file}", "{file}"] }, "agent.write_checker_invalid"],
      // A command without the file would check the whole project and call that a diagnosis (§6.0p.9).
      [{ args: ["--noEmit"] }, "agent.write_checker_invalid"],
      [{ grants: { network: true } }, "actions.input_invalid"],
      // The SDK runs a check with no environment of the person's choosing and only a bare name found on the Host's PATH (S-38):
      // either would be kept and then refused each time it runs.
      [{ env_allowlist: ["NODE_OPTIONS"] }, "actions.input_invalid"],
      [{ executable: "/usr/local/bin/node" }, "agent.write_checker_invalid"],
      [{ executable: "node_modules/.bin/eslint" }, "agent.write_checker_invalid"],
      [{ executable: "./node" }, "agent.write_checker_invalid"],
      [{ executable: "tools\\lint.cmd" }, "agent.write_checker_invalid"],
      [{ executable: ".." }, "agent.write_checker_invalid"],
      [{ executable: " " }, "agent.write_checker_invalid"],
      // The SDK's `prepareCommand` refuses whitespace and shell characters in the executable, and its Host never runs `NEVER_RUN`.
      [{ executable: "npx eslint" }, "agent.write_checker_invalid"],
      [{ executable: "npx\u3000eslint" }, "agent.write_checker_invalid"],
      [{ executable: "eslint " }, "agent.write_checker_invalid"],
      [{ executable: "eslint;rm" }, "agent.write_checker_invalid"],
      [{ executable: "$HOME" }, "agent.write_checker_invalid"],
      [{ executable: "rm" }, "agent.write_checker_invalid"],
      [{ executable: "chmod" }, "agent.write_checker_invalid"],
      [{ timeout_ms: 999 }, "actions.input_invalid"],
      [{ timeout_ms: 60_001 }, "actions.input_invalid"],
      [{ applies_to: ["js"] }, "actions.input_invalid"],
      [{ cwd: "../outside" }, "agent.write_checker_invalid"],
      [{ cwd: "tools/../../outside" }, "agent.write_checker_invalid"],
      [{ cwd: "/tmp" }, "agent.write_checker_invalid"],
      [{ cwd: ".git" }, "agent.write_checker_invalid"],
      [{ cwd: "packages/web/node_modules/eslint" }, "agent.write_checker_invalid"],
      [{ cwd: "./.prologue/" }, "agent.write_checker_invalid"],
      // The SDK trims the directory first and refuses a drive: kept as written, these would run elsewhere or not at all.
      [{ cwd: " /etc" }, "agent.write_checker_invalid"],
      [{ cwd: ".git " }, "agent.write_checker_invalid"],
      [{ cwd: "tools " }, "agent.write_checker_invalid"],
      [{ cwd: "C:/x" }, "agent.write_checker_invalid"],
    ];
    for (const [change, expected] of refused) {
      await assert.rejects(f.save({ workspace_id: "app", expected_version: 0, checkers: [{ ...NODE, ...change }] }), code(expected), JSON.stringify(change));
    }
    await assert.rejects(f.save({ workspace_id: "app", expected_version: 0, checkers: [NODE, { ...NODE, display_name: "又一个" }] }), code("agent.write_checker_invalid"));
    assert.deepEqual(await f.lists(), [{ workspace_id: "app", version: 0, checkers: [] }]);
    // A whole {file}, and paths with spaces and `;`, are kept exactly as written: each is one argument, never a shell's.
    const kept = await f.save({ workspace_id: "app", expected_version: 0,
      checkers: [{ ...NODE, args: ["--config", "a b;c.json", "{file}"], cwd: "./tools", timeout_ms: 1_000 }] });
    assert.deepEqual(kept.checkers, [{ ...KEPT, args: ["--config", "a b;c.json", "{file}"], cwd: "tools", timeout_ms: 1_000 }]);
    // Protected metadata is a whole path segment, not a prefix: directories only named like it are kept.
    const alike = [{ ...NODE, checker_id: "workflows", cwd: ".github/workflows" }, { ...NODE, checker_id: "cache", cwd: "node_modules_cache" }];
    assert.deepEqual((await f.save({ workspace_id: "app", expected_version: 1, checkers: alike })).checkers, alike.map(checker => ({ ...KEPT, ...checker })));
  } finally { await f.close(); }
});
