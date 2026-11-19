import assert from "node:assert/strict";
import test from "node:test";
import { type ActionCallContext, type ActionReference, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_INSTALL_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

test("S-blueprint-consent-context: adoption passes its person's settings authority and never delegates installation consent", async t => {
  const { host, createProject } = await openTestHome(t);
  const project = await createProject("Notebook"), raw = host.actionClient(project.reference);
  const person = { ...await host.localPersonContext(project.reference), user_action: { source: "web", conversation_ref: "project/settings", message_ref: "adopt-scene" } };
  const user = bindActionClient(raw, () => person), key = "projects.runtime", title = { literal: "Notebook settings" };
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key, value: "prologue" } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["engine", "note"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "note", location: title } },
  } });
  const preview = await user.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["engine"] });
  const candidate = preview.parts[0]?.candidates[0];
  assert.ok(candidate?.kind === "owner" && candidate.current.state === "present");
  const settingWrite = candidate.action;
  const value = { key, layer: "project", expected_revision: candidate.current.revision, request_id: "system-write", change: { set: "prologue" } };
  await assert.rejects(raw.invoke({ ...person, actor_id: "system.blueprints" }, settingWrite, value), { code: "actions.forbidden" });
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);

  let checked = 0;
  const clientFor = host.actionClient.bind(host);
  t.mock.method(host, "actionClient", (...args: Parameters<typeof host.actionClient>): ReturnType<typeof host.actionClient> => {
    const client = clientFor(...args);
    return { ...client, async invoke(caller: ActionCallContext, ref: ActionReference, input: unknown) {
      if (ref.capability_id === settingWrite.capability_id) {
        assert.equal(caller.actor_id, person.actor_id);
        assert.equal(caller.project_id, project.project_id);
        assert.equal(caller.user_action, undefined);
        await assert.rejects(client.invoke(caller, { ...pluginInstallActions.confirm, provider_id: PLUGIN_INSTALL_PROVIDER_ID },
          { preview_id: "consent-not-given", consent: true }), { code: "actions.forbidden" });
        checked++;
      }
      return client.invoke(caller, ref, input);
    } };
  });
  const result = await user.invoke(blueprintActions.apply, { preview_id: preview.preview_id, part_ids: ["engine"], request_id: "real-person" });
  assert.equal(result.steps[0]?.state, "applied");
  assert.equal(checked, 1);
  const layer = host.observation!.layer; layer.flush();
  const records = readRecords(layer.writer.database()!.db, { limit: 5000 });
  const parent = records.find(r => r.fact === "action.call" && r.detail.action === "blueprints.adoption.apply@1" && r.outcome === "succeeded");
  assert.ok(parent?.work.invocation_id);
  assert.ok(records.some(r => r.detail.action === "projects.settings.write@1" && r.outcome === "succeeded" &&
    r.work.parent_invocation_id === parent.work.invocation_id && r.work.call_id === parent.work.call_id));
});
