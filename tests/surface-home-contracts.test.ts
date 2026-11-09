import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, compileActionSchema } from "@molis-ai/molis-work-kernel";
import { bindActionClient, bindActionHandler, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction, type PresentationOverviewDeclaration } from "@molis-ai/molis-work-contracts/platform/presentation";
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
  const failed = description([{ ...group, state: "unreadable" }]);
  assert.throws(() => assertSurfaceDescription(failed, failed), { code: "actions.output_invalid" });
});

test("SCS-09 SCS-17 the Kernel's original start registration is checked after overview, only when the card offers that start", { timeout: 10_000 }, async () => {
  const start = { ...formAction, action: { ...formAction.action, input_schema: { type: "object", properties: {}, additionalProperties: false } } } satisfies ActionDefinition;
  const capability = { capability_id: start.capability_id, version: start.version };
  const project = "project", startProvider = "notes-start", overviewProvider = "notes-overview";
  const common = { project_id: project, plugin_id: owner, plugin_install_id: release.install_id, kind: "plugin", title: "Notes" } as const;
  const plugin: SurfacePlugin = { plugin_id: owner, install_id: release.install_id, scope: release.scope, revision: "release-r1", state: "running", slots: [],
    presentation: { objects: [], overview: { ...declaration, start: [capability] } },
    home: { installation_generation: release.installation_generation, version: release.version, manifest_digest: release.manifest_digest, order: 0 } };
  const caller: ActionCallContext = { actor_id: "local-person", audience: "user", project_id: project, permissions: [] };
  const compose = surfaceCompositionActions.compose;
  for (const selected of [true, false]) {
    const actions = new ActionService(), service = new SurfaceCompositionService();
    const entered = Promise.withResolvers<void>(), releaseOverview = Promise.withResolvers<void>();
    let writes = 0;
    const registerStart = (definition: ActionDefinition) => actions.registerProvider({ provider: { ...common, provider_id: startProvider },
      definitions: [definition], handlers: [{ ...capability, handle: () => { writes++; } }] });
    const stopStart = registerStart(start);
    const stopOverview = actions.registerProvider({ provider: { ...common, provider_id: overviewProvider }, definitions: [overview],
      handlers: [bindActionHandler(overview, async () => {
        entered.resolve();
        await releaseOverview.promise;
        return { summary: { key: "notes.home.empty" }, subjects: [], start: selected ? [capability] : [] };
      })] });
    const stopService = actions.registerProvider({ provider: { provider_id: SURFACES_PROVIDER_ID, title: "Surfaces", kind: "system", project_id: project }, definitions: [compose],
      handlers: [bindActionHandler(compose, (input, context) => service.compose(input, {
        caller: context, signal: context.signal, beforeEffect: context.beforeEffect, current: () => context.signal?.throwIfAborted(),
        catalog: () => [plugin], discover: () => actions.discover(context),
        retain: views => context.retainAuthority!(views.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }))).assertCurrent,
        values: async () => ({ items: [] }), attention: () => [], relations: () => [],
        corrections: { read: () => ({ revision: "0", corrections: [] }), correct: async () => { throw new Error("unexpected correction"); } },
        home: {
          overview: (view, signal) => bindActionClient(actions, () => context).invoke({ ...overview, provider_id: view.provider.provider_id }, {}, { ...context, signal }),
          acceptsEmptyInput: view => compileActionSchema(view.action.input_schema)({}) === true,
          retainCatalog: () => () => undefined, hiddenAboveLabel: () => { throw new Error("unexpected count"); },
        },
      }))] });
    let stopReplacement: (() => void) | undefined;
    try {
      const pending = actions.invoke(caller, compose, { slot: { kind: "home" } });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("overview did not wait"); })]);
      stopStart();
      stopReplacement = registerStart(formAction);
      const result = selected ? assert.rejects(pending, { code: "actions.provider_changed" })
        : pending.then(value => assert.deepEqual((value as SurfaceDescription).groups[1]?.plugin_card, { summary: { owner, key: "notes.home.empty" } }));
      releaseOverview.resolve();
      await result;
      assert.equal(writes, 0);
    } finally {
      releaseOverview.resolve();
      stopReplacement?.();
      stopStart();
      stopOverview();
      stopService();
    }
  }
});
