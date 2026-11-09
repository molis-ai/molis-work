import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, compileActionSchema, sampleRetainedActionDirectory, type RetainedActionDirectory } from "@molis-ai/molis-work-kernel";
import { bindActionClient, bindActionHandler, defineSubjectContextAction, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction, definePresentationValuesAction, type PresentationOverviewDeclaration, type PresentationValues, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { PLACEMENT_PROVIDER_ID, placementActions } from "@molis-ai/molis-work-contracts/services/placement";
import { SURFACE_HOME_ORDER_LIMIT, SURFACES_PROVIDER_ID, surfaceCompositionActions, type SurfaceDescription, type SurfaceGroup, type SurfaceInstallationRef, type SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { assertSurfaceDescription, isPresentationOverviewReader, validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { SurfaceCompositionService, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";

const owner = "io.molis.work.notes";
const release = { scope: "project", install_id: "notes-project", installation_generation: "gen-2", version: "1.2.0", manifest_digest: "notes-digest" } satisfies SurfaceInstallationRef;
const overview = definePresentationOverviewAction("notes.overview", 1, "Overview", []);
const formAction = { capability_id: "notes.create", version: 1, operation: "command", action: {
  scope: "project", kind: "operation", audiences: ["user"], permissions: [], subject_kinds: [], title: "Create", description: "Create a note",
  input_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false },
} } satisfies ActionDefinition;
const open = { view_id: "stage", panel: "create-dialog" };
const declaration = { capability_id: "notes.overview", version: 1,
  start: [{ capability_id: "notes.create", version: 1, open }] } satisfies PresentationOverviewDeclaration;

test("SSC-18 overview declarations require the common free read protocol and an own Manifest stage for the start form", () => {
  const manifest = { plugin_id: owner, actions: [overview, formAction], ui: { views: [{ view_id: "stage", slot: "stage" }] },
    presentation: { objects: [], overview: declaration } };
  assert.equal(overview.action.execution?.cost, "none");
  assert.equal(isPresentationOverviewReader(overview), true);
  assert.deepEqual(validatePresentationDeclaration(manifest), []);
  for (const action of [
    { ...overview.action, execution: undefined },
    { ...overview.action, execution: { cost: "unknown" } },
    { ...overview.action, execution: { cost: "metered" } },
    { ...overview.action, external: true },
    { ...overview.action, permissions: ["model:invoke"] },
  ]) {
    const bad = { ...overview, action };
    assert.equal(isPresentationOverviewReader(bad), false);
    assert.match(validatePresentationDeclaration({ ...manifest, actions: [bad, formAction] }).join("\n"), /definePresentationOverviewAction/);
  }
  for (const route of [{ ...open, view_id: "another-owner" }, { ...open, panel: "x".repeat(101) }, { ...open, url: "/external" }]) {
    const start = [{ ...declaration.start[0], open: route }];
    assert.match(validatePresentationDeclaration({ ...manifest, presentation: { objects: [], overview: { ...declaration, start } } }).join("\n"),
      /presentation\.overview\.start\[0\]\.open/);
  }
  assert.match(validatePresentationDeclaration({ ...manifest, ui: { views: [{ view_id: "stage", slot: "settings" }] } }).join("\n"), /stage/);
});

const card = {
  summary: { owner, key: "notes.home.empty" },
  note: { owner: "workbench", key: "common.presentation.unreadable" },
  start: [{ kind: "form", ...open, installation: release, action: { ref: "notes.create@1", provider_id: "plugin:" + owner, primary: true } }],
  open: { kind: "stage", view_id: "stage", installation: release },
} satisfies SurfacePluginCard;

const group = { kind: "plugin", owner_plugin_id: owner, state: "ok", items: [], plugin_card: card } satisfies SurfaceGroup;
const description = (groups: SurfaceGroup[]): SurfaceDescription => ({ composed_by: "rules", revision: "home-r1", corrections_revision: "0", groups });

test("SCS-11 SCS-12 SSC-18 the Kernel action contract closes home order, start routes, installation bindings and card groups", async () => {
  const service = new ActionService();
  let answer: unknown = description([group]), calls = 0;
  const compose = surfaceCompositionActions.compose;
  service.registerProvider({ provider: { provider_id: SURFACES_PROVIDER_ID, kind: "system", title: "Surfaces", project_id: "project" },
    definitions: [compose], handlers: [{ capability_id: compose.capability_id, version: compose.version, handle: () => { calls++; return answer; } }] });
  const caller: ActionCallContext = { actor_id: "local-person", audience: "user", project_id: "project", permissions: [] };
  const home = { slot: { kind: "home" } };
  const ask = (input: unknown = home) => service.invoke(caller, compose, input);
  assert.deepEqual(await ask({ ...home, home_order: [owner] }), answer);
  for (const input of [
    { ...home, home_order: [owner, owner] },
    { ...home, home_order: Array.from({ length: SURFACE_HOME_ORDER_LIMIT + 1 }, (_, index) => "io.molis.work.p" + index) },
    { slot: { kind: "attention" }, home_order: [owner] },
  ]) await assert.rejects(ask(input), { code: "actions.input_invalid" });
  assert.equal(calls, 1);

  const start = card.start[0]!;
  for (const plugin_card of [
    { ...card, start: [{ ...start, kind: "invoke" }] },
    { ...card, start: [{ ...start, action: { ...start.action, ref: "open" } }] },
    { ...card, start: [{ ...start, action: { ...start.action, provider_id: undefined } }] },
    { ...card, start: [{ ...start, action: { ...start.action, prepared_input: { title: "confidential" } } }] },
    { ...card, open: { ...card.open, installation: { ...release, manifest_digest: undefined } } },
    { enable: { kind: "project_membership", action: start.action, installation: release } },
    { enable: { kind: "home_plugin_settings", installation: release } },
  ]) {
    answer = { ...description([]), groups: [{ ...group, plugin_card }] };
    await assert.rejects(ask(), { code: "actions.output_invalid" });
  }
  answer = { ...description([]), groups: [{ kind: "attention", state: "ok", items: [], plugin_card: card }] };
  await assert.rejects(ask(), { code: "actions.output_invalid" });
});

test("SCS-12 SSC-18 the SDK retains the candidate card facts and rejects rewritten or misplaced cards", () => {
  const attention = { kind: "attention", state: "ok", items: [] } satisfies SurfaceGroup;
  const candidate = description([attention, group]);
  assert.deepEqual(assertSurfaceDescription(candidate, candidate), { description: candidate, dropped: [] });
  const picked = { ...candidate, composed_by: "assistant", groups: [attention, { ...group, plugin_card: undefined }] };
  assert.deepEqual(assertSurfaceDescription(picked, candidate).description.groups[1]?.plugin_card, card);
  for (const plugin_card of [
    { ...card, summary: { owner, key: "notes.home.other" } },
    { ...card, note: { owner, key: "notes.home.other" } },
    { ...card, start: [{ ...card.start[0], panel: "different-form" }] },
    { ...card, open: { ...card.open, installation: { ...release, manifest_digest: "other-release" } } },
    { ...card, enable: { kind: "home_plugin_settings", installation: { ...release, scope: "home" } } },
  ]) assert.throws(() => assertSurfaceDescription({ ...picked, groups: [attention, { ...group, plugin_card }] }, candidate), { code: "actions.output_invalid" });
  assert.throws(() => assertSurfaceDescription({ ...picked, groups: [{ ...attention, plugin_card: card }, group] }, candidate), { code: "actions.output_invalid" });
  assert.throws(() => assertSurfaceDescription({ ...picked, groups: [{ ...attention, plugin_card: null }, group] }, candidate), { code: "actions.output_invalid" });
  const forged = description([{ ...group, plugin_card: { ...card, summary: { owner: "other", key: "notes.home.empty" } } }]);
  assert.throws(() => assertSurfaceDescription(forged, forged), { code: "actions.output_invalid" });
  const unreadableRows = description([{ ...group, state: "unreadable" }]);
  assert.deepEqual(assertSurfaceDescription(unreadableRows, unreadableRows).description, unreadableRows);
  const failedOverview = description([{ ...group, state: "unreadable", plugin_card: { ...card, summary: undefined } }]);
  assert.throws(() => assertSurfaceDescription(failedOverview, failedOverview), { code: "actions.output_invalid" });
});

const project = "project";
const common = { project_id: project, plugin_id: owner, plugin_install_id: release.install_id, kind: "plugin", title: "Notes" } as const;
const caller: ActionCallContext = { actor_id: "local-person", audience: "user", project_id: project, permissions: [] };
const compose = surfaceCompositionActions.compose;

function registerComposer(actions: ActionService, plugin: SurfacePlugin, afterSample?: (sample: RetainedActionDirectory) => void, form?: "card") {
  const service = new SurfaceCompositionService();
  return actions.registerProvider({ provider: { provider_id: SURFACES_PROVIDER_ID, title: "Surfaces", kind: "system", project_id: project }, definitions: [compose],
    handlers: [bindActionHandler(compose, (input, context) => {
      const readers = bindActionClient(actions, () => ({ ...context, query_only: true, read_only_effects: true }));
      return service.compose(input, {
        caller: context, signal: context.signal, beforeEffect: context.beforeEffect, current: () => context.signal?.throwIfAborted(),
        catalog: () => [plugin],
        discover: () => {
          const directory = sampleRetainedActionDirectory(observe => actions.discover(context, observe), context.retainAuthority!);
          afterSample?.(directory);
          return directory;
        },
        values: (view, input, signal, assertCurrent) => readers.invoke<PresentationValuesInput, PresentationValues>(
          { ...view, provider_id: view.provider.provider_id }, input, { ...context, signal, assert_authority_current: assertCurrent }),
        attention: () => [], relations: () => [],
        corrections: { read: () => ({ revision: "0", corrections: form ? [{ correction: "form", form, position: null }] : [] }),
          correct: async () => { throw new Error("unexpected correction"); } },
        home: {
          overview: (view, signal, assertCurrent) => readers.invoke({ ...overview, provider_id: view.provider.provider_id }, {},
            { ...context, signal, assert_authority_current: assertCurrent }),
          acceptsEmptyInput: view => compileActionSchema(view.action.input_schema)({}) === true,
          retainCatalog: () => () => undefined, hiddenAboveLabel: () => { throw new Error("unexpected count"); },
        },
      });
    })] });
}

test("SCS-09 SCS-17 the Kernel binds the original directory row across a same-ref replacement immediately after discovery", { timeout: 10_000 }, async () => {
  const start = { ...formAction, action: { ...formAction.action, input_schema: { type: "object", properties: {}, additionalProperties: false } } } satisfies ActionDefinition;
  const capability = { capability_id: start.capability_id, version: start.version };
  const startProvider = "notes-start", overviewProvider = "notes-overview";
  const plugin: SurfacePlugin = { plugin_id: owner, install_id: release.install_id, scope: release.scope, revision: "release-r1", state: "running", slots: [],
    presentation: { objects: [], overview: { ...declaration, start: [capability] } },
    home: { installation_generation: release.installation_generation, version: release.version, manifest_digest: release.manifest_digest, order: 0 } };
  for (const selected of [true, false]) {
    const actions = new ActionService();
    const replaced = Promise.withResolvers<void>();
    let writes = 0, summaries = 0;
    const registerStart = (definition: ActionDefinition) => actions.registerProvider({ provider: { ...common, provider_id: startProvider },
      definitions: [definition], handlers: [{ ...capability, handle: () => { writes++; } }] });
    const stopStart = registerStart(start);
    const stopOverview = actions.registerProvider({ provider: { ...common, provider_id: overviewProvider }, definitions: [overview],
      handlers: [bindActionHandler(overview, () => {
        summaries++;
        return { summary: { key: "notes.home.empty" }, subjects: [], start: selected ? [capability] : [] };
      })] });
    let stopReplacement: (() => void) | undefined;
    const stopService = registerComposer(actions, plugin, directory => {
      const original = directory.views.find(view => view.capability_id === capability.capability_id)!;
      assert.throws(() => directory.retain([{ ...original }]), { code: "actions.forbidden" });
      queueMicrotask(() => {
        try {
          stopStart();
          stopReplacement = registerStart(formAction);
          replaced.resolve();
        } catch (error) { replaced.reject(error); }
      });
    });
    try {
      const pending = actions.invoke(caller, compose, { slot: { kind: "home" } });
      const result = selected ? assert.rejects(pending, { code: "actions.provider_changed" })
        : pending.then(value => assert.deepEqual((value as SurfaceDescription).groups[1]?.plugin_card, { summary: { owner, key: "notes.home.empty" } }));
      await replaced.promise;
      await result;
      assert.equal(summaries, 1);
      assert.equal(writes, 0);
    } finally {
      stopReplacement?.();
      stopStart();
      stopOverview();
      stopService();
    }
  }
});

test("SCS-09 SCS-17 only displayed object operations retain registrations after overview, including the selected placement action", { timeout: 10_000 }, async () => {
  const note = { kind: "note", id: "note-1" };
  const reader = defineSubjectContextAction("notes.read", 1, "note", "Notes", []);
  const values = definePresentationValuesAction("notes.values", 1, ["note"], "Note values", []);
  const conversation = { ...formAction, capability_id: "notes.conversation" };
  const draft = { ...formAction, capability_id: "notes.draft" };
  const accepted = { ...formAction, capability_id: "notes.accept" };
  const noteDeclaration = {
    kind: "note",
    fields: [{ key: "title", role: "title" }, { key: "stage", role: "status" }],
    status: { field: "stage", map: { ready: { ring: "ready" }, draft: { ring: "draft" } } },
    forms: { row: { fields: ["title"] }, card: { fields: ["title"] } },
    actions: [
      { ref: "notes.conversation@1", when: { slots: ["conversation"] } },
      { ref: "notes.draft@1", when: { status: ["draft"] } },
      { ref: "notes.accept@1", when: { status: ["ready"] } },
    ],
  } as const;
  const plugin: SurfacePlugin = { plugin_id: owner, install_id: release.install_id, scope: release.scope, revision: "release-r1", state: "running", slots: [],
    presentation: { objects: [noteDeclaration], overview: { capability_id: overview.capability_id, version: overview.version } },
    home: { installation_generation: release.installation_generation, version: release.version, manifest_digest: release.manifest_digest, order: 0 } };
  const operations = [conversation, draft, accepted, placementActions.link];
  for (const scenario of [
    { replace: placementActions.link, rejects: false }, { replace: conversation, rejects: false }, { replace: draft, rejects: false },
    { replace: accepted, rejects: true }, { replace: placementActions.link, form: "card", rejects: true },
  ] as const) {
    const actions = new ActionService();
    const entered = Promise.withResolvers<void>(), releaseOverview = Promise.withResolvers<void>();
    let valuesReads = 0;
    const stopRead = actions.registerProvider({ provider: { ...common, provider_id: "notes-reader" }, definitions: [overview, reader, values],
      handlers: [bindActionHandler(overview, async () => {
        entered.resolve();
        await releaseOverview.promise;
        return { summary: { key: "notes.home.summary" }, subjects: [note], start: [] };
      }), bindActionHandler(reader, () => assert.fail("rule values never read a subject body")),
      bindActionHandler(values, () => { valuesReads++; return { items: [{ subject: note, revision: "r1", state: "ok", values: { stage: "ready" } }] }; })] });
    const register = (definition: ActionDefinition) => actions.registerProvider({
      provider: definition === placementActions.link ? { provider_id: PLACEMENT_PROVIDER_ID, title: "Placement", kind: "system" }
        : { ...common, provider_id: definition.capability_id },
      definitions: [definition], handlers: [{ ...definition, handle: () => assert.fail("compose never executes a displayed operation") }],
    });
    const registrations = new Map<ActionDefinition, () => void>(operations.map(definition => [definition, register(definition)]));
    const stopService = registerComposer(actions, plugin, directory => {
      assert.equal(directory.views.find(view => view.capability_id === scenario.replace.capability_id)?.availability.available, true);
    }, "form" in scenario ? scenario.form : undefined);
    try {
      const pending = actions.invoke({ ...caller, permissions: placementActions.link.action.permissions }, compose, { slot: { kind: "home" } });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("overview did not wait"); })]);
      registrations.get(scenario.replace)!();
      registrations.set(scenario.replace, register(scenario.replace));
      const result = scenario.rejects ? assert.rejects(pending, { code: "actions.provider_changed" })
        : pending.then(value => {
          const row = (value as SurfaceDescription).groups[1]?.items[0];
          assert.equal(row?.form, "row");
          assert.deepEqual(row?.actions.map(action => action.ref), ["notes.accept@1", "open", "peek"]);
        });
      releaseOverview.resolve();
      await result;
      assert.equal(valuesReads, 1);
    } finally {
      releaseOverview.resolve();
      for (const stop of registrations.values()) stop();
      stopRead();
      stopService();
    }
  }
});

for (const selection of ["one row", "two rows together", "two rows separately"]) {
  test("SCS-09 SCS-17 the final registration check rejects replacement with " + selection, async () => {
    const actions = new ActionService();
    const first = { ...formAction, capability_id: "notes.first" };
    const last = { ...formAction, capability_id: "notes.last" };
    const single = selection === "one row";
    const chosen = single ? [first] : [first, last];
    const probe = definePresentationOverviewAction("notes.retained.probe", 1, "Retained directory", []);
    let armed = false, replacements = 0;
    let stopFirst: () => void;
    let stopReplacement: (() => void) | undefined;
    const replaceDuringAvailability = () => {
      if (armed) {
        armed = false;
        stopFirst();
        stopReplacement = register(first);
        replacements++;
      }
      return { available: true } as const;
    };
    const register = (definition: ActionDefinition, availability?: typeof replaceDuringAvailability) => actions.registerProvider({
      provider: { ...common, provider_id: definition.capability_id }, definitions: [definition], availability,
      handlers: [{ ...definition, handle: () => assert.fail("checking a directory must not execute its actions") }],
    });
    stopFirst = register(first, single ? replaceDuringAvailability : undefined);
    const stopLast = single ? undefined : register(last, replaceDuringAvailability);
    const stopProbe = actions.registerProvider({ provider: { ...common, provider_id: "retained-probe" }, definitions: [probe],
      handlers: [bindActionHandler(probe, (_input, context) => {
        const snapshot = sampleRetainedActionDirectory(observe => actions.discover(context, observe), context.retainAuthority!);
        const views = chosen.map(definition => snapshot.views.find(view => view.capability_id === definition.capability_id)!);
        const prior = selection === "two rows separately" ? snapshot.retain(views.slice(0, 1)) : undefined;
        const guard = snapshot.retain(prior ? views.slice(1) : views);
        armed = true;
        prior?.();
        guard();
        return { summary: { key: "notes.home.summary" }, subjects: [], start: [] };
      })] });
    try {
      await assert.rejects(actions.invoke(caller, probe, {}), { code: "actions.provider_changed" });
      assert.equal(replacements, 1);
    } finally {
      stopReplacement?.();
      stopFirst();
      stopLast?.();
      stopProbe();
    }
  });
}
