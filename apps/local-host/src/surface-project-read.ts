import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { surfaceCompositionActions, SURFACES_PROVIDER_ID, type SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { searchActions, SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
import { startSurfaceRead, type SurfaceComposePorts } from "@molis-ai/molis-work-service-surfaces";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { LocalHost } from "./local-host.js";
import { openProjectPersonContext } from "./local-web-actions.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { surfaceHomeDirectory, type SurfaceHomeCatalogReader } from "./surface-home-directory.js";
import { homeChanged, homeReference as reference, ownerReader, projectHomePeek, projectPositionDisplay, type HomeReadSample } from "./surface-home-display.js";
import { assertHomeDisplayReader, homeObjectClick, openHomeObject } from "./surface-home-open.js";
import { withSurfaceSample } from "./surface-read-sample.js";
import type { SurfaceSlotRecord } from "./surface-slot-state.js";
import { captureSurfaceSlot } from "./surface-slot-controls.js";

type Transport = ReturnType<typeof pluginRouteControl>;
type DiscussionViews = NonNullable<SurfaceComposePorts["discussion"]>["views"];
export type SurfaceProjectContext = ReturnType<typeof openProjectPersonContext> & {
  client: ActionClient; runtime: MolisWorkProjectRuntime; catalog: ReturnType<typeof surfaceHomeDirectory>; transport: Transport;
  retained?: true;
};

/** A protected display position may use only providers of an already opened project and running installations. */
export function projectSurfaceContext(host: LocalHost<MolisWorkProjectRuntime>, owner: MolisWorkLocalHost, homeDirectory: string | undefined, readCatalog: SurfaceHomeCatalogReader) {
  return <Result>(reference: LocalHostProjectReference, signal: AbortSignal, assertSource: (() => void) | undefined,
    use: (context: SurfaceProjectContext) => Result | Promise<Result>, slot?: SurfaceSlotRecord) => {
    const transport = pluginRouteControl(signal, () => {
      if (owner.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主已关闭");
    }, assertSource);
    return host.withExistingRuntime(reference, async runtime => {
      requireSynchronous(transport.assert_authority_current?.());
      if (!homeDirectory) throw new ActionError("actions.unavailable", "呈现需要 Home 目录");
      const original = surfaceHomeDirectory({ store: runtime.store, reference, homeDirectory, home: owner.homePlugins, readCatalog });
      const catalog = slot ? slotCatalog(original, slot) : original;
      const authority = openProjectPersonContext(owner, reference, runtime.store, slot?.signal ?? signal);
      const caller = slot ? { ...authority.caller, assert_authority_current: (...args: Parameters<NonNullable<ActionCallContext["assert_authority_current"]>>) => {
        slot.assertCurrent(); requireSynchronous(authority.caller.assert_authority_current?.(...args));
      } } : authority.caller;
      return use({ ...authority, caller, runtime, catalog, transport, client: host.actionClient(reference), ...(slot ? { retained: true } : {}) });
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

function positionAccess(sample: HomeReadSample, { client, caller, transport }: SurfaceProjectContext, prefix: string, signal: AbortSignal) {
  const current = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
  const groups = sample.discussionGroups ?? sample.description.groups;
  const values = displayValues(sample, client, caller, transport);
  return {
    current,
    declaredKinds() {
      current();
      return [...new Set(sample.catalog.entries.flatMap(entry => entry.plugin.presentation?.objects.map(object => object.kind) ?? []))];
    },
    captureSlot: (display: Awaited<ReturnType<typeof projectPositionDisplay>>) => captureSurfaceSlot(display, sample),
    count() { current(); return groups.flatMap(group => group.items).filter(item => item.state === "ok" || item.state === "stale" && item.read_at).length; },
    async display() {
      const display = await projectPositionDisplay(sample, groups, signal, values);
      current();
      return display;
    },
    assertReadable(subjects: readonly ActionSubject[]) {
      current();
      const proved = new Set(groups.flatMap(group => group.items.filter(item => item.state === "ok")
        .flatMap(item => [item.subject, ...item.merged?.map(merge => merge.subject) ?? []])).map(subjectKey));
      if (subjects.some(subject => !proved.has(subjectKey(subject)))) throw new ActionError("actions.subject_unavailable", "部分对象目前无法引用");
      return current;
    },
    async open(owner: string, target: Record<string, unknown>, groupIndex = 0) {
      current();
      if (target.kind !== "object" && target.kind !== "peek") throw homeChanged();
      const group = groups[groupIndex];
      if (!group) throw homeChanged();
      const selected = homeObjectClick(target, owner, sample, [group]);
      if (!selected?.item) throw homeChanged();
      assertHomeDisplayReader(sample, selected.entry, selected.item);
      if (selected.kind === "peek") {
        const row = await projectHomePeek(sample, selected.item, signal, values);
        current();
        return { kind: "peek" as const, row, display: selected.entry.display };
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
    assertSource: (() => void) | undefined, use: (position: ReturnType<typeof positionAccess>) => Result | Promise<Result>, discussion?: DiscussionViews, slot?: SurfaceSlotRecord) =>
    context(reference, signal, assertSource, async context => {
      const deadline = startSurfaceRead(signal);
      try {
        const sample = await composeSurface(context, request, deadline, undefined, discussion);
        const position = positionAccess(sample, context, prefix, signal);
        position.current();
        return await use(position);
      } finally { deadline.dispose(); }
    }, slot);
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
