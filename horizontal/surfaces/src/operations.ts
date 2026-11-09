import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormKind, PresentationObject, PresentationObjectAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import { PLACEMENT_PROVIDER_ID, placementActions } from "@molis-ai/molis-work-contracts/services/placement";
import type { SurfaceConsequence, SurfaceItem, SurfaceItemAction, SurfaceItemNotice, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { ownedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import { viewRef, type SurfaceComposePorts, type SurfacePlugin } from "./ports.js";

export function ownsView(plugin: SurfacePlugin, view: ActionView): boolean {
  return plugin.install_id === view.provider.plugin_install_id && view.provider.kind === "plugin" && view.provider.plugin_id === plugin.plugin_id
    && (plugin.scope === "project") === (view.provider.project_id !== undefined);
}

export function declaredAction(ref: string, owner: SurfacePlugin, views: readonly ActionView[]): ActionView | undefined {
  const matches = views.filter(view => viewRef(view) === ref);
  const own = matches.filter(view => ownsView(owner, view));
  const choices = own.length ? own : matches;
  return choices.length === 1 ? choices[0] : undefined;
}

function actionFor(declaration: PresentationObjectAction, view: ActionView, primary: boolean): SurfaceItemAction {
  const consequence: SurfaceConsequence[] = [];
  if (view.action.external) consequence.push("external");
  if (view.action.execution?.cost === "metered") consequence.push("cost");
  if (view.action.effect === "irreversible") consequence.push("irreversible");
  return { ref: declaration.ref, provider_id: view.provider.provider_id, primary,
    ...(declaration.input_from ? { prepared_input: { ...declaration.input_from } } : {}), ...(consequence.length ? { consequence } : {}) };
}

function noticeApplies(declaration: PresentationObjectAction, status: string | undefined, view: ActionView): boolean {
  const when = declaration.unavailable?.when;
  if (!when) return false;
  return (!when.status || (status !== undefined && when.status.includes(status)))
    && (!when.codes || (!view.availability.available && when.codes.includes(view.availability.code)));
}

function safeNext(declaration: PresentationObjectAction, view: ActionView): boolean {
  const metadata = view.action;
  const read = view.operation === "query" && (metadata.kind === "query" || metadata.kind === "navigation")
    && (metadata.effect === undefined || metadata.effect === "read") && metadata.external !== true && metadata.execution?.cost !== "metered"
    && !metadata.permissions.includes("model:invoke");
  const required = metadata.input_schema.required;
  return read && (!Array.isArray(required) || required.every(key => typeof key === "string" && Object.hasOwn(declaration.input_from ?? {}, key)));
}

function genericOperations(form: FormKind, views: readonly ActionView[]): SurfaceItemAction[] {
  const actions: SurfaceItemAction[] = [{ ref: "open", primary: false }];
  if (form === "chip" || form === "row") actions.push({ ref: "peek", primary: false });
  if (form === "card") {
    const available = (definition: { capability_id: string; version: number }) => views.some(view => view.availability.available
      && view.capability_id === definition.capability_id && view.version === definition.version && view.provider.provider_id === PLACEMENT_PROVIDER_ID);
    if (available(placementActions.link)) actions.push({ ref: "place", primary: false });
    if (available(placementActions.convert)) actions.push({ ref: "hand_off", primary: false });
  }
  return actions;
}

export const isPlacementOperation = (view: ActionView) => view.provider.provider_id === PLACEMENT_PROVIDER_ID
  && [placementActions.link, placementActions.convert].some(definition => view.capability_id === definition.capability_id && view.version === definition.version);

export function operationsFor(object: PresentationObject, owner: SurfacePlugin, form: FormKind, slot: SurfaceSlot, status: string | undefined,
  views: readonly ActionView[], diagnose: SurfaceComposePorts["diagnostic"]): Pick<SurfaceItem, "actions" | "notices"> {
  const matched = (object.actions ?? []).flatMap(declaration => {
    const when = declaration.when;
    if (when?.slots && !when.slots.includes(slot.kind)) return [];
    if (when?.status && (status === undefined || !when.status.includes(status))) return [];
    const view = declaredAction(declaration.ref, owner, views);
    if (!view) { diagnose?.("action_missing", { plugin_id: owner.plugin_id, ref: declaration.ref }); return []; }
    return [{ declaration, view, notice: noticeApplies(declaration, status, view) }];
  });
  const usable = matched.filter(item => item.view.availability.available && !item.notice);
  const primary = usable.find(item => item.declaration.primary);
  const actions = usable.map(item => actionFor(item.declaration, item.view, item === primary));
  const notices: SurfaceItemNotice[] = [];
  for (const item of matched) {
    const notice = item.declaration.unavailable;
    if (!item.notice || !notice) continue;
    const next = usable.find(candidate => candidate.declaration.ref === notice.next && safeNext(candidate.declaration, candidate.view));
    notices.push({ reason: ownedTextRef(notice.reason, owner.plugin_id), ...(next ? { next: actionFor(next.declaration, next.view, false) } : {}) });
  }
  actions.push(...genericOperations(form, views));
  return { actions, ...(notices.length ? { notices } : {}) };
}
