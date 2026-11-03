import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { ActionDefinition, ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMcpServerView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AssistantStore, assistantSurroundings, repositoryName } from "@molis-ai/molis-work-app-local-host";
import { EXECUTOR_MODES, roleViews } from "./fixtures/work-executor-fake.js";

// specs/visual-ui-experience VUX-08/09, the user's 2026-10-20 decision ②: the Assistant's 工作环境 and 连接与工具 are read
// from each owner's own public read, as the person, when the panel asks; nothing is kept. These are those owners' reads,
// answering in their contracts' shapes.
const view = (capability_id: string, provider: string, available = true, reason = ""): ActionView => ({ capability_id, version: 1,
  provider: { provider_id: provider, title: provider === "system.connectors" ? "连接" : provider },
  action: { title: capability_id, audiences: ["user", "agent"] }, availability: available ? { available: true } : { available: false, code: "x", reason } }) as ActionView;

/** An owner's answers, carried by the person's bound client as an executor plugin's reads are. */
const bound = (owner: { discover(): Promise<readonly ActionView[]>; invoke(reference: { capability_id: string }, input: unknown): Promise<unknown> }): BoundActionClient =>
  ({ discover: owner.discover, invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => await owner.invoke(definition, input) as Output });

const mcp = (id: string, label: string, health: AgentMcpServerView["health"], tools: string[]): AgentMcpServerView => ({ id, version: 1, label, enabled: true, transport: "stdio",
  timeout_ms: 1000, credential: "none", health, tools: tools.map(tool => ({ server: id, tool, version: "1", description: "" })), resources: [] });

const EXECUTOR = "io.molis.work.fixture-agent";

function owners() {
  const calls: string[] = [];
  const executor = {
    discover: async () => [...roleViews(EXECUTOR, "样例 Agent", "fixture_session"), view("projects.workspace.git.inspect", "system.projects")],
    invoke: async (reference: { capability_id: string }, input: unknown) => {
      calls.push(reference.capability_id);
      if (reference.capability_id === `${EXECUTOR}.session.read`) return { session_id: (input as { session_id: string }).session_id, title: "会话", mode: null, runs: [], runtime_session_id: null, recovery: null, workspace_id: "w-1",
        mcp_tools: [{ server: "gh", tool: "list_issues", version: "1" }, { server: "gh", tool: "close_issue", version: "1" }, { server: "lin", tool: "create_issue", version: "1", server_label: "Linear" }] };
      if (reference.capability_id === `${EXECUTOR}.state`) return { modes: EXECUTOR_MODES, default_mode: "execute", images: false, workspace_id: "w-0",
        workspaces: [{ workspace_id: "w-0", name: "other", path: "/work/other" }, { workspace_id: "w-1", name: "molis", path: "/work/molis" }],
        mcp: [mcp("gh", "GitHub MCP", "connected", ["list_issues"]), mcp("lin", "Linear MCP", "disconnected", ["create_issue"])] };
      return { outcome: "summary", branch: "feature/env", head_commit: "abc", upstream: "origin/feature/env", ahead: 2, behind: 1, branches: [], merging: false, revision: "r",
        remotes: [{ name: "upstream", url: "git@github.com:other/fork.git" }, { name: "origin", url: "https://someone:ghp_secret123@github.com/molis-ai/molis-work.git" }],
        staged: [{ path: "a", status: "M" }], unstaged: 3, conflicted: ["b"] };
    },
  };
  const status = (connectivity: string, authorization: string, capabilities: string) => ({ configuration: { state: "complete", enabled: true, revision: "1", source: "s" },
    connectivity: { state: connectivity, source: "s" }, authorization: { service: { state: authorization, scopes: null, scope_state: "unknown" }, work: { state: "allowed", missing_permissions: [], source: "s", note: "" } },
    capabilities: { state: capabilities, entries: [], coverage: "", note: "" } });
  let homeFails = false;
  const home = {
    discover: async () => [view("connectors.connections.read", "system.connectors")],
    invoke: async () => { calls.push("connectors.connections.read"); if (homeFails) throw new Error("连接服务没有回应"); return { connections: [
      { connection_id: "c1", display_name: "GitHub", account_label: "octo", enabled: true, status: status("connected", "verified", "callable") },
      { connection_id: "c2", display_name: "Notion", enabled: true, status: status("unchecked", "required", "none-discovered") },
      { connection_id: "c3", display_name: "Linear", enabled: false, status: status("connected", "verified", "callable") }] }; },
  };
  const assistant = [view("todo.items.create", "Todo"), view("todo.items.read", "Todo"), view("pages.read", "Pages"), view("mail.send", "Mail", false, "邮件连接需要重新登录")];
  const ports: Parameters<typeof assistantSurroundings>[1] = { personActions: async () => bound(executor), homeActions: async () => home, projectTitle: async () => "发布计划",
    authority: async () => ({ actions: async () => ({ discover: async () => assistant }) }) };
  return { calls, ports, fail: () => { homeFails = true; } };
}

test("VUX-08 VUX-09 a plugin-carried work's 工作环境 is its session's directory and repository, with the remote named without its credentials, and its tools are the session's MCP tools", async () => {
  const store = new AssistantStore(new DatabaseSync(":memory:")), { ports, calls } = owners();
  const work = store.create({ actor_id: "web-user", title: "改发布脚本", scope: { kind: "project", project_id: "p1" }, scope_title: "发布计划", origin: null,
    executor: { kind: "plugin", plugin_id: EXECUTOR, title: "样例 Agent", session_id: "s-1" } });
  const read = await assistantSurroundings(store, ports, "web-user")(work.work_id);
  assert.deepEqual(read.environment, { scope: { kind: "project", project_id: "p1", title: "发布计划" }, executor: { workspace: { name: "molis", path: "/work/molis" },
    git: { repository: "molis-ai/molis-work", branch: "feature/env", ahead: 2, behind: 1, changed: 4, conflicted: 1 } } }, "the session's own directory, not the executor's current one");
  assert.doesNotMatch(JSON.stringify(read), /ghp_secret123|someone/, "a credential in a remote's address never reaches the page");
  assert.deepEqual(read.tools, { executor: "plugin", callable: [{ provider: "GitHub MCP", count: 1 }], unavailable: [
    { title: "close_issue", provider: "GitHub MCP", reason: "服务里已没有这个工具" }, { title: "create_issue", provider: "Linear MCP", reason: "服务未连接" }] },
    "the MCP tools chosen for the session, live only while their server is connected and still offers them");
  assert.deepEqual(calls.filter(call => call.startsWith(`${EXECUTOR}.`)), [`${EXECUTOR}.session.read`, `${EXECUTOR}.state`], "one read of the executor serves both groups");
  assert.ok(calls.includes("projects.workspace.git.inspect"));
});

test("VUX-08 VUX-09 连接与工具: each connection by its own status, what the Assistant can call by provider, what it cannot with the owner's reason", async () => {
  const store = new AssistantStore(new DatabaseSync(":memory:")), { ports } = owners();
  const work = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "personal" }, origin: null });
  const read = await assistantSurroundings(store, ports, "web-user")(work.work_id);
  assert.deepEqual(read.environment, { scope: { kind: "personal" } });
  assert.deepEqual(read.connections.map(one => [one.title, one.state, one.tools, one.account]), [["GitHub", "connected", "callable", "octo"], ["Notion", "needs-authorization", "none-discovered", null], ["Linear", "off", "callable", null]]);
  assert.deepEqual(read.tools, { executor: "assistant", callable: [{ provider: "Todo", count: 2 }, { provider: "Pages", count: 1 }], unavailable: [{ title: "mail.send", provider: "Mail", reason: "邮件连接需要重新登录" }] });
});

test("VUX-08 VUX-09 a part its owner cannot answer says why and the rest still answer; one answer serves redraws until the work changes", async () => {
  const store = new AssistantStore(new DatabaseSync(":memory:")), { ports, calls, fail } = owners();
  const work = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "personal" }, origin: null });
  const surroundings = assistantSurroundings(store, ports, "web-user");
  fail();
  const read = await surroundings(work.work_id);
  assert.deepEqual(read.connections, []);
  assert.equal(read.connections_problem, "连接服务没有回应");
  assert.equal(read.tools.callable.length, 2, "the tools still answer");
  const asked = calls.length;
  assert.equal(await surroundings(work.work_id), read, "asked again at the same revision, the held answer");
  assert.equal(calls.length, asked);
  store.update("web-user", work.work_id, null, { title: "整理周报（改）" });
  await surroundings(work.work_id);
  assert.ok(calls.length > asked, "a new revision is read again");
});

test("VUX-09 a remote's address is shown as owner/name only, whatever form it takes", () => {
  assert.equal(repositoryName("https://user:token@github.com/molis-ai/molis-work.git"), "molis-ai/molis-work");
  assert.equal(repositoryName("git@github.com:molis-ai/molis-work.git"), "molis-ai/molis-work");
  assert.equal(repositoryName("ssh://git@host:22/team/repo"), "team/repo");
  assert.equal(repositoryName("/Users/me/code/repo"), "code/repo");
  // A query or fragment after the path (a token some remotes carry) never reaches the page.
  assert.equal(repositoryName("https://host/owner/name.git?private_token=abc#x"), "owner/name");
});
