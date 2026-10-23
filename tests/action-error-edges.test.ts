import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { randomUUID } from "node:crypto";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { handleHomeDockJudgmentHttp, LocalMcpServer, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { actionMcpToolName, createActionMcpPorts, handleMcpMessage, molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import {
  ActionError,
  bindActionClient,
  type ActionCallContext,
  type ActionClient,
  type BoundActionClient,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import {
  TODO_ACTION_PERMISSIONS,
  createTodoActionHandlers,
  openTodoStore,
  todoActions,
  todoManifest,
  ownTodoStores,
} from "@molis-ai/molis-work-plugin-todo";
import { PLACEMENT_LEDGER_ACCESS, PlacementService } from "@molis-ai/molis-work-service-placement";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { serveNativeHttp } from "./fixtures/native-http.js";

// specs/repository-anti-corruption W3-02-A. Todo's failures used to be a class of their own (`TodoError extends Error`: a code on a plain Error, not an
// ActionError), so a Host edge that branches on `instanceof ActionError` answered them as "some other error". Todo raises ActionErrors now (`todoErrors`).
// Not every such edge saw a TodoError on origin/main, though: Todo's subject reader (`todo.search.subject`) already raised `new ActionError("todo.not_found")`.
// So each test below says which kind it is. Changed by this slice (each fails when Todo's errors are put back to the origin/main shape): the MCP action port,
// the Host's own MCP server, the Home dock's execute route, and the move that placement asks Todo to make. Unchanged, pinned because the slice rewrote the
// errors it reads: placement's read of a Todo that is gone. (The edges that read a failure by shape, such as the action
// gateway, did not change and have no test here.)

function todoHost(t: { after(fn: () => void): void }) {
  const home = mkdtempSync(join(tmpdir(), "action-error-edges-"));
  const store = openTodoStore(home);
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ ...ownTodoStores(run => run(store)) }) });
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const caller = (audience: ActionCallContext["audience"], project_id: string | null = null): ActionCallContext =>
    ({ actor_id: audience === "user" ? "web-user" : "mcp-client", project_id, audience, permissions: TODO_ACTION_PERMISSIONS });
  return { service, store, caller, person: bindActionClient(service, () => caller("user")) };
}

test("MCP action port: a Todo failure comes out as its own code and message, not as the generic 能力执行失败", async t => {
  // origin/main: TodoError was not an ActionError, so action-tools.ts answered { code: "actions.execution_failed", message: "能力执行失败" }.
  const { service, caller, person } = todoHost(t);
  const ports = createActionMcpPorts({ service, context: () => caller("mcp"), serverInfo: { name: "todo-edge", version: "1" } });
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = await handleMcpMessage({ id: 1, method: "tools/call", params: { name, arguments: args } }, ports);
    const result = reply!.result as { isError: boolean; content: Array<{ text: string }> };
    return { isError: result.isError, ...(result.isError ? JSON.parse(result.content[0]!.text) as { code: string; error: string } : {}) };
  };
  const missing = await call(actionMcpToolName(todoActions.get), { id: "no-such-todo" });
  assert.deepEqual(missing, { isError: true, code: "todo.not_found", error: "找不到这件待办，可能已被删除" });
  const created = await person.invoke(todoActions.create, { title: "写周报" });
  const stale = await call(actionMcpToolName(todoActions.update), { id: created.item.id, expected_revision: created.item.revision + 5, title: "改过的标题" });
  assert.deepEqual([stale.isError, stale.code], [true, "todo.conflict"]);
});

test("the Host's own MCP server: a Todo failure carries its code line", async t => {
  // origin/main: formatMcpToolError (mcp-server.ts) wrote only `错误: <message>` for a TodoError, because it was neither an ActionError nor one of the
  // Host's other error classes; an ActionError adds the code line the caller can branch on.
  const home = mkdtempSync(join(tmpdir(), "action-error-edges-mcp-"));
  const token = "action-error-edges-control-token";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "待办 MCP", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const web = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  let external: LocalMcpServer | undefined;
  t.after(async () => {
    await external?.close();
    await new Promise<void>(resolve => web.close(() => resolve()));
    await host.close();
    catalog.close();
    rmSync(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
  const address = web.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const grant = await fetch(`${origin}/api/settings/mcp/actions`, { method: "POST", headers: { origin, "content-type": "application/json",
    "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
  body: JSON.stringify({ client_id: "runtime:external", project_id: null, capability_id: todoActions.get.capability_id, version: 1,
    provider_id: todoManifest.plugin_id, enabled: true }) });
  assert.equal(grant.status, 200, await grant.clone().text());
  external = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: origin },
    { homeDirectory: home, runtimeContext: { runtime_id: "external", stable_work_context_id: null, host_declares_stable: false } }, host);
  const reply = await external.handleMessage({ id: 1, method: "tools/call", params: { name: molisWorkActionToolName(todoActions.get), arguments: { id: "no-such-todo" } } }) as
    { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(reply.result.isError, true, JSON.stringify(reply));
  // W3-02-H-01: one JSON error body; only the actual recorded read has a diagnostic number.
  const line = JSON.parse(reply.result.content[0]!.text) as { error: string; code: string; call_id?: string };
  assert.equal(line.error, "找不到这件待办，可能已被删除");
  assert.deepEqual(Object.keys(line), ["error", "code", "call_id"]);
  assert.equal(line.code, "todo.not_found");
  assert.match(line.call_id ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(host.callLog!.find(line.call_id!)[0]?.code, "todo.not_found", "the number finds the row of the failed read");
});

test("W3-02-G1-03 Home dock execute preserves the Todo owner's not_found kind and answers 404", async t => {
  // The actual Todo reader refuses a deleted object; the common HTTP exit preserves its code and message.
  const { person } = todoHost(t);
  const failing: BoundActionClient = { discover: async () => [], invoke: async () => await person.invoke(todoActions.get, { id: "no-such-todo" }) as never };
  const server = await serveNativeHttp((request, response, url) => handleHomeDockJudgmentHttp(request, response, url, { actions: failing, invalidateWebView: () => undefined }));
  try {
    const execute = await server.post("/api/home/actions/execute", "{}");
    assert.deepEqual([execute.status, execute.body.code, execute.body.error], [404, "todo.not_found", "找不到这件待办，可能已被删除"]);
  } finally { await server.close(); }
});

function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never, transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

/** The placement service over a Todo-only action client, with an in-memory ledger. */
function placementOver(t: { after(fn: () => void): void }, client: ActionClient): PlacementService {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const titles = new Map<string, string>();
  return new PlacementService({
    ledger: createContextLedger(ledgerDatabase(db), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id }),
    spaces: async () => [{ project_id: "personal", title: "个人空间", kind: "personal" }, { project_id: "q4", title: "Q4 新版发布", kind: "project" }],
    scope: async projectId => ({ client, caller: { actor_id: "web-user", project_id: projectId, audience: "user", permissions: TODO_ACTION_PERMISSIONS } }),
    titles: { get: (kind, id) => titles.get(`${kind}:${id}`) ?? null, set: (kind, id, title) => { titles.set(`${kind}:${id}`, title); } },
  });
}
const todoRef = (id: string) => ({ kind: "todo_item", id, project_id: null });

test("placement: a Todo that is gone or archived reads as 原对象已删除 (the owner's not_found), not as 暂时读不到 (unchanged by W3-02-A)", async t => {
  // UNCHANGED. Placement tells "deleted" from "unreadable" by whether the owner's reader raised an ActionError ending in `.not_found`. Todo's reader
  // (`todo.search.subject`) raised `new ActionError("todo.not_found", ...)` on origin/main already, for a todo that was deleted and for one that is archived,
  // so this test passes there too: the describe is `missing`, and a move refuses with `placement.missing`. It is pinned because the slice rewrote that
  // reader's error (`todoErrors.not_found`): were the reader to stop raising an ActionError, a deleted todo would read as `unavailable` here.
  const { service, person } = todoHost(t);
  const placement = placementOver(t, service);
  const live = (await person.invoke(todoActions.create, { title: "发布后回访五位用户" })).item;
  const alive = await placement.describe(todoRef(live.id));
  assert.deepEqual([alive.state, alive.title, alive.can.move], ["ok", "发布后回访五位用户", true]);

  const archived = (await person.invoke(todoActions.create, { title: "已经做完的事" })).item;
  const done = (await person.invoke(todoActions.status, { id: archived.id, status: "done" })).item;
  await person.invoke(todoActions.archive, { id: archived.id, expected_revision: done.revision, archived: true });
  const removed = (await person.invoke(todoActions.create, { title: "删掉的事" })).item;
  await person.invoke(todoActions.remove, { id: removed.id });
  for (const gone of [archived, removed]) {
    const described = await placement.describe(todoRef(gone.id));
    assert.deepEqual([described.state, described.reason], ["missing", "原对象已删除"], gone.title);
    await assert.rejects(placement.move(todoRef(gone.id), "q4"), { code: "placement.missing", message: "原对象已删除" }, gone.title);
  }
});

test("placement: a Todo deleted between the read and the move is the owner's not_found, an ActionError, not a plain Error", async t => {
  // CHANGED. origin/main: `todo.placement.move` raised TodoError (an Error with a code, not an ActionError) for a todo that had gone, so
  // PlacementService.move rejected with a plain Error and handlePlacementHttp answered 500 `placement.failed`. It is `new ActionError("todo.not_found")`
  // now, which handlePlacementHttp answers 409 with that code (any ActionError but actions.forbidden and actions.input_invalid is 409). The race is made
  // by a client that removes the todo just before it forwards the first `todo.placement.move`, after placement's own read has found it.
  const { service, person } = todoHost(t);
  let racing = true;
  const client: ActionClient = {
    discover: caller => service.discover(caller),
    invoke: async (caller, reference, input) => {
      if (racing && reference.capability_id === todoActions.move.capability_id) {
        racing = false;
        await person.invoke(todoActions.remove, { id: (input as { subject: { id: string } }).subject.id });
      }
      return await service.invoke(caller, reference, input);
    },
  };
  const placement = placementOver(t, client);
  const item = (await person.invoke(todoActions.create, { title: "读到之后被删掉" })).item;
  assert.equal((await placement.describe(todoRef(item.id))).state, "ok");
  await assert.rejects(placement.move(todoRef(item.id), "q4"), (error: unknown) => {
    assert.ok(error instanceof ActionError, `an ActionError, got ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    assert.deepEqual([error.code, error.kind, error.message], ["todo.not_found", "not_found", "找不到这件待办，可能已被删除"]);
    return true;
  });
  assert.equal(racing, false, "the move was reached after the read found the todo");
  assert.equal((await placement.describe(todoRef(item.id))).state, "missing");
});
