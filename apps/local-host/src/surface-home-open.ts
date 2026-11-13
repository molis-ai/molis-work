import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiViewSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceGroup, SurfaceInstallationRef, SurfaceItem, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { assertStageInstallation, installedStagePath } from "./installed-stage-identity.js";
import { readSurfaceSubject, type SurfaceSubjectSummary } from "@molis-ai/molis-work-service-surfaces";
import { displayedFallback, homeChanged, homeReference, ownerReader, type HomeReadSample } from "./surface-home-display.js";
import { objectStageLocation, type HomeDirectoryEntry } from "./surface-home-directory.js";
import type { pluginRouteControl } from "./plugin-route-control.js";
import { isPlacementKind } from "./surface-placement.js";

type Target = NonNullable<SurfacePluginCard["open"]> | Extract<NonNullable<SurfacePluginCard["start"]>[number], { kind: "form" }>;
type ObjectNavigation = { id: string; title: string; surface: string };
export type HomeObjectClick = { kind: "object" | "open_result" | "peek"; subject: ActionSubject; installation: SurfaceInstallationRef };

export function stageNavigation(entry: HomeDirectoryEntry, target: Target, prefix: string, object?: ObjectNavigation) {
  const route = entry.route;
  if (!route || route.view_id !== target.view_id) throw homeChanged();
  const selection: UiViewSelection = { surface: object?.surface ?? route.surface, id: route.view_id, intent: "open", ...(target.kind === "form" ? { panel: target.panel } : {}) };
  return { kind: "stage", owner_plugin_id: entry.plugin.plugin_id, shell_key: route.shell, installation: entry.installation, selection,
    ...(object ? { item_id: object.id, title: object.title } : {}),
    ...(route.kind === "native" ? { producer: route.owner.producer } : { frame_path: installedStagePath(prefix, entry.plugin.plugin_id, entry.installation) }) };
}

/** A click can only name an object and the exact release shown on the page; never a reader, provider, surface or URL. */
export function homeObjectClick(target: Record<string, unknown>, owner: string, sample: HomeReadSample, groups: readonly SurfaceGroup[] = sample.description.groups) {
  const kind = target.kind;
  const placement = isPlacementKind(kind);
  if (!placement && kind !== "object" && kind !== "open_result" && kind !== "peek") return undefined;
  const revision = typeof target.revision === "string" ? target.revision : undefined;
  const subject = target.subject;
  if (Object.keys(target).length !== (placement ? 4 : 3) || placement && (!revision || revision.length > 200)
    || !placement && Object.hasOwn(target, "revision") || !isRecord(subject) || Object.keys(subject).length !== 2
    || typeof subject.id !== "string" || !subject.id.length || subject.id.length > 1000
    || typeof subject.kind !== "string" || !subject.kind.length || subject.kind.length > 200) throw new ActionError("actions.input_invalid", "首页对象无效");
  const entry = sample.catalog.entries.find(entry => entry.plugin.plugin_id === owner && entry.record.state === "running"
    && canonicalJsonText(entry.installation, "null") === canonicalJsonText(target.installation, "null"));
  if (!entry) throw homeChanged();
  const selected: ActionSubject = { kind: subject.kind, id: subject.id };
  const item = groups.flatMap(group => group.items).find(item => item.owner_plugin_id === owner
    && item.subject.kind === selected.kind && item.subject.id === selected.id && (item.state === "ok" || item.state === "stale")
    && item.actions.some(action => action.ref === (placement || kind === "peek" ? kind : "open")));
  if (target.kind !== "open_result" && !item) throw homeChanged();
  return { kind, entry, subject: selected, item, revision };
}

export function assertHomeDisplayReader(sample: HomeReadSample, entry: HomeDirectoryEntry, item: SurfaceItem) {
  const fallback = displayedFallback(sample, item);
  if (fallback) {
    if (fallback.entry !== entry) throw homeChanged();
    return fallback.proof;
  }
  const view = ownerReader(sample, entry, item.subject);
  if (!view || !sample.views.has(view) || !entry.plugin.presentation?.objects.some(object => object.kind === item.subject.kind)) throw homeChanged();
}

export async function openHomeObject(sample: Pick<HomeReadSample, "catalog" | "retain" | "assertCurrent">, entry: HomeDirectoryEntry, reader: ActionView, subject: ActionSubject,
  client: ActionClient, caller: ActionCallContext, transport: ReturnType<typeof pluginRouteControl>, prefix: string) {
  sample.retain([reader]);
  const current = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
  current();
  const read = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  const result = await read.invoke<{ subject_id: string }, ActionSubjectContext>({ ...reader, ...homeReference(reader) }, { subject_id: subject.id },
    { ...transport, assert_authority_current: current });
  current();
  if (result.subject.kind !== subject.kind || result.subject.id !== subject.id) throw homeChanged();
  return openProvedHomeObject(sample.catalog, entry, result, prefix);
}

/** The protected click can use the current request's existing subject proof. */
export function openProvedHomeObject(catalog: HomeReadSample["catalog"], entry: HomeDirectoryEntry, proof: SurfaceSubjectSummary, prefix: string) {
  const target = objectStageLocation(catalog.entries, entry, proof.open);
  if (!target) throw homeChanged();
  const { stage, viewId, id, surface } = target;
  assertStageInstallation(stage.installation.scope, stage.record, stage.installation);
  return stageNavigation(stage, { kind: "stage", view_id: viewId, installation: stage.installation }, prefix, { id, title: proof.title, surface });
}

/** A retained slot control has no old title or open result. Use the same exact reader again on its new request. */
export async function rereadSurfaceFallback(reader: ActionView, subject: ActionSubject, client: ActionClient, caller: ActionCallContext,
  control: ReturnType<typeof pluginRouteControl>, deadline: NonNullable<HomeReadSample["deadline"]>, current: () => void) {
  const read = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  let proof: SurfaceSubjectSummary | undefined;
  await deadline.read([subject], current, (subject, signal) => readSurfaceSubject(reader, subject, (view, input, signal, assertCurrent) =>
    read.invoke({ ...view, ...homeReference(view) }, input, { ...control, signal, assert_authority_current: assertCurrent }), signal, current),
  (_subject, result) => { if ("value" in result) proof = result.value; });
  current();
  if (!proof) throw homeChanged();
  return proof;
}
