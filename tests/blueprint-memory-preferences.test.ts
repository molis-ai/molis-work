import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
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
