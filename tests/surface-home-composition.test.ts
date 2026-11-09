import assert from "node:assert/strict";
import test from "node:test";
import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ActionError, defineSubjectContextAction, type ActionAvailability, type ActionDefinition, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction, definePresentationValuesAction, type PresentationObject, type PresentationOverview, type PresentationOverviewDeclaration, type PresentationValueItem, type PresentationValues, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SURFACE_HOME_ORDER_LIMIT, type SurfaceDescription, type SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { readSurfaceValues, startSurfaceRead, SurfaceCompositionService, type SurfaceComposePorts, type SurfaceHomePlugin, type SurfaceHomePorts, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";

const project = "project-a";
const person = { actor_id: "local-person", project_id: project, audience: "user" } as const;
const request = { slot: { kind: "home" } } satisfies SurfaceRequest;
const available = { available: true } as const;
const denied = { available: false, code: "actions.forbidden", reason: "no permission" } as const;
const emptyInput = { type: "object", properties: {}, additionalProperties: false } as const;
const at = "2026-11-08T08:00:00Z";
const subject = (kind: string, id: string): ActionSubject => ({ kind, id });
const target = ({ capability_id, version }: ActionDefinition) => ({ capability_id, version });
const exact = (view: ActionView) => ({ ...target(view), provider_id: view.provider.provider_id });
const ownerId = (name: string) => "io.molis.work." + name;
const card = (result: SurfaceDescription, owner: SurfacePlugin) => result.groups.find(group => group.owner_plugin_id === owner.plugin_id)!;

function installation(name: string, order: number, options: Partial<SurfacePlugin> = {}): SurfacePlugin & { home: SurfaceHomePlugin } {
  const scope = options.scope ?? "project";
  return { plugin_id: ownerId(name), install_id: name + "-" + scope, state: "running", slots: [], revision: "release-r1", ...options,
    scope, home: options.home ?? { order, installation_generation: "generation-1", version: "1.0.0", manifest_digest: "digest-" + name, stage_view_id: "stage" } };
}

function ownedView(plugin: SurfacePlugin, definition: ActionDefinition, availability: ActionAvailability = available, providerId = plugin.install_id): ActionView {
  return { ...definition, provider: { provider_id: providerId, plugin_install_id: plugin.install_id, plugin_id: plugin.plugin_id, title: plugin.plugin_id,
    kind: "plugin", ...(plugin.scope === "project" ? { project_id: project } : {}) }, availability };
}

function command(id: string, schema: ActionDefinition["action"]["input_schema"] = emptyInput): ActionDefinition {
  return { capability_id: id, version: 1, operation: "command", action: { kind: "operation", title: id, description: id,
    scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: schema } };
}

function systemView(id: string, providerId: string): ActionView {
  return { ...command(id), provider: { provider_id: providerId, kind: "system", title: providerId, project_id: project }, availability: available };
}

const readers = (plugin: SurfacePlugin, kind: string) => [
  ownedView(plugin, defineSubjectContextAction(kind + ".read", 1, kind, "Read", [], plugin.scope)),
  ownedView(plugin, definePresentationValuesAction(kind + ".values", 1, [kind], "Values", [], plugin.scope)),
];
function object(kind: string, actions?: PresentationObject["actions"]): PresentationObject {
  return { kind, fields: [{ key: "title", role: "title" }, { key: "stage", role: "status" }, { key: "edge", role: "relation" }],
    status: { field: "stage", map: { ready: { ring: "done" }, draft: { ring: "draft", attention: "needs_acceptance" } } },
    forms: { row: { fields: ["title"] }, card: { fields: ["title", "edge"] } }, actions };
}

function overview(name: string, plugin: SurfacePlugin, objects: PresentationObject[] = [], options: Omit<PresentationOverviewDeclaration, "capability_id" | "version"> = {}) {
  const definition = definePresentationOverviewAction(name + ".overview", 1, "Overview", [], plugin.scope);
  plugin.presentation = { objects, overview: { ...target(definition), ...options } };
  return ownedView(plugin, definition);
}

function entry(plugin: SurfacePlugin, object: ActionSubject, reason: AttentionSurfaceEntry["reason"] = "manual", revision = 1): AttentionSurfaceEntry {
  return { owner_plugin_id: plugin.plugin_id, subject: object, reason, entered_at: at, revision };
}

function harness(plugins: SurfacePlugin[], views: ActionView[], changes: Partial<SurfaceComposePorts> = {}, homeChanges: Partial<SurfaceHomePorts> = {}) {
  const counts = { admission: 0, catalog: 0, directory: 0, corrections: 0, attention: 0, relations: 0 };
  const calls: Array<{ ref: string; input: PresentationValuesInput }> = [];
  const { attention, relations, ...control } = changes;
  const ports: SurfaceComposePorts = {
    caller: person, current: () => undefined,
    beforeEffect: async () => { counts.admission++; },
    catalog: () => { counts.catalog++; return plugins; },
    discover: () => { counts.directory++; return { views, retain: () => () => undefined }; },
    corrections: { read: () => { counts.corrections++; return { corrections: [], revision: "0" }; },
      correct: async () => { throw new Error("unexpected write"); } },
    attention: () => { counts.attention++; return attention?.() ?? []; },
    relations: candidates => { counts.relations++; return relations?.(candidates) ?? []; },
    values: async (view, input) => {
      calls.push({ ref: view.capability_id, input });
      return { items: input.subjects.map(object => ({ subject: object, revision: "values-r1", state: "ok" })) };
    },
    home: {
      overview: async () => { throw new Error("unexpected overview"); },
      acceptsEmptyInput: view => compileActionSchema(view.action.input_schema)({}) === true,
      retainCatalog: () => () => undefined,
      hiddenAboveLabel: count => ({ owner: "workbench", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: count }] }),
      ...homeChanges,
    },
    ...control,
  };
  const service = new SurfaceCompositionService();
  return { counts, calls, compose: (input: SurfaceRequest = request) => service.compose(input, ports) };
}

test("SCS-07 SCS-08 home is personal before reads and a supplied order only ranks visible current catalog entries", async () => {
  const a = installation("alpha", 0), b = installation("beta", 1);
  const hidden: SurfacePlugin = { ...installation("hidden", 0), home: undefined };
  const uninstalled = installation("removed", 0, { state: "uninstalled" });
  const plugin = harness([a, b], [], { caller: { ...person, audience: "plugin" } });
  await assert.rejects(plugin.compose(), { code: "actions.forbidden" });
  assert.ok(Object.values(plugin.counts).every(count => count === 0));

  const cold = harness([], []);
  assert.deepEqual((await cold.compose()).groups, [{ kind: "attention", state: "ok", items: [] }]);
  const h = harness([a, b, hidden, uninstalled], []);
  const defaultOrder = await h.compose();
  assert.deepEqual(defaultOrder.groups.slice(1).map(group => group.owner_plugin_id), [a.plugin_id, b.plugin_id]);
  const pinned = await h.compose({ ...request, home_order: [hidden.plugin_id, uninstalled.plugin_id, b.plugin_id] });
  assert.deepEqual(pinned.groups.slice(1).map(group => group.owner_plugin_id), [b.plugin_id, a.plugin_id]);
  assert.notEqual(pinned.revision, defaultOrder.revision);
  await assert.rejects(h.compose({ ...request, home_order: [b.plugin_id, b.plugin_id] }), { code: "actions.input_invalid" });
  await assert.rejects(h.compose({ ...request, home_order: Array.from({ length: SURFACE_HOME_ORDER_LIMIT + 1 }, (_, index) => ownerId("x" + index)) }),
    { code: "actions.input_invalid" });
  await assert.rejects(h.compose({ slot: { kind: "discussion" }, home_order: [b.plugin_id] }), { code: "actions.input_invalid" });
  assert.deepEqual(h.counts, { admission: 2, catalog: 2, directory: 2, corrections: 2, attention: 2, relations: 0 });
});

test("SCS-08: a dual owner's identical provider and action refs cannot mix Home and project field reads", async () => {
  const personal = installation("shared", 0, { scope: "home" }), local = installation("shared", 0);
  const owner = personal.plugin_id;
  const view = (plugin: SurfacePlugin) => ownedView(plugin, definePresentationValuesAction("shared.values", 1, ["note"], "Values", [], plugin.scope), available, owner);
  const home = view(personal), project = view(local);
  const batch = [
    { action: home, subject: subject("note", "personal-note"), fields: ["title"] },
    { action: project, subject: subject("note", "project-note"), fields: ["title", "summary"] },
    { action: project, subject: subject("note", "project-other"), fields: ["title"] },
  ];
  const calls: Array<{ scope: string; fields: string[]; ids: string[] }> = [];
  const budget = startSurfaceRead(undefined);
  try {
    const results = await readSurfaceValues(batch, { values: async (action, input) => {
      calls.push({ scope: action.action.scope, fields: [...input.fields], ids: input.subjects.map(object => object.id) });
      return { items: input.subjects.map(object => ({ subject: object, revision: "1", state: "ok", values: { title: object.id } })) };
    } }, budget, () => undefined);
    assert.deepEqual(calls, [
      { scope: "home", fields: ["title"], ids: ["personal-note"] },
      { scope: "project", fields: ["summary", "title"], ids: ["project-note", "project-other"] },
    ]);
    assert.equal(results.size, 3);
  } finally { budget.dispose(); }
});

test("SCS-08 SCS-11 SCS-12 SSC-18 cards preserve exact starts and restore routes, distinguish failed and disabled, and read a dual owner only if unique", async () => {
  const ready = installation("notes", 0), plain = installation("plain", 1), failed = installation("failed", 2, { state: "crashed" });
  const nativeOff = installation("native-off", 3, { state: "disabled" });
  const signedOff = installation("signed-off", 4, { state: "disabled" });
  const homeOff = installation("home-off", 5, { state: "disabled", scope: "home" });
  const duoProject = installation("duo", 6), duoHome = installation("duo", 6, { scope: "home" });
  const bothProject = installation("both", 7), bothHome = installation("both", 7, { scope: "home" });
  duoProject.home = { ...duoProject.home, stage_view_id: undefined };
  bothProject.home = { ...bothProject.home, stage_view_id: undefined };
  const membership = systemView("projects.plugins.set", "system.projects");
  const installed = systemView("plugins.installed.enable", "system.plugins.installed");
  nativeOff.home = { ...nativeOff.home, enable: { kind: "project_membership", action: exact(membership), expected_revision: "members-r7" } };
  signedOff.home = { ...signedOff.home, enable: { kind: "project_installation", action: exact(installed) } };
  homeOff.home = { ...homeOff.home, enable: { kind: "home_plugin_settings" } };
  const withRequired = { type: "object", properties: { title: { type: "string" } }, additionalProperties: false, allOf: [{ required: ["title"] }] } as const;
  const required = ownedView(ready, command("notes.required", withRequired));
  const startForm = { view_id: "stage", panel: "create-dialog" };
  const form = ownedView(ready, command("notes.create", withRequired));
  const irreversible = command("notes.remove");
  const invoke = ownedView(ready, { ...irreversible, action: { ...irreversible.action, external: true } });
  ready.home = { ...ready.home, forms: [{ ...startForm, action: exact(form) }] };
  const readReady = overview("notes", ready, [], { note: { key: "notes.home.note" }, start: [target(required), { ...target(form), open: startForm }, target(invoke)] });
  const readDuo = overview("duo", duoProject);
  const readBoth = [overview("both", bothProject), overview("both", bothHome)];
  const readCalls: string[] = [];
  const h = harness([ready, plain, failed, nativeOff, signedOff, homeOff, duoProject, duoHome, bothProject, bothHome],
    [readReady, readDuo, ...readBoth, required, form, invoke, membership, installed], {}, { overview: async view => {
      readCalls.push(view.provider.provider_id);
      return { summary: { key: view === readReady ? "notes.home.empty" : "duo.home.summary" }, subjects: [],
        start: view === readReady ? [target(required), target(form), target(invoke)] : [] };
    } });
  const result = await h.compose();
  assert.deepEqual(readCalls, [ready.install_id, duoProject.install_id]);
  assert.equal(result.groups.filter(group => group.kind === "plugin").length, 8);
  assert.equal(result.groups.some(group => group.kind === "continue"), false);
  const readyRelease = { scope: "project", install_id: "notes-project", installation_generation: "generation-1", version: "1.0.0", manifest_digest: "digest-notes" };
  assert.equal(card(result, ready).state, "ok");
  assert.deepEqual(card(result, ready).items, []);
  assert.deepEqual(card(result, ready).plugin_card, {
    open: { kind: "stage", installation: readyRelease, view_id: "stage" },
    summary: { owner: ready.plugin_id, key: "notes.home.empty" }, note: { owner: ready.plugin_id, key: "notes.home.note" },
    start: [
      { kind: "form", ...startForm, installation: readyRelease, action: { ref: "notes.create@1", provider_id: ready.install_id, primary: true } },
      { kind: "invoke", installation: readyRelease, action: { ref: "notes.remove@1", provider_id: ready.install_id, primary: false, consequence: ["external", "irreversible"] } },
    ],
  });
  assert.deepEqual([card(result, plain).state, Object.keys(card(result, plain).plugin_card!)], ["undeclared", ["open"]]);
  assert.deepEqual([card(result, failed).state, card(result, failed).plugin_card], ["unreadable", {}]);
  assert.equal(card(result, nativeOff).state, "disabled");
  assert.deepEqual(card(result, nativeOff).plugin_card?.enable, {
    kind: "project_membership", expected_revision: "members-r7", action: { ref: "projects.plugins.set@1", provider_id: "system.projects", primary: true },
    installation: { ...readyRelease, install_id: "native-off-project", manifest_digest: "digest-native-off" },
  });
  assert.equal(card(result, signedOff).plugin_card?.enable?.kind, "project_installation");
  assert.deepEqual(card(result, homeOff).plugin_card?.enable, { kind: "home_plugin_settings",
    installation: { ...readyRelease, scope: "home", install_id: "home-off-home", manifest_digest: "digest-home-off" } });
  assert.equal(card(result, duoProject).plugin_card?.open?.installation.scope, "home");
  assert.deepEqual(card(result, duoProject).plugin_card?.summary, { owner: duoProject.plugin_id, key: "duo.home.summary" });
  assert.equal(card(result, bothProject).state, "unreadable");
  assert.equal(card(result, bothProject).plugin_card?.summary, undefined);

  ready.home = { ...ready.home, forms: [{ ...startForm, action: { ...exact(form), provider_id: "different-provider" } }] };
  const changed = await h.compose();
  assert.deepEqual(card(changed, ready).plugin_card?.start?.map(start => start.kind), ["invoke"]);
  assert.notEqual(changed.revision, result.revision);
});

test("SCS-07 SCS-09 SCS-11 SCS-17 one authorised object pass deduplicates Attention and the cards, joins only readable relationships, and ignores foreign claims", async () => {
  const notes = installation("notes", 1), feed = installation("feed", 0);
  const off = installation("off", 2, { state: "disabled" }), crash = installation("crash", 3, { state: "quarantined" });
  const a = subject("note", "decision"), b = subject("note", "denied"), c = subject("note", "deleted"), d = subject("note", "current"), e = subject("note", "stale");
  const source = subject("entry", "origin"), sync = subject("entry", "sync-only"), spoof = subject("note", "someone-elses");
  const edit = ownedView(notes, command("notes.edit"));
  const noteOverview = overview("notes", notes, [object("note", [{ ref: "notes.edit@1", primary: true }])]);
  const feedOverview = overview("feed", feed, [object("entry")]);
  const values: Array<{ view: string; input: PresentationValuesInput }> = [];
  const relations: ActionSubject[][] = [];
  const h = harness([notes, feed, off, crash], [noteOverview, feedOverview, ...readers(notes, "note"), ...readers(feed, "entry"), edit], {
    attention: () => [entry(notes, a, "goal_decision"), entry(notes, a), entry(notes, b), entry(notes, e), entry(off, b), entry(off, b, "manual", 2), entry(crash, c)],
    values: async (view, input) => {
      values.push({ view: view.capability_id, input });
      return { items: input.subjects.map((item): PresentationValueItem => {
        const revision = "facts-" + item.id;
        if (item.id === b.id) return { subject: item, revision, state: "forbidden" };
        if (item.id === c.id) return { subject: item, revision, state: "deleted" };
        if (item.id === e.id) return { subject: item, revision, state: "stale", read_at: at, values: { stage: "draft" } };
        return { subject: item, revision, state: "ok", values: { stage: "ready" } };
      }) };
    },
    relations: candidates => {
      relations.push(candidates.map(({ id, kind }) => ({ id, kind })));
      assert.ok(candidates.every(candidate => candidate.project_id === project));
      return [
        { derived: a, origin: source, type: CONTEXT_RELATION_TYPES.derived_from, revision: 1 },
        { derived: a, origin: b, type: CONTEXT_RELATION_TYPES.derived_from, revision: 2 },
      ];
    },
  }, { overview: async view => view === noteOverview
    ? { summary: { key: "notes.home.summary" }, subjects: [a, b, c, d, e], start: [] }
    : { summary: { key: "feed.home.summary" }, subjects: [source, { ...source }, sync, spoof], start: [] } });
  const result = await h.compose({ ...request, subjects: [spoof], home_order: [feed.plugin_id] });
  assert.deepEqual(h.counts, { admission: 1, catalog: 1, directory: 1, corrections: 1, attention: 1, relations: 1 });
  assert.deepEqual(values, [
    { view: "note.values", input: { subjects: [a, b, e, c, d], fields: ["edge", "stage"] } },
    { view: "entry.values", input: { subjects: [source, sync], fields: ["edge", "stage"] } },
  ]);
  assert.deepEqual(relations, [[a, e, d, source, sync]]);
  const attention = result.groups[0]!;
  assert.deepEqual(attention.items.map(item => item.subject), [a, e]);
  assert.equal(attention.items[0]?.actions[0]?.primary, true);
  assert.deepEqual(attention.items[0]?.merged, [{ subject: source, owner_plugin_id: feed.plugin_id, relation: CONTEXT_RELATION_TYPES.derived_from }]);
  assert.deepEqual(attention.excluded, [{ reason: "disabled", owner_plugin_id: off.plugin_id, count: 1 }]);
  assert.deepEqual(result.groups.slice(1, 3).map(group => group.owner_plugin_id), [notes.plugin_id, feed.plugin_id]);
  assert.deepEqual(card(result, notes).items.map(item => [item.subject, item.form, item.actions[0]?.primary]), [[d, "row", false]]);
  assert.deepEqual(card(result, feed).items.map(item => item.subject), [sync]);
  assert.equal(card(result, notes).hidden_above?.count, 2);
  assert.deepEqual(card(result, feed).hidden_above, { count: 1, label: { owner: "workbench", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: 1 }] } });
  assert.doesNotMatch(JSON.stringify(result), /"id":"(?:denied|deleted|someone-elses)"/);
});

test("SCS-08 SCS-12 SSC-18 repeated requests read current facts before cache reuse, with exact stale times and no previous overview on failure", async () => {
  const notes = installation("notes", 0), tasks = installation("tasks", 1);
  const a = subject("note", "a"), b = subject("note", "b"), c = subject("task", "c");
  const readNotes = overview("notes", notes, [object("note")]), readTasks = overview("tasks", tasks, [object("task")]);
  let count = 2, readCount = 0, fail = false, currentB = false, delayed = readNotes, forged = false;
  const h = harness([notes, tasks], [readNotes, readTasks, ...readers(notes, "note"), ...readers(tasks, "task")], {
    values: async (_view, input) => ({ items: input.subjects.map((item): PresentationValueItem =>
      item.kind === "task" || (item.id === "b" && currentB) ? { subject: item, state: "ok", revision: "current" }
        : { subject: item, state: "stale", revision: "old", read_at: item.id === "a" ? "2026-11-08T09:00:00Z" : at, values: { stage: "draft" } }) }),
  }, { overview: async view => {
    readCount++;
    if (view === delayed) await new Promise<void>(resolve => setImmediate(resolve));
    if (view === readTasks) return { summary: { key: "tasks.home.summary" }, subjects: [c], start: [] };
    if (fail) throw new Error("source unavailable");
    const summary = { key: "notes.home.summary", args: [{ name: "count", kind: "number" as const, number: count }], ...(forged ? { owner: tasks.plugin_id } : {}) };
    return { summary, subjects: [a, b], start: [] };
  } });
  const first = await h.compose();
  assert.deepEqual([card(first, notes).state, card(first, notes).read_at], ["stale", at]);
  assert.deepEqual(card(first, notes).items.map(item => [item.state, item.read_at]), [["stale", "2026-11-08T09:00:00Z"], ["stale", at]]);
  delayed = readTasks;
  assert.deepEqual(await h.compose(), first, "opposite response order does not affect the description");
  assert.equal(readCount, 4, "a revision hit still re-reads both overviews");
  assert.equal(h.counts.catalog, 2);
  count++;
  const changed = await h.compose();
  assert.notEqual(changed.revision, first.revision, "text arguments are revision facts");
  assert.deepEqual(card(changed, notes).plugin_card?.summary, { owner: notes.plugin_id, key: "notes.home.summary", args: [{ name: "count", kind: "number", number: 3 }] });
  notes.home = { ...notes.home, installation_generation: "generation-2" };
  const replaced = await h.compose();
  assert.notEqual(replaced.revision, changed.revision, "same version and digest, different installation generation");
  currentB = true;
  const mixed = await h.compose();
  assert.deepEqual([card(mixed, notes).state, card(mixed, notes).read_at], ["ok", undefined]);
  assert.equal(card(mixed, notes).items[0]?.state, "stale");
  fail = true;
  const unreadable = await h.compose();
  assert.equal(card(unreadable, notes).state, "unreadable");
  assert.equal(card(unreadable, notes).plugin_card?.summary, undefined);
  assert.deepEqual(card(unreadable, notes).items, []);
  assert.deepEqual(card(unreadable, tasks), card(mixed, tasks));
  fail = false;
  forged = true;
  const spoofed = await h.compose();
  assert.equal(card(spoofed, notes).state, "unreadable");
  assert.equal(card(spoofed, notes).plugin_card?.summary, undefined);
  assert.deepEqual(card(spoofed, notes).items, []);
  forged = false;
  assert.deepEqual(await h.compose(), mixed);
});

test("SCS-08 SCS-11 SSC-18 automatic overview rejects cost, external actions, model access and another scope's provider", async () => {
  const unsafe = installation("unsafe", 0), safe = installation("safe", 1);
  const original = overview("unsafe", unsafe), good = overview("safe", safe);
  const attempts = [
    { ...original.action, execution: undefined },
    { ...original.action, execution: { cost: "unknown" as const } },
    { ...original.action, execution: { cost: "metered" as const } },
    { ...original.action, external: true as const },
    { ...original.action, permissions: ["model:invoke"] },
    { ...original.action, effect: "write" as const },
    { ...original.action, scope: "home" as const },
  ];
  for (const action of attempts) {
    const called: string[] = [];
    const h = harness([unsafe, safe], [{ ...original, action }, good], {}, { overview: async view => {
      called.push(view.capability_id);
      return { summary: { key: "safe.home.summary" }, subjects: [], start: [] };
    } });
    const result = await h.compose();
    assert.deepEqual(called, ["safe.overview"]);
    assert.equal(card(result, unsafe).state, "unreadable");
    assert.equal(card(result, unsafe).plugin_card?.summary, undefined);
    assert.equal(card(result, safe).state, "ok");
  }
});

test("SCS-09 shared home batches split at 50 subjects or the union of 32 rule fields", async () => {
  const notes = installation("notes", 0);
  const a = Array.from({ length: 51 }, (_, index) => subject("note", "n" + index)), b = subject("ticket", "t");
  const fields = (prefix: string) => Array.from({ length: 17 }, (_, index) => ({ key: prefix + index, role: "relation" as const }));
  const declaration = (kind: string): PresentationObject => ({ kind, fields: [{ key: "title", role: "title" }, ...fields(kind)], forms: { row: { fields: ["title"] } } });
  const summary = overview("notes", notes, [declaration("note"), declaration("ticket")]);
  const shared = ownedView(notes, definePresentationValuesAction("notes.values", 1, ["note", "ticket"], "Values", []));
  const h = harness([notes], [summary, readers(notes, "note")[0]!, readers(notes, "ticket")[0]!, shared], {
    attention: () => [...a.map(item => entry(notes, item)), entry(notes, b)],
  }, { overview: async () => ({ summary: { key: "notes.home.summary" }, subjects: [a[0]!, a[50]!, b], start: [] }) });
  const result = await h.compose();
  assert.deepEqual(h.calls.map(call => [call.ref, call.input.subjects, call.input.fields]), [
    ["notes.values", a.slice(0, 50), fields("note").map(field => field.key).sort()],
    ["notes.values", a.slice(50), fields("note").map(field => field.key).sort()],
    ["notes.values", [b], fields("ticket").map(field => field.key).sort()],
  ]);
  assert.equal(h.counts.relations, 1);
  assert.equal(result.groups[0]?.items.length, 52);
  assert.deepEqual(card(result, notes).items, []);
  assert.equal(card(result, notes).hidden_above?.count, 3);
});

test("SCS-09 overview gateway timeouts keep their real in-flight slot through values and late completion never starts another read", { timeout: 10_000 }, async t => {
  const owners = Array.from({ length: 4 }, (_, index) => installation("overview-" + index, index));
  const active = installation("work", 4);
  const subjects = Array.from({ length: 5 }, (_, index) => subject("work" + index, "item" + index));
  active.presentation = { objects: subjects.map(item => object(item.kind)) };
  const overviewViews = owners.map((owner, index) => overview("overview-" + index, owner));
  const valuesViews = subjects.flatMap(item => readers(active, item.kind));
  const timedOutProvider = Promise.withResolvers<void>(), heldValues = Promise.withResolvers<PresentationValues>(), valuesBegan = Promise.withResolvers<void>();
  t.after(() => { timedOutProvider.resolve(); heldValues.resolve({ items: [] }); });
  let live = 0, maxLive = 0, valuesStarted = 0;
  const signals: AbortSignal[] = [];
  const start = (signal: AbortSignal) => { signals.push(signal); maxLive = Math.max(maxLive, ++live); };
  const h = harness([...owners, active], [...overviewViews, ...valuesViews], {
    attention: () => subjects.map(item => entry(active, item)),
    values: async (_view, _input, signal) => {
      start(signal);
      if (++valuesStarted === 3) valuesBegan.resolve();
      try { return await heldValues.promise; } finally { live--; }
    },
  }, { overview: async (view, signal) => {
    start(signal);
    if (view === overviewViews[0]) {
      void timedOutProvider.promise.then(() => { live--; });
      throw new ActionError("actions.timeout", "Gateway returned while provider still runs");
    }
    live--;
    return { summary: { literal: "Current summary" }, subjects: [], start: [] };
  } });
  const composing = h.compose();
  await valuesBegan.promise;
  assert.equal(live, 4);
  assert.equal(valuesStarted, 3);
  const result = await composing;
  assert.equal(maxLive, 4);
  assert.equal(card(result, owners[0]!).state, "unreadable");
  assert.equal(card(result, owners[0]!).plugin_card?.summary, undefined);
  assert.ok(owners.slice(1).every(owner => card(result, owner).state === "ok"));
  assert.deepEqual(result.groups[0]?.items, []);
  assert.equal(new Set(signals).size, 1, "both phases share the same absolute deadline signal");
  assert.ok(signals.every(signal => signal.aborted));
  timedOutProvider.resolve();
  heldValues.resolve({ items: [] });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(live, 0);
  assert.equal(valuesStarted, 3);
});

test("SCS-09 SCS-17 cancellation, retained overview authority, and catalog replacement reject the whole in-flight home", { timeout: 10_000 }, async () => {
  const notes = installation("notes", 0), a = subject("note", "a");
  const read = overview("notes", notes, [object("note")]);
  const views = [read, ...readers(notes, "note")];
  const overviewReady = Promise.withResolvers<AbortSignal>(), heldOverview = Promise.withResolvers<PresentationOverview>();
  const parent = new AbortController();
  const h = harness([notes], views, { signal: parent.signal }, {
    overview: (_view, signal) => { overviewReady.resolve(signal); return heldOverview.promise; },
  });
  const pending = h.compose();
  const child = await overviewReady.promise;
  const cancellation = new ActionError("actions.cancelled", "Parent cancelled");
  parent.abort(cancellation);
  await assert.rejects(pending, cancellation);
  heldOverview.resolve({ summary: { key: "notes.home.summary" }, subjects: [a], start: [] });
  assert.equal(child.aborted, true);
  assert.deepEqual(h.calls, []);

  for (const revoked of ["action", "catalog"] as const) {
    let current = true;
    const begun = Promise.withResolvers<void>(), held = Promise.withResolvers<PresentationValues>();
    const error = new ActionError(revoked === "action" ? "actions.forbidden" : "actions.provider_changed", "Home authority changed");
    const next = harness([notes], views, {
      discover: () => ({ views, retain: selected => () => { if (!current && revoked === "action" && selected.includes(read)) throw error; } }),
      values: () => { begun.resolve(); return held.promise; },
    }, {
      retainCatalog: () => () => { if (!current && revoked === "catalog") throw error; },
      overview: async () => ({ summary: { key: "notes.home.summary" }, subjects: [a], start: [] }),
    });
    const composing = next.compose();
    await begun.promise;
    current = false;
    held.resolve({ items: [{ subject: a, revision: "r1", state: "ok" }] });
    await assert.rejects(composing, error);
  }
});

test("SCS-09 SCS-17 replacing the values registration during overview cannot attach the old directory row to a new provider token", { timeout: 10_000 }, async () => {
  const notes = installation("notes", 0), a = subject("note", "a");
  const read = overview("notes", notes, [object("note")]);
  const [reader, values] = readers(notes, "note");
  const began = Promise.withResolvers<void>(), held = Promise.withResolvers<PresentationOverview>();
  let registration = 1;
  const h = harness([notes], [read, reader!, values!], {
    discover: () => {
      const original = registration;
      return { views: [read, reader!, values!], retain: actions => () => {
        if (actions.includes(values!) && registration !== original) throw new ActionError("actions.provider_changed", "Registration replaced");
      } };
    },
  }, { overview: () => { began.resolve(); return held.promise; } });
  const result = h.compose();
  await began.promise;
  registration++;
  held.resolve({ summary: { key: "notes.home.summary" }, subjects: [a], start: [] });
  await assert.rejects(result, { code: "actions.provider_changed" });
  assert.deepEqual(h.calls, []);
});

test("SCS-08 SCS-09 SCS-17 failed first row reads mark only their overview card unreadable and keep its current summary and start", { timeout: 10_000 }, async t => {
  const notes = installation("notes", 0), empty = installation("empty", 1), waiting = installation("waiting", 2);
  const a = subject("note", "a"), b = subject("note", "b");
  const start = ownedView(notes, command("notes.start"));
  const notesOverview = overview("notes", notes, [object("note")], { start: [target(start)] });
  const emptyOverview = overview("empty", empty), waitingOverview = overview("waiting", waiting);
  const pending = Promise.withResolvers<PresentationOverview>();
  t.after(() => pending.resolve({ summary: { key: "waiting.home.summary" }, subjects: [], start: [] }));

  for (const mode of ["error", "deadline", "denied"] as const) {
    const includeWaiting = mode === "deadline";
    let valuesReads = 0, aborted: AbortSignal | undefined;
    const h = harness(includeWaiting ? [notes, empty, waiting] : [notes, empty],
      [notesOverview, emptyOverview, ...readers(notes, "note"), start, ...(includeWaiting ? [waitingOverview] : [])], {
        values: async (_view, input) => {
          valuesReads++;
          if (mode === "error") throw new Error("First read failed");
          assert.equal(mode, "denied", "the common deadline was already spent waiting for overview");
          return { items: input.subjects.map((item): PresentationValueItem => ({ subject: item, state: item.id === "a" ? "forbidden" : "deleted", revision: "not-visible" })) };
        },
      }, { overview: async (view, signal) => {
        if (view === waitingOverview) { aborted = signal; return pending.promise; }
        return view === notesOverview ? { summary: { key: "notes.home.summary" }, subjects: [a, b], start: [target(start)] }
          : { summary: { key: "empty.home.summary" }, subjects: [], start: [] };
      } });
    const result = await h.compose();
    const group = card(result, notes);
    assert.equal(group.state, mode === "denied" ? "ok" : "unreadable");
    assert.equal(group.read_at, undefined);
    assert.deepEqual(group.items, []);
    assert.equal(group.hidden_above, undefined);
    assert.deepEqual(group.plugin_card?.summary, { owner: notes.plugin_id, key: "notes.home.summary" });
    assert.deepEqual(group.plugin_card?.start?.map(({ kind, action }) => [kind, action.ref]), [["invoke", "notes.start@1"]]);
    assert.equal(card(result, empty).state, "ok");
    assert.equal(valuesReads, mode === "deadline" ? 0 : 1);
    if (mode === "deadline") {
      assert.ok(aborted?.aborted);
      assert.equal(card(result, waiting).state, "unreadable");
      assert.equal(card(result, waiting).plugin_card?.summary, undefined);
    }
  }
});
