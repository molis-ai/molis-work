import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, type ActionCallContext, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import { memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { memorySettingActions, MEMORY_SETTING_KEYS } from "@molis-ai/molis-work-service-memory";
import { openTestHome } from "./fixtures/test-home.js";

test("SPC-04/ONB-22/23: memory adoption preserves per-plugin inheritance and undo returns the project to its live default", async t => {
  const env = await openTestHome(t), project = await env.createProject("Writing"), other = await env.createProject("Research");
  const who = await env.host.localPersonContext(project.reference), whoElse = await env.host.localPersonContext(other.reference);
  const homeCaller = await env.host.localPersonContext();
  const here = bindActionClient(env.host.actionClient(project.reference), () => who);
  const there = bindActionClient(env.host.actionClient(other.reference), () => whoElse);
  const home = bindActionClient(env.host.homeActionClient(), () => homeCaller);
  const key = MEMORY_SETTING_KEYS.project;
  async function read(client: BoundActionClient) {
    const { values: [setting] } = await client.invoke(memorySettingActions.read, { keys: [key] });
    assert.ok(setting?.state === "ok" && setting.value && typeof setting.value === "object" && !Array.isArray(setting.value));
    return { setting, value: setting.value };
  }
  const initial = await read(home);
  assert.equal(initial.setting.source, "provider_default");
  const baseRule = { plugin_id: "notes", allowed: false, kinds: ["fact"] };
  const base = { ...initial.value, plugins: [baseRule] };
  const request = { key, layer: "personal" as const, expected_revision: initial.setting.revision, request_id: "all-projects", change: { set: base } };
  const confirmed = await home.invoke(memorySettingActions.write, request);
  assert.equal((await read(here)).setting.source, "personal");
  const ownRule = { plugin_id: "writing", allowed: true, kinds: ["convention"] };
  const value = { ...base, auto: true, plugins: [ownRule] };
  const title = { literal: "Writing memory" };
  const { draft } = await here.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "rules", layer: "project", required: true, proposal: { kind: "setting", key, value } },
      { part_id: "outline", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["rules", "outline"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "outline", location: title } },
  } });
  const preview = await here.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["rules"] });
  assert.equal(preview.parts[0]?.decision, "update");
  const applied = await here.invoke(blueprintActions.apply, { preview_id: preview.preview_id, part_ids: ["rules"], request_id: "writing-memory" });
  assert.equal(applied.steps[0]?.state, "applied");
  const local = await read(here);
  assert.deepEqual(local.setting.layers?.project, value);
  assert.deepEqual(local.value.plugins, [baseRule, ownRule]);
  const { prefs } = await here.invoke(memoryActions.prefs, { scope: "project" });
  assert.deepEqual(prefs.plugins, { notes: { allowed: false, kinds: ["fact"] }, writing: { allowed: true, kinds: ["convention"] } });
  assert.equal(prefs.auto, true);
  assert.deepEqual((await read(there)).value, base);
  const incoming = await here.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "new_project", display_name: "Editing" }, part_ids: ["rules"] });
  const candidate = incoming.parts[0]?.candidates[0];
  assert.ok(candidate?.kind === "owner" && candidate.current.state === "present");
  assert.equal(candidate.current.setting_source, "personal");
  assert.deepEqual(candidate.current.value, base, "a new project inherits the default, including when the originating project overrides it");
  const reversed = await here.invoke(blueprintActions.revert, { adoption_id: applied.adoption_id, request_id: "undo-writing" });
  assert.equal(reversed.undo.steps[0]?.state, "restored");
  assert.equal((await read(here)).setting.source, "personal");
  assert.deepEqual((await read(here)).value, base);
  await home.invoke(memorySettingActions.write, { ...request, expected_revision: confirmed.values[0]!.revision, request_id: "back-to-provider", change: { inherit: true } });
  assert.equal((await read(here)).setting.source, "provider_default");
  assert.deepEqual(await home.invoke(memorySettingActions.write, request), confirmed);
  assert.equal((await read(there)).setting.source, "provider_default", "replaying the original receipt does not overwrite the later default");
  await assert.rejects(env.host.homeActionClient().invoke({ ...homeCaller, actor_kind: "runtime" }, memorySettingActions.read, { keys: [key] }), { code: "memory.forbidden" });
});

test("SPC-04/ONB-28/30: one adoption writes both memory layers and another project can keep the personal default it reused", async t => {
  const env = await openTestHome(t), one = await env.createProject("Writing"), two = await env.createProject("Research");
  const key = MEMORY_SETTING_KEYS.project;
  async function person(project: typeof one) {
    const caller = await env.host.localPersonContext(project.reference);
    return bindActionClient(env.host.actionClient(project.reference), () => caller);
  }
  const writing = await person(one), research = await person(two), title = { literal: "Remember editorial conventions" };
  async function read(client: BoundActionClient) {
    const [current] = (await client.invoke(memorySettingActions.read, { keys: [key] })).values;
    assert.ok(current?.state === "ok" && current.value && typeof current.value === "object" && !Array.isArray(current.value));
    return { current, value: current.value };
  }
  const initial = await read(writing);
  const personal = { ...initial.value, auto: true, plugins: [{ plugin_id: "notes", allowed: false, kinds: ["fact"] }] };
  const local = { ...initial.value, auto: false, plugins: [{ plugin_id: "writing", allowed: true, kinds: ["convention"] }] };
  async function adopt(client: BoundActionClient, id: string, both: boolean) {
    const { draft } = await client.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
      title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title }, parts: [
        { part_id: "base", layer: "personal", required: true, proposal: { kind: "setting", key, value: personal } },
        { part_id: "local", layer: "project", required: false, proposal: { kind: "setting", key, value: local } },
        { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
      steps: [{ step_id: "prepare", title, part_ids: ["base", "local", "note"] }],
      example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "note", location: title } },
    } });
    const part_ids = both ? ["base", "local"] : ["base"];
    const { preview_id } = await client.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids });
    return client.invoke(blueprintActions.apply, { preview_id, part_ids, request_id: id });
  }
  const first = await adopt(writing, "both-layers", true);
  assert.deepEqual(first.steps.map(step => step.state), ["applied", "applied"]);
  assert.deepEqual((await read(writing)).current.layers?.project, local);
  assert.deepEqual((await read(research)).value, personal);
  assert.ok((await writing.invoke(blueprintActions.read, { adoption_id: first.adoption_id })).apply_steps.every(step => step.state === "applied" && !step.current));
  const undone = await writing.invoke(blueprintActions.revert, { adoption_id: first.adoption_id, request_id: "undo-both" });
  assert.deepEqual(undone.undo.steps.map(step => step.state), ["restored", "restored"]);
  assert.equal((await read(writing)).current.source, "provider_default");
  assert.equal((await read(research)).current.source, "provider_default");

  // A real user edit lands after the personal write and before the project write of the same adoption.
  const normalClient = env.host.actionClient.bind(env.host);
  const manual = { ...initial.value, plugins: [{ plugin_id: "research", allowed: false, kinds: ["fact"] }] };
  const editProject = async () => writing.invoke(memorySettingActions.write, { key, layer: "project",
    expected_revision: (await read(writing)).current.revision, request_id: "manual-between-layers", change: { set: manual } });
  let injected = false;
  const interruption = t.mock.method(env.host, "actionClient", (...args: Parameters<typeof env.host.actionClient>): ReturnType<typeof env.host.actionClient> => {
    const client = normalClient(...args);
    return { ...client, async invoke(ctx: ActionCallContext, ref: ActionReference, input: unknown) {
      const answer = await client.invoke(ctx, ref, input);
      if (!injected && ref.capability_id === memorySettingActions.write.capability_id && (input as SettingsWriteInput).layer === "personal") {
        injected = true; await editProject();
      }
      return answer;
    } };
  });
  const interrupted = await adopt(writing, "between-layers", true);
  interruption.mock.restore();
  assert.equal(injected, true);
  assert.deepEqual(interrupted.steps.map(step => step.state), ["applied", "failed"]);
  assert.deepEqual((await read(writing)).current.layers?.project, manual);
  let lost = false;
  const droppedReply = t.mock.method(env.host, "actionClient", (...args: Parameters<typeof env.host.actionClient>): ReturnType<typeof env.host.actionClient> => {
    const client = normalClient(...args);
    return { ...client, async invoke(ctx: ActionCallContext, ref: ActionReference, input: unknown) {
      const answer = await client.invoke(ctx, ref, input);
      if (!lost && ref.capability_id === memorySettingActions.write.capability_id && (input as SettingsWriteInput).request_id.endsWith(":undo:base")) {
        lost = true; throw new Error("owner reply interrupted after commit");
      }
      return answer;
    } };
  });
  const undo = { adoption_id: interrupted.adoption_id, request_id: "undo-interrupted" };
  const pending = await writing.invoke(blueprintActions.revert, undo);
  droppedReply.mock.restore();
  assert.equal(lost, true);
  assert.equal(pending.undo.steps[0]?.state, "pending_verification");
  await writing.invoke(memorySettingActions.write, { key, layer: "project", expected_revision: (await read(writing)).current.revision,
    request_id: "later-project-edit", change: { inherit: true } });
  const afterManual = await read(writing);
  const replayed = await writing.invoke(blueprintActions.revert, undo);
  assert.equal(replayed.undo.steps[0]?.state, "restored");
  assert.deepEqual(await read(writing), afterManual, "lost undo replies replay the original full revision, preserving the intervening project edit");

  // An undo that never reached the owner may retry after another layer changed the full revision.
  const confirmed = await adopt(writing, "before-undo-dispatch", false);
  assert.equal(confirmed.steps[0]?.state, "applied");
  const beforeDispatch = t.mock.method(env.host, "actionClient", (...args: Parameters<typeof env.host.actionClient>) => {
    const client = normalClient(...args);
    return { ...client, async invoke(ctx: ActionCallContext, ref: ActionReference, input: unknown) {
      if (ref.capability_id === memorySettingActions.write.capability_id && (input as SettingsWriteInput).recovery)
        throw new Error("interrupted before the owner received the undo");
      return client.invoke(ctx, ref, input);
    } };
  });
  const resume = { adoption_id: confirmed.adoption_id, request_id: "resume-undo" };
  assert.equal((await writing.invoke(blueprintActions.revert, resume)).undo.steps[0]?.state, "pending_verification");
  beforeDispatch.mock.restore();
  await writing.invoke(memorySettingActions.write, { key, layer: "project", expected_revision: (await read(writing)).current.revision,
    request_id: "change-other-layer-during-undo", change: { set: manual } });
  const conflict = (await writing.invoke(blueprintActions.revert, resume)).undo.steps[0];
  assert.ok(conflict?.state === "failed" && conflict.error.code === "memory.setting_conflict", "the version conflict remains retryable");
  assert.equal((await writing.invoke(blueprintActions.revert, resume)).undo.steps[0]?.state, "restored");
  const restored = await read(writing);
  assert.equal(restored.current.layers?.personal, undefined);
  assert.deepEqual(restored.current.layers?.project, manual);
  assert.equal((await writing.invoke(blueprintActions.remove, { ...resume, request_id: "remove-restored" })).undo.steps[0]?.state, "restored");
  assert.deepEqual(await read(writing), restored);
  await writing.invoke(memorySettingActions.write, { key, layer: "project", expected_revision: restored.current.revision,
    request_id: "clear-project-before-shared-adoption", change: { inherit: true } });

  const again = await adopt(writing, "both-again", true);
  const byOther = await adopt(research, "keep-personal", false);
  assert.deepEqual(byOther.steps[0], { part_id: "base", state: "applied", outcome: "reused" });
  const after = await writing.invoke(blueprintActions.remove, { adoption_id: again.adoption_id, request_id: "remove-both" });
  assert.deepEqual(after.undo.steps.find(step => step.part_id === "base"), { part_id: "base", state: "skipped", reason: "shared" });
  assert.equal(after.undo.steps.find(step => step.part_id === "local")?.state, "restored");
  assert.deepEqual((await read(writing)).value, personal);
  assert.deepEqual((await read(research)).value, personal);
});
