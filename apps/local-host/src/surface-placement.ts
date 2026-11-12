import { randomUUID } from "node:crypto";
import { ActionError, bindActionClient, findSubjectReader, isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { placementActions, PLACEMENT_PROVIDER_ID, type PlacedObject } from "@molis-ai/molis-work-contracts/services/placement";
import type { SurfaceItem } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { presentationFormFields } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { sameReference } from "./contextual/contextual-service.js";
import { withSurfacePlacementCall, type SurfacePlacementCall, type SurfaceReceiver } from "./placement-surface-call.js";
import { displayedRoute, homeChanged, homeOwnsView, homeReference as ref, type HomeReadSample } from "./surface-home-display.js";
import { offerConsequences, surfaceOfferOperation, type SurfaceOfferObject } from "./surface-offer-operation.js";
import type { PositionChoice, PositionOfferSource } from "./surface-position-offers.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export type PlacementKind = "place" | "hand_off";
export const isPlacementKind = (kind: unknown): kind is PlacementKind => kind === "place" || kind === "hand_off";
export const needsPositionWindow = (kind: unknown) => kind === "peek" || isPlacementKind(kind);
const action = <Name extends keyof typeof placementActions>(name: Name) => ({ ...placementActions[name], provider_id: PLACEMENT_PROVIDER_ID });
type Route = NonNullable<ReturnType<typeof displayedRoute>>;
type Registered = Omit<ActionView, "availability">;

type PlacementSource = { object: SurfaceOfferObject; reader: ActionView; source: PlacedObject; original: string };
type ReceiverChoice = SurfaceReceiver & { original: string; current(): void };
type PlacementBinding = PlacementSource & { receiver?: ReceiverChoice; revision: string };
export type SurfacePlacementTarget = PlacementSource & { receivers?: readonly ReceiverChoice[] };

const isReceiver = (view: Registered) => view.operation === "command" && view.action.scope === "project" && view.provider.project_id !== undefined && view.action.workflow_content?.role === "receive";
const safeReader = (view: ActionView) => view.operation === "query" && !view.action.external && view.action.execution?.cost !== "metered"
  && !view.action.permissions.includes("model:invoke") && (view.action.effect === undefined || view.action.effect === "read");

function originalMetadata(views: readonly Registered[], source: ActionView, kind: string, receiver?: SurfaceReceiver) {
  return JSON.stringify(views.filter(view => view.action.scope === source.action.scope && isSubjectReader(view.action) && view.action.subject_kinds.includes(kind)
    || receiver && (isReceiver(view) && view.action.workflow_content?.id === receiver.station || isSubjectReader(view.action) && view.action.scope === "project" && view.action.subject_kinds.includes(receiver.kind)))
    .map(view => canonicalJsonText([ref(view), view.provider.plugin_install_id, view.action])).sort());
}

export function availableSurfaceReceivers(sample: HomeReadSample): SurfaceReceiver[] {
  const installed = sample.catalog.entries.filter(entry => entry.record.state === "running" && entry.installation.scope === "project");
  const stations = new Map<string, ActionView[]>();
  for (const view of sample.directory) {
    if (!view.availability.available || !isReceiver(view) || !installed.some(entry => homeOwnsView(entry, view))) continue;
    const station = view.action.workflow_content!.id;
    stations.set(station, [...stations.get(station) ?? [], view]);
  }
  const readers = sample.directory.filter(view => view.action.scope === "project" && view.provider.project_id !== undefined);
  return [...stations].flatMap(([station, candidates]) => {
    const [action] = candidates, kinds = action!.action.subject_kinds;
    if (candidates.length !== 1 || kinds.length !== 1) return [];
    const reader = findSubjectReader(readers, kinds[0]!);
    if (reader.found !== "one" || !safeReader(reader.view) || !installed.some(entry => homeOwnsView(entry, action!) && homeOwnsView(entry, reader.view))) return [];
    return [{ action: action!, reader: reader.view, station, kind: kinds[0]! }];
  });
}

export function bindSurfacePlacement(sample: HomeReadSample, route: Route, item: SurfaceItem, kind: PlacementKind, revision: string, project: string,
  metadata: readonly Registered[]): SurfacePlacementTarget | undefined {
  if (item.form !== "card" || item.state !== "ok" || !item.actions.some(operation => operation.ref === kind) || !safeReader(route.reader)) return undefined;
  const form = presentationFormFields(route.object, "card"), subject = item.subject;
  const original = findSubjectReader(sample.directory.filter(view => view.action.scope === route.reader.action.scope), subject.kind);
  if (!form || original.found !== "one" || original.view !== route.reader) return undefined;
  const available = kind === "hand_off" ? availableSurfaceReceivers(sample) : undefined;
  if (available && !available.length) return undefined;
  const receivers = available?.map(receiver => ({ ...receiver, current: sample.pin([receiver.action, receiver.reader]),
    original: originalMetadata(metadata, route.reader, subject.kind, receiver) }));
  const names = kind === "place" ? ["describe", "spaces", "link"] as const : ["describe", "convert"] as const;
  const placement = names.map(name => sample.directory.find(view => view.availability.available && sameReference(ref(view), action(name))));
  if (placement.some(view => !view)) return undefined;
  sample.retain([route.reader, route.action, ...placement.flatMap(view => view ? [view] : [])]);
  return { object: { subject, values: route.action, fields: form.fields, revision }, reader: route.reader, source: {
    ...subject, project_id: route.entry.installation.scope === "home" ? null : project,
  }, receivers, original: originalMetadata(metadata, route.reader, subject.kind) };
}

const checkDirectory = (binding: PlacementSource & { receiver?: ReceiverChoice }, context: SurfaceProjectContext, current: () => void) => () => {
  current();
  const { receiver } = binding;
  receiver?.current();
  if (originalMetadata(context.inspect(), binding.reader, binding.source.kind, receiver) !== (receiver?.original ?? binding.original)) throw homeChanged();
};

function controlFor(context: SurfaceProjectContext, current: () => void) {
  return { signal: context.transport.signal, locale: context.transport.locale, assert_authority_current: current,
    async beforeEffect() { await context.transport.beforeEffect(); current(); } };
}

function protectedCall(context: SurfaceProjectContext, binding: PlacementSource & { receiver?: SurfaceReceiver }, effect: SurfacePlacementCall["effect"]) {
  const project = context.caller.project_id;
  if (!project) throw homeChanged();
  return { effect, source: binding.source, reader: binding.reader, receiver: binding.receiver, actor: context.caller.actor_id, project, client: context.client };
}

function placementChoice(binding: PlacementBinding, choice: { project: string; name: string }): PositionChoice {
  const request = randomUUID(), warning = binding.receiver ? offerConsequences(binding.receiver.action) : [];
  return { key: randomUUID(), label: choice.name, consequence: warning, async confirm(context, current, beforeWrite) {
    const valid = checkDirectory(binding, context, current), write = () => { valid(); beforeWrite?.(); };
    await surfaceOfferOperation(context, write).version(binding.object);
    const actions = bindActionClient(context.client, () => context.caller);
    const call = { ...protectedCall(context, binding, binding.receiver ? "convert" : "link"), revision: binding.revision, beforeWrite: write };
    write();
    const result = await withSurfacePlacementCall(call, async () => binding.receiver
      ? actions.invoke(action("convert"), { source: binding.source, to: { station: binding.receiver.station }, to_project_id: choice.project, request_id: request }, controlFor(context, valid))
      : actions.invoke(action("link"), { object: binding.source, project_id: choice.project }, controlFor(context, valid)));
    try { valid(); }
    catch (cause) { throw new ActionError("actions.outcome_unknown", "操作结果需要到原对象核对", { cause }); }
    return { title: "title" in result ? uiText.text("workbench.placement.turned-into") + " · " + result.title : uiText.text("workbench.placement.used-project-project", { project: choice.name }), result,
      ...(binding.receiver ? { request_id: request } : {}) };
  } };
}

export async function prepareSurfacePlacement(context: SurfaceProjectContext, bound: SurfacePlacementTarget, current: () => void, source: PositionOfferSource = {}) {
  const valid = checkDirectory(bound, context, () => { current(); source.current?.(); source.beforeWrite?.(); });
  const version = () => surfaceOfferOperation(context, valid).version(bound.object);
  await version();
  const client = bindActionClient(context.client, () => ({ ...context.caller, query_only: true, read_only_effects: true }));
  const call: SurfacePlacementCall = protectedCall(context, bound, "describe");
  const description = await withSurfacePlacementCall(call, () => client.invoke(action("describe"), { object: bound.source }, controlFor(context, valid)));
  if (description.state !== "ok" || !call.checkedRevision || description.object.project_id !== bound.source.project_id) throw homeChanged();
  const { receivers, ...original } = bound;
  const binding = { ...original, revision: call.checkedRevision };
  if (receivers) {
    valid();
    const choices = receivers.map(receiver => placementChoice({ ...binding, receiver },
      { project: call.project, name: receiver.action.action.workflow_content!.title }));
    return { title: uiText.text("common.presentation.hand_off"), description: uiText.text("workbench.placement.original-stays-new-item-records-where-came"), choices };
  }
  const { spaces } = await client.invoke(action("spaces"), {}, controlFor(context, valid));
  const used = new Set(description.associations.flatMap(edge => edge.type === "used_in" && edge.target.kind === "project" ? [edge.target.project_id] : []));
  const choices = description.can.use_in_project ? spaces.filter(space => space.kind === "project" && space.project_id !== description.location?.project_id
    && space.project_id !== bound.source.project_id && !used.has(space.project_id)).slice(0, 30)
    .map(space => placementChoice(binding, { project: space.project_id, name: space.title })) : [];
  valid();
  return { title: uiText.text("workbench.placement.use-project-2"), description: uiText.text("workbench.placement.stays-place-project-only-gets-link", { place: description.location?.title ?? uiText.text("workbench.placement.its-current-location") }), choices };
}
