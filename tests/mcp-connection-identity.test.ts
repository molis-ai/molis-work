import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { MCP_TOOLS } from "@molis-ai/molis-work-app-mcp";

/**
 * The five connection tools (bind, unbind, reject a suggestion, create and bind, delete a project) name no actor: the Host
 * records the MCP client and the Runtime Session of the call (repository-anti-corruption §1, 2026-10-07), and a caller that
 * still sends an `actor_id` is told so and changes nothing.
 */
const FIVE = ["molis_work_v1_context_bind", "molis_work_v1_context_unbind", "molis_work_v1_context_reject_suggestion",
  "molis_work_v1_context_create_and_bind", "molis_work_v1_project_delete"];
type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
type Reply = { isError: boolean; content: Array<{ text: string }> };

async function fixture(t: TestContext, session: string | null = "identity-session") {
  const directory = await mkdtemp(join(tmpdir(), "molis-mcp-connection-identity-"));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const host = { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: session, host_declares_stable: session !== null } };
  const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, host);
  t.after(async () => { await server.close(); catalog.close(); await rm(directory, { recursive: true, force: true }); });
  const call = async (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) => (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } }) as { result: Reply }).result;
  return { directory, home, catalog, host, server, call };
}
const bindingActors = (catalog: Catalog, context: Parameters<Catalog["listRuntimeContextBindingEvents"]>[0]) => catalog.listRuntimeContextBindingEvents(context).map(event => [event.type, event.actor_id]);

test("none of the five connection tools lists or requires an actor", () => {
  const tools = FIVE.map(name => MCP_TOOLS.find(tool => tool.name === name));
  for (const [index, tool] of tools.entries()) {
    assert.ok(tool, FIVE[index]);
    const schema = tool.inputSchema as { properties: Record<string, unknown>; required: string[] };
    assert.equal(Object.hasOwn(schema.properties, "actor_id"), false, `${tool.name} lists no actor_id`);
    assert.equal(schema.required.includes("actor_id"), false, `${tool.name} does not require one`);
  }
});

test("a connection tool that is sent an actor refuses it and changes nothing", async t => {
  const { home, catalog, host, call } = await fixture(t);
  const project = await catalog.createProject({ display_name: "已有的项目", actor_id: "test-user" });
  const arguments_: Record<string, Record<string, unknown>> = {
    molis_work_v1_context_bind: { project_id: project.project_id, user_confirmed: true },
    molis_work_v1_context_unbind: { user_confirmed: true },
    molis_work_v1_context_reject_suggestion: { project_id: project.project_id, user_confirmed: true },
    molis_work_v1_context_create_and_bind: { display_name: "不该建出来", user_confirmed: true, idempotency_key: "refused-create" },
    molis_work_v1_project_delete: { project_id: project.project_id, delete_confirmed: true, idempotency_key: "refused-delete" },
  };
  for (const name of FIVE) {
    for (const field of ["actor_id", "audit_actor_id"]) {
      const reply = await call(name, { ...arguments_[name], [field]: "web-user" });
      assert.equal(reply.isError, true, `${name} with ${field}`);
      assert.match(reply.content[0]?.text ?? "", /mcp\.unexpected_field/);
      assert.match(reply.content[0]?.text ?? "", new RegExp(field));
    }
  }
  assert.deepEqual(catalog.listProjects().map(item => item.project_id), [project.project_id], "no project was made or deleted");
  assert.equal(existsSync(project.database_path), true);
  assert.deepEqual(catalog.listProjectDeletions(), []);
  assert.deepEqual(catalog.listRuntimeContextBindings(), [], "nothing was bound");
  // The same calls without an actor are the ones that work.
  const bound = await call("molis_work_v1_context_bind", arguments_.molis_work_v1_context_bind!);
  assert.equal(bound.isError, false, bound.content[0]?.text);
  assert.deepEqual(bindingActors(catalog, host.runtimeContext), [["context.bound", "runtime:codex:identity-session"]]);
  assert.ok(home);
});

test("what the Host records is the MCP client and the Runtime Session of the call", async t => {
  const { catalog, host, call } = await fixture(t);
  const project = await catalog.createProject({ display_name: "已有的项目", actor_id: "test-user" });

  assert.equal((await call("molis_work_v1_context_bind", { project_id: project.project_id, user_confirmed: true })).isError, false);
  assert.equal((await call("molis_work_v1_context_unbind", { user_confirmed: true })).isError, false);
  assert.deepEqual(bindingActors(catalog, host.runtimeContext), [["context.bound", "runtime:codex:identity-session"], ["context.unbound", "runtime:codex:identity-session"]]);

  // A host that says which Session each call is made in (the `_meta` of the call) is recorded by that Session.
  const created = await call("molis_work_v1_context_create_and_bind", { display_name: "新建的项目", user_confirmed: true, idempotency_key: "identity-create" }, { "molis-work/sessionId": "per-call-session" });
  assert.equal(created.isError, false, created.content[0]?.text);
  const createdId = (JSON.parse(created.content[0]!.text) as { connection: { project_id: string } }).connection.project_id;
  assert.equal(catalog.getProject(createdId).display_name, "新建的项目");
  const perCall = catalog.listRuntimeContextBindingEvents({ ...host.runtimeContext, stable_work_context_id: "per-call-session" });
  assert.deepEqual(perCall.map(event => [event.type, event.actor_id]), [["context.bound", "runtime:codex:per-call-session"]]);

  const deleted = await call("molis_work_v1_project_delete", { project_id: createdId, delete_confirmed: true, idempotency_key: "identity-delete" }, { "molis-work/sessionId": "per-call-session" });
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  assert.equal((JSON.parse(deleted.content[0]!.text) as { deletion: { actor_id: string } }).deletion.actor_id, "runtime:codex:per-call-session");
});

test("a Runtime that names no Session is recorded as the client alone, and a host with no Runtime id is refused", async t => {
  const { catalog, call } = await fixture(t, null);
  const project = await catalog.createProject({ display_name: "已有的项目", actor_id: "test-user" });
  const deleted = await call("molis_work_v1_project_delete", { project_id: project.project_id, delete_confirmed: true, idempotency_key: "client-only-delete" });
  assert.equal(deleted.isError, false, deleted.content[0]?.text);
  assert.equal((JSON.parse(deleted.content[0]!.text) as { deletion: { actor_id: string } }).deletion.actor_id, "runtime:codex");

  const directory = await mkdtemp(join(tmpdir(), "molis-mcp-connection-identity-noid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nameless = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, { homeDirectory: join(directory, "home"), runtimeContext: { runtime_id: " ", stable_work_context_id: "s", host_declares_stable: true } });
  t.after(() => nameless.close());
  const reply = (await nameless.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "molis_work_v1_project_delete", arguments: { project_id: "x", delete_confirmed: true, idempotency_key: "k" } } }) as { result: Reply }).result;
  assert.equal(reply.isError, true);
});

test("the Skill and the MCP manual tell a Runtime to send no actor to the connection tools", () => {
  const skill = readFileSync(join(process.cwd(), "skills/goal-advance/references/project-connection.md"), "utf8");
  const overview = readFileSync(join(process.cwd(), "skills/goal-advance/SKILL.md"), "utf8");
  const manual = readFileSync(join(process.cwd(), "docs/mcp.md"), "utf8");
  const manualEnglish = readFileSync(join(process.cwd(), "docs/mcp.en.md"), "utf8");
  for (const [name, text] of [["project-connection.md", skill], ["SKILL.md", overview]] as const) {
    assert.doesNotMatch(text, /current Runtime actor_id/, name);
    assert.doesNotMatch(text, /retain their explicit identity fields/, name);
    assert.doesNotMatch(text, /display_name, actor_id/, name);
  }
  assert.match(skill, /no actor_id/);
  assert.match(manual, /连接工具[^\n]*不收 `actor_id`/);
  assert.match(manualEnglish, /connection tools[^\n]*take no `actor_id`/);
});
