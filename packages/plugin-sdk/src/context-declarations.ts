import { canonicalJsonText, isRecord } from "./json-value.js";
import {
  DELIVERED_MATERIAL_KINDS, FRAGMENT_OFFERS_INPUT_TYPE, WORKFLOW_CONTENT_SCHEMAS, ITEM_ATTACH_POSITIONS, ITEM_DECLARATION_LIMITS, actionEffect, isArtifactContinueAction, isSubjectReader,
  type ActionMetadata, type DeliveredMaterialKind,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_NOTIFICATION_DELIVERY_INPUT_SCHEMA, PLUGIN_NOTIFICATION_DELIVERY_RECEIPT_SCHEMA, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA, ONBOARDING_DOCUMENTS_INPUT_SCHEMA, ONBOARDING_DOCUMENTS_RESULT_SCHEMA, ONBOARDING_DRAFT_GET_INPUT_SCHEMA,
  ONBOARDING_DRAFT_GET_RESULT_SCHEMA, ONBOARDING_DRAFT_INPUT_SCHEMA, ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA, ONBOARDING_DRAFT_KEEP_RESULT_SCHEMA,
  ONBOARDING_DRAFT_RESULT_SCHEMA, ONBOARDING_TAKE_RESULT_SCHEMA,
} from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import { SURFACE_PLACES } from "@molis-ai/molis-work-contracts/services/contextual";

// The checks for what a plugin declares about being put things into (context-program §3.3, §3.4, §4): creation entries
// (`intake`), appends (`attach`), the places an offer applies in (`places`) and the object kinds a right-panel cell shows
// (`ui.views[].objects`). Two layers, as for the other declarations: `contextDeclarationProblems` reads one action by itself
// when it registers, `inspectContextDeclarations` reads the whole Manifest for what refers across actions and views. Both
// return every problem and never throw, and both append to the older checks, so the order an author reads does not change.

const ID_PATTERN = /^[a-z][a-z0-9_.-]*$/u;
const PLACES: ReadonlySet<string> = new Set(SURFACE_PLACES);
const POSITIONS: ReadonlySet<string> = new Set(ITEM_ATTACH_POSITIONS);
const LIMITS = ITEM_DECLARATION_LIMITS;

const words = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const ownId = (value: unknown): value is string => words(value, LIMITS.id) && ID_PATTERN.test(value);
const reference = (value: unknown): value is { capability_id: string; version: number } => isRecord(value) && words(value.capability_id, 200)
  && typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version > 0 && Object.keys(value).length === 2;

/** `places`, when declared, is a non-empty set of the places that exist. */
function placesValid(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length > 0 && value.every(place => PLACES.has(String(place))) && new Set(value).size === value.length);
}

function inputFields(action: Record<string, unknown>): Record<string, unknown> {
  const properties = isRecord(action.input_schema) ? action.input_schema.properties : undefined;
  return isRecord(properties) ? properties : {};
}

/** The part both declarations share: its words, the field that takes the selected text, and which places it applies in. */
function destinationValid(value: Record<string, unknown>): boolean {
  return words(value.title, LIMITS.title) && words(value.verb, LIMITS.verb) && words(value.describe, LIMITS.describe)
    && (value.material_field === undefined || typeof value.material_field === "string")
    && (value.prepare === undefined || reference(value.prepare)) && placesValid(value.places);
}

/** A destination writes: a command that can be taken back or confirmed, never one that cannot be undone. */
function writes(key: string, operation: unknown, action: Record<string, unknown>): boolean {
  const effect = action.effect === "read" || action.effect === "write" || action.effect === "irreversible" ? action.effect : undefined;
  return operation === "command" && actionEffect({ kind: action.kind as ActionMetadata["kind"], ...(effect ? { effect } : {}) }, key.split("@")[0]!) !== "irreversible";
}

/** Key order aside, the same JSON: a delivered intake's input and output are exactly the platform's. */
const same = (left: unknown, right: unknown): boolean => canonicalJsonText(left) === canonicalJsonText(right);

/**
 * What the platform delivers, the action that takes it (contract-design §2.1, §2.5): its exact input and output, its operation, where it
 * runs and who may call it. `drafts` names two more actions (`get`, `keep`), checked across the Manifest in `inspectContextDeclarations`.
 */
export const DELIVERED_INTAKE_SHAPES: Readonly<Record<DeliveredMaterialKind, { readonly input: unknown; readonly output: unknown; readonly scope: "project" | "home"; readonly audiences?: readonly string[] }>> = {
  handoff: { input: WORKFLOW_CONTENT_SCHEMAS.receive.input, output: WORKFLOW_CONTENT_SCHEMAS.receive.output, scope: "project" },
  notification: { input: PLUGIN_NOTIFICATION_DELIVERY_INPUT_SCHEMA, output: PLUGIN_NOTIFICATION_DELIVERY_RECEIPT_SCHEMA, scope: "project", audiences: ["workflow"] },
  code_root: { input: ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA, output: ONBOARDING_TAKE_RESULT_SCHEMA, scope: "project", audiences: ["user"] },
  documents: { input: ONBOARDING_DOCUMENTS_INPUT_SCHEMA, output: ONBOARDING_DOCUMENTS_RESULT_SCHEMA, scope: "project", audiences: ["user"] },
  drafts: { input: ONBOARDING_DRAFT_INPUT_SCHEMA, output: ONBOARDING_DRAFT_RESULT_SCHEMA, scope: "home", audiences: ["user"] },
};
/** The two parts a `drafts` intake names, each a Home action of the same Manifest in this shape. */
export const DRAFT_PART_SHAPES = {
  get: { operation: "query", input: ONBOARDING_DRAFT_GET_INPUT_SCHEMA, output: ONBOARDING_DRAFT_GET_RESULT_SCHEMA },
  keep: { operation: "command", input: ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA, output: ONBOARDING_DRAFT_KEEP_RESULT_SCHEMA },
} as const;

const DELIVERED: ReadonlySet<string> = new Set(DELIVERED_MATERIAL_KINDS);
/** Delivered kinds the platform gives to one action of a plugin: every station has its own `handoff`, so that one is not counted. */
const ONE_PER_MANIFEST: ReadonlySet<string> = new Set(DELIVERED_MATERIAL_KINDS.filter(kind => kind !== "handoff"));
const PERSON_ONLY_FIELDS = ["title", "title_text", "verb", "describe", "examples", "start", "material_field", "prepare", "places", "effect", "multiple"] as const;
const isArtifactMaterial = (material: unknown) => isRecord(material) && material.kind === "artifact"
  && Object.keys(material).every(field => ["kind", "artifact_types", "file"].includes(field))
  && Array.isArray(material.artifact_types) && material.artifact_types.length > 0 && material.artifact_types.length <= 20
  && material.artifact_types.every(type => isRecord(type) && words(type.artifact_type_id, 200) && Number.isSafeInteger(type.schema_version) && Number(type.schema_version) > 0 && Object.keys(type).length === 2)
  && (material.file === undefined || (isRecord(material.file) && Array.isArray(material.file.extensions) && material.file.extensions.every(extension => typeof extension === "string" && /^\.[a-z0-9]{1,16}$/u.test(extension))
    && (material.file.stored_text === undefined || typeof material.file.stored_text === "boolean") && Object.keys(material.file).every(field => field === "extensions" || field === "stored_text")));
const isDraftsMaterial = (material: Record<string, unknown>) => Object.keys(material).every(field => ["kind", "get", "keep"].includes(field)) && reference(material.get) && reference(material.keep);

/** `start`, when declared: a name and a hint (each with an optional language key), an icon and a form to open. */
function startValid(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).some(field => !["title", "title_text", "hint", "hint_text", "icon", "open"].includes(field))) return false;
  const key = (ref: unknown) => ref === undefined || (isRecord(ref) && words(ref.key, 200));
  const open = value.open;
  return words(value.title, LIMITS.start_title) && words(value.hint, LIMITS.hint) && key(value.title_text) && key(value.hint_text)
    && (value.icon === undefined || words(value.icon, 80))
    && (open === undefined || (isRecord(open) && words(open.view_id, 120) && words(open.panel, 120) && Object.keys(open).length === 2));
}

function intakeProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  const intake = action.intake;
  if (intake === undefined) return [];
  if (!isRecord(intake)) return [`能力 ${key} 的创建入口声明无效：需要稳定的 id、对象种类、名称、动词、说明与一到三条示例，字段都有长度上限`];
  const accepts = intake.accepts;
  if (accepts !== undefined && !Array.isArray(accepts)) return [`能力 ${key} 的创建入口 accepts 必须是材料种类的列表`];
  const kinds = Array.isArray(accepts) ? accepts.map(material => isRecord(material) ? String(material.kind) : "") : ["text"];
  const delivered = kinds.filter(kind => DELIVERED.has(kind));
  if (delivered.length && delivered.length !== kinds.length) return [`能力 ${key} 的创建入口 accepts 只能收一类：人手里的（文字、对象、成果）或平台送来的，不能混着收`];
  return delivered.length ? deliveredIntakeProblems(key, operation, action, intake) : personIntakeProblems(key, operation, action, intake, kinds);
}

/** An intake a person picks: its words, and what it takes from their hands. */
function personIntakeProblems(key: string, operation: unknown, action: Record<string, unknown>, value: Record<string, unknown>, kinds: readonly string[]): string[] {
  const examples = Array.isArray(value.examples) ? value.examples : [];
  const accepts = Array.isArray(value.accepts) ? value.accepts : [{ kind: "text" }];
  const text = kinds.includes("text");
  const valid = destinationValid(value) && ownId(value.intake_id) && words(value.item_kind, 80) && Array.isArray(value.examples)
    && examples.length >= (text ? 1 : 0) && examples.length <= LIMITS.examples && examples.every(example => words(example, LIMITS.example))
    && (value.effect === undefined || value.effect === "creates" || value.effect === "proposes")
    && (value.multiple === undefined || typeof value.multiple === "boolean") && startValid(value.start);
  const problems = valid ? [] : [`能力 ${key} 的创建入口声明无效：需要稳定的 id、对象种类、名称、动词、说明与一到三条示例（不收文字时可以没有），起点要有名称与提示，字段都有长度上限`];
  if (!writes(key, operation, action)) problems.push(`能力 ${key} 的创建入口必须声明在写入动作（command）上，且不能是不可撤回的`);
  if (typeof value.material_field === "string" && !(value.material_field in inputFields(action))) problems.push(`能力 ${key} 的创建入口的 material_field 必须是输入里的顶层字段`);
  if (new Set(kinds).size !== kinds.length || accepts.some(material => !(isText(material) || isArtifactMaterial(material)))) {
    problems.push(`能力 ${key} 的创建入口只能收选中的文字或成果（accepts 省略、[]、[{ kind: "text" }] 或 [{ kind: "artifact", artifact_types, file? }]）；把对象挂到别的对象上走放置关联（placement_relation）`);
  }
  if (kinds.includes("artifact")) {
    if (kinds.length !== 1) problems.push(`能力 ${key} 的从成果继续的创建入口只收成果`);
    if (value.material_field !== undefined || value.prepare !== undefined) problems.push(`能力 ${key} 的从成果继续的创建入口不写 material_field、prepare`);
    if (!isArtifactContinueAction(action as { input_type?: string; output_type?: string })) problems.push(`能力 ${key} 收成果，但不是平台给「从这一版继续」的形状（defineArtifactContinueAction）`);
  }
  if (!text && (value.material_field !== undefined || value.prepare !== undefined || value.places !== undefined)) problems.push(`能力 ${key} 的创建入口不收文字，不写 material_field、prepare、places`);
  return problems;
}

/**
 * An intake the platform delivers to: no words of its own (no person picks it from a bar), one material, and the action is exactly the
 * platform's for that material, in the scope and for the audience the platform calls it with.
 */
function deliveredIntakeProblems(key: string, operation: unknown, action: Record<string, unknown>, value: Record<string, unknown>): string[] {
  const accepts = value.accepts as unknown[];
  if (accepts.length !== 1) return [`能力 ${key} 的创建入口收平台送来的材料，一份声明只收一种`];
  const material = accepts[0] as Record<string, unknown>, kind = material.kind as DeliveredMaterialKind, shape = DELIVERED_INTAKE_SHAPES[kind];
  const problems: string[] = [];
  if (!ownId(value.intake_id) || !words(value.item_kind, 80)) problems.push(`能力 ${key} 的创建入口需要稳定的 id 与对象种类`);
  const words_ = PERSON_ONLY_FIELDS.filter(field => value[field] !== undefined);
  if (words_.length) problems.push(`能力 ${key} 的创建入口收平台送来的 ${kind}，不写给人看的入口：${words_.join("、")}`);
  if (Object.keys(value).some(field => !["intake_id", "item_kind", "accepts", ...PERSON_ONLY_FIELDS].includes(field))) problems.push(`能力 ${key} 的创建入口有不认识的字段`);
  if (kind === "drafts" ? !isDraftsMaterial(material) : Object.keys(material).length !== 1) problems.push(`能力 ${key} 的创建入口的材料 ${kind} 形状无效${kind === "drafts" ? "：需要 get 与 keep 两个动作" : ""}`);
  const audiences = Array.isArray(action.audiences) ? action.audiences as unknown[] : [];
  if (operation !== "command" || action.scope !== shape.scope || (shape.audiences && (audiences.length !== shape.audiences.length || shape.audiences.some(audience => !audiences.includes(audience))))
    || (kind === "handoff" && !(isRecord(action.workflow_content) && action.workflow_content.role === "receive"))) {
    problems.push(`能力 ${key} 收 ${kind}：需要${shape.scope === "home" ? " Home 级" : "项目里"}的写动作${shape.audiences ? `，受众只有 ${shape.audiences.join("、")}` : ""}${kind === "handoff" ? "，并且是内容站的 receive" : ""}`);
  }
  if (!same(action.input_schema, shape.input) || !same(action.output_schema, shape.output)) problems.push(`能力 ${key} 收 ${kind}，输入输出必须正好是平台给这种材料的形状`);
  return problems;
}

function attachProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  const attach = action.attach;
  if (attach === undefined) return [];
  const value = isRecord(attach) ? attach : {};
  const positions = value.positions;
  const positionsValid = positions === undefined || (Array.isArray(positions) && positions.length > 0 && positions.every(position => POSITIONS.has(String(position))) && new Set(positions).size === positions.length);
  const valid = isRecord(attach) && destinationValid(value) && ownId(value.attach_id) && words(value.item_kind, 80) && positionsValid;
  const problems = valid ? [] : [`能力 ${key} 的追加声明无效：需要稳定的 id、对象种类、名称、动词与说明，位置只能是光标、选区、文末`];
  if (!writes(key, operation, action)) problems.push(`能力 ${key} 的追加必须声明在写入动作（command）上，且不能是不可撤回的`);
  if (isRecord(attach) && typeof value.material_field === "string" && !(value.material_field in inputFields(action))) problems.push(`能力 ${key} 的追加的 material_field 必须是输入里的顶层字段`);
  // A write at a cursor or over a selection is only safe against the document the person was looking at.
  if (positionsValid && Array.isArray(positions) && (positions.includes("cursor") || positions.includes("selection")) && !("expected_version" in inputFields(action))) {
    problems.push(`能力 ${key} 的追加到光标或选区必须在输入里带 expected_version，文档变了就拒绝写入`);
  }
  return problems;
}

const isText = (material: unknown) => isRecord(material) && material.kind === "text" && Object.keys(material).length === 1;

/** The places an offer's choices apply in. */
function choicePlaceProblems(key: string, action: Record<string, unknown>): string[] {
  const choices = [action.subject_offer_choices, action.fragment_offer_choices].flatMap(list => Array.isArray(list) ? list : []);
  return choices.some(choice => isRecord(choice) && !placesValid(choice.places)) ? [`能力 ${key} 的选项范围 places 无效：只能是左边、右栏、助理面板，不重复`] : [];
}

/** What one action says about being put things into, read by itself. */
export function contextDeclarationProblems(key: string, operation: unknown, action: Record<string, unknown>): string[] {
  return [...intakeProblems(key, operation, action), ...attachProblems(key, operation, action), ...choicePlaceProblems(key, action)];
}

/** The kinds a group of definitions reads objects of: each has a reader among them. Entries that are not shaped like actions read as none. */
export function readerKinds(definitions: unknown): ReadonlySet<string> {
  const kinds = new Set<string>();
  for (const definition of Array.isArray(definitions) ? definitions as unknown[] : []) {
    if (!isRecord(definition) || !isRecord(definition.action) || !isSubjectReader(definition.action) || !Array.isArray(definition.action.subject_kinds)) continue;
    for (const kind of definition.action.subject_kinds) if (typeof kind === "string") kinds.add(kind);
  }
  return kinds;
}

/** A `drafts` intake's `get` and `keep`: Home actions of the same Manifest, reachable in projects, in the platform's shape. */
function draftPartProblems(key: string, intake: unknown, definitions: readonly unknown[]): string[] {
  const material = isRecord(intake) && Array.isArray(intake.accepts) && intake.accepts.length === 1 && isRecord(intake.accepts[0]) && intake.accepts[0].kind === "drafts" ? intake.accepts[0] : undefined;
  if (!material) return [];
  const problems: string[] = [];
  for (const part of ["get", "keep"] as const) {
    const ref = material[part], shape = DRAFT_PART_SHAPES[part];
    const target = reference(ref) ? definitions.find(definition => isRecord(definition) && definition.capability_id === ref.capability_id && definition.version === ref.version) as Record<string, unknown> | undefined : undefined;
    const body = target && isRecord(target.action) ? target.action : undefined;
    if (!body || target!.operation !== shape.operation || body.scope !== "home" || !same(body.input_schema, shape.input) || !same(body.output_schema, shape.output)) {
      problems.push(`能力 ${key} 的草稿 ${part} 必须是本插件的 Home 级${shape.operation === "query" ? "查询" : "写动作"}，输入输出正好是平台给草稿 ${part} 的形状`);
    }
  }
  return problems;
}

/** Declarations that refer to other declarations of the same Manifest: unique ids, a `prepare` that exists, kinds it owns. */
export function inspectContextDeclarations(manifest: Pick<PluginManifest, "actions"> & { readonly ui: Pick<PluginManifest["ui"], "views"> }): string[] {
  const problems: string[] = [];
  const definitions = Array.isArray(manifest.actions) ? manifest.actions : [];
  const kinds = readerKinds(manifest.actions);
  const seen = { intake: new Set<string>(), attach: new Set<string>() }, delivered = new Map<string, string[]>();
  for (const definition of definitions) {
    if (!isRecord(definition) || !isRecord(definition.action)) continue;
    const key = `${definition.capability_id}@${definition.version}`, action: Record<string, unknown> = definition.action;
    for (const [name, id, declared] of [["创建入口", "intake_id", action.intake], ["追加声明", "attach_id", action.attach]] as const) {
      if (!isRecord(declared)) continue;
      const set = id === "intake_id" ? seen.intake : seen.attach, own = declared[id];
      if (typeof own === "string") {
        if (set.has(own)) problems.push(`${name}重复：${own}`);
        set.add(own);
      }
      const prepare = declared.prepare;
      if (reference(prepare) && !definitions.some(target => isRecord(target) && target.capability_id === prepare.capability_id && target.version === prepare.version
        && target.operation === "query" && isRecord(target.action) && target.action.input_type === FRAGMENT_OFFERS_INPUT_TYPE)) {
        problems.push(`能力 ${key} 的${name}的 prepare ${prepare.capability_id}@${prepare.version} 不是本插件的选区动作查询（defineFragmentOffersAction）`);
      }
    }
    // An offers query with no choices of its own shows nothing on the bar: it exists only as some entry's `prepare`.
    if (Array.isArray(action.fragment_offer_choices) && !action.fragment_offer_choices.length && !definitions.some(source => isRecord(source) && isRecord(source.action)
      && [source.action.intake, source.action.attach].some(declared => isRecord(declared) && isRecord(declared.prepare) && declared.prepare.capability_id === definition.capability_id && declared.prepare.version === definition.version))) {
      problems.push(`能力 ${key} 没有片段动作选项，也不是本插件某个创建入口或追加的 prepare`);
    }
    problems.push(...draftPartProblems(key, action.intake, definitions));
    if (isRecord(action.intake) && Array.isArray(action.intake.accepts)) for (const material of action.intake.accepts) {
      if (isRecord(material) && ONE_PER_MANIFEST.has(String(material.kind))) delivered.set(String(material.kind), [...delivered.get(String(material.kind)) ?? [], key]);
    }
    const attach = action.attach;
    if (isRecord(attach) && typeof attach.item_kind === "string" && !kinds.has(attach.item_kind)) {
      problems.push(`能力 ${key} 的追加对象种类 ${attach.item_kind} 不是本插件拥有的种类：没有它的对象读取器，插件不能写进别的插件的对象`);
    }
  }
  for (const view of Array.isArray(manifest.ui.views) ? manifest.ui.views : []) {
    if (!isRecord(view) || view.objects === undefined) continue;
    if (view.slot !== "side") problems.push(`视图 ${view.view_id} 的 objects 只能用在 side 视图上`);
    else if (!Array.isArray(view.objects) || view.objects.length === 0 || view.objects.length > 8 || view.objects.some(kind => !words(kind, 80)) || new Set(view.objects).size !== view.objects.length) {
      problems.push(`视图 ${view.view_id} 的 objects 无效：一到八个不重复的对象种类`);
    } else for (const kind of view.objects) if (!kinds.has(kind)) problems.push(`视图 ${view.view_id} 的对象种类 ${kind} 没有对象读取器`);
  }
  // The platform hands a code folder, onboarding's documents, its drafts or a notification to one action of a plugin; a second would never be called.
  for (const [kind, keys] of delivered) if (keys.length > 1) problems.push(`本插件有 ${keys.length} 个动作收平台送来的 ${kind}（${keys.join("、")}）：一个插件只能声明一个`);
  return problems;
}
