import type { ContextualDraft } from "@molis-ai/molis-work-contracts/services/contextual";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";
import type { HostTextRequestOptions } from "../host-complete-text.js";
import { cutUnits, draftData, type DraftMaterial, type DraftScreen, type DraftTarget } from "./draft-data.js";
import { fillableFields, materialValue, requiredFields, type Fillable } from "./fields.js";

/**
 * Drafting a creation entry's input (quick-create §5, context-program §6): the destination's own input schema is the form,
 * the passage or sentence is the material, and one structured model request fills the text and date fields. It opens no Agent
 * round, carries no tool, and writes no record. Nothing here can lose the person's words: whatever a model does, the draft
 * keeps them, and a model that is absent, slow or wrong only means the draft is what needs no model.
 */

export interface DraftModel {
  (prompt: string, options: Required<Pick<HostTextRequestOptions, "system" | "structured" | "timeoutMs" | "maxOutputTokens">> & Pick<HostTextRequestOptions, "signal">):
  Promise<{ readonly structured?: unknown; readonly configuredModel?: string }>;
}

export interface DraftPorts {
  /** Absent when no text model is configured. */
  readonly generate?: DraftModel;
  /** The drafting instruction as the person left it (设置 › 提示词), read when a model is actually asked. */
  instruction(): string;
  readonly screen: DraftScreen;
  /** The person's date, `YYYY-MM-DD`: “下周三前” means something only against it. */
  today(): string;
  readonly timeoutMs?: number;
}

export interface DraftInput {
  readonly target: DraftTarget;
  readonly material: DraftMaterial;
  /** Names this draft's request; the creation that follows is idempotent on it. */
  readonly request_id: string;
  /** What the provider computed from the passage without a model (its `prepare`): used as it is unless the person added a sentence. */
  readonly prepared?: { readonly input: Readonly<Record<string, unknown>>; readonly summary?: string; readonly editable?: readonly string[] };
}

type DraftOutcome = Pick<ContextualDraft, "input" | "basis" | "missing" | "editable" | "kept" | "notes"> & Partial<Pick<ContextualDraft, "summary" | "said" | "fallback" | "model">>;

const DRAFT_TIMEOUT_MS = 25_000;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const present = (value: unknown): boolean => value !== undefined && value !== null && !(typeof value === "string" && !value.trim()) && !(Array.isArray(value) && value.length === 0);

/** What needs no model: the provider's computed input, else the material placed in its field, and the request's name. */
function baseInput(input: DraftInput): Record<string, unknown> {
  const { target, material } = input;
  const base: Record<string, unknown> = { ...(input.prepared?.input ?? {}) };
  const properties = isRecord(target.input_schema.properties) ? target.input_schema.properties : {};
  if (target.material_field && !present(base[target.material_field])) {
    const value = materialValue(target.input_schema, target.material_field, material.text);
    if (value !== undefined) base[target.material_field] = value;
  }
  const shape = properties.request_id;
  if (isRecord(shape) && !present(base.request_id)) base.request_id = input.request_id.slice(0, typeof shape.maxLength === "number" ? Math.min(160, shape.maxLength) : 160);
  return base;
}

/** The fields a model returned that the destination's own schema accepts; the rest are left out, not repaired. */
function accepted(returned: Record<string, unknown>, fields: Fillable): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of fields.names) {
    const raw = returned[name];
    const value = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.map(item => typeof item === "string" ? item.trim() : item).filter(present) : raw;
    if (!present(value)) continue;
    const check = compileActionSchema({ type: "object", properties: { [name]: fields.shapes[name] }, additionalProperties: false });
    if (check({ [name]: value })) out[name] = value;
  }
  return out;
}

type Filled = { readonly values: Record<string, unknown>; readonly notes: string[]; readonly model?: string } | { readonly failed: NonNullable<ContextualDraft["fallback"]>["reason"]; readonly notes: string[] };

async function fillByModel(input: DraftInput, fields: Fillable, ports: DraftPorts, signal?: AbortSignal): Promise<Filled> {
  if (!ports.generate) return { failed: "unconfigured", notes: [] };
  const { data, notes } = draftData(input.target, input.material, ports.today(), ports.screen);
  let returned: unknown, model: string | undefined;
  try {
    const result = await ports.generate(data, { system: ports.instruction(), timeoutMs: ports.timeoutMs ?? DRAFT_TIMEOUT_MS, maxOutputTokens: 1_200,
      structured: { mode: "local", name: "intake_draft", schema: fields.request as never }, ...(signal ? { signal } : {}) });
    returned = result.structured; model = result.configuredModel;
  } catch (error) {
    // The person moved on: nobody waits for this draft, and nothing is returned for it.
    if (signal?.aborted) throw error;
    return { failed: "failed", notes };
  }
  const values = isRecord(returned) ? accepted(returned, fields) : {};
  return Object.keys(values).length ? { values, notes, ...(model ? { model } : {}) } : { failed: "invalid", notes };
}

/** What the card says when a model was wanted and not used: the passage is kept either way, and so is a provider's own result. */
const FALLBACK_MESSAGE = {
  unconfigured: ["没有可用的文字模型，已带着原文去新建", "没有可用的文字模型，没能按补充的话起草，先用原文的结果"],
  failed: ["起草没有完成，已带着原文去新建，可以重试", "起草没有完成，没能按补充的话起草，先用原文的结果，可以重试"],
  invalid: ["模型没有给出可用的内容，已带着原文去新建", "模型没有给出可用的内容，没能按补充的话起草，先用原文的结果"],
} as const;
const fallbackOf = (reason: keyof typeof FALLBACK_MESSAGE, prepared: boolean) => ({ reason, message: FALLBACK_MESSAGE[reason][prepared ? 1 : 0] });

function summaryOf(input: DraftInput, values: Record<string, unknown>, fields: Fillable): string {
  const first = fields.names.map(name => values[name]).find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return first ? `${input.target.verb}：「${first.length > 40 ? `${cutUnits(first, 39)}…` : first}」` : input.target.verb;
}

/**
 * The draft for one creation entry. A provider's `prepare` is used as it is, with no model, unless the person added a sentence;
 * otherwise a model fills the text and date fields the schema allows. The result is always a draft the person can read and
 * change: a field nobody could fill is named in `missing`, and nothing is asked back.
 */
export async function draftIntake(input: DraftInput, ports: DraftPorts, signal?: AbortSignal): Promise<DraftOutcome> {
  const { target, material } = input;
  const fields = fillableFields(target.input_schema, target.material_field ? [target.material_field] : []);
  const base = baseInput(input);
  const asked = (!input.prepared || Boolean(material.said)) && fields.names.length > 0;
  const filled = asked ? await fillByModel(input, fields, ports, signal) : undefined;
  const values = filled && "values" in filled ? filled.values : {};
  let merged: Record<string, unknown> = { ...base, ...values };
  let fallback = filled && "failed" in filled ? fallbackOf(filled.failed, Boolean(input.prepared)) : undefined;
  const missing = (candidate: Record<string, unknown>) => requiredFields(target.input_schema).filter(name => !present(candidate[name]));
  // A model's fields must not make an input the action itself refuses: when they do, the draft is what needs no model.
  if (Object.keys(values).length && !missing(merged).length) {
    try { assertActionInput(target.input_schema, merged); }
    catch { merged = { ...base }; fallback = fallbackOf("invalid", Boolean(input.prepared)); }
  }
  const modelWorked = Object.keys(values).length > 0 && !fallback;
  const basis: ContextualDraft["basis"] = modelWorked ? "model" : input.prepared ? "prepared" : "rules";
  const editable = [...new Set([...(input.prepared?.editable ?? []), ...fields.names])];
  return { input: merged, basis, missing: missing(merged), editable, kept: material.text, notes: filled?.notes ?? [],
    summary: modelWorked || !input.prepared?.summary ? summaryOf(input, merged, fields) : input.prepared.summary,
    ...(material.said ? { said: material.said } : {}), ...(fallback ? { fallback } : {}), ...(modelWorked && filled && "model" in filled && filled.model ? { model: filled.model } : {}) };
}
