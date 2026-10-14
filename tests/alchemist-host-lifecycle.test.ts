import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, alchemistManifest, ALCHEMIST_ACTION_PERMISSIONS, createAlchemistStudioRuntime, type AlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import { LocalHost, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";
import { alchemistOutput } from "./fixtures/alchemist-output.js";

async function setup(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "alchemist-host-lifecycle-")), hosts: MolisWorkLocalHost[] = [];
  const beforeClose: Array<() => void> = [];
  const { ai, requests } = controlledAlchemistAi();
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-a" });
  const open = async (actor: string) => {
    const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture" } }); hosts.push(host);
    await host.withProject(ref, r => r.coordinator.initializeBoard({ project_id: ref.project_id, title: "Host lifecycle", actor_id: "setup", idempotency_key: "init" }));
    return as(host, actor);
  };
  /** Another caller on the same Host, as separate MCP clients forwarded to the resident service are. */
  const as = (host: MolisWorkLocalHost, actor: string) => {
    const caller: ActionCallContext = { actor_id: actor, project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
    const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
    return { host, caller, client, bound };
  };
  t.after(async () => { beforeClose.forEach(release => release()); await Promise.all(hosts.map(host => host.close())); await rm(home, { recursive: true, force: true }); });
  return { home, ai, requests, ref, open, as, beforeClose, path: join(home, "alchemist/projects/project-a/studio.sqlite") };
}

for (const operation of ["conversation", "plan", "settings"] as const) {
  for (const refusal of ["cancel", "revoke"] as const) {
    test(`W2-18-ALCHEMIST-EFFECT-01: formal Host ${operation} rejects late foreground writes (${refusal})`, { timeout: 20_000 }, async t => {
      const f = await setup(t), first = await f.open("foreground-owner");
      const { direction } = await first.bound.invoke(a.directionCreate, { description: "验证前台等待结束后原始权限仍然有效" });
      let ideaId = "";
      if (operation === "plan") {
        const receipt = await first.bound.invoke(a.explorationStart, { id: direction.id });
        let exploration;
        for (let n = 0; n < 100; n++) {
          exploration = (await first.bound.invoke(a.explorationGet, { id: receipt.runId })).exploration;
          if (exploration.status === "completed") break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(exploration!.status, "completed");
        ideaId = (await first.bound.invoke(a.cardKeep, { id: exploration!.cards[0]!.id })).idea.id;
      }
      const before = await first.bound.invoke(a.settingsGet, {});
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
      const finished = Promise.withResolvers<void>();
      if (refusal === "cancel") {
        // Observe the actual resident Studio executor. No new runtime, fake business handler or production test hook.
        // The outer Kernel can refuse while that executor is still unwinding a non-cooperative model/metadata read.
        const owner = Reflect.get(first.host, "alchemist") as { get(caller: ActionCallContext): AlchemistStudioRuntime };
        const studio = owner.get(first.caller), invoke = studio.actions.invoke.bind(studio.actions);
        const actionId = (operation === "conversation" ? a.conversationSend : operation === "plan" ? a.researchPlan : a.settingsUpdate).capability_id;
        studio.actions.invoke = async (definition, input, signal, control) => {
          try { return await invoke(definition, input, signal, control); }
          finally { if (definition.capability_id === actionId) finished.resolve(); }
        };
      }
      f.beforeClose.push(() => release.resolve());
      let revoked = false;
      const listModels = f.ai.listModels;
      if (operation === "conversation") f.ai.generate = async () => { entered.resolve(); await release.promise; return alchemistOutput('{"reply":"Late answer"}'); };
      else f.ai.listModels = async () => { entered.resolve(); await release.promise; return listModels(); };
      const caller = { ...first.caller, signal: abort.signal, validate_authority: async () => {
        if (revoked) throw new ActionError("actions.forbidden", "original grant revoked");
      } };
      const pending = operation === "conversation"
        ? first.client.invoke(caller, a.conversationSend, { body: "The original user message", context: { kind: "direction", label: direction.title, directionId: direction.id } })
        : operation === "settings" ? first.client.invoke(caller, a.settingsUpdate, { modelPolicy: "auto", modelId: "", defaultBudgets: { marketSpace: { kind: "calls", limit: 9 }, buildCost: { kind: "calls", limit: 9 } } })
        : first.client.invoke(caller, a.researchPlan, { id: ideaId, ideaVersion: 1, lens: "build_cost", modelPolicy: "auto", budget: { kind: "calls", limit: 3 } });
      const rejected = assert.rejects(pending);
      await entered.promise; if (refusal === "cancel") abort.abort(); else revoked = true;
      release.resolve(); await rejected;
      if (refusal === "cancel") await finished.promise;
      f.ai.listModels = listModels;
      const db = new Database(f.path, { readonly: true });
      try {
        assert.equal((db.prepare("SELECT COUNT(*) AS count FROM research_plans").get() as { count: number }).count, 0);
        assert.equal((db.prepare("SELECT COUNT(*) AS count FROM mvp_scope_versions").get() as { count: number }).count, 0);
        assert.equal((db.prepare("SELECT COUNT(*) AS count FROM conversation_messages WHERE author = 'assistant'").get() as { count: number }).count, 0);
        assert.equal((db.prepare("SELECT COUNT(*) AS count FROM conversation_messages WHERE author = 'user'").get() as { count: number }).count, operation === "conversation" ? 1 : 0);
      } finally { db.close(); }
      assert.deepEqual(await first.bound.invoke(a.settingsGet, {}), before, "metadata return cannot change settings after refusal");
    });
  }
}

for (const operation of ["conversation", "settings"] as const) {
  test(`W2-18-ALCHEMIST-EFFECT-01: real provider disable/re-enable cannot revive a waiting ${operation}`, { timeout: 20_000 }, async t => {
    const plugin: { disable?: () => void; enable?: () => void } = {};
    const actionRegistry = LocalHost.prototype.actionRegistry;
    // Capture only the real Host's composition registration, then restore the observer before invoking anything.
    // Alchemist is personal, so a project Catalog toggle would not actually disable its provider.
    const observer = t.mock.method(LocalHost.prototype, "actionRegistry", function (this: LocalHost<unknown>, ...args: Parameters<LocalHost<unknown>["actionRegistry"]>) {
      const registry = actionRegistry.apply(this, args), register = registry.registerProvider;
      registry.registerProvider = registration => {
        const dispose = register(registration);
        if (registration.provider.plugin_id === alchemistManifest.plugin_id) {
          plugin.disable = dispose; plugin.enable = () => { plugin.disable = register(registration); };
        }
        return dispose;
      };
      return registry;
    });
    const f = await setup(t), first = await f.open("foreground-owner"); observer.mock.restore();
    assert.ok(plugin.disable); assert.ok(plugin.enable);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
    f.beforeClose.push(() => release.resolve());
    const { direction } = await first.bound.invoke(a.directionCreate, { description: "Keep the original foreground invocation stopped after plugin reload" });
    const before = await first.bound.invoke(a.settingsGet, {});
    const definition = operation === "conversation" ? a.conversationSend : a.settingsUpdate;
    const owner = Reflect.get(first.host, "alchemist") as { get(caller: ActionCallContext): AlchemistStudioRuntime };
    const studio = owner.get(first.caller), invoke = studio.actions.invoke.bind(studio.actions);
    studio.actions.invoke = async (target, input, signal, control) => {
      try { return await invoke(target, input, signal, control); }
      finally { if (target.capability_id === definition.capability_id) finished.resolve(); }
    };
    const generate = f.ai.generate, listModels = f.ai.listModels;
    // Ignore cancellation deliberately, so a late model/metadata return exercises production effect guards.
    if (operation === "conversation") f.ai.generate = async () => { entered.resolve(); await release.promise; return alchemistOutput('{"reply":"Late answer from the old registration"}'); };
    else f.ai.listModels = async () => { entered.resolve(); await release.promise; return listModels(); };
    const message = { body: "The original user message", context: { kind: "direction" as const, label: direction.title, directionId: direction.id } };
    const settings = { modelPolicy: "auto" as const, modelId: "", defaultBudgets: { marketSpace: { kind: "calls" as const, limit: 9 }, buildCost: { kind: "calls" as const, limit: 9 } } };
    const pending = operation === "conversation" ? first.bound.invoke(a.conversationSend, message) : first.bound.invoke(a.settingsUpdate, settings);
    const rejected = assert.rejects(pending, { code: "actions.provider_changed" });
    await entered.promise;
    plugin.disable();
    assert.equal((await first.bound.discover()).some(item => item.capability_id === definition.capability_id), false, "disabled provider is absent from the real directory");
    plugin.enable();
    assert.ok((await first.bound.discover()).some(item => item.capability_id === definition.capability_id && item.availability.available), "new registration is available before the old wait returns");
    release.resolve(); await rejected; await finished.promise;
    f.ai.generate = generate; f.ai.listModels = listModels;
    const db = new Database(f.path, { readonly: true });
    try {
      assert.equal((db.prepare("SELECT COUNT(*) AS count FROM conversation_messages WHERE author = 'assistant'").get() as { count: number }).count, 0, "old reply or failed reply is never persisted");
      assert.equal((db.prepare("SELECT COUNT(*) AS count FROM conversation_messages WHERE author = 'user'").get() as { count: number }).count, operation === "conversation" ? 1 : 0);
    } finally { db.close(); }
    assert.deepEqual(await first.bound.invoke(a.settingsGet, {}), before, "old metadata return cannot change settings after re-enable");
    if (operation === "conversation") {
      const fresh = await first.bound.invoke(a.conversationSend, { ...message, body: "A new invocation after re-enable" });
      assert.ok("assistantMessage" in fresh);
      assert.equal(fresh.assistantMessage.responseState, "complete");
      assert.equal((await first.bound.invoke(a.conversationList, {})).messages.filter(item => item.author === "assistant").length, 1, "only the new invocation writes a reply");
    } else {
      await first.bound.invoke(a.settingsUpdate, settings);
      assert.equal((await first.bound.invoke(a.settingsGet, {})).defaultBudgets.marketSpace.limit, 9, "the new invocation can update settings");
    }
  });
}

// One Home has one execution owner: AI goes through the Home's Prologue Runtime, so a second Host for the same Home is
// refused and MCP clients are forwarded to the resident one. Separate callers therefore share one Host.
test("Alchemist discovery is inert; on the Home's one Host a job keeps its caller, others' activity cannot stop it, and concurrent callers stay separate", { timeout: 30_000 }, async t => {
  const f = await setup(t), first = await f.open("alice"), second = f.as(first.host, "bob");
  // R4C2-01: a second Host still refuses the same Home instead of acquiring another model executor.
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: f.home }), { code: "agent.inference.home_in_use" });
  const catalog = await first.bound.discover();
  assert.ok(catalog.some(item => item.capability_id === a.directionCreate.capability_id && item.availability.available));
  await assert.rejects(access(f.path), { code: "ENOENT" }); assert.equal(f.requests.length, 0);
  const { direction } = await first.bound.invoke(a.directionCreate, { description: "多个 Host 共用同一份后台研究任务" });
  await second.bound.invoke(a.bootstrap, {});
  const generate = f.ai.generate, entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let jobActor: string | undefined;
  f.ai.generate = async input => { jobActor = input.actorId; entered.resolve(); await release.promise; return generate(input); };
  // Release in cleanup even if an assertion fails before the normal release.
  f.beforeClose.push(() => release.resolve());
  const receipt = await second.bound.invoke(a.explorationStart, { id: direction.id });
  await entered.promise;
  assert.equal(jobActor, "bob");
  // Another caller keeps working on the same Host; bob's running job is untouched.
  assert.ok((await first.bound.invoke(a.bootstrap, {})).directions.some((item: { id: string }) => item.id === direction.id));
  assert.equal((await second.bound.invoke(a.runEvents, { id: receipt.jobId! })).status, "running");
  release.resolve();
  let exploration;
  for (let n = 0; n < 100; n++) {
    exploration = (await second.bound.invoke(a.explorationGet, { id: receipt.runId })).exploration;
    if (["completed", "failed", "cancelled"].includes(exploration.status)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(exploration!.status, "completed"); assert.equal(f.requests.length, 1);
  const kept = await second.bound.invoke(a.cardKeep, { id: exploration!.cards[0]!.id }); assert.equal(kept.version.revision.actorId, "bob");
  const third = f.as(first.host, "carol"), both = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  const actors: string[] = [];
  f.ai.generate = async input => { actors.push(input.actorId!); if (actors.length === 2) both.resolve(); await finish.promise; return generate(input); };
  f.beforeClose.push(() => finish.resolve());
  const message = { body: "当前方向的风险是什么", context: { kind: "direction" as const, label: direction.title, directionId: direction.id } };
  const left = second.bound.invoke(a.conversationSend, message), right = third.bound.invoke(a.conversationSend, message);
  await both.promise; assert.deepEqual(actors.sort(), ["bob", "carol"]); finish.resolve();
  const replies = await Promise.all([left, right]);
  assert.deepEqual(replies.map(reply => reply.message.actorId), ["bob", "carol"]);
  assert.deepEqual(replies.map(reply => "assistantMessage" in reply ? reply.assistantMessage.actorId : null), ["bob", "carol"]);
  await first.host.close();
  const reopened = await f.open("dave");
  assert.equal((await reopened.bound.invoke(a.ideaGet, { id: kept.idea.id, version: 1 })).version.revision.actorId, "bob");
  assert.equal((await reopened.bound.invoke(a.conversationList, {})).messages.length, 4);
});

test("Alchemist queued jobs keep their original actor after restart", async t => {
  const f = await setup(t), caller = await f.open("new-reader");
  // A queued Studio task from the previous process, using its real invocation and persistent job input.
  const original = createAlchemistStudioRuntime({ databasePath: f.path, ai: f.ai });
  let receipt: { runId: string; jobId?: string };
  try {
    const actions = original.actionsFor("original-actor");
    const { direction } = await actions.invoke(a.directionCreate, { description: "重启后沿用已保存的任务发起者身份" });
    receipt = await actions.invoke(a.explorationStart, { id: direction.id });
  } finally { await original.close(); }
  const db = new Database(f.path);
  try { assert.equal(JSON.parse((db.prepare("SELECT input_json FROM jobs WHERE id = ?").get(receipt!.jobId) as { input_json: string }).input_json).actorId, "original-actor"); }
  finally { db.close(); }
  await caller.bound.invoke(a.bootstrap, {});
  let state = "queued";
  for (let n = 0; n < 100; n++) {
    state = (await caller.bound.invoke(a.runEvents, { id: receipt!.jobId! })).status;
    if (state === "completed" || state === "failed") break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(state, "completed"); assert.equal(f.requests[0]!.actorId, "original-actor");
});
