// SECURITY-INVARIANTS S-17, S-37: the session an Agent round's tool calls carry is the one the Host checked against the Runtime's own record
// when it started the round, for every plugin; it is never read from the start request or from a tool's input, and it grants nothing.
// Each refusal asserts the refusal itself and that nothing was written (specs/ai-input-receipts D42, RCPT-391..395).
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  MolisWorkLocalHost, composeAgentHost, connectorSetupAction, connectorSetupExecuteAction, withConnectorConnections,
} from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import {
  agentHostCapabilities, agentOfferActions, type AgentActionClient, type AgentOfferRunRequest, type AgentRunHandle, type AgentRunOffer, type AgentRunRef, type AgentRunView,
  type AgentSessionRef, type AgentSessionView, type AgentStartInput,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { actionDigest, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { revokeMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";

const RUNTIME = "probe";
/** The grant's client id: what the Host calls the Runtime. Constant across rounds and sessions; the session is a separate fact. */
const CLIENT = `agent:${RUNTIME}`;

const note: ActionDefinition = { capability_id: "fixture.agent.note", version: 1, operation: "command", action: { title: "Note", description: "Records who called it",
  kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false } } };

/** An item id is unique across the project's proposals, so the same idempotency key in another session carries an item of its own. */
const proposal = (key: string, item = key) => ({ summary: "拆一个子目标", idempotency_key: key, items: [{ item_id: `item-${item}`, kind: "goal" as const, operation: "create" as const,
  payload: { goal_id: `goal-${item}`, title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] });
type Submitted = { proposal: { proposal_id: string; submitted_by: string; submitted_session_id: string | null }; replayed: boolean };
type Proposals = { proposals: Array<{ proposal_id: string }> };

/**
 * The plugin whose sessions these are: one the Host starts like any other, with a writing role of its own. Its page starts the rounds
 * and runs their suggestions through its own SDK, so each of its calls carries the caller the Host issued its session, the only one
 * a plugin's call is accepted with (S-15).
 */
function sessionKeeper() {
  const contexts: PluginStartContext[] = [];
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.round-sessions", version: "1.0.0",
    name: "Round sessions", kind: "app", publisher: { publisher_id: "example", signature: "round-sessions" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [agentHostCapabilities.startRun.capability_id, agentHostCapabilities.listActions.capability_id, agentOfferActions.run.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    agent: { roles: [{ role_id: "builder", version: 1, execution: "workspace-write", prompts: ["builder"], host_tools: [] }], prompts: [{ prompt_id: "builder", version: 1 }] } },
    agent_prompts: [{ prompt_id: "builder", version: 1, body: "Work in the project's workspace.", layer: "role" }],
    async start(context) { contexts.push(context); return { kind: "app" }; } };
  return { definition, contexts };
}

/**
 * A Host assembled the way the product assembles it, with one project, the plugin whose sessions these are, and a Runtime of our own.
 * The Runtime keeps what the Host handed it (`rounds`) and answers `readSession` with whatever `answer` says, so a test can make its
 * record disagree with the start request.
 */
async function world(t: TestContext) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "agent-run-session-")));
  const keeper = sessionKeeper();
  const localHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [keeper.definition] } });
  let served: TestHostServer | undefined;
  t.after(async () => {
    try { await served?.close(); }
    finally {
      try { await localHost.close(); }
      finally { await rm(home, { recursive: true, force: true }); }
    }
  });
  const composition = localHost.ensureAgentService(home, () => composeAgentHost({ localHost, homeDirectory: home,
    workspaceFor: () => ({ workspace_id: "w", canonical_path: home, realpath_verified: true, display_name: "workspace" }) }));
  served = await serveTestHost(null, { home, host: localHost });
  const project = await served.createProject("Round sessions");
  // The directory a round may work in is the project's authorized workspace, as a person adds it; the Host holds no other.
  await served.web.post(`/projects/${project.project_id}/api/workspaces`, { workspace_path: home, user_confirmed: true });
  const handled: Array<{ actor_id: string; runtime_session_id: string | undefined; audit_actor_id: string | undefined }> = [];
  const rounds: Array<{ session_id: string; tools: AgentActionClient }> = [];
  /** Each round the Runtime started, with the suggestions its model made: what `read` answers for `agent.offers.run`. */
  const held: Array<{ ref: AgentRunRef; frozen: AgentRunHandle["frozen"]; offers: AgentRunOffer[] }> = [];
  // The project's plugins start when its actions are first looked at, as the workbench does when the person opens the project.
  await localHost.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] }, project.reference);
  const plugin = keeper.contexts.at(-1);
  assert.ok(plugin?.actor_id, "the plugin whose sessions these are has started");
  const capabilities = plugin.services?.capabilities, actions = plugin.services?.actions;
  assert.ok(capabilities && actions, "it reaches the Agent Host and the action directory through its own SDK");
  const owner = { project_id: project.project_id, plugin_id: plugin.plugin_id, install_id: plugin.install_id, actor_id: plugin.actor_id };
  const answer: { read: (session: AgentSessionRef) => AgentSessionView } = {
    read: session => ({ session, owner, title: "Read", runs: [], latest_run: null }) };
  composition.agentHost.register({
    // A writing role needs a Runtime that can edit and run commands; this one never does either.
    descriptor: { runtime_id: RUNTIME, display_name: "Probe", provider_version: "1", supports_action_tools: true,
      capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported", "text-edit": "supported", command: "supported" } },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    async createSession() { throw new Error("Not used by this fixture"); },
    async read(run) {
      const round = held.find(entry => entry.ref.session_id === run.session_id && entry.ref.run_id === run.run_id);
      if (!round) throw new Error("Not used by this fixture");
      return { ref: round.ref, frozen: round.frozen, offers: round.offers } as AgentRunView;
    },
    observe() { throw new Error("Not used by this fixture"); },
    async control() { throw new Error("Not used by this fixture"); },
    async readCommandOutput() { throw new Error("Not used by this fixture"); },
    async readSession(session) { return answer.read(session); },
    async start(given) {
      const role = given.role!;
      rounds.push({ session_id: given.session.session_id, tools: role.actions!.client });
      const ref = { run_id: `r${rounds.length}`, session_id: given.session.session_id };
      const frozen = { role_id: role.role_id, role_version: role.version, execution: role.execution,
        model_id: "probe", prompts: role.prompts.map(prompt => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt) })), host_tools: [...role.host_tools],
        skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null, directory: { canonical_path: home, realpath_verified: true as const }, action_tools: given.action_tools };
      held.push({ ref, frozen, offers: [] });
      return { ref, frozen };
    },
  });
  localHost.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "fixture.agent", kind: "plugin", title: "Fixture" }, definitions: [note],
    handlers: [{ ...note, handle(context) { handled.push({ actor_id: context.actor_id, runtime_session_id: context.runtime_session_id, audit_actor_id: context.audit_actor_id }); return "noted"; } }] });
  const grants = await grantGoalsMcp(served, project, CLIENT, [note, connectorSetupAction, connectorSetupExecuteAction]);
  const reference = (capability_id: string): ExactActionReference => {
    const row = grants.find(item => item.capability_id === capability_id);
    assert.ok(row, `${capability_id} was granted to ${CLIENT}`);
    return { capability_id, version: row.version, provider_id: row.provider_id };
  };
  /** `agent.run.start` as the plugin's page sends it, in the given session of that plugin; `extra` is whatever else a body could carry. */
  const start = (sessionId: string, tools: readonly string[], extra: Record<string, unknown> = {}) => capabilities.invoke(agentHostCapabilities.startRun, [RUNTIME, {
    session: { runtime_id: RUNTIME, session_id: sessionId }, task: "读取项目", role_id: "builder",
    directory: { canonical_path: home, realpath_verified: true }, action_tools: tools.map(reference), ...extra } as AgentStartInput]);
  const tools = [note.capability_id, goalsActions.treeSubmit.capability_id, goalsActions.treeRead.capability_id];
  const submit = (round: AgentActionClient, key: string, item = key) => round.invoke(reference(goalsActions.treeSubmit.capability_id), proposal(key, item)) as Promise<Submitted>;
  const proposals = async (round: AgentActionClient) => ((await round.invoke(reference(goalsActions.treeRead.capability_id), {})) as Proposals).proposals;
  /** The Runtime keeps the sessions it started, each with the rounds it ran, as its own record. */
  const holding = (session: AgentSessionRef): AgentSessionView => ({ session, owner, title: "Held", latest_run: null,
    runs: held.filter(entry => entry.ref.session_id === session.session_id).map(entry => entry.ref) });
  /** The latest round's model suggests an action, with its contract as the Host reads it now; the input is the person's at the click. */
  const suggest = async (offer_id: string, capability_id: string) => {
    const round = held[held.length - 1]!, ref = reference(capability_id);
    const view = (await capabilities.invoke(agentHostCapabilities.listActions, [RUNTIME, owner.plugin_id])).find(row =>
      row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    assert.ok(view, `${capability_id} is offered to the round`);
    round.offers.push({ offer_id, offered_at: "2026-10-20T08:00:00.000Z", title: view.action.title, summary: view.action.description, reference: ref, input: {}, action_digest: actionDigest(view) });
    return { run: round.ref, offer_id, reference: ref };
  };
  // A person clicks a suggestion of a round, through the plugin that keeps its card (`agent.offers.run`, for plugins only).
  const click = (offered: { run: AgentRunRef; offer_id: string; reference: ExactActionReference }, input: unknown, extra: Record<string, unknown> = {}) =>
    actions.invoke(agentOfferActions.run, { runtime_id: RUNTIME, session_id: offered.run.session_id, run_id: offered.run.run_id, offer_id: offered.offer_id,
      reference: offered.reference, input, ...extra } as AgentOfferRunRequest);
  return { home, served, project, answer, owner, handled, rounds, reference, start, tools, submit, proposals, last: () => rounds[rounds.length - 1]!.tools, holding, suggest, click };
}

test("S-17 a round's tool calls carry the session the Host verified (RCPT-391)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  // A start body naming a session or an author of its own is refused by the action's schema before any round or tool exists.
  await assert.rejects(w.start("s", w.tools, { runtime_session_id: "forged", audit_actor_id: `${CLIENT}:forged` }), { code: "actions.input_invalid" });
  assert.equal(w.rounds.length, 0, "the refused start built no tools");
  // Only the Host-verified session reaches the tools.
  await w.start("s", w.tools);
  const first = w.last();
  await first.invoke(w.reference(note.capability_id), {});
  assert.deepEqual(w.handled, [{ actor_id: CLIENT, runtime_session_id: "s", audit_actor_id: `${CLIENT}:s` }],
    "the grant's client id is unchanged; the session and the author name the verified session");

  // What Goals records follows: the author is the session, and the same key in another session of the same plugin is its own proposal.
  const mine = await w.submit(first, "k");
  assert.equal(mine.proposal.submitted_session_id, "s");
  assert.equal(mine.proposal.submitted_by, `${CLIENT}:s`);
  assert.equal((await w.submit(first, "k")).replayed, true, "the same key in the same session replays");
  await w.start("t", w.tools);
  const theirs = await w.submit(w.last(), "k", "other-session");
  assert.equal(theirs.replayed, false, "the same key in another session does not replay the first session's proposal");
  assert.equal(theirs.proposal.submitted_session_id, "t");
  assert.equal(theirs.proposal.submitted_by, `${CLIENT}:t`);
  assert.notEqual(theirs.proposal.proposal_id, mine.proposal.proposal_id);
});

test("S-17 a start in a session the Host does not hold (RCPT-392)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  // The Runtime's own record disagrees with the request: another session, another plugin, install, person or project.
  const records: Array<[string, (session: AgentSessionRef) => AgentSessionView]> = [
    ["another session", session => ({ session: { ...session, session_id: "another" }, owner: w.owner, title: "Other", runs: [], latest_run: null })],
    ["another plugin", session => ({ session, owner: { ...w.owner, plugin_id: "io.molis.work.other" }, title: "Other", runs: [], latest_run: null })],
    ["another install", session => ({ session, owner: { ...w.owner, install_id: "other" }, title: "Other", runs: [], latest_run: null })],
    ["another person", session => ({ session, owner: { ...w.owner, actor_id: "someone-else" }, title: "Other", runs: [], latest_run: null })],
    ["another project", session => ({ session, owner: { ...w.owner, project_id: "another-project" }, title: "Other", runs: [], latest_run: null })],
  ];
  for (const [who, read] of records) {
    w.answer.read = read;
    await assert.rejects(w.start("s", w.tools), { code: "agent.session_unknown" }, who);
  }
  assert.equal(w.rounds.length, 0, "no round was started, so no tool was built for any of them");
  assert.deepEqual(w.handled, [], "no tool call ran");
  // The record is the Runtime's: a round that starts afterwards in the session it does hold still proves the refusals were about the record.
  w.answer.read = session => ({ session, owner: w.owner, title: "Own", runs: [], latest_run: null });
  await w.start("s", w.tools);
  assert.deepEqual(await w.proposals(w.last()), [], "the refused starts wrote no proposal");
});

test("S-17 a tool input that names a session or an author (RCPT-393)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  await w.start("s", w.tools);
  const round = w.last();
  for (const field of ["submitted_session_id", "runtime_session_id", "audit_actor_id", "actor_id"]) {
    await assert.rejects(round.invoke(w.reference(goalsActions.treeSubmit.capability_id), { ...proposal("named"), [field]: `${CLIENT}:t` }), { code: "actions.input_invalid" }, field);
  }
  await assert.rejects(round.invoke(w.reference(note.capability_id), { runtime_session_id: "t" }), { code: "actions.input_invalid" });
  assert.deepEqual(w.handled, [], "the fixture action did not run");
  assert.deepEqual(await w.proposals(round), [], "no proposal was written");
});

test("S-17 a round's session grants nothing (RCPT-394)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  await w.start("s", w.tools);
  const round = w.last();
  await round.invoke(w.reference(note.capability_id), {});
  assert.equal(w.handled.length, 1, "while the grant stands the round's call runs");
  // The person turns the grants off. The round still carries its session, and every call it makes now is refused.
  for (const capability of [note.capability_id, goalsActions.treeSubmit.capability_id])
    await revokeMcpAction(w.served.web, { clientId: CLIENT, projectId: w.project.project_id, action: w.reference(capability) });
  await assert.rejects(round.invoke(w.reference(note.capability_id), {}), { code: "mcp.action_revoked" });
  await assert.rejects(w.submit(round, "after-revoke"), { code: "mcp.action_revoked" });
  assert.equal(w.handled.length, 1, "the revoked action did not run again");
  assert.deepEqual(await w.proposals(round), [], "the revoked submit wrote no proposal");
});

// A consequence of RCPT-391: before the round carried its session, every round of every plugin was `agent:probe` with no session, so a setup one
// session prepared could be continued from any other session of the same plugin, which S-37 refuses.
test("S-37 a connector setup one round prepared is continued only by that session, not by another session of the same plugin", { timeout: 180_000 }, async t => {
  const w = await world(t);
  const prepare = w.reference(connectorSetupAction.capability_id), execute = w.reference(connectorSetupExecuteAction.capability_id);
  const refs = [connectorSetupAction.capability_id, connectorSetupExecuteAction.capability_id];
  await w.start("s", refs);
  const preparing = w.last();
  // Nothing listens here: a continuation that got past the initiator check would fail on connecting, not with foreign_request.
  const prepared = await preparing.invoke(prepare, { service_id: "mcp-bearer", method: "mcp", display_name: "Prepared MCP", expected_revision: null,
    endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }) as { authorization_id: string };
  await w.start("t", refs);
  await assert.rejects(w.last().invoke(execute, { authorization_id: prepared.authorization_id }), { code: "connector.setup.foreign_request" });
  assert.deepEqual(withConnectorConnections(w.home, store => store.list()), [], "the refused continuation connected and saved nothing");
  // The session that prepared it gets past the initiator check and only then fails on connecting: without this, a request that stopped
  // recording its session would be refused for everyone, and the refusal above would still pass.
  await assert.rejects(preparing.invoke(execute, { authorization_id: prepared.authorization_id }), (error: { code?: string }) => {
    assert.notEqual(error.code, "connector.setup.foreign_request", "the request was left for the session that prepared it");
    assert.match(String(error.code), /^connector\.mcp\./, "it failed on connecting to the endpoint nothing listens on");
    return true;
  });
});

// The person's click on a round's suggestion (agent.offers.run) runs the action the way the round's own calls do: the tools it reaches carry the
// session of the round clicked, checked by the Host against the Runtime's record (requireRun), never one the click names.
test("S-17 a click on a round's suggestion runs under the session of that round, never one the click names (RCPT-395)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  w.answer.read = w.holding;
  await w.start("s", w.tools);
  const inS = await w.suggest("offer-s", note.capability_id);
  // A click that names a session or an author is refused by the action's own contract before anything runs.
  for (const field of ["runtime_session_id", "audit_actor_id", "actor_id", "submitted_session_id"]) {
    await assert.rejects(w.click(inS, {}, { [field]: `${CLIENT}:forged` }), { code: "actions.input_invalid" }, field);
  }
  assert.deepEqual(w.handled, [], "the refused clicks ran nothing");
  assert.deepEqual(await w.click(inS, {}), { output: "noted" });
  assert.deepEqual(w.handled, [{ actor_id: CLIENT, runtime_session_id: "s", audit_actor_id: `${CLIENT}:s` }],
    "the grant's client id is unchanged; the session and the author name the session of the round clicked");
  await w.start("t", w.tools);
  const inT = await w.suggest("offer-t", note.capability_id);
  await w.click(inT, {});
  assert.deepEqual(w.handled.slice(1), [{ actor_id: CLIENT, runtime_session_id: "t", audit_actor_id: `${CLIENT}:t` }], "a click in another session carries that session");
  // The round must be the named session's own: a click naming session s with t's round is refused and runs nothing.
  await assert.rejects(w.click({ ...inT, run: { session_id: "s", run_id: inT.run.run_id } }, {}), { code: "agent.run_unknown" });
  assert.equal(w.handled.length, 2, "the refused click ran nothing");
});

// A consequence of RCPT-395: before a click carried its round's session, a setup one session's suggestion prepared could be continued by a click
// in any other session of the same plugin (the initiator check compared no session with no session), which S-37 refuses.
test("S-37 a setup a click prepared is continued only by a click in the same session, not by one in another session of the same plugin (RCPT-395)", { timeout: 180_000 }, async t => {
  const w = await world(t);
  w.answer.read = w.holding;
  const refs = [connectorSetupAction.capability_id, connectorSetupExecuteAction.capability_id];
  await w.start("s", refs);
  const prepare = await w.suggest("offer-prepare", connectorSetupAction.capability_id);
  const execute = await w.suggest("offer-execute", connectorSetupExecuteAction.capability_id);
  const prepared = (await w.click(prepare, { service_id: "mcp-bearer", method: "mcp", display_name: "Prepared MCP", expected_revision: null,
    endpoint: "http://127.0.0.1:9/mcp", authentication: "none", transport: "http" }) as { output: { authorization_id: string } }).output;
  await w.start("t", refs);
  const elsewhere = await w.suggest("offer-execute-t", connectorSetupExecuteAction.capability_id);
  // Nothing listens here: a continuation that got past the initiator check would fail on connecting, not with foreign_request.
  await assert.rejects(w.click(elsewhere, { authorization_id: prepared.authorization_id }), { code: "connector.setup.foreign_request" });
  assert.deepEqual(withConnectorConnections(w.home, store => store.list()), [], "the refused continuation connected and saved nothing");
  // The session that prepared it gets past the initiator check and only then fails on connecting: without this, a request that stopped
  // recording its session would be refused for everyone, and the refusal above would still pass.
  await assert.rejects(w.click(execute, { authorization_id: prepared.authorization_id }), (error: { code?: string }) => {
    assert.notEqual(error.code, "connector.setup.foreign_request", "the request was left for the session that prepared it");
    assert.match(String(error.code), /^connector\.mcp\./, "it failed on connecting to the endpoint nothing listens on");
    return true;
  });
});
