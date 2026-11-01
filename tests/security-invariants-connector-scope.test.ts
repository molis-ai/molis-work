// S-36, S-37: who may continue a prepared connector request, and whose project MCP a caller manages.
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectorCliActions, connectorLocalActions, connectorManagementActions, connectorSetupAction, connectorSetupExecuteAction, ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCliPackageFixture } from "./fixtures/connector-cli-package.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
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
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), [], "a refused continuation connects and saves nothing");
  const installed = await actions.invoke(preparer, connectorCliActions.install, fromHome) as { status: string };
  assert.equal(installed.status, "needs_person"); assert.equal(source.downloads(), 1);
});

test("S-37 a prepared credential-free MCP connects only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  // Nothing listens here: a continuation that got past the initiator check would fail on connecting, not with foreign_request.
  const { fromHome, refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp",
    display_name: "Prepared MCP", expected_revision: null, endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }));
  for (const { who, client, caller, request } of refused)
    await assert.rejects(client.invoke(caller, connectorSetupExecuteAction, request), { code: "connector.setup.foreign_request" }, who);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), [], "a refused continuation saves nothing");
  // The preparer gets past the initiator check and only then fails on connecting: without this, a request that stopped recording its
  // initiator would be refused for everyone, and every refusal above would still pass.
  await assert.rejects(actions.invoke(preparer, connectorSetupExecuteAction, fromHome), (error: { code?: string }) => {
    assert.notEqual(error.code, "connector.setup.foreign_request", "the request was left for its own preparer");
    assert.match(String(error.code), /^connector\.mcp\./, "it failed on connecting to the endpoint nothing listens on");
    return true;
  });
});

// RAC-1478: the four callers who may not continue a request may not read it either, and the preparer still reads the setup it prepared.
test("S-37 a prepared request is read only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const { fromHome, refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp",
    display_name: "Prepared MCP", expected_revision: null, endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }));
  for (const { who, client, caller, request } of refused)
    await assert.rejects(client.invoke(caller, connectorManagementActions.authorization, request), { code: "connector.setup.foreign_request" }, who);
  const read = await actions.invoke(preparer, connectorManagementActions.authorization, fromHome) as { status: string; setup?: unknown };
  assert.equal(read.status, "prepared", "the refusals did not end the request of its own preparer");
  assert.ok(read.setup, "the preparer still reads the setup it prepared");
});

// RAC-1479: a refused cancel leaves the request prepared and its managed install directory and staged material in place; only its
// preparer cancels it, which is what removes the managed directory.
test("S-37 a prepared request is cancelled only for the person, project and session that prepared it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), source = await createCliPackageFixture(t, home.home), actions = home.host.homeActionClient();
  const { fromHome, refused } = await continuations(home, (client, caller) => client.invoke(caller, connectorCliActions.prepare, source.input));
  assert.equal((await actions.invoke(preparer, connectorCliActions.install, fromHome) as { status: string }).status, "needs_person");
  const installations = join(home.home, "runtime", "connectors", "installs"), [installation] = readdirSync(installations);
  assert.ok(installation, "installing left the managed directory behind");
  const directory = join(installations, installation!), downloads = source.downloads();
  const state = () => actions.invoke(preparer, connectorManagementActions.authorization, fromHome) as Promise<{ status: string; installation_ready?: boolean }>;
  assert.equal((await state()).status, "prepared"); assert.equal((await state()).installation_ready, true);
  for (const { who, client, caller, request } of refused)
    await assert.rejects(client.invoke(caller, connectorManagementActions.cancel, request), { code: "connector.setup.foreign_request" }, who);
  assert.equal((await state()).status, "prepared", "a refused cancel did not end the request of its own preparer");
  assert.equal((await state()).installation_ready, true, "a refused cancel kept the installation");
  assert.equal(existsSync(directory), true, "a refused cancel left the managed install directory in place");
  assert.equal(source.downloads(), downloads, "a refused cancel installed nothing more");
  assert.equal((await actions.invoke(preparer, connectorManagementActions.cancel, fromHome) as { status: string }).status, "cancelled",
    "the preparer still cancels its own request");
  assert.deepEqual(readdirSync(installations), [], "its own cancel removed the managed install directory");
});

// RAC-1479 order proof: the initiator check must come before beforeEffect, so a refused cancel adds no effect boundary of its own to
// the dispatch baseline. The assertion below states why that is the baseline and not zero.
test("S-37 a refused cancellation is refused before the call's effect boundary", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(preparer, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp", display_name: "Prepared MCP",
    expected_revision: null, endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }) as Request;
  const request = { authorization_id: prepared.authorization_id };
  // Dispatching a call asks the caller's validate_authority once before any handler runs, so a control's beforeEffect is reached once for
  // every call, refused or not. That dispatch count is the baseline: a read handler has no effect boundary of its own, so reading the
  // request measures it. The cancel handler asks for its effect boundary exactly once, so an accepted cancel is baseline + 1 and a refused
  // one must stay at the baseline. That is "the initiator check comes before beforeEffect", not "beforeEffect is never reached at all".
  let boundaries = 0;
  const control = { beforeEffect: async () => { boundaries += 1; } };
  const bound = (caller: ActionCallContext) => bindActionClient(home.host.homeActionClient(), () => caller);
  await bound(preparer).invoke(connectorManagementActions.authorization, request, control);
  const baseline = boundaries;
  assert.equal(baseline, 1, "one authority check before dispatch, and no effect boundary of a read handler");
  boundaries = 0;
  await assert.rejects(bound({ ...preparer, runtime_session_id: "another-session" }).invoke(connectorManagementActions.cancel, request, control),
    { code: "connector.setup.foreign_request" });
  assert.equal(boundaries, baseline, "a refused cancel adds no effect boundary of its own to the dispatch baseline");
  boundaries = 0;
  assert.equal((await bound(preparer).invoke(connectorManagementActions.cancel, request, control) as { status: string }).status, "cancelled");
  assert.equal(boundaries, baseline + 1, "the accepted cancel reached the effect boundary of its handler");
});

// RAC-1480: a page-started request records no initiator, so every action caller is refused; the person's own page routes still read and
// cancel it.
test("S-37 a request started by the page has no action reader or canceller but stays readable and cancellable from the page", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  oauthNetwork(t, async url => {
    assert.equal(url, "https://github.com/login/device/code");
    return Response.json({ device_code: "fixture-private-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
  });
  const started = await home.web.post<Request>("/api/settings/connectors/methods/device/start", { service_id: "github", client_id: "fixture-app", display_name: "Work account" });
  const request = { authorization_id: started.authorization_id };
  await assert.rejects(actions.invoke(preparer, connectorManagementActions.authorization, request), { code: "connector.setup.foreign_request" },
    "the page keeps no initiator, so no action caller reads it");
  await assert.rejects(actions.invoke(preparer, connectorManagementActions.cancel, request), { code: "connector.setup.foreign_request" },
    "the page keeps no initiator, so no action caller cancels it");
  const path = `/api/settings/connectors/authorizations/${started.authorization_id}`;
  assert.equal((await home.web.get<{ status: string }>(path)).status, "pending", "the page still reads its own pending request");
  assert.equal((await home.web.delete<{ status: string }>(path)).status, "cancelled", "the page still cancels its own request");
});

// RAC-1481: an id that names nothing and an id that names someone else's request are refused with the same code and words, on read and
// on cancel, so neither reveals whether the request exists.
test("S-37 an unknown or someone else's request is refused the same way on read and cancel", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(preparer, connectorSetupAction, { service_id: "github", method: "token", display_name: "Work account", expected_revision: null }) as Request;
  const otherSession = { ...preparer, runtime_session_id: "another-session" };
  const answer = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { return error as { code?: string; message?: string }; } assert.fail("a request of another session was reached"); };
  const refusal = async (step: typeof connectorManagementActions.authorization, id: string) => (await answer(() => actions.invoke(otherSession, step, { authorization_id: id })))!;
  const foreignRead = await refusal(connectorManagementActions.authorization, prepared.authorization_id);
  const unknownRead = await refusal(connectorManagementActions.authorization, randomUUID());
  const foreignCancel = await refusal(connectorManagementActions.cancel, prepared.authorization_id);
  const unknownCancel = await refusal(connectorManagementActions.cancel, randomUUID());
  for (const refused of [foreignRead, unknownRead, foreignCancel, unknownCancel]) assert.equal(refused.code, "connector.setup.foreign_request");
  for (const refused of [unknownRead, foreignCancel, unknownCancel]) {
    assert.equal(refused.message, foreignRead.message, "a request that is not the caller's is refused the same way whatever the id names");
    assert.doesNotMatch(String(refused.message), new RegExp(prepared.authorization_id));
    assert.doesNotMatch(String(refused.message), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  }
});

// RAC-1482: this task tightens ownership only; expiry keeps its contract. The preparer still reads its own request as expired, and
// everyone else is refused whatever the expiry.
test("S-37 an expired request stays expired for its preparer and is refused to everyone else", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(preparer, connectorSetupAction, { service_id: "github", method: "token", display_name: "Work account", expected_revision: null }) as Request;
  const request = { authorization_id: prepared.authorization_id };
  const now = Date.now(); t.mock.method(Date, "now", () => now + 25 * 60 * 60_000);
  assert.equal((await actions.invoke(preparer, connectorManagementActions.authorization, request) as { status: string }).status, "expired",
    "the preparer still reads its own request as expired, exactly as before");
  for (const step of [connectorManagementActions.authorization, connectorManagementActions.cancel])
    await assert.rejects(actions.invoke({ ...preparer, runtime_session_id: "another-session" }, step, request), { code: "connector.setup.foreign_request" },
      "an expired request is still refused to everyone who did not prepare it");
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
