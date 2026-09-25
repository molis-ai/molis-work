import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MolisWorkLocalHost, LocalMcpServer, ensureSystemAgentService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { gitActions } from "@molis-ai/molis-work-plugin-git";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { acquirePrologueStorageOwner } from "../horizontal/agent-host/src/adapters/prologue-storage-owner.js";

const catalog = withMolisWorkProjectCatalog;

test("closing an unused or initializing service cannot leave a runtime alive or resurrect it through ready", async () => {
  const home = await mkdtemp(join(tmpdir(), "system-agents-close-"));
  try {
    for (const initialize of [false, true]) {
      const host = new MolisWorkLocalHost({ homeDirectory: home });
      const service = ensureSystemAgentService(host, home, catalog);
      const starting = initialize ? service.ready : Promise.resolve();
      await host.close(); await starting;
      await assert.rejects(service.ready, /已关闭/);
      if (!initialize) await assert.rejects(access(join(home, "agent-runtime")), { code: "ENOENT" });
      else { const release = acquirePrologueStorageOwner(join(home, "agent-runtime")); release(); }
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("MCP composes a lazy Host-owned review service before Web; later Web approves the same real Git operation and closing surfaces preserves it", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "system-agents-")), directory = join(home, "repo");
  await mkdir(directory);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });
  git("init", "-q", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  await writeFile(join(directory, "note"), "before\n"); git("add", "."); git("commit", "-qm", "base");
  await writeFile(join(directory, "note"), "after\n");
  const project = await catalog({ homeDirectory: home }, async c => {
    const project = await c.createProject({ display_name: "Headless Git", actor_id: "web-user" });
    c.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
    c.addWorkspaceProject({ project_id: project.project_id, canonical_path: directory, actor_id: "web-user", user_confirmed: true });
    return project;
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: id => catalog({ homeDirectory: home }, c => c.listWorkspaceDirectory(id)) });
  const mcp = new LocalMcpServer(catalog, "runtime", { projectId: project.project_id, boardId: project.board_id,
    databasePath: project.database_path, webBaseUrl: "http://127.0.0.1:4173" },
    { homeDirectory: home, runtimeContext: { runtime_id: "fixture", stable_work_context_id: null, host_declares_stable: false } }, host);
  const service = ensureSystemAgentService(host, home, catalog);
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const token = "system-agent-fixture-control-token-0123456789";
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  const stopWeb = async () => { if (server) { const current = server; server = undefined; await new Promise<void>((resolve, reject) => current.close(error => error ? reject(error) : resolve())); } };
  const prepare = async () => {
    const workspace_id = (await actions.invoke(gitActions.state, {})).workspace.workspace_id;
    const selected = await actions.invoke(gitActions.selectDiff, { workspace_id, path: ["note"], side: "worktree" });
    assert.equal(selected.result.outcome, "diff");
    if (selected.result.outcome !== "diff") throw new Error("Expected real Git diff");
    return actions.invoke(gitActions.prepareIndex, { workspace_id, path: ["note"], action: "stage", revision: selected.result.revision, operation_id: randomUUID() });
  };
  try {
    assert.equal(ensureSystemAgentService(host, home, catalog), service);
    assert.throws(() => ensureSystemAgentService(host, home + "-other", catalog), { code: "actions.home_mismatch" });
    await actions.discover();
    await assert.rejects(access(join(home, "agent-runtime")), { code: "ENOENT" }, "discovery must not initialize runtime storage");
    const first = await prepare(); // no Web server has existed
    assert.equal(service.agentHost.reviews.receipt(first.review_id)?.status, "pending");
    assert.equal(git("show", ":note"), "before\n");
    const probe = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/agent-storage-owner.ts", import.meta.url)), home, project.board_id], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const exited = once(probe, "exit");
    try {
      const [message] = await Promise.race([once(probe, "message"), exited.then(() => { throw new Error("Probe exited without a result"); })]);
      assert.deepEqual(message, { code: "agent.storage_busy" });
      await exited;
    } finally { if (probe.exitCode === null && probe.signalCode === null) { probe.kill("SIGKILL"); await exited; } }
    await service.agentHost.reviews.refresh(project.board_id);
    assert.equal(service.agentHost.reviews.receipt(first.review_id)?.status, "pending", "another process must not cancel this owner's live review");
    server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token, localHost: host });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const base = `/projects/${project.project_id}/api/agent/reviews`;
    const listed = await fetch(origin + base, { headers: { "x-molis-work-control-token": token } });
    assert.equal(listed.status, 200); assert.ok((await listed.json() as any).reviews.some((row: any) => row.request.review_id === first.review_id));
    const decided = await fetch(origin + base + "/decide", { method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify({ review_id: first.review_id, decision: "approve" }) });
    assert.equal(decided.status, 200, await decided.text());
    assert.equal(git("show", ":note"), "after\n");
    assert.equal((await actions.invoke(gitActions.results, {})).results[0]?.result.outcome, "succeeded");
    await writeFile(join(directory, "note"), "later\n");
    const pending = await prepare();
    await stopWeb(); await mcp.close();
    assert.equal(service.agentHost.reviews.receipt(pending.review_id)?.status, "pending", "borrowed transports cannot dispose the Host service");
    await service.agentHost.reviews.respond({ review_id: pending.review_id, decision: "approve", actor_id: "web-user" });
    assert.equal(git("show", ":note"), "later\n");
    await writeFile(join(directory, "note"), "never staged\n");
    const abandoned = await prepare();
    const close = host.close(); assert.equal(host.close(), close); await close;
    assert.equal(service.agentHost.reviews.receipt(abandoned.review_id)?.status, "cancelled");
    await assert.rejects(service.ready, /已关闭/);
    assert.throws(() => ensureSystemAgentService(host, home, catalog), { code: "host.closed" });
    const reopened = new MolisWorkLocalHost({ homeDirectory: home });
    try {
      const next = ensureSystemAgentService(reopened, home, catalog); await next.ready;
      await next.agentHost.reviews.refresh(project.board_id);
      assert.equal(next.agentHost.reviews.receipt(first.review_id)?.effect_settled, true);
      assert.equal(next.agentHost.reviews.receipt(abandoned.review_id)?.status, "cancelled");
      assert.equal(git("show", ":note"), "later\n");
    } finally { await reopened.close(); }
  } finally { await stopWeb(); await mcp.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("another process cannot recover the active SDK owner; ownership is released by process death", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-owner-process-"));
  const script = fileURLToPath(new URL("./fixtures/agent-storage-owner.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", script, home], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let errors = ""; child.stderr?.on("data", data => { errors += String(data); });
  try {
    const ready = await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error(errors); })]);
    assert.deepEqual(ready[0], { ready: true });
    const host = new MolisWorkLocalHost({ homeDirectory: home });
    try {
      const service = ensureSystemAgentService(host, home, catalog);
      await assert.rejects(service.ready, { code: "agent.storage_busy" });
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
      await service.ready; // failed lazy acquisition must be retryable
      assert.equal(service.agentHost.adapter("prologue").descriptor.runtime_id, "prologue");
    } finally { await host.close(); }
    const release = acquirePrologueStorageOwner(join(home, "agent-runtime")); release(); release();
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited; }
    await rm(home, { recursive: true, force: true });
  }
});
