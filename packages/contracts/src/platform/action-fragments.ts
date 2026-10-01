import type { ActionDefinition, ActionReference } from "./actions.js";

/**
 * Fragment offers (specs/contextual-interaction §5.1): the subject-offers pattern applied to part of an object — a word,
 * a range, one or several blocks, or several objects the person selected. A provider declares its finite choices
 * statically (so a judgment can only pick among declared keys) and prepares each one's complete input on request.
 * Preparing never writes; the chosen action runs only when the person clicks it.
 */
export const FRAGMENT_OFFERS_INPUT_TYPE = "molis.fragment-offers.input.v1";
export const FRAGMENT_OFFERS_OUTPUT_TYPE = "molis.fragment-offers.output.v1";

/**
 * Declared in `subject_kinds` by a fragment offers query whose choices fit a fragment of any object (search it, note
 * it down): platform-wide providers declare it instead of listing every kind. It is never an object's kind.
 */
export const FRAGMENT_ANY_OBJECT = "molis.any-object";

/**
 * How much of an object the person has in hand. `object` is the whole object (整篇): a choice declared for it is also
 * offered, grouped apart, while the person has only part of that object in hand (specs/contextual-interaction §6.4.1).
 */
export const FRAGMENT_GRANULARITIES = ["word", "range", "block", "blocks", "objects", "object"] as const;
export type FragmentGranularity = (typeof FRAGMENT_GRANULARITIES)[number];

/** What a selected part is, as its surface knows it. */
export const FRAGMENT_ROLES = ["heading", "paragraph", "list", "task", "table", "quote", "code", "object"] as const;
export type FragmentRole = (typeof FRAGMENT_ROLES)[number];

/**
 * The person's likely purpose. A provider declares the intent of each choice; the judgment ranks intents but never
 * invents one. Titles are the group headings shown under “更多”.
 */
export const FRAGMENT_INTENTS = [
  { id: "understand", title: "理解" },
  { id: "question", title: "质疑" },
  { id: "expand", title: "展开" },
  { id: "organize", title: "组织" },
  { id: "relate", title: "关联" },
  { id: "rewrite", title: "改写" },
  { id: "combine", title: "比较与合并" },
  { id: "capture", title: "记录" },
  { id: "advance", title: "推进" },
] as const;
export type FragmentIntent = (typeof FRAGMENT_INTENTS)[number]["id"];

/**
 * What choosing the offer does to the page, so the surface can show the right preview before anything changes:
 * - `result`: produces something to read (an answer, a comparison); nothing on the page changes;
 * - `replace`: proposes new text for the selected range; applied only after the person accepts the preview;
 * - `insert_after`: proposes text placed after the selection; same acceptance;
 * - `record`: creates or links a record elsewhere (a Goal, a relation, a note); its parameters are shown first.
 */
export type FragmentApply = "result" | "replace" | "insert_after" | "record";

export interface FragmentTarget {
  readonly kind: "text_range" | "block" | "object";
  readonly role?: FragmentRole;
  /** For `object` targets (several objects selected): which object this part is. */
  readonly ref?: { readonly kind: string; readonly id: string; readonly version?: string | number; readonly title?: string };
  /** Bounded text of this part; `truncated` says it was cut. */
  readonly text: string;
  readonly truncated?: boolean;
}

export interface FragmentOffersInput {
  readonly fragment: {
    readonly object: { readonly kind: string; readonly id: string; readonly version?: string | number; readonly title?: string };
    readonly granularity: FragmentGranularity;
    readonly targets: readonly FragmentTarget[];
    readonly heading_path?: readonly string[];
    /** The Goal the object belongs to, when the surface knows it. */
    readonly goal?: { readonly id: string; readonly title: string };
  };
  readonly request_id: string;
}

export interface FragmentActionOffer {
  readonly offer_id: string;
  readonly title: string;
  readonly action: ActionReference;
  /** The complete input for `action`, prepared from the fragment. */
  readonly input: unknown;
  /** For an offer that writes (`record`): what it will do, in the person's words, shown before they confirm. */
  readonly summary?: string;
  /** Top-level input fields the person may change before confirming. */
  readonly editable?: readonly string[];
  /** Values the fragment could not supply; the person answers these before it can run. */
  readonly missing?: readonly { readonly field: string; readonly question: string }[];
}

/** A declared choice. The target belongs to the same provider; `granularities` narrows where it applies. */
export interface FragmentOfferChoice {
  readonly offer_id: string;
  readonly title: string;
  readonly intent: FragmentIntent;
  readonly apply: FragmentApply;
  /** One plain sentence a judgment reads to tell this choice from the others. */
  readonly hint: string;
  readonly action: Pick<ActionReference, "capability_id" | "version">;
  readonly granularities?: readonly FragmentGranularity[];
  readonly roles?: readonly FragmentRole[];
  /** Offered only when the surface knows this about the object: `goal`, the Goal it belongs to. */
  readonly requires?: readonly "goal"[];
}

const id = { type: "string", minLength: 1 };
const text = { type: "string", maxLength: 4000 };
const TARGET_SCHEMA = {
  type: "object",
  properties: { kind: { enum: ["text_range", "block", "object"] }, role: { enum: [...FRAGMENT_ROLES] }, text, truncated: { type: "boolean" },
    ref: { type: "object", properties: { kind: id, id, version: { type: ["string", "integer"] }, title: { type: "string", maxLength: 200 } }, required: ["kind", "id"], additionalProperties: false } },
  required: ["kind", "text"], additionalProperties: false,
};
export const FRAGMENT_OFFERS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    fragment: {
      type: "object",
      properties: {
        object: { type: "object", properties: { kind: id, id, version: { type: ["string", "integer"] }, title: { type: "string", maxLength: 200 } }, required: ["kind", "id"], additionalProperties: false },
        granularity: { enum: [...FRAGMENT_GRANULARITIES] },
        targets: { type: "array", minItems: 1, maxItems: 8, items: TARGET_SCHEMA },
        heading_path: { type: "array", maxItems: 6, items: { type: "string", maxLength: 200 } },
        goal: { type: "object", properties: { id, title: { type: "string", maxLength: 200 } }, required: ["id", "title"], additionalProperties: false },
      },
      required: ["object", "granularity", "targets"], additionalProperties: false,
    },
    request_id: { ...id, maxLength: 200 },
  },
  required: ["fragment", "request_id"], additionalProperties: false,
};
export const FRAGMENT_OFFERS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          offer_id: id, title: { ...id, maxLength: 120 },
          action: { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id }, required: ["capability_id", "version"], additionalProperties: false },
          input: {},
          summary: { type: "string", maxLength: 600 },
          editable: { type: "array", maxItems: 20, items: id },
          missing: { type: "array", maxItems: 10, items: { type: "object", properties: { field: id, question: { type: "string", minLength: 1, maxLength: 200 } }, required: ["field", "question"], additionalProperties: false } },
        },
        required: ["offer_id", "title", "action", "input"], additionalProperties: false,
      },
    },
  },
  required: ["offers"], additionalProperties: false,
};

export function defineFragmentOffersAction(capabilityId: string, kinds: string[], title: string, permissions: string[],
  choices: readonly FragmentOfferChoice[], scope: "project" | "home" = "project"): ActionDefinition<FragmentOffersInput, { offers: FragmentActionOffer[] }> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "按选中的片段准备本插件真实动作的完整参数；不会执行这些动作。", kind: "query", scope, scheduling: "concurrent",
    permissions, audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: kinds, fragment_offer_choices: choices,
    input_type: FRAGMENT_OFFERS_INPUT_TYPE, output_type: FRAGMENT_OFFERS_OUTPUT_TYPE, input_schema: FRAGMENT_OFFERS_INPUT_SCHEMA, output_schema: FRAGMENT_OFFERS_OUTPUT_SCHEMA } };
}

const INTENT_IDS: ReadonlySet<string> = new Set(FRAGMENT_INTENTS.map(intent => intent.id));
const APPLIES: ReadonlySet<string> = new Set(["result", "replace", "insert_after", "record"]);

/** Registration-time checks, in the style of the other declaration checks in `actions.ts`. */
export function fragmentOfferDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (schema: unknown) => string): string[] {
  const metadata = action as {
    readonly kind?: string; readonly scope?: string; readonly subject_kinds?: readonly string[];
    readonly input_type?: string; readonly output_type?: string; readonly input_schema?: unknown; readonly output_schema?: unknown;
    readonly fragment_offer_choices?: readonly FragmentOfferChoice[];
  };
  const problems: string[] = [];
  const declares = metadata.input_type === FRAGMENT_OFFERS_INPUT_TYPE || metadata.output_type === FRAGMENT_OFFERS_OUTPUT_TYPE || metadata.fragment_offer_choices !== undefined;
  if (!declares) return problems;
  // A platform provider (search, say) lives at home scope and serves every project; a plugin's offers are per project.
  if (operation !== "query" || metadata.kind !== "query" || (metadata.scope !== "project" && metadata.scope !== "home") || !metadata.subject_kinds?.length
    || metadata.input_type !== FRAGMENT_OFFERS_INPUT_TYPE || metadata.output_type !== FRAGMENT_OFFERS_OUTPUT_TYPE
    || canonical(metadata.input_schema) !== canonical(FRAGMENT_OFFERS_INPUT_SCHEMA) || canonical(metadata.output_schema) !== canonical(FRAGMENT_OFFERS_OUTPUT_SCHEMA)) {
    problems.push(`能力 ${key} 没有兑现片段动作协议 v1 的输入输出合同`);
  }
  const choices = metadata.fragment_offer_choices;
  const valid = (choice: FragmentOfferChoice) => typeof choice === "object" && choice !== null
    && typeof choice.offer_id === "string" && /^[a-z][a-z0-9_.-]{0,47}$/.test(choice.offer_id)
    && typeof choice.title === "string" && choice.title.trim().length > 0 && choice.title.length <= 40
    && typeof choice.hint === "string" && choice.hint.trim().length > 0 && choice.hint.length <= 160
    && INTENT_IDS.has(choice.intent) && APPLIES.has(choice.apply)
    && typeof choice.action === "object" && choice.action !== null && typeof choice.action.capability_id === "string" && choice.action.capability_id.length > 0
    && Number.isInteger(choice.action.version) && choice.action.version >= 1 && (choice.action as { provider_id?: unknown }).provider_id === undefined
    && (choice.granularities === undefined || (Array.isArray(choice.granularities) && choice.granularities.length > 0 && choice.granularities.every(item => (FRAGMENT_GRANULARITIES as readonly string[]).includes(item))))
    && (choice.roles === undefined || (Array.isArray(choice.roles) && choice.roles.length > 0 && choice.roles.every(item => (FRAGMENT_ROLES as readonly string[]).includes(item))))
    && (choice.requires === undefined || (Array.isArray(choice.requires) && choice.requires.length > 0 && choice.requires.every(item => item === "goal")));
  if (!Array.isArray(choices) || !choices.length || choices.some(choice => !valid(choice)) || new Set(choices.map(choice => choice.offer_id)).size !== choices.length) {
    problems.push(`能力 ${key} 的片段动作选项必须有唯一标识、名称、意图、说明及本提供方的目标动作版本`);
  }
  return problems;
}
