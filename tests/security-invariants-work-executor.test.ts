import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, assistantServiceFor, closeAssistantService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { EXECUTOR_MODES, roleDefinitions, roleOfCapability } from "./fixtures/work-executor-fake.js";

// S-51 (specs/repository-anti-corruption PG-036, C8-1): the Assistant calls a work's executor as the person at this computer, through
// the same installation-grant checks the person's own page goes through, and a dispatch (a Send, a follow-up's round) binds the
// person's client anew when it acts. A follow-up scheduled while the executor plugin held its grants is refused once they are gone.

function reply(): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

async function until(read: () => boolean | Promise<boolean>): Promise<void> {
  for (let count = 0; count < 500; count++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("The expected state was not reached");
}

const USE = "executor:use", EXECUTOR_ID = "io.molis.work.example.executor", PREFIX = "example.executor";

/** A plugin that takes on a work through the work-executor protocol, as any installed plugin may: each of its actions needs its installation's one grant, and counts its runs. */
function executorPlugin() {
  const handled: string[] = [], runs: string[] = [], sessions = new Set<string>();
  const definitions = roleDefinitions(PREFIX, "example_session", [USE]);
  const handle = async (name: string, context: ActionExecutionContext, input: Record<string, unknown>): Promise<unknown> => {
    handled.push(name);
    if (name !== "state" && name !== "session.read") await context.beforeEffect();
    if (name === "state") return { modes: EXECUTOR_MODES, default_mode: "execute", images: false };
    if (name === "session.open") { const id = `session-${sessions.size + 1}`; sessions.add(id); return { session_id: id }; }
    if (name === "session.read") return { session_id: String(input.session_id), title: "会话", mode: null, runs: [], runtime_session_id: null, recovery: null };
    if (name === "session.update") return { session_id: String(input.session_id), mode: String(input.mode) };
    if (name === "run.start") { runs.push(String(input.task)); return { run_id: `run-${runs.length}` }; }
    return { accepted: true };
  };
  const definition = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: EXECUTOR_ID, version: "1.0.0", name: "执行方样例",
    kind: "app", publisher: { publisher_id: "example", signature: "executor" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: USE, required: false, reason: "接手助理交来的工作" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] }, actions: definitions },
    async start() { return { kind: "app", actions: definitions.map(entry => ({ ...entry,
      handle: (context: ActionExecutionContext, input: unknown) => handle(roleOfCapability(PREFIX, entry.capability_id), context, input as Record<string, unknown>) })) }; } });
  return { definition, handled, runs };
}

test("S-51 a follow-up scheduled before its executor plugin's grant is revoked, or the plugin stopped, is refused when due, and none of the executor's actions runs", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-executor-revoked-"));
  const created = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "执行方撤权", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: created.database_path, projectId: created.project_id });
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.mock.method(globalThis, "fetch", answeringEndingReviews(() => reply(), async () => reply()));
  const reviews = new AgentReviewQueue(), agents = new AgentHost({ reviews });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.executor-revoked-test", appVersion: "1.0.0" },
    storageRoot: join(home, "sdk"), reviewQueue: reviews,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agents.register(adapter);
  const executor = executorPlugin();
  let runtime: PluginRuntime | undefined, installId = "";
  t.after(async () => {
    closeAssistantService(local);
    if (runtime && installId) await runtime.stop(installId).catch(() => undefined);
    await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true });
  });
  await runWithMolisWorkHome(home, async () => {
    // The executor plugin is one of the project's executors beside Coding; the work this test hands over names it by its plugin id.
    const repository = await local.withProject(reference, project => new SqlitePluginRuntimeRepository(project.store.db));
    runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: local.actionRegistry(reference), project_id: reference.project_id } });
    installId = runtime.install({ trust: { level: "unsigned" }, definition: executor.definition, deployment: "local", grants: [USE] }).install.install_id;
    await runtime.start(installId);
    const views = await local.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: reference.project_id, permissions: [] }, reference);
    assert.equal(views.find(view => view.capability_id === `${PREFIX}.state`)?.provider.plugin_id, EXECUTOR_ID, "the person reaches the executor plugin's actions");

    // The Assistant as the Host composes it, with the person's own clients.
    const { service, store } = assistantServiceFor({ localHost: local, homeDirectory: home, agentHost: agents, agentReady: async () => {},
      projectTitle: async () => "执行方撤权", projectReference: async () => reference, pages: async () => [] });
    assert.equal(await service.attachSchedule(), true);
    const sent = await service.send({ text: "先整理一下这项工作", request_id: "executor-revoked-0001" }, { project_ref: reference });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed");
    await service.handover(sent.work.work_id, { to: { kind: "plugin", plugin_id: EXECUTOR_ID } });
    assert.ok(executor.handled.includes("session.open"), "the work's session is opened with the executor plugin");
    const ranOnce = async (label: string) => {
      const standing = await service.followUps.save({ work_id: sent.work.work_id, text: label, at: new Date(Date.now() + 1200).toISOString(), repeat: "daily", label, time_zone: "UTC" });
      return { standing, ran: () => until(() => service.followUps.list(sent.work.work_id).find(row => row.followup_id === standing.followup_id)?.last?.due_at === standing.next_at) };
    };

    // While its installation holds the grant, a follow-up's round reaches the executor and starts there.
    const granted = await ranOnce("有授权时的定时");
    await granted.ran();
    assert.equal(executor.runs.length, 1, "the granted follow-up started one round in the executor");
    await service.followUps.remove(granted.standing.followup_id);
    const roundsBefore = store.rounds(sent.work.work_id).length;

    // Scheduled while granted, then the grant is withdrawn from the executor's installation before it comes due.
    const pending = await ranOnce("撤权以后的定时");
    repository.save({ ...runtime.get(installId), grants: [] });
    const handledBefore = executor.handled.length;
    await pending.ran();
    const last = service.followUps.list(sent.work.work_id).find(row => row.followup_id === pending.standing.followup_id)!.last!;
    assert.equal(last.outcome, "failed", "the round is refused when it comes due");
    assert.match(last.detail ?? "", /执行方现在找不到/u, "refused because the person's directory no longer offers the executor's actions, not by something else failing");
    assert.deepEqual(executor.handled.slice(handledBefore), [], "none of the executor's actions ran after its grant was withdrawn, reads included");
    assert.equal(executor.runs.length, 1, "no round started in the executor");
    assert.equal(store.rounds(sent.work.work_id).length, roundsBefore, "the work records no round for the refused follow-up");
    await service.followUps.remove(pending.standing.followup_id);

    // The grant given back, a follow-up scheduled while the executor runs, then the plugin stopped (as revoking or disabling it does
    // in the product) before it comes due: its actions are gone, and the round is refused without reaching it.
    repository.save({ ...runtime.get(installId), grants: [USE] });
    const stopping = await ranOnce("停用以后的定时");
    await runtime.stop(installId);
    const handledBeforeStop = executor.handled.length;
    await stopping.ran();
    const stopped = service.followUps.list(sent.work.work_id).find(row => row.followup_id === stopping.standing.followup_id)!.last!;
    assert.equal(stopped.outcome, "failed", "the round is refused when it comes due");
    assert.match(stopped.detail ?? "", /执行方现在找不到/u, "refused because the stopped executor's actions are gone, not by something else failing");
    assert.deepEqual(executor.handled.slice(handledBeforeStop), [], "none of the stopped executor's actions ran");
    assert.equal(executor.runs.length, 1, "no round started in the stopped executor");
    assert.equal(store.rounds(sent.work.work_id).length, roundsBefore, "the work records no round for either refused follow-up");
  });
});
