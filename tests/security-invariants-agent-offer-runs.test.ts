// SECURITY-INVARIANTS: a plugin runs a round's suggestion only through `agent.offers.run`, and that runs exactly the action
// the suggestion names, under the round's own grant as it reads now, with input the action itself accepts. Each case
// asserts the refusal itself and that nothing ran (specs/ai-interaction-experience D25, D27).
import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, actionDigest, emptyCapabilityMatrix, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentOfferActions, type AgentRecalledMemory, type AgentRunOffer, type AgentRunView, type AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "install", actor_id: "actor" };
const WRITE: ActionView = { capability_id: "fixture.notes.write", version: 1, operation: "command",
  provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true },
  action: { title: "Save a note", description: "Store a note", kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } } };
const DELETE: ActionView = { ...WRITE, capability_id: "fixture.notes.delete", action: { ...WRITE.action, title: "Delete every note" } };
const refOf = (view: ActionView): ExactActionReference => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const offer: AgentRunOffer = { offer_id: "offer-1", offered_at: "2026-10-16T08:00:00.000Z", title: "保存", summary: "存一条", reference: refOf(WRITE),
  input: { text: "会后发纪要" }, editable: ["text"], action_digest: actionDigest(WRITE) };

/** `agent.offers.run` as the Host registers it, over a runtime holding one finished round with one suggestion. */
function registered(options: { views?: ActionView[]; sessionOwner?: typeof owner; frozen?: ExactActionReference[];
  memory?: Pick<AgentRunView, "class_restrictions" | "memory_scene">; latestMemory?: Pick<AgentRunView, "class_restrictions" | "memory_scene"> } = {}) {
  const host = new AgentHost(), handlers = new Map<string, (source: unknown, input: unknown, invocation: unknown) => Promise<unknown>>();
  const counts = { checked: 0, invoked: [] as Array<{ reference: ExactActionReference; input: unknown }>,
    readRuns: [] as string[], memory: [] as Array<Pick<AgentRecalledMemory, "class_restrictions" | "current_scene"> | null | undefined> };
  const run = { offers: [offer], frozen: { action_tools: options.frozen ?? [refOf(WRITE), refOf(DELETE)] }, ...options.memory };
  const original = { session_id: "own-session", run_id: "own-run" }, latest = { session_id: "own-session", run_id: "latest-run" };
  const latestView = options.latestMemory ? { ...run, ...options.latestMemory, ref: latest } as AgentRunView : null;
  const adapter = { descriptor: { runtime_id: "fixture", display_name: "Fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async readSession(ref) { return { session: ref, owner: options.sessionOwner ?? owner, title: "Owned", runs: latestView ? [original, latest] : [original], latest_run: structuredClone(latestView) }; },
    async read(ref) { counts.readRuns.push(ref.run_id); return structuredClone(ref.run_id === latest.run_id ? latestView : run) as AgentRunView; },
  } as AgentRuntimeAdapter;
  host.register(adapter);
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler as never); return () => {}; } },
    { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [], prompts: [] }, authorizedDirectories: [],
      actions: async (_runtimeId, _context, _session, memory) => { counts.memory.push(memory); return {
        discover: async () => options.views ?? [WRITE, DELETE],
        check: async (_reference, input) => { counts.checked++; if (typeof (input as { text?: unknown }).text !== "string") throw new ActionError("actions.input_invalid", "text must be a string"); },
        // As the composition's client does: the call's signal is checked again right before the action's effect.
        invoke: async (reference, input, signal) => { signal?.throwIfAborted(); counts.invoked.push({ reference, input }); return { saved: "ran" }; },
      }; } }) });
  const call = (input: Record<string, unknown>, invocation: Record<string, unknown>) => handlers.get(agentOfferActions.run.capability_id)!({}, input, invocation);
  return { call, counts };
}
const input = { runtime_id: "fixture", session_id: "own-session", run_id: "own-run", offer_id: "offer-1", reference: refOf(WRITE), input: { text: "会后发纪要，抄送小林" } };
const live = (assertAuthorityCurrent: () => void = () => {}, plugin: Record<string, unknown> = owner) =>
  ({ consumer: "plugin" as const, plugin: { ...plugin, assertActive() {}, declaration: { manifest: {} as never } }, assertAuthorityCurrent, beforeEffect: async () => {} });
const refusedWith = (code: string, kind?: string) => (error: unknown) => {
  assert.equal((error as { code?: unknown }).code, code, String(error));
  if (kind) assert.equal((error as { kind?: unknown }).kind, kind);
  return true;
};

test("S-29 (D25) agent.offers.run is for plugins only: the directory takes no other audience and a call with no plugin behind it is refused", async () => {
  assert.deepEqual(agentOfferActions.run.action.audiences, ["plugin"], "the person reaches a round's suggestion through the plugin that keeps its card");
  assert.equal(agentOfferActions.run.action.scheduling, "concurrent");
  const { call, counts } = registered();
  for (const consumer of ["agent", "user", "mcp"]) {
    await assert.rejects(call(input, { consumer, assertAuthorityCurrent() {}, beforeEffect: async () => {} }), refusedWith("actions.forbidden"), consumer);
  }
  assert.equal(counts.invoked.length, 0);
});

test("S-29 (D25) a round of another plugin's session, an offer the round never made, or a reference that is not the offer's own runs nothing", async () => {
  const foreign = registered({ sessionOwner: { ...owner, plugin_id: "io.molis.work.other" } });
  await assert.rejects(foreign.call(input, live()), refusedWith("agent.session_unknown"));
  assert.equal(foreign.counts.invoked.length, 0);

  const { call, counts } = registered();
  await assert.rejects(call({ ...input, run_id: "foreign-run" }, live()), refusedWith("agent.run_unknown"));
  await assert.rejects(call({ ...input, offer_id: "offer-forged" }, live()), refusedWith("agent.offer_unknown", undefined));
  // Another action the round was given is still not this suggestion's: a card runs what it shows, never a neighbour.
  await assert.rejects(call({ ...input, reference: refOf(DELETE) }, live()), refusedWith("agent.offer_mismatch"));
  await assert.rejects(call({ ...input, reference: { ...refOf(WRITE), version: 2 } }, live()), refusedWith("agent.offer_mismatch"));
  assert.equal(counts.checked + counts.invoked.length, 0);

  // A record naming an action outside the round's frozen tools is not run either.
  const outside = registered({ frozen: [refOf(DELETE)] });
  await assert.rejects(outside.call(input, live()), refusedWith("agent.offer_mismatch"));
  assert.equal(outside.counts.invoked.length, 0);
});

test("S-29 (D25) revoked access, an action switched off, gone or changed since the suggestion, or input the action refuses runs nothing", async () => {
  const revoked = registered();
  await assert.rejects(revoked.call(input, live(() => { throw new ActionError("plugins.activation_revoked", "activation revoked"); })), refusedWith("plugins.activation_revoked"));
  assert.equal(revoked.counts.invoked.length, 0);
  // Revoked after the action was found and its input checked, right before it would run: the last check refuses it.
  const late = registered();
  let checks = 0;
  await assert.rejects(late.call(input, live(() => { if (++checks > 3) throw new ActionError("plugins.activation_revoked", "revoked before running"); })), refusedWith("plugins.activation_revoked"));
  assert.equal(late.counts.checked, 1, "it got as far as the check");
  assert.equal(late.counts.invoked.length, 0);

  const off = registered({ views: [{ ...WRITE, availability: { available: false, code: "notes.disabled", reason: "Notes is turned off" } }] });
  await assert.rejects(off.call(input, live()), refusedWith("notes.disabled", "unavailable"));
  const gone = registered({ views: [DELETE] });
  await assert.rejects(gone.call(input, live()), refusedWith("actions.missing"));
  const notForAgents = registered({ views: [{ ...WRITE, action: { ...WRITE.action, audiences: ["user"] } }] });
  await assert.rejects(notForAgents.call(input, live()), refusedWith("actions.missing"));
  const changed = registered({ views: [{ ...WRITE, action: { ...WRITE.action, description: "Now also emails it" } }] });
  await assert.rejects(changed.call(input, live()), refusedWith("actions.definition_changed"));
  const refused = registered();
  await assert.rejects(refused.call({ ...input, input: { text: 42 } }, live()), refusedWith("actions.input_invalid"));
  for (const item of [off, gone, notForAgents, changed, refused]) assert.equal(item.counts.invoked.length, 0);
});

test("S-29 (D25) a click cancelled after the checks, right before the action would run, runs nothing", async () => {
  const { call, counts } = registered();
  const controller = new AbortController();
  // Cancelled once the Host has found the action and checked the input: only the action's own last check is left.
  const invocation = { ...live(), signal: controller.signal, beforeEffect: async () => { controller.abort(new ActionError("actions.cancelled", "the click was cancelled")); } };
  await assert.rejects(call(input, invocation), refusedWith("actions.cancelled"));
  assert.equal(counts.checked, 1, "it got as far as the check");
  assert.equal(counts.invoked.length, 0);
});

test("S-29 (D25) the offer's own action runs once with the person's input, under the round's grant", async () => {
  const { call, counts } = registered();
  assert.deepEqual(await call(input, live()), { output: { saved: "ran" } });
  assert.deepEqual(counts.invoked, [{ reference: refOf(WRITE), input: { text: "会后发纪要，抄送小林" } }]);
  assert.equal(counts.checked, 1);
});

const oldMemory: Pick<AgentRunView, "class_restrictions" | "memory_scene"> = {
  class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [], project: [
    { selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "inherit" },
  ] }, memory_scene: "coding",
};
const latestMemory: Pick<AgentRunView, "class_restrictions" | "memory_scene"> = {
  class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [], project: [] }, memory_scene: "assistant",
};

test("S-29 an old round's offer carries its original memory restrictions and scene, even when the session has a newer round", async () => {
  const { call, counts } = registered({ memory: oldMemory, latestMemory });
  assert.deepEqual(await call(input, live()), { output: { saved: "ran" } });
  assert.deepEqual(counts.memory, [{ class_restrictions: oldMemory.class_restrictions, current_scene: "coding" }]);
  assert.deepEqual(counts.readRuns, ["own-run"]);
  assert.equal(counts.invoked.length, 1);
});

test("S-29 an offer without its complete original memory snapshot passes null rather than borrowing the newer round's policy", async () => {
  for (const memory of [{}, { class_restrictions: oldMemory.class_restrictions }, { memory_scene: oldMemory.memory_scene }]) {
    const { call, counts } = registered({ memory, latestMemory });
    assert.deepEqual(await call(input, live()), { output: { saved: "ran" } });
    assert.deepEqual(counts.memory, [null]);
    assert.deepEqual(counts.readRuns, ["own-run"]);
    assert.equal(counts.invoked.length, 1, "the ordinary action stays usable without granting memory access");
  }
});
