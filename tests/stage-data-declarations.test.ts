// T-133 slice 1 (PG-060): a plugin's stage reads its own data through the read action its stage-opening Manifest view declares
// (`stage_data`), under the same rule as `settings_data`. The Host calls it as the person in the project with only that action's own
// permissions and knows no plugin by name: the page, and `GET /api/stage/<plugin>` that redraws the stage in place. Schedule is the
// first plugin drawn this way.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_CATALOG, stageDataAction, renderStagePage } from "@molis-ai/molis-work-app-workbench";
import { scheduleActions, scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import { MolisWorkLocalHost, declaredStageData, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;

const readAction = (over: Part = {}, id = "notes.snapshot", version = 1) => ({ capability_id: id, version, operation: "query", action: {
  title: "读取", description: "读取舞台的数据", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" }, output_schema: { type: "object" }, ...over } });
/** A Manifest whose views are `views`, each drawn by its own contribution, with `actions` as its own actions. */
const withViews = (views: Part[], actions: unknown[] = [readAction()]) => declarationManifest({ actions,
  ui: { contributions: views.map(view => `${DECLARATION_PLUGIN_ID}.${String(view.view_id)}`), views } });
const navigator = (over: Part = {}): Part => ({ view_id: "main", slot: "navigator", title: "Main", icon: "note", stage_data: { action: "notes.snapshot" }, ...over });
const NO_ACTION = "视图 main 的 stage_data 指向 notes.snapshot，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作";

const DECLARATION_RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  { rule: "the navigator view that opens the stage names a read of its own for the person", manifest: withViews([navigator()]), expected: "" },
  { rule: "the stage view names it while a navigator lists the plugin", manifest: withViews([navigator({ stage_data: undefined }), { view_id: "board", slot: "stage", title: "Board", stage_data: { action: "notes.snapshot" } }]), expected: "" },
  { rule: "a navigator view that does not open the stage", manifest: withViews([navigator(), { view_id: "board", slot: "stage", title: "Board" }]),
    expected: "视图 main 的 stage_data 只用于打开舞台的视图（board）" },
  { rule: "a second navigator view", manifest: withViews([navigator({ stage_data: undefined }), navigator({ view_id: "more" })]),
    expected: "视图 more 的 stage_data 只用于打开舞台的视图（main）" },
  { rule: "a settings view", manifest: withViews([navigator({ slot: "settings" })]), expected: "视图 main 的 stage_data 只用于打开舞台的视图（stage 或 navigator）" },
  { rule: "a side view", manifest: withViews([navigator({ slot: "side" })]), expected: "视图 main 的 stage_data 只用于打开舞台的视图（stage 或 navigator）" },
  { rule: "stage_data without an action", manifest: withViews([navigator({ stage_data: {} })]), expected: "视图 main 的 stage_data 必须写明 action" },
  { rule: "stage_data that is not an object", manifest: withViews([navigator({ stage_data: "notes.snapshot" })]), expected: "视图 main 的 stage_data 必须写明 action" },
  { rule: "another plugin's action", manifest: withViews([navigator({ stage_data: { action: "schedule.tasks.list" } })]),
    expected: "视图 main 的 stage_data 指向 schedule.tasks.list，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作" },
  { rule: "a command", manifest: withViews([navigator()], [{ ...readAction(), operation: "command", action: { ...readAction().action, kind: "operation" } }]), expected: NO_ACTION },
  { rule: "a query that writes", manifest: withViews([navigator()], [readAction({ effect: "write" })]), expected: NO_ACTION },
  { rule: "an action that is not for the person", manifest: withViews([navigator()], [readAction({ audiences: ["workflow", "agent"] })]), expected: NO_ACTION },
  { rule: "an action declared in two versions", manifest: withViews([navigator()], [readAction(), readAction({}, "notes.snapshot", 2)]), expected: NO_ACTION },
];

for (const { rule, manifest, expected } of DECLARATION_RULES) {
  test(`RAC-2500 stage data declaration: ${rule}`, () => {
    assert.equal(manifestProblems(manifest), expected);
  });
}

test("RAC-2500 Schedule's stage-opening view names its own task list, and the workbench reads the action from the Manifest alone", () => {
  assert.equal(manifestProblems(scheduleManifest), "");
  assert.equal(stageDataAction(scheduleManifest), scheduleManifest.actions!.find(action => action.capability_id === scheduleActions.list.capability_id));
  assert.equal(stageDataAction(scheduleManifest)?.capability_id, "schedule.tasks.list");
  const declaring = BUILTIN_PLUGIN_CATALOG.filter(entry => stageDataAction(entry.manifest)).map(entry => entry.project_plugin_id);
  assert.deepEqual(declaring, ["goals", "feed", "inbox", "schedule"], "each owner declares its own stage read");
});

/** A binder that records the action each stage read is bound for, and answers through `answer`. */
function recordingBinder(answer: (capabilityId: string) => unknown) {
  const bound: string[] = [];
  const bind = (action: ActionDefinition): BoundActionClient => {
    bound.push(`${action.capability_id}@${action.version}`);
    return { discover: async () => [], invoke: async definition => answer(definition.capability_id) as never };
  };
  return { bound, bind };
}

test("RAC-2505 a stage read is bound for its own action alone, and only for the plugins the page shows", async () => {
  const { bound, bind } = recordingBinder(() => ({ jobs: [], tasks: [], operations: [] }));
  assert.deepEqual(await declaredStageData(["schedule", "goals"], bind), { goals: { jobs: [], tasks: [], operations: [] }, schedule: { jobs: [], tasks: [], operations: [] } });
  assert.deepEqual(bound, ["goals.stage.read@1", `${scheduleActions.list.capability_id}@${scheduleActions.list.version}`]);
  const none = recordingBinder(() => { throw new Error("not called"); });
  assert.deepEqual(await declaredStageData(["pages"], none.bind), {}, "no shown plugin declares a stage read");
  assert.deepEqual(none.bound, [], "a plugin the page does not show is not asked");
});

for (const code of ["actions.plugin_disabled", "actions.missing", "actions.forbidden"]) {
  test(`RAC-2504 a plugin that answers ${code} has no stage data, and the page still draws`, async () => {
    const { bind } = recordingBinder(() => { throw new ActionError(code, "不在"); });
    assert.deepEqual(await declaredStageData(["schedule"], bind), {});
  });
}

test("RAC-2504 any other failure of a stage read is the page's to show, not an empty stage", async () => {
  const { bind } = recordingBinder(() => { throw new Error("库坏了"); });
  await assert.rejects(declaredStageData(["schedule"], bind), /库坏了/);
});

/**
 * A Home with two projects, one showing Schedule and one not, served by the real web server over a real local Host; `actions` writes
 * Schedule's tasks as a person who may. Everything is closed and removed after the test.
 */
async function servedHome(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "stage-data-"));
  const { scheduled, bare } = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const make = async (name: string) => { const { project_id } = await catalog.createProject({ display_name: name, actor_id: "test" }); return project_id; };
    const scheduledId = await make("有 Schedule"), bareId = await make("没有 Schedule");
    if (!catalog.listProjectPlugins(scheduledId).includes("schedule")) catalog.addProjectPlugin({ project_id: scheduledId, plugin_id: "schedule", actor_id: "test" });
    if (catalog.listProjectPlugins(bareId).includes("schedule")) catalog.removeProjectPlugin({ project_id: bareId, plugin_id: "schedule", actor_id: "test" });
    return { scheduled: catalog.getProject(scheduledId), bare: catalog.getProject(bareId) };
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: scheduled.database_path, projectId: scheduled.project_id });
  const caller: ActionCallContext = { actor_id: "person", audience: "user", project_id: reference.project_id, permissions: ["schedule:read", "schedule:write"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = (projectId: string) => `http://127.0.0.1:${address.port}/projects/${encodeURIComponent(projectId)}`;
  return { host, scheduled, bare, actions, base };
}

test("RAC-2501 RAC-2502 RAC-2503 the page and its redraw take Schedule's stage from its own read; a plugin the project does not show, or one without a stage read, has no redraw", { timeout: 60_000 }, async t => {
  const { scheduled, bare, actions, base } = await servedHome(t);
  await actions.invoke(scheduleActions.createTask, { title: "Morning digest", instructions: "Read the news", time: "08:00" });

  // RAC-2501: the page's Schedule stage carries the task its own read lists.
  const page = await fetch(`${base(scheduled.project_id)}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Morning digest/);

  // RAC-2502: the stage is drawn again in place, from a fresh read: a task made after the page shows up in the redraw.
  await actions.invoke(scheduleActions.createTask, { title: "Evening review", instructions: "Close the day", time: "20:00" });
  const redraw = await fetch(`${base(scheduled.project_id)}/api/stage/schedule`);
  assert.equal(redraw.status, 200);
  assert.equal(redraw.headers.get("cache-control"), "no-store");
  const html = await redraw.text();
  assert.match(html, /data-schedule-workbench/);
  assert.match(html, /Morning digest/);
  assert.match(html, /Evening review/);

  // RAC-2503: a project that does not show Schedule is refused before anything is drawn or read.
  const refused = await fetch(`${base(bare.project_id)}/api/stage/schedule`);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json() as { code: string }).code, "actions.plugin_disabled");
  // A plugin whose stage declares no read, or a path below a plugin, is not this route's: the page has no such redraw.
  for (const path of ["/api/stage/pages", "/api/stage/schedule/tasks", "/api/stage/no-such-plugin"]) {
    const response = await fetch(base(scheduled.project_id) + path);
    assert.notEqual(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /data-schedule-workbench/, path);
  }
});

// Verification of slice 1 (#1590, Codex A): the binder was handed the action's permissions, but the local web adapter joined every running
// installation's back into the caller. What is asserted here is the caller the Host's action client really gets, for the page and its
// redraw: the person in this project, exactly the action's own permissions, and no other action it may reach.
test("RAC-2505 the page and its redraw call the stage read as the person in the project with exactly its own permissions and no other action", { timeout: 60_000 }, async t => {
  const { host, scheduled, actions, base } = await servedHome(t);
  await actions.invoke(scheduleActions.createTask, { title: "Morning digest", instructions: "Read the news", time: "08:00" });
  const callers: ActionCallContext[] = [], actionClient = MolisWorkLocalHost.prototype.actionClient;
  t.mock.method(host, "actionClient", (reference: Parameters<typeof actionClient>[0]) => {
    const client = actionClient.call(host, reference);
    return { discover: (context: ActionCallContext) => client.discover(context), invoke(context: ActionCallContext, action: ActionReference, input: unknown) {
      if (action.capability_id === scheduleActions.list.capability_id) callers.push(context);
      return client.invoke(context, action, input);
    } };
  });
  for (const path of ["/", "/api/stage/schedule"]) {
    callers.length = 0;
    const response = await fetch(base(scheduled.project_id) + path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /Morning digest/, path);
    assert.equal(callers.length, 1, `${path}: the stage read is called once`);
    const [caller] = callers;
    assert.deepEqual([caller!.actor_id, caller!.audience, caller!.project_id], [LOCAL_PERSON_ACTOR_ID, "user", scheduled.project_id], path);
    assert.deepEqual([...caller!.permissions].sort(), [...scheduleActions.list.action.permissions].sort(), `${path}: only the read's own permissions`);
    assert.deepEqual(caller!.allowed_actions?.map(item => `${item.capability_id}@${item.version}`), [`${scheduleActions.list.capability_id}@${scheduleActions.list.version}`], `${path}: no other action`);
    assert.equal(typeof caller!.validate_authority, "function", `${path}: the installation's grant is still checked per call`);
  }
});


test("RAC-2510 object reads and finite stage surfaces obey the same owner/read/placement declarations", () => {
  const object = readAction({}, "notes.object");
  const opening = navigator({ stage_data: { action: "notes.snapshot", object_action: "notes.object" }, stage_surfaces: ["workbench", "source-workbench"] });
  assert.equal(manifestProblems(withViews([opening], [readAction(), object])), "");
  for (const invalid of [readAction({}, "notes.other"), readAction({ effect: "write" }, "notes.object"),
    { ...object, operation: "command", action: { ...object.action, kind: "operation" } }, readAction({ audiences: ["agent"] }, "notes.object")]) {
    assert.match(manifestProblems(withViews([opening], [readAction(), invalid])), /stage_data.object_action/);
  }
  assert.match(manifestProblems(withViews([opening], [readAction(), object, readAction({}, "notes.object", 2)])), /stage_data.object_action/);
  for (const list of [[], ["source-workbench"], ["workbench", "workbench"], ["workbench", ""], "workbench"]) {
    assert.match(manifestProblems(withViews([navigator({ stage_surfaces: list })])), /stage_surfaces/);
  }
  assert.match(manifestProblems(withViews([navigator({ stage_surfaces: ["workbench"] }), { view_id: "other", title: "Other", slot: "stage" }])), /stage_surfaces.*打开舞台/);
  assert.match(manifestProblems(withViews([navigator({ slot: "settings", stage_data: undefined, stage_surfaces: ["workbench"] })])), /stage_surfaces.*打开舞台/);
});

test("RAC-2508 finite automatic surfaces share one model, skip already drawn pairs and exclude object/fragment main surfaces", () => {
  const manifest = scheduleManifest;
  const calls: string[] = [], data = { owner: "same result" }, model = { data };
  const contribution = { descriptor: { contribution_id: "surface-owner", kind: "embedded" as const, label: "Surface owner", slots: [], surfaces: [
    ...["workbench", "source-workbench", "persisted-detail", "frame-block", "workbench-fragment"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })),
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" }, { surface_id: "overlay", target_slot_id: "workbench.overlay", format: "declarative-html" },
  ] }, render(request: { surface: string; model: typeof model }) { assert.equal(request.model.data, data); calls.push(request.surface); return `<div data-surface="${request.surface}"></div>`; } };
  const selected = { ...manifest, ui: { ...manifest.ui, views: [{ view_id: "stage", title: "Stage", slot: "stage" as const, stage_surfaces: ["workbench", "source-workbench"] }] } };
  const result = renderStagePage(contribution, model, "surface-owner", false, undefined, { manifest: selected });
  assert.deepEqual(calls, ["workbench", "source-workbench", "directory", "overlay"]);
  assert.deepEqual(result.surfaces.map(row => row.surface), calls);
  assert.match(result.panels, /data-surface="directory"/); assert.match(result.overlays, /data-surface="overlay"/);
  calls.length = 0;
  renderStagePage(contribution, model, "surface-owner", false, undefined, { manifest: selected, rendered: [{ contribution_id: "surface-owner", surface: "workbench" }] });
  assert.deepEqual(calls, ["source-workbench", "directory", "overlay"]);
  calls.length = 0;
  assert.throws(() => renderStagePage(contribution, model, "surface-owner", false, undefined, { manifest: { ...selected, ui: { ...selected.ui,
    views: [{ ...selected.ui.views[0]!, stage_surfaces: ["workbench", "overlay"] }] } } }), /Stage main surface/);
  assert.deepEqual(calls, [], "an invalid declaration renders nothing");
});
