import { fakeWriterActions, pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectDirectoryActions, type ProjectDirectories, type ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

/** The project's folders as `projects.directories.get@1` answers them: the first is the output, the others inputs. */
function folders(rows: ReadonlyArray<{ workspace_id: string; canonical_path: string }>): ProjectDirectories {
  const directories = rows.map((row, i): ProjectDirectory => ({ ...row, realpath_verified: true, display_name: row.workspace_id, roles: [i === 0 ? "output" : "input"], state: "ok" }));
  return { project_id: DEMO_PROJECT_ID, directories, source_links: [], revision: "directories-1" };
}

test("parallel assignment routes retain drafts, freeze trusted roots and task bodies, and reject revoked or foreign directories before execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-assignment-http-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  await codingSessions(store).create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "并行分工", runtime_id: "prologue", at: new Date().toISOString() });
  const roots = ["main", "writer-a", "writer-b", "foreign"].map(id => ({ workspace_id: id, canonical_path: join(root, id), realpath_verified: true }));
  // The project has its output; the writers' worktrees are the Host's own, listed by their `worktree_id`, never folders of the project (plan A).
  const grants = folders([roots[0]!, roots[3]!]);
  const worktrees = roots.slice(1, 3).map((grant, i) => ({ worktree_id: grant.workspace_id, canonical_path: grant.canonical_path, branch: `writer/${i}`, base_commit: "abc123" }));
  let owned = worktrees.slice();
  const starts: AgentStartRequest[] = []; let created = 0;
  // The writer directories the Host lists under the main workspace; the other writer actions are not asked here.
  const writerActions = fakeWriterActions(pluginActions(store, DEMO_PROJECT_ID), (definition, input) => {
    if (definition.capability_id !== writerDirectoryCapabilities.list.capability_id) throw new Error(`Unexpected action ${definition.capability_id}`);
    assert.equal((input as { workspace_id: string }).workspace_id, "main");
    return structuredClone(owned);
  });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: writerActions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectDirectoryActions.get.capability_id) return grants as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return ["reader", "writers"].map(role_id => ({ role_id, available: true })) as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: "sdk" } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: `run-${starts.length}` } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host(), [], [projectDirectoryActions.get])).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const assignments = [{ worktree_id: "writer-a", task: "  修复税率\n保留零值  " }, { worktree_id: "writer-b", task: "补运输边界与测试" }];
  const start = (writer_assignments: unknown, extra = {}) => request("/runs", "POST", { task: "按分工修改并报告，不整合。", intent: "parallel", workspace_id: "main", provider_id: "p", model_id: "m", writer_assignments, ...extra });
  const configuration = { intent: "parallel", workspace_id: "main", provider_id: "p", model_id: "m", writer_assignments: assignments };
  try {
    // A folder of the project (an input, or the output itself) is not a worktree the Host made; an old split naming `workspace_id` is not read.
    for (const invalid of [[], undefined, [{ worktree_id: "writer-a", task: " " }], [...assignments, assignments[0]], [{ worktree_id: "foreign", task: "越界" }], [{ worktree_id: "main", task: "父目录" }],
      [{ worktree_id: "../../escape", task: "逃逸" }], [{ worktree_id: "writer-a", task: "长".repeat(8001) }], [{ workspace_id: "writer-a", task: "旧版本的分工" }]]) {
      assert.equal((await start(invalid)).status, 400, JSON.stringify(invalid));
    }
    assert.equal(created, 0); assert.equal(starts.length, 0);
    assert.equal((await request("", "PATCH", { draft: "主任务草稿", configuration,expected_input_revision:0 })).status, 200);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    const restored = (await request()).body; assert.deepEqual(restored.configuration, configuration); assert.equal(restored.draft, "主任务草稿");
    // A worktree the Host no longer lists (removed, or its branch switched by hand) takes no work; whether a listed one is still the Host's is
    // checked again by agent-host when the round starts (tests/prologue-writer-authority.test.ts).
    owned = worktrees.slice(0, 1);
    assert.equal((await start(assignments)).status, 400); assert.equal(created, 0);
    owned = [worktrees[0]!, { ...worktrees[1]!, problem: "分支被手动切换" }];
    assert.equal((await start(assignments)).status, 400); assert.equal(created, 0);
    owned = worktrees.slice();
    const accepted = await start(assignments.map(row => ({ ...row, directory: "/forged", branch: "forged", base_commit: "forged" })));
    assert.equal(accepted.status, 200, JSON.stringify(accepted)); assert.equal(created, 1); assert.equal(starts.length, 1);
    const frozen = structuredClone(starts[0]); assert.equal(frozen!.role_id, "writers");
    assert.deepEqual(frozen!.subagent_workspaces, worktrees.map(({ worktree_id, canonical_path }) => ({ worktree_id, directory: { canonical_path, realpath_verified: true } })));
    const tasks = JSON.parse(frozen!.task.slice(frozen!.task.indexOf("[\n")));
    assert.equal(tasks[0].task, assignments[0]!.task); assert.equal(tasks[0].directory, roots[1]!.canonical_path); assert.equal(tasks[0].branch, "writer/0"); assert.equal(tasks[0].base_commit, "abc123");
    assert.ok(!frozen!.task.includes("forged"));
    assert.equal((await request("", "PATCH", { configuration: { ...configuration, writer_assignments: [] } })).status, 200);
    assert.deepEqual(starts[0], frozen, "saving the next draft cannot rewrite an accepted start");
    assert.equal((await start(assignments, { intent: "discuss" })).status, 400);
    // Stay below the HTTP byte limit so this exercises the composed task's character limit.
    const tooLong = await start(assignments, { task: "x".repeat(99_999) });
    assert.equal(tooLong.status, 400);
    assert.match(JSON.stringify(tooLong.body), /总任务与分工合计超过 100000 字符/u);
    assert.equal(starts.length, 1);
    assert.equal((await request("", "PATCH", { configuration: { ...configuration, writer_assignments: [{ worktree_id: "writer-a", task: "" }] } })).status, 200, "incomplete drafts are retained without starting");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.equal((await request()).body.configuration.writer_assignments[0].task, ""); assert.equal(starts.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("CODING-WORKTREE-01..04 a session pointed at one of the Host's worktrees runs its next rounds there; without it they run in the output; a worktree that is gone is refused, never swapped for the output", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-worktree-use-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  await codingSessions(store).create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "独立工作树", runtime_id: "prologue", at: new Date().toISOString() });
  const output = { workspace_id: "main", canonical_path: join(root, "main") }, notes = { workspace_id: "notes", canonical_path: join(root, "notes") };
  // The Host's worktree of the output, named by its own id; it is not a folder of the project (plan A).
  const tree = { worktree_id: "writer-0123456789abcdef01234567", canonical_path: join(root, ".molis-work-writers", "x", "writer-0123456789abcdef01234567"), branch: "molis-writer/a", base_commit: "abc123" };
  let owned: Array<typeof tree & { problem?: string }> = [tree];
  const starts: AgentStartRequest[] = [], sessions: unknown[] = [], listed: unknown[] = [];
  const writerActions = fakeWriterActions(pluginActions(store, DEMO_PROJECT_ID), (definition, input) => {
    if (definition.capability_id !== writerDirectoryCapabilities.list.capability_id) throw new Error(`Unexpected action ${definition.capability_id}`);
    listed.push(input);
    return structuredClone(owned);
  });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: writerActions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectDirectoryActions.get.capability_id) return folders([output, notes]) as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return ["reader", "writers"].map(role_id => ({ role_id, available: true })) as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { sessions.push(structuredClone((args as any[])[1].directory)); return { runtime_id: "prologue", session_id: "sdk" } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: `run-${starts.length}` } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host(), [], [projectDirectoryActions.get])).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const start = (extra = {}) => request("/runs", "POST", { task: "看一下这个目录", intent: "discuss", workspace_id: "main", provider_id: "p", model_id: "m", ...extra });
  const where = (index: number) => starts[index]?.directory?.canonical_path;
  try {
    // CODING-WORKTREE-02: a round the session was not pointed at a worktree for runs in the output, as before; no worktree is looked up.
    assert.equal((await start()).status, 200);
    assert.equal(where(0), output.canonical_path); assert.deepEqual(listed, []);
    // CODING-WORKTREE-01: the session remembers the worktree by its id (the path only says where), and its next rounds run there.
    const configuration = { intent: "discuss", workspace_id: "main", provider_id: "p", model_id: "m", worktree: { worktree_id: tree.worktree_id, canonical_path: tree.canonical_path } };
    assert.equal((await request("", "PATCH", { configuration, expected_input_revision: 0 })).status, 200);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.configuration, configuration);
    const accepted = await start({ worktree_id: tree.worktree_id });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(where(1), tree.canonical_path, "the round runs in the Host's worktree");
    assert.deepEqual(listed, [{ workspace_id: "main" }], "found among the Host's worktrees of the session's folder");
    // A saved worktree with anything besides its id and path is not read.
    assert.equal((await request("", "PATCH", { configuration: { ...configuration, worktree: { ...configuration.worktree, workspace_id: "main" } } })).status, 400);
    // CODING-WORKTREE-03: once the worktree is gone (integrated and removed), or no longer the Host's as it was made, the round is refused, never run in the output instead.
    for (const now of [[], [{ ...tree, problem: "分支被手动切换" }]]) {
      owned = now;
      const refused = await start({ worktree_id: tree.worktree_id });
      assert.equal(refused.status, 400); assert.match(JSON.stringify(refused.body), /独立工作树已不在.*换回输出目录/u);
    }
    assert.equal(starts.length, 2, "nothing started in its place");
    owned = [tree];
    // Parallel writers split from the folder itself: a session in a worktree switches back first.
    const parallel = await start({ worktree_id: tree.worktree_id, intent: "parallel", writer_assignments: [{ worktree_id: tree.worktree_id, task: "补测试" }] });
    assert.equal(parallel.status, 400); assert.match(JSON.stringify(parallel.body), /换回输出目录/u);
    // Switching back is choosing the folder again: the round runs in the output.
    assert.equal((await start()).status, 200); assert.equal(where(2), output.canonical_path);
    // CODING-WORKTREE-04: a folder that is only an input stays one; the Host refuses the round there (tests/security-invariants-directory-output-only.test.ts).
    assert.deepEqual(sessions, [{ canonical_path: output.canonical_path, realpath_verified: true }]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
