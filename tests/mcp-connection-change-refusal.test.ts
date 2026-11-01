import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { molisWorkActionToolName, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

const action: ActionDefinition<Record<string, never>, { value: string }> = {
  capability_id: "fixture.alias.read", version: 1, operation: "query", action: {
    title: "Alias read", description: "Observe dispatch after alias", kind: "query", scope: "project",
    audiences: ["mcp"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false },
    output_schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
  },
};
const toolName = molisWorkActionToolName(action);
const panelId = "plugin-alias-refusal";
const sessionId = "019a-b2";
const callContext: McpToolCallContext = { runtimeSessionId: sessionId, runtimeSessionIdSource: "sessionId" };

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("alias barrier did not settle")), 10_000); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
type Gate = { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; aliases: number };
type Outcome = { ok: true; value: string } | { ok: false; error: unknown };

async function withFixture(t: TestContext, run: (fixture: {
  server: LocalMcpServer;
  connection: NonNullable<LocalMcpServer["runtimeConnection"]>;
  arm: () => Gate;
  call: () => Promise<Outcome>;
  calls: () => number;
}) => Promise<void>) {
  const home = await openTestHome(t);
  const project = await home.createProject("Alias refusal");
  let calls = 0;
  await home.host.withProject(project.reference, () => {
    home.host.actionRegistry(project.reference).registerProvider({
      provider: { provider_id: "alias-fixture", title: "Alias fixture", kind: "plugin", plugin_id: "io.molis.work.example.alias" },
      definitions: [action], handlers: [{ ...action, handle: () => { calls += 1; return { value: "dispatched" }; } }],
    });
  });
  await home.grant("runtime:codex", project.project_id, [action]);
  await withCatalog({ homeDirectory: home.home }, catalog => catalog.commit(() => catalog.terminalPanels.insert({
    panel_id: panelId, install_id: "fixture-install", project_id: project.project_id, actor_id: "user", key: "main", subject: "alias-test",
    runtime: "codex", launch_command: "codex", launch_args: [], title: "Alias fixture",
  }, home.home)));

  let armed: Gate | undefined;
  const gates: Gate[] = [];
  const pending: Promise<Outcome>[] = [];
  // Only the return of a successful, real alias transaction is delayed. Catalog, grant and dispatch stay real.
  const runner: ConstructorParameters<typeof LocalMcpServer>[0] = (options, operation) => withCatalog(options, async catalog => {
    const observed: Parameters<typeof catalog.terminalPanels.aliasSession>[0][] = [];
    const panels = new Proxy(catalog.terminalPanels, { get(target, key) {
      if (key === "aliasSession") return (input: Parameters<typeof target.aliasSession>[0]) => {
        const result = target.aliasSession(input);
        observed.push(input);
        return result;
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const commit: typeof catalog.commit = async step => {
      const before = observed.length;
      const result = await catalog.commit(step);
      const alias = observed.at(before);
      const gate = armed;
      if (gate && alias?.panel_id === panelId && alias.runtime_id === "codex" && alias.host_session_id === sessionId) {
        armed = undefined;
        const saved = catalog.terminalPanels.get(panelId);
        assert.equal(saved?.host_session_id, sessionId, "alias is persisted before entered, outside the write transaction");
        assert.equal(saved?.project_id, project.project_id);
        gate.aliases += 1;
        gate.entered.resolve();
        await gate.release.promise;
      }
      return result;
    };
    return operation(new Proxy(catalog, { get(target, key) {
      if (key === "terminalPanels") return panels;
      if (key === "commit") return commit;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } }));
  });
  const connection = { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin };
  const server = new LocalMcpServer(runner, "runtime", connection, {
    homeDirectory: home.home, panelId, webBaseUrl: home.origin,
    runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false },
  }, home.host);
  try {
    const discovery = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const result = discovery?.result;
    assert.ok(result && typeof result === "object" && "tools" in result && Array.isArray(result.tools));
    assert.ok(result.tools.some((tool: unknown) => !!tool && typeof tool === "object" && "name" in tool && tool.name === toolName),
      "the real catalog and grant expose the action before the alias barrier is armed");
    await run({ server, connection, calls: () => calls,
      arm: () => {
        assert.equal(armed, undefined);
        const gate = { entered: deferred(), release: deferred(), aliases: 0 };
        gates.push(gate); armed = gate; return gate;
      },
      call: () => {
        const outcome = server.callTool(toolName, {}, callContext).then<Outcome, Outcome>(
          value => ({ ok: true, value }), error => ({ ok: false, error }));
        pending.push(outcome); return outcome;
      },
    });
  } finally {
    for (const gate of gates) gate.release.resolve();
    try { await within(Promise.all(pending)); }
    finally { await server.close(); }
    // openTestHome's hook then closes the HTTP server/Host and removes this temporary Home.
  }
}

test("RAC-2765 real alias commits before an unchanged connection dispatches once", { timeout: 60_000 }, async t => {
  await withFixture(t, async fixture => {
    const gate = fixture.arm();
    const pending = fixture.call();
    await within(gate.entered.promise);
    assert.equal(gate.aliases, 1);
    assert.equal(fixture.calls(), 0);
    gate.release.resolve();
    const result = await within(pending);
    assert.deepEqual(result, { ok: true, value: JSON.stringify({ value: "dispatched" }) });
    assert.equal(fixture.calls(), 1);
  });
});

test("RAC-2764 RAC-2766 changing the connection during real alias completion refuses exactly, then recovers", { timeout: 60_000 }, async t => {
  await withFixture(t, async fixture => {
    const gate = fixture.arm();
    const pending = fixture.call();
    await within(gate.entered.promise);
    assert.equal(gate.aliases, 1);
    assert.equal(fixture.calls(), 0);
    fixture.server.runtimeConnection = null;
    gate.release.resolve();
    const refused = await within(pending);
    assert.equal(fixture.calls(), 0, "connection refusal happens before the action handler");
    assert.equal(refused.ok, false);
    assert.ok(!refused.ok && refused.error instanceof ActionError);
    assert.deepEqual({ code: refused.error.code, kind: actionErrorKind(refused.error) },
      { code: "mcp.context_changed", kind: "invalid" });

    fixture.server.runtimeConnection = { ...fixture.connection };
    const recovery = fixture.arm();
    const retried = fixture.call();
    await within(recovery.entered.promise);
    assert.equal(recovery.aliases, 1);
    assert.equal(fixture.calls(), 0);
    recovery.release.resolve();
    assert.deepEqual(await within(retried), { ok: true, value: JSON.stringify({ value: "dispatched" }) });
    assert.equal(fixture.calls(), 1);
  });
});
