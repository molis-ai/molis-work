import { PRESENTATION_FORM_KINDS } from "@molis-ai/molis-work-contracts/platform/presentation";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContributionDeclaration, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";

/** Only object mounts are author data. The actual workbench contribution is fixed by the Host. */
export type SandboxUiContribution = Pick<UiContributionDeclaration, "slots">;
export const sandboxUiContribution = (pluginId: string) => pluginId + ".ui.v1";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const invalid = (): never => { throw pluginErrors.declaration_invalid("界面 ui 只接受合法、唯一的对象挂载位声明"); };

export function parseSandboxUi(value: unknown): SandboxUiContribution | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.slots)) return invalid();
  const seen = new Set<string>();
  const slots = value.slots.map((entry: unknown): UiSlotDescriptor => {
    if (!record(entry) || Object.keys(entry).some(key => !["slot_id", "accepts", "accepts_forms", "max", "refuse_kinds"].includes(key))
      || !name(entry.slot_id) || seen.has(entry.slot_id) || !Array.isArray(entry.accepts) || entry.accepts.length) return invalid();
    const { slot_id, max, refuse_kinds } = entry, forms = entry.accepts_forms;
    if (!Array.isArray(forms) || !forms.length || max !== undefined && (typeof max !== "number" || !Number.isSafeInteger(max) || max < 1)
      || refuse_kinds !== undefined && (!Array.isArray(refuse_kinds) || !refuse_kinds.every(name) || new Set(refuse_kinds).size !== refuse_kinds.length)) return invalid();
    const accepts_forms = PRESENTATION_FORM_KINDS.filter(form => forms.includes(form));
    if (accepts_forms.length !== forms.length || accepts_forms.some((form, index) => form !== forms[index])) return invalid();
    seen.add(slot_id);
    return { slot_id, accepts: [], accepts_forms, ...(typeof max === "number" ? { max } : {}), ...(Array.isArray(refuse_kinds) ? { refuse_kinds: [...refuse_kinds] } : {}) };
  });
  return { slots };
}

export function sandboxUiDeclaration(input: { pluginId: string; name: string; ui?: SandboxUiContribution }): UiContributionDeclaration {
  return { contribution_id: sandboxUiContribution(input.pluginId), kind: "primary-page", label: input.name, slots: input.ui?.slots ?? [],
    surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }] };
}
