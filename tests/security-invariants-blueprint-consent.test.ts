import assert from "node:assert/strict";
import test from "node:test";
import { type ActionCallContext, type ActionReference, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_INSTALL_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { HOME_PAGE_CONTENT_TYPE, type HomePageOverview } from "@molis-ai/molis-work-contracts/services/home";
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

test("B37R-1 · scene draft readback and personal approval stay separate across retries", async t => {
  const { host, web, createProject } = await openTestHome(t);
  const project = await createProject("Scene page");
  const caller = await host.localPersonContext(project.reference);
  const user = bindActionClient(host.actionClient(project.reference), () => caller);
  const directory = await user.discover();
  assert.equal(directory.find(view => view.capability_id === "home.pages.drafts.save")?.provider.adopts?.[0]?.type, HOME_PAGE_CONTENT_TYPE);
  const title = { literal: "Weekly review" }, part_id = "first-page";
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id, required: true, layer: "project", proposal: { kind: "content", type: HOME_PAGE_CONTENT_TYPE,
      body: { title: title.literal, entry: "index.html", files: [{ path: "index.html", media_type: "text/html", text: "<h1>Review</h1>" }], actions: [] } } }],
    steps: [{ step_id: "start", title, part_ids: [part_id] }], example_task: { title, input: title, step_ids: ["start"], result: { part_id, location: title } },
  } });
  const preview = await user.invoke(blueprintActions.preview, { source: draft.source, part_ids: [part_id], target: { kind: "current_project" } });
  assert.equal(preview.parts[0]?.decision, "create");
  const input = { preview_id: preview.preview_id, part_ids: [part_id], request_id: "weekly-review" };
  const resume = async () => (await user.invoke(blueprintActions.apply, input)).steps[0];
  const step = await resume();
  assert.ok(step?.state === "needs_approval");
  assert.deepEqual(await resume(), step);
  const prefix = "/projects/" + project.project_id + "/api/home-pages/";
  const home = () => web.post<HomePageOverview>(prefix + "read", {});
  const first = await home();
  assert.equal(first.versions.length, 1);
  assert.deepEqual(first.selection, { kind: "basic" });
  const approve = async (request_id: string) => web.post(prefix + "adopt", {
    page_id: step.page_id, version: step.version, approved_actions: [], request_id, expected_revision: (await home()).revision,
  });
  await approve("independent-personal-adoption");
  assert.deepEqual(await resume(), step);
  await approve(step.approval_request_id);
  const accepted = await resume();
  assert.ok(accepted?.state === "applied" && "receipt" in accepted);
  const revision = (await home()).revision;
  assert.equal(accepted.receipt.revision, revision);
  await web.post(prefix + "select", { kind: "basic", expected_revision: revision, request_id: "use-default" });
  const after = await resume();
  assert.ok(after?.state === "applied" && "receipt" in after);
  assert.equal(after.current, "changed");
  assert.equal(after.receipt.revision, revision);
  assert.equal((await home()).versions.length, 1);
});
