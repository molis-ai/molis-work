import { randomUUID } from "node:crypto";
import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_FORM_KINDS, PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { projectRoutePrefix, type ProjectRequestContext } from "./web-project-context.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { SurfaceSlotRecord } from "./surface-slot-state.js";
import { slotOperation, surfaceSlotLabels, type RetainedSlotControls, type SlotPreparation } from "./surface-slot-controls.js";
import { positionCorrection, positionRecovery } from "./surface-position-correction.js";

type Intent = { intent: "reserve"; mount_id: number; slot_id: string; subjects: ActionSubject[] }
  | { intent: "read"; slot: string; recovery?: ActionSubject }
  | { intent: "close"; slot: string }
  | { intent: "activate"; slot: string; render: string; control: string }
  | { intent: "correct"; slot: string; render: string; correction: NonNullable<ReturnType<typeof positionCorrection>> }
  | { intent: "confirm"; slot: string; render: string; preparation: string }
  | { intent: "cancel"; slot: string; preparation: string };

export interface RenderedSurfaceSlot {
  readonly id: string;
  readonly binding: RetainedSlotControls;
  busy?: boolean;
  prepared?: { id: string; value: SlotPreparation };
}
const invalid = () => new ActionError("actions.input_invalid", "呈现位置请求无效");
const expired = () => new ActionError("actions.provider_changed", "呈现位置已变化，请重新读取");
const name = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;
const closed = (value: Record<string, unknown>, ...keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function intentOf(body: Record<string, unknown>): Intent {
  const { intent, mount_id, slot_id, subjects, slot, render, control, preparation } = body;
  if (intent === "reserve" && closed(body, "intent", "mount_id", "slot_id", "subjects") && typeof mount_id === "number" && Number.isSafeInteger(mount_id)
    && mount_id > 0 && name(slot_id) && Array.isArray(subjects) && subjects.length <= PRESENTATION_LIMITS.values_subjects) {
    const checked = subjects.map(subject => {
      if (!isRecord(subject) || !closed(subject, "kind", "id") || typeof subject.kind !== "string" || !subject.kind.length
        || typeof subject.id !== "string" || !subject.id.length) throw invalid();
      return { kind: subject.kind, id: subject.id };
    });
    return { intent, mount_id, slot_id, subjects: checked };
  }
  if (name(slot)) {
    if (intent === "close" && closed(body, "intent", "slot")) return { intent, slot };
    if (intent === "read" && (closed(body, "intent", "slot") || closed(body, "intent", "slot", "recovery")))
      return { intent, slot, recovery: positionRecovery(body.recovery) };
    if (intent === "activate" && closed(body, "intent", "slot", "render", "control") && name(render) && name(control)) return { intent, slot, render, control };
    if (intent === "correct" && closed(body, "intent", "slot", "render", "correct") && name(render)) {
      const correction = positionCorrection(body.correct);
      if (correction) return { intent, slot, render, correction };
    }
    if (intent === "confirm" && closed(body, "intent", "slot", "render", "preparation") && name(render) && name(preparation)) return { intent, slot, render, preparation };
    if (intent === "cancel" && closed(body, "intent", "slot", "preparation") && name(preparation)) return { intent, slot, preparation };
  }
  throw invalid();
}

function heights(slot: SurfaceSlotRecord) {
  const form = [...PRESENTATION_FORM_KINDS].reverse().find(form => slot.slot.accepts_forms?.includes(form));
  switch (form) {
    case "peek": return { narrow: 304, wide: 256 };
    case "card": return { narrow: 232, wide: 192 };
    case "row": return { narrow: 116, wide: 100 };
    default: return { narrow: 86, wide: 76 };
  }
}

async function readSlot({ localHost, hostReference, options }: ProjectRequestContext, slot: SurfaceSlotRecord, signal: AbortSignal,
  current: () => void, deliver: (value: unknown) => void, recovery?: ActionSubject) {
  slot.read?.abort(expired());
  slot.render = undefined;
  const read = slot.read = new AbortController();
  const live = AbortSignal.any([signal, slot.signal, read.signal]);
  const assertReading = () => { live.throwIfAborted(); current(); slot.assertCurrent(); if (slot.read !== read) throw expired(); };
  try {
    return await localHost.surfacePosition(hostReference, { slot: { kind: "plugin-slot", plugin_id: slot.pluginId, slot_id: slot.slot.slot_id }, subjects: [...slot.subjects] },
      projectRoutePrefix(options), live, assertReading, async position => {
        const display = await position.display(recovery), binding = position.captureSlot(display), id = randomUUID();
        position.current(); assertReading(); binding.assertCurrent();
        slot.render = { id, binding };
        const groups = display.groups.map(group => ({ ...group, items: group.items.map(item => ({
          ...item, actions: [], ...(item.notices ? { notices: item.notices.map(({ reason }) => ({ reason })) } : {}),
        })) }));
        deliver({ render: id, display: { ...display, groups }, controls: surfaceSlotLabels(binding) });
        return true;
      }, undefined, slot);
  } finally { if (slot.read === read) slot.read = undefined; }
}

export async function handleSurfaceSlotHttp(context: ProjectRequestContext): Promise<boolean> {
  const { request, response, url, hostReference, localHost, options } = context;
  if (url.pathname !== "/api/contextual/surface-slot") return false;
  try {
    const page = pluginPageRequest(request);
    if (request.method !== "POST" || !page || page.project_id !== hostReference.project_id)
      throw new ActionError("actions.forbidden", "需要原插件页面的呈现位置凭据");
    const state = page.surfaceSlot(), input = intentOf(await readLocalWebBody(request, 64_000));
    await page.beforeEffect();
    const deliver = (value: unknown) => { page.assertCurrent(); sendLocalWebJson(response, 200, value); };
    if (input.intent === "reserve") {
      const slot = state.reserve(input.mount_id, input.slot_id, input.subjects);
      deliver({ slot: slot.id, heights: heights(slot) }); return true;
    }
    const slot = state.require(input.slot);
    if (input.intent === "close") { state.close(slot.id); deliver({ closed: true }); return true; }
    if (input.intent === "read") {
      if (!await readSlot(context, slot, page.signal, page.assertCurrent, deliver, input.recovery)) throw expired();
      return true;
    }
    const render = slot.render;
    if (input.intent === "cancel") {
      if (!render?.prepared || render.prepared.id !== input.preparation) throw expired();
      render.prepared = undefined; deliver({ closed: true }); return true;
    }
    if (!render || !("render" in input) || render.id !== input.render || render.busy) throw expired();
    const assertRender = () => { page.assertCurrent(); slot.assertCurrent(); if (slot.render !== render) throw expired(); };
    render.busy = true;
    const prepared = render.prepared;
    render.prepared = undefined; // This handle can be consumed once, even if a later recheck refuses.
    try {
      const live = AbortSignal.any([page.signal, slot.signal]);
      if (input.intent === "correct") {
        const updated = await localHost.surfacePosition(hostReference, { slot: { kind: "plugin-slot", plugin_id: slot.pluginId, slot_id: slot.slot.slot_id }, subjects: [...slot.subjects] },
          projectRoutePrefix(options), live, () => { assertRender(); render.binding.assertCurrent(); }, async position => {
            const result = await position.correct(input.correction);
            position.current(); deliver(result); return true;
          }, undefined, slot);
        if (!updated) throw expired();
        return true;
      }
      if (!await localHost.surfaceOperation(hostReference, live, assertRender, async context => {
        const operation = slotOperation(context, render.binding, projectRoutePrefix(options), assertRender);
        if (input.intent === "confirm") {
          if (!prepared || prepared.id !== input.preparation) throw expired();
          const result = await operation.confirm(prepared.value);
          if (prepared.value.target.kind !== "placement-choice") operation.current();
          deliver({ result: { kind: "invoked", label: prepared.value.target.label,
            ...(prepared.value.target.kind === "placement-choice" ? { receipt: result } : {}) } });
        } else {
          const control = render.binding.controls.get(input.control);
          if (!control) throw expired();
          const result = await operation.activate(control);
          operation.current();
          if (result.preparation) {
            const id = randomUUID();
            render.prepared = { id, value: result.preparation };
            deliver({ preparation: id, label: control.label, consequence: control.warning ?? [] });
          } else deliver(result);
        }
        return true;
      })) throw expired();
    } finally { render.busy = false; }
  } catch (error) {
    if (!response.destroyed) { const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body); }
  }
  return true;
}
