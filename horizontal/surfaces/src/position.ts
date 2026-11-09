import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_FORM_KINDS, type FormKind, type PresentationObject } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceItem, SurfaceRequest, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { presentationFormFields } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { surfaceErrors } from "./errors.js";
import { subjectKey, type SurfacePlugin } from "./ports.js";

export interface Position {
  forms: readonly FormKind[];
  refuse: ReadonlySet<string>;
  max: number;
}

const fixed = (forms: readonly FormKind[], max = Infinity): Position => ({ forms, max, refuse: new Set() });
const conversation = fixed(["chip", "card"], 6);
const attention = fixed(["row"]);

export function positionFor(slot: SurfaceSlot, plugins: readonly SurfacePlugin[]): Position {
  switch (slot.kind) {
    case "conversation":
    case "discussion": return conversation;
    case "attention": return attention;
    case "plugin-slot": {
      const active = plugins.filter(entry => entry.plugin_id === slot.plugin_id && entry.state === "running");
      if (!active.length) throw surfaceErrors.slot_unknown("找不到这个挂载位置");
      const mounts = active.flatMap(plugin => plugin.slots.filter(entry => entry.slot_id === slot.slot_id && entry.accepts_forms?.length));
      const mount = mounts.length === 1 ? mounts[0] : undefined;
      return { forms: PRESENTATION_FORM_KINDS.filter(form => mount?.accepts_forms?.includes(form)), max: mount?.max ?? Infinity, refuse: new Set(mount?.refuse_kinds) };
    }
    default: throw surfaceErrors.slot_unknown("这个位置尚未提供组合");
  }
}

export function deliveredSubjects(request: SurfaceRequest): ReadonlySet<string> {
  const keys = request.delivery_subjects?.map(subjectKey) ?? [];
  const selected = new Set(keys);
  const asked = new Set(request.subjects?.map(subjectKey));
  if (selected.size !== keys.length || keys.some(key => !asked.has(key))) {
    throw new ActionError("actions.input_invalid", "交付的对象必须在请求对象里，每个只列一次");
  }
  return selected;
}

export function formAt(position: Position, preferred: FormKind, object?: PresentationObject): Pick<SurfaceItem, "form" | "fields"> {
  const forms = [...position.forms];
  const fallback = { form: forms[0]!, fields: [] };
  if (!object) return fallback;
  const ceiling = PRESENTATION_FORM_KINDS.indexOf(preferred);
  for (const form of forms.reverse()) {
    if (PRESENTATION_FORM_KINDS.indexOf(form) > ceiling) continue;
    const chosen = presentationFormFields(object, form);
    if (!chosen || !position.forms.includes(chosen.form)) continue;
    const fields = object.fields.filter(field => chosen.fields.includes(field.key));
    return { form: chosen.form, fields: chosen.fields.map(key => ({ key, role: fields.find(field => field.key === key)!.role })) };
  }
  return fallback;
}
