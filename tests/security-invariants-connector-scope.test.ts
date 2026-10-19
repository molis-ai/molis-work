// S-36, S-37: who may continue a prepared connector request, and whose project MCP a caller manages.
import assert from "node:assert/strict";
import test from "node:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectorCliActions, connectorLocalActions, connectorManagementActions, connectorSetupAction, connectorSetupExecuteAction, ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCliPackageFixture } from "./fixtures/connector-cli-package.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";
import { openTestHome } from "./fixtures/test-home.js";

type TestHome = Awaited<ReturnType<typeof openTestHome>>;
type Client = ReturnType<TestHome["host"]["homeActionClient"]>;
type Request = { authorization_id: string };
const preparer: ActionCallContext = { actor_id: "connector-preparer", runtime_session_id: "preparing-session", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", "mcp:external"] };

/**
 * One request prepared in the Home and one in a project, and every continuation that is not its preparer's: another person, another
 * session, the same person and session from inside a project (a project client reaches these Home actions, so only the initiator check
 * refuses it), and the project's request continued from the Home.
 */
async function continuations(home: TestHome, prepare: (client: Client, caller: ActionCallContext) => Promise<unknown>) {
  const project = await home.createProject("Continuing project"), homeClient = home.host.homeActionClient(), projectClient = home.host.actionClient(project.reference);
  const inProject = { ...preparer, project_id: project.project_id };
  const request = async (client: Client, caller: ActionCallContext): Promise<Request> => ({ authorization_id: (await prepare(client, caller) as Request).authorization_id });
  const fromHome = await request(homeClient, preparer), fromProject = await request(projectClient, inProject);
  return { fromHome, refused: [
    { who: "another person", client: homeClient, caller: { ...preparer, actor_id: "someone-else" }, request: fromHome },
    { who: "another session", client: homeClient, caller: { ...preparer, runtime_session_id: "another-session" }, request: fromHome },
    { who: "the same person and session in a project", client: projectClient, caller: inProject, request: fromHome },
    { who: "the project's preparer from the Home", client: homeClient, caller: preparer, request: fromProject },
  ] };
}

test("S-37 a prepared local launch continues only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  writeFileSync(join(home.home, "tool.mjs"), MCP_FIXTURE);
  const { fromHome, refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorLocalActions.prepare, { display_name: "My local tool", expected_revision: null,
    source: { kind: "executable", executable: realpathSync(process.execPath) }, args: ["tool.mjs"], cwd: realpathSync(home.home), environment_names: [] }));
  for (const { who, client, caller, request } of refused)
    await assert.rejects(client.invoke(caller, connectorLocalActions.execute, request), { code: "connector.setup.foreign_request" }, who);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), [], "a refused continuation launches and saves nothing");
  const result = await actions.invoke(preparer, connectorLocalActions.execute, fromHome) as { status: string };
  assert.equal(result.status, "connected", "the refusals left the request for its own preparer");
});

test("S-37 a prepared CLI installs and connects only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), source = await createCliPackageFixture(t, home.home), actions = home.host.homeActionClient();
  const { fromHome, refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorCliActions.prepare, source.input));
  for (const { who, client, caller, request } of refused) for (const step of [connectorCliActions.install, connectorCliActions.connect])
    await assert.rejects(client.invoke(caller, step, request), { code: "connector.setup.foreign_request" }, `${who}: ${step.capability_id}`);
  assert.equal(source.downloads(), 0, "a refused install downloads nothing");
  const installed = await actions.invoke(preparer, connectorCliActions.install, fromHome) as { status: string };
  assert.equal(installed.status, "needs_person"); assert.equal(source.downloads(), 1);
});

test("S-37 a prepared credential-free MCP connects only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  // Nothing listens here: a continuation that got past the initiator check would fail on connecting, not with foreign_request.
  const { refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp",
    display_name: "Prepared MCP", expected_revision: null, endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }));
  for (const { who, client, caller, request } of refused)
    await assert.rejects(client.invoke(caller, connectorSetupExecuteAction, request), { code: "connector.setup.foreign_request" }, who);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), [], "a refused continuation saves nothing");
});

test("S-36 project MCP management sees and changes only the caller's own project; Home management sees every project", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), [mine, theirs] = [await home.createProject("Own MCP"), await home.createProject("Other MCP")];
  const library = (await ensureSystemAgentService(home.host, home.home).mcpLibrary())!;
  const save = (project: typeof mine, label: string) => {
    const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" };
    return library.save(owner, { expected_version: 0, label, transport: "http", enabled: true, timeout_ms: 3000, endpoint: "http://127.0.0.1:9/mcp", auth: { kind: "none" } })
      .then(server => ({ owner, id: server.id }));
  };
  const own = await save(mine, "Own service"), foreign = await save(theirs, "Other service");
  const ids = async (client: ReturnType<typeof home.host.homeActionClient>, caller: ActionCallContext) =>
    ((await client.invoke(caller, connectorManagementActions.list, {})) as { connections: Array<{ connection_id: string }> }).connections.map(row => row.connection_id).filter(id => id === own.id || id === foreign.id).sort();
  const inProject = { ...preparer, project_id: mine.project_id }, client = home.host.actionClient(mine.reference);
  assert.deepEqual(await ids(client, inProject), [own.id], "a project caller's list holds only its own project's MCP");
  for (const [step, input] of [[connectorManagementActions.control, { connection_id: foreign.id, expected_revision: "1", action: "disable" }],
    [connectorManagementActions.remove, { connection_id: foreign.id, expected_revision: "1" }], [connectorManagementActions.check, { connection_id: foreign.id }]] as const)
    await assert.rejects(client.invoke(inProject, step, input), { code: "connector.project_mcp.unknown" });
  assert.deepEqual((await library.list(foreign.owner)).map(server => [server.id, server.enabled, server.version]), [[foreign.id, true, 1]], "another project's connection is untouched");
  await client.invoke(inProject, connectorManagementActions.control, { connection_id: own.id, expected_revision: "1", action: "disable" });
  assert.equal((await library.list(own.owner))[0]!.enabled, false, "the caller's own project connection is still managed");
  const homeClient = home.host.homeActionClient();
  assert.deepEqual(await ids(homeClient, preparer), [own.id, foreign.id].sort(), "Home management sees every project's MCP");
  await homeClient.invoke(preparer, connectorManagementActions.control, { connection_id: foreign.id, expected_revision: "1", action: "disable" });
  assert.equal((await library.list(foreign.owner))[0]!.enabled, false, "and changes any of them");
});
