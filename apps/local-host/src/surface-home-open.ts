import { ActionError, bindActionClient, type ActionCallContext, type ActionClient, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiViewSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceInstallationRef, SurfaceItem, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { assertStageInstallation, installedStagePath } from "./installed-stage-identity.js";
import { homeChanged, homeReference, ownerReader, type HomeReadSample } from "./surface-home-display.js";
import type { HomeDirectoryEntry } from "./surface-home-directory.js";
import type { pluginRouteControl } from "./plugin-route-control.js";

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
export function homeObjectClick(target: Record<string, unknown>, owner: string, sample: HomeReadSample) {
  if (target.kind !== "object" && target.kind !== "open_result" && target.kind !== "peek") return undefined;
  const subject = target.subject;
  if (Object.keys(target).length !== 3 || !isRecord(subject) || Object.keys(subject).length !== 2
    || typeof subject.id !== "string" || !subject.id.length || subject.id.length > 1000
    || typeof subject.kind !== "string" || !subject.kind.length || subject.kind.length > 200) throw new ActionError("actions.input_invalid", "首页对象无效");
  const entry = sample.catalog.entries.find(entry => entry.plugin.plugin_id === owner && entry.record.state === "running"
    && canonicalJsonText(entry.installation, "null") === canonicalJsonText(target.installation, "null"));
  if (!entry) throw homeChanged();
  const selected: ActionSubject = { kind: subject.kind, id: subject.id };
  const item = sample.description.groups.flatMap(group => group.items).find(item => item.owner_plugin_id === owner
    && item.subject.kind === selected.kind && item.subject.id === selected.id && (item.state === "ok" || item.state === "stale")
    && item.actions.some(action => action.ref === (target.kind === "peek" ? "peek" : "open")));
  if (target.kind !== "open_result" && !item) throw homeChanged();
  return { kind: target.kind, entry, subject: selected, item };
}

export function assertHomeDisplayReader(sample: HomeReadSample, entry: HomeDirectoryEntry, item: SurfaceItem) {
  const view = ownerReader(sample, entry, item.subject);
  if (!view || !sample.views.has(view) || !entry.plugin.presentation?.objects.some(object => object.kind === item.subject.kind)) throw homeChanged();
}

export async function openHomeObject(sample: HomeReadSample, entry: HomeDirectoryEntry, reader: ActionView, subject: ActionSubject,
  client: ActionClient, caller: ActionCallContext, transport: ReturnType<typeof pluginRouteControl>, prefix: string) {
  sample.retain([reader]);
  const current = () => { transport.signal?.throwIfAborted(); sample.assertCurrent(); };
  current();
  const read = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  const result = await read.invoke<{ subject_id: string }, ActionSubjectContext>({ ...reader, ...homeReference(reader) }, { subject_id: subject.id },
    { ...transport, assert_authority_current: current });
  current();
  if (result.subject.kind !== subject.kind || result.subject.id !== subject.id || !result.open) throw homeChanged();
  // A signed reader can only open its own installation. A dual native owner can share its registered main surface.
  const stage = entry.route ? entry : sample.catalog.entries.find(item => item.route?.kind === "native" && entry.record.publisher_trust === "host"
    && item.plugin.plugin_id === entry.plugin.plugin_id && item.record.publisher_signature === entry.record.publisher_signature);
  const route = stage?.route;
  if (!stage || !route) throw homeChanged();
  assertStageInstallation(stage.installation.scope, stage.record, stage.installation);
  const { id, surface } = result.open;
  const main = surface === route.shell || surface === route.surface;
  if (!main && (route.kind !== "native" || !route.owner.view.descriptor.surfaces?.some(item => item.surface_id === surface && item.target_slot_id === "workbench.main"))) throw homeChanged();
  return stageNavigation(stage, { kind: "stage", view_id: route.view_id, installation: stage.installation }, prefix,
    { id, title: result.title, surface: main ? route.surface : surface });
}
