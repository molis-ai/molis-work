import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { surfaceCompositionActions, SURFACES_PROVIDER_ID, type SurfaceItem, type SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { searchActions, SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
import { startSurfaceRead, type SurfaceComposePorts } from "@molis-ai/molis-work-service-surfaces";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SurfaceHomeRowDisplay } from "@molis-ai/molis-work-design-system";
import type { LocalHost } from "./local-host.js";
import { openProjectPersonContext } from "./local-web-actions.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { surfaceHomeDirectory, type SurfaceHomeCatalogReader } from "./surface-home-directory.js";
import { displayedRoute, homeChanged, homeReference as reference, ownerReader, projectHomePeek, projectPositionDisplay, type HomeReadSample } from "./surface-home-display.js";
import { assertHomeDisplayReader, homeObjectClick, openHomeObject, openProvedHomeObject } from "./surface-home-open.js";
import { withSurfaceSample } from "./surface-read-sample.js";
import type { SurfaceSlotRecord } from "./surface-slot-state.js";
import { captureSurfaceSlot } from "./surface-slot-controls.js";
import { surfaceOfferOperation, surfaceOfferSources } from "./surface-offer-operation.js";
import { positionSubjectChoices, type CaptureOfferSource, type OfferWindow, type PositionOfferSource } from "./surface-position-offers.js";
import { bindSurfacePlacement, isPlacementKind, prepareSurfacePlacement, type PlacementKind } from "./surface-placement.js";
import { attentionPositionGuard, canRestoreSurfaceObject, correctSurfacePosition, type positionCorrection } from "./surface-position-correction.js";

type Transport = ReturnType<typeof pluginRouteControl>;
type DiscussionViews = NonNullable<SurfaceComposePorts["discussion"]>["views"];
type Retention = SurfaceSlotRecord | OfferWindow;
type PeekOffers = { window: OfferWindow; source?: CaptureOfferSource };
export type SurfaceProjectContext = ReturnType<typeof openProjectPersonContext> & {
  client: ActionClient; runtime: MolisWorkProjectRuntime; catalog: ReturnType<typeof surfaceHomeDirectory>; transport: Transport;
  retained?: true;
};

/** A protected display position may use only providers of an already opened project and running installations. */
export function projectSurfaceContext(host: LocalHost<MolisWorkProjectRuntime>, owner: MolisWorkLocalHost, homeDirectory: string | undefined, readCatalog: SurfaceHomeCatalogReader) {
  return <Result>(reference: LocalHostProjectReference, signal: AbortSignal, assertSource: (() => void) | undefined,
    use: (context: SurfaceProjectContext) => Result | Promise<Result>, retained?: Retention) => {
    const slot = retained && "slot" in retained ? retained : undefined;
    if (retained) signal = AbortSignal.any([signal, retained.signal]);
    const transport = pluginRouteControl(signal, () => {
      if (owner.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主已关闭");
    }, assertSource);
    return host.withExistingRuntime(reference, async runtime => {
      requireSynchronous(transport.assert_authority_current?.());
      if (!homeDirectory) throw new ActionError("actions.unavailable", "呈现需要 Home 目录");
      const original = surfaceHomeDirectory({ store: runtime.store, reference, homeDirectory, home: owner.homePlugins, readCatalog });
      const catalog = slot ? slotCatalog(original, slot) : original;
      const authority = openProjectPersonContext(owner, reference, runtime.store, retained?.signal ?? signal);
      const caller = retained ? { ...authority.caller, assert_authority_current: (...args: Parameters<NonNullable<ActionCallContext["assert_authority_current"]>>) => {
        retained.assertCurrent(); requireSynchronous(authority.caller.assert_authority_current?.(...args));
      } } : authority.caller;
      return use({ ...authority, caller, runtime, catalog, transport, client: host.actionClient(reference), ...(retained ? { retained: true } : {}) });
    });
  };
}

function slotCatalog(original: SurfaceProjectContext["catalog"], slot: SurfaceSlotRecord): SurfaceProjectContext["catalog"] {
  slot.assertCurrent();
  const id = canonicalJsonText(slot.source.installation), matches = original.entries.filter(entry => entry.plugin.plugin_id === slot.pluginId
    && canonicalJsonText(entry.installation) === id && entry.record.state === "running");
  if (matches.length !== 1) throw homeChanged();
  const entries = original.entries.map(entry => ({ ...entry, plugin: { ...entry.plugin, slots: entry === matches[0] ? [slot.slot] : [] } }));
  return { ...original, entries, plugins: entries.map(entry => entry.plugin), assertCurrent() { slot.assertCurrent(); original.assertCurrent(); } };
}

export function displayValues(sample: HomeReadSample, client: ActionClient, caller: ActionCallContext, transport: Transport) {
  const read = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  return (view: ActionView, input: PresentationValuesInput, signal: AbortSignal) => read.invoke<PresentationValuesInput, PresentationValues>(
    { ...view, ...reference(view) }, input, { ...transport, signal, assert_authority_current: () => {
      requireSynchronous(transport.assert_authority_current?.());
      sample.assertCurrent();
    } });
}

export function composeSurface(context: SurfaceProjectContext, request: SurfaceRequest, deadline: HomeReadSample["deadline"],
  formOnly: (view: ActionView) => boolean = () => false, discussion?: DiscussionViews) {
  const { runtime, catalog, client, caller, transport } = context;
  return withSurfaceSample(runtime.store, request.slot.kind, catalog, formOnly, deadline, () => bindActionClient(client, () => caller)
    .invoke({ ...surfaceCompositionActions.compose, provider_id: SURFACES_PROVIDER_ID }, request, context.retained ? undefined : transport), discussion,
    context.retained ? { signal: transport.signal!, assertCurrent: () => requireSynchronous(transport.assert_authority_current?.()) } : undefined);
}

async function preparePeekOffers(sample: HomeReadSample, context: SurfaceProjectContext, item: SurfaceItem, row: SurfaceHomeRowDisplay,
  { window, source: capture }: PeekOffers, current: () => void) {
  if (row.read.state !== "ok" || !("revision" in row.read)) return undefined;
  const route = displayedRoute(sample, item), choices = surfaceOfferSources(sample.directory, item.subject.kind);
  if (!route || !choices.length) return undefined;
  const source: PositionOfferSource = capture?.(item.owner_plugin_id, item.subject) ?? { beforeWrite: attentionPositionGuard(sample, context, item.owner_plugin_id, item.subject) };
  const proof = () => { current(); source.current?.(); source.beforeWrite?.(); };
  sample.retain(choices.flatMap(choice => [choice.source, choice.action]));
  const result = await surfaceOfferOperation(context, proof).prepare({
    subject: item.subject, values: route.action, fields: row.declaration.fields.map(field => field.key), revision: row.read.revision,
  }, choices, false);
  proof();
  return window.prepare({ choices: positionSubjectChoices(result), source, original: sample.retainGuard() });
}

export async function preparePositionPlacement(sample: HomeReadSample, context: SurfaceProjectContext, item: SurfaceItem, kind: PlacementKind,
  revision: string, { window, source: capture }: PeekOffers, current: () => void) {
  const route = displayedRoute(sample, item);
  if (!route) throw homeChanged();
  const target = bindSurfacePlacement(sample, route, item, kind, revision, context.runtime.project_id, context.metadata);
  if (!target) throw homeChanged();
  const source = capture?.(item.owner_plugin_id, item.subject) ?? {};
  const { title, description, choices } = await prepareSurfacePlacement(context, target, current, source);
  return { kind: "placement" as const, title, description, offers: window.prepare({ choices, source, original: sample.retainGuard() }) };
}

function positionAccess(sample: HomeReadSample, context: SurfaceProjectContext, prefix: string, signal: AbortSignal, request: SurfaceRequest, discussion?: DiscussionViews) {
  const { client, caller, transport } = context;
  const current = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
  const groups = sample.discussionGroups ?? sample.description.groups;
  const values = displayValues(sample, client, caller, transport);
  return {
    current,
    captureSlot: (display: Awaited<ReturnType<typeof projectPositionDisplay>>) => captureSurfaceSlot(display, sample, context.runtime.project_id, context.metadata),
    correct(input: NonNullable<ReturnType<typeof positionCorrection>>, index = 0) {
      const group = groups[index];
      if (!group) throw homeChanged();
      return correctSurfacePosition(sample, context, request.slot, [group], input, values, discussion?.[index]?.subjects ?? request.subjects);
    },
    count() {
      current();
      return { count: groups.flatMap(group => group.items).filter(item => item.state === "ok" || item.state === "stale" && item.read_at).length,
        can_restore: sample.description.corrections_revision !== "0" };
    },
    async display(recovery?: ActionSubject) {
      const display = await projectPositionDisplay(sample, groups, signal, values);
      const restorable = recovery && !groups[0]?.items.some(item => subjectKey(item.subject) === subjectKey(recovery))
        && await canRestoreSurfaceObject(sample, context, request.slot, recovery, values, discussion?.[0]?.subjects ?? request.subjects ?? []);
      current();
      return restorable ? { ...display, object_restore_available: true as const } : display;
    },
    assertReadable(subjects: readonly ActionSubject[]) {
      current();
      if (subjects.some(subject => !sample.currentSubjects?.has(subjectKey(subject)))) throw new ActionError("actions.subject_unavailable", "部分对象目前无法引用");
      return current;
    },
    async open(owner: string, target: Record<string, unknown>, groupIndex = 0, offers?: PeekOffers) {
      current();
      if (target.kind !== "object" && target.kind !== "peek" && !isPlacementKind(target.kind)) throw homeChanged();
      const group = groups[groupIndex];
      if (!group) throw homeChanged();
      const selected = homeObjectClick(target, owner, sample, [group]);
      if (!selected?.item) throw homeChanged();
      const fallback = assertHomeDisplayReader(sample, selected.entry, selected.item);
      if (fallback) {
        if (request.slot.kind === "attention") attentionPositionGuard(sample, context, selected.entry.plugin.plugin_id, selected.subject)();
        const stage = openProvedHomeObject(sample.catalog, selected.entry, fallback, prefix);
        current();
        return stage;
      }
      if (isPlacementKind(selected.kind)) {
        if (!offers || !selected.revision) throw homeChanged();
        return preparePositionPlacement(sample, context, selected.item, selected.kind, selected.revision, offers, current);
      }
      if (selected.kind === "peek") {
        const row = await projectHomePeek(sample, selected.item, signal, values);
        current();
        const prepared = offers && await preparePeekOffers(sample, context, selected.item, row, offers, current);
        return { kind: "peek" as const, row, display: selected.entry.display, ...(prepared ? { offers: prepared } : {}) };
      }
      const reader = ownerReader(sample, selected.entry, selected.subject);
      if (!reader) throw homeChanged();
      const stage = await openHomeObject(sample, selected.entry, reader, selected.subject, client, caller, transport, prefix);
      current();
      return stage;
    },
  };
}

const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
export function discussionSurfaceRequest(views: DiscussionViews): SurfaceRequest {
  return { slot: { kind: "discussion" }, expanded: true,
    subjects: [...new Map(views.flatMap(view => view.subjects).map(subject => [subjectKey(subject), subject])).values()] };
}

export function projectSurfacePosition(context: ReturnType<typeof projectSurfaceContext>) {
  return <Result>(reference: LocalHostProjectReference, request: SurfaceRequest, prefix: string, signal: AbortSignal,
    assertSource: (() => void) | undefined, use: (position: ReturnType<typeof positionAccess>) => Result | Promise<Result>, discussion?: DiscussionViews, retained?: Retention) =>
    context(reference, signal, assertSource, async context => {
      const deadline = startSurfaceRead(signal);
      try {
        const sample = await composeSurface(context, request, deadline, undefined, discussion);
        const position = positionAccess(sample, context, prefix, signal, request, discussion);
        position.current();
        return await use(position);
      } finally { deadline.dispose(); }
    }, retained);
}

/** Search candidates are proved by the same retained compose and final owner values before a discussion offers them. */
export function projectSurfaceSearch(project: ReturnType<typeof projectSurfaceContext>) {
  return (reference: LocalHostProjectReference, query: string, signal: AbortSignal, assertSource: () => void) =>
    project(reference, signal, assertSource, async context => {
      const { caller, client, transport } = context;
      const deadline = startSurfaceRead(signal);
      const current = () => requireSynchronous(transport.assert_authority_current?.());
      try {
        const read = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
        const found = await deadline.wait(read.invoke({ ...searchActions.query, provider_id: SEARCH_PROVIDER_ID },
          { query, limit: 8, scope: "project" }, { ...transport, signal: deadline.signal }));
        current();
        if (!found) throw new ActionError("actions.timeout", "引用搜索暂时没有完成");
        const subjects = found.hits.map(hit => hit.subject);
        const groups = [{ subjects, expanded: true as const }];
        const sample = await composeSurface(context, discussionSurfaceRequest(groups), deadline, undefined, groups);
        const display = await projectPositionDisplay(sample, sample.discussionGroups ?? [], signal, displayValues(sample, client, caller, transport));
        current(); sample.assertCurrent();
        return display.display.rows.flatMap(row => {
          const title = "values" in row.read ? row.read.values?.[row.declaration.fields.find(field => field.role === "title")?.key ?? ""] : undefined;
          return row.read.state === "ok" && typeof title === "string" ? [{ ...row.subject, label: title, owner: display.display.owners[row.owner]?.name }] : [];
        });
      } finally { deadline.dispose(); }
    });
}
