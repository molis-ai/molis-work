import { isRecord } from "./json-value.js";
import {
  FILE_CONTENT_INPUT_SCHEMA, FILE_CONTENT_INPUT_TYPE, FILE_CONTENT_OUTPUT_SCHEMA, FILE_CONTENT_OUTPUT_TYPE,
  FILE_ENTRIES_INPUT_SCHEMA, FILE_ENTRIES_INPUT_TYPE, FILE_ENTRIES_OUTPUT_SCHEMA, FILE_ENTRIES_OUTPUT_TYPE,
  FRAGMENT_GRANULARITIES, FRAGMENT_INTENTS, FRAGMENT_OFFERS_INPUT_SCHEMA, FRAGMENT_OFFERS_INPUT_TYPE,
  FRAGMENT_OFFERS_OUTPUT_SCHEMA, FRAGMENT_OFFERS_OUTPUT_TYPE, FRAGMENT_ROLES,
  PLACEMENT_COPY_INPUT_TYPE, PLACEMENT_COPY_INPUT_SCHEMA, PLACEMENT_COPY_OUTPUT_TYPE, PLACEMENT_MOVE_INPUT_SCHEMA,
  PLACEMENT_MOVE_INPUT_TYPE, PLACEMENT_MOVE_OUTPUT_TYPE, PLACEMENT_RESULT_SCHEMA,
  SEARCH_ENTRIES_INPUT_SCHEMA, SEARCH_ENTRIES_INPUT_TYPE, SEARCH_ENTRIES_OUTPUT_SCHEMA, SEARCH_ENTRIES_OUTPUT_TYPE,
  PLACEMENT_ATTACH_OPERATION, PLACEMENT_ATTACH_PARTS, PLACEMENT_ATTACH_SCHEMAS, PLACEMENT_ATTACH_TYPE, TASK_SERVES_ROLES, actionEffect, isAttachRelationPart, isFileContentSource, isFileEntriesSource, isObjectCopier, isObjectMover, isSearchEntriesSource,
  type ActionMetadata, type FileSourceKind, type FragmentOfferChoice, type PlacementAttachPart, type SearchSourceKind, type TaskServesRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/composer";

// The checks a Manifest's action declarations get for the five protocols the system reads a plugin's actions through: search
// sources, composer sources, fragment offers, file sources and placement. `inspectActionDeclarations` is the one caller, and each returns its
// problems, never throws. The protocol definitions (types, schemas, `define…`, `bind…`, `is…`) stay in the contracts package; the
// checks moved here from the same files (W3-03), and they are not part of the SDK's public exports.

export function searchSourceDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const problems: string[] = [];
  const entries = isSearchEntriesSource(action as { input_type?: string; output_type?: string });
  const mentions = [SEARCH_ENTRIES_INPUT_TYPE, SEARCH_ENTRIES_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions && action.search_source === undefined) return problems;
  const kinds = (action.search_source as { kinds?: unknown } | undefined)?.kinds;
  const subjectKinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  const kindsValid = Array.isArray(kinds) && kinds.length > 0 && kinds.every(entry => !!entry && typeof entry === "object"
    && typeof (entry as SearchSourceKind).kind === "string" && subjectKinds.includes((entry as SearchSourceKind).kind)
    && typeof (entry as SearchSourceKind).title === "string" && (entry as SearchSourceKind).title.trim().length > 0
    && typeof (entry as SearchSourceKind).surface === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test((entry as SearchSourceKind).surface))
    && new Set(kinds.map(entry => (entry as SearchSourceKind).kind)).size === kinds.length && kinds.length === subjectKinds.length;
  const schemas = entries ? [SEARCH_ENTRIES_INPUT_SCHEMA, SEARCH_ENTRIES_OUTPUT_SCHEMA] : null;
  // The index is built as the local person; a source closed to `user` could never be indexed.
  const openToUser = Array.isArray(action.audiences) && (action.audiences as unknown[]).includes("user");
  if (!schemas || operation !== "query" || action.kind !== "query" || !["home", "project"].includes(String(action.scope)) || !kindsValid || !openToUser
    || canonical(action.input_schema) !== canonical(schemas[0]) || canonical(action.output_schema) !== canonical(schemas[1])) {
    problems.push(`能力 ${key} 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型、对本机用户开放与对应对象种类的打开位置`);
  }
  return problems;
}

const COMPOSER_LAYERS: readonly unknown[] = ["ai", "plain"];
const COMPOSER_SOURCE_FIELDS: readonly string[] = ["title", "title_text", "layers"];
const distinctList = (value: unknown, valid: (entry: unknown) => boolean): value is unknown[] =>
  Array.isArray(value) && value.length > 0 && value.every(valid) && new Set(value).size === value.length;

/**
 * A source in the unified input's `+` menu (S-composer-source-call). The pick schemas are compared whole: a provider that widened its
 * input under the same type name could be handed what the composer holds (the draft, the receiver, other attachments). Whether each
 * kind is one this provider reads back is a cross-reference (`action-cross-references.ts`).
 */
export function composerSourceDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const declared = action.composer_source;
  const mentions = [COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_TYPE].some(type => action.input_type === type || action.output_type === type);
  if (!mentions && declared === undefined) return [];
  // The kinds it picks are the action's own `subject_kinds`: the declaration does not write them a second time.
  const picksKinds = Array.isArray(action.subject_kinds) && action.subject_kinds.length > 0;
  const shaped = isRecord(declared) && Object.keys(declared).every(field => COMPOSER_SOURCE_FIELDS.includes(field))
    && typeof declared.title === "string" && declared.title.trim().length > 0 && picksKinds
    && (declared.title_text === undefined || isRecord(declared.title_text) && Object.keys(declared.title_text).length === 1 && typeof declared.title_text.key === "string")
    && distinctList(declared.layers, layer => COMPOSER_LAYERS.includes(layer));
  // The composer lists sources as the person, and a source only reads.
  const openToUser = Array.isArray(action.audiences) && (action.audiences as unknown[]).includes("user");
  const effect = typeof action.effect === "string" ? { effect: action.effect as ActionMetadata["effect"] } : {};
  if (!shaped || operation !== "query" || action.kind !== "query" || actionEffect({ kind: "query", ...effect }, key.split("@")[0]!) !== "read" || !["home", "project"].includes(String(action.scope)) || !openToUser
    || action.input_type !== COMPOSER_PICK_INPUT_TYPE || action.output_type !== COMPOSER_PICK_OUTPUT_TYPE
    || canonical(action.input_schema) !== canonical(COMPOSER_PICK_INPUT_SCHEMA) || canonical(action.output_schema) !== canonical(COMPOSER_PICK_OUTPUT_SCHEMA)) {
    return [`能力 ${key} 没有兑现输入框来源协议 v1：需要平台给的输入输出、对本机用户开放的只读查询，动作自己的对象种类，以及名称和所在的层（ai、plain）`];
  }
  return [];
}

const INTENT_IDS: ReadonlySet<string> = new Set(FRAGMENT_INTENTS.map(intent => intent.id));
const APPLIES: ReadonlySet<string> = new Set(["result", "replace", "insert_after", "record"]);

/** Registration-time checks, in the style of the other declaration checks in `action-declarations.ts`. */
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
    && (choice.belongs_to === undefined || (Array.isArray(choice.belongs_to) && choice.belongs_to.length > 0
      && choice.belongs_to.every(item => typeof item === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(item))));
  // No choices: the query only prepares a creation entry's input (its `prepare`), checked against the Manifest in context-declarations.ts.
  if (!Array.isArray(choices) || choices.some(choice => !valid(choice)) || new Set(choices.map(choice => choice.offer_id)).size !== choices.length) {
    problems.push(`能力 ${key} 的片段动作选项必须有唯一标识、名称、意图、说明及本提供方的目标动作版本`);
  }
  return problems;
}

export function fileSourceDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const entries = isFileEntriesSource(action as { input_type?: string; output_type?: string });
  const content = isFileContentSource(action as { input_type?: string; output_type?: string });
  const mentions = [FILE_ENTRIES_INPUT_TYPE, FILE_ENTRIES_OUTPUT_TYPE, FILE_CONTENT_INPUT_TYPE, FILE_CONTENT_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions && action.file_source === undefined) return [];
  const declared = action.file_source as { kinds?: unknown; role?: unknown } | undefined;
  const kinds = declared?.kinds;
  const subjectKinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  const kindsValid = Array.isArray(kinds) && kinds.length > 0 && kinds.every(entry => !!entry && typeof entry === "object"
    && typeof (entry as FileSourceKind).kind === "string" && subjectKinds.includes((entry as FileSourceKind).kind)
    && typeof (entry as FileSourceKind).title === "string" && (entry as FileSourceKind).title.trim().length > 0
    && typeof (entry as FileSourceKind).surface === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test((entry as FileSourceKind).surface))
    && new Set(kinds.map(entry => (entry as FileSourceKind).kind)).size === kinds.length && kinds.length === subjectKinds.length;
  const schemas = entries ? [FILE_ENTRIES_INPUT_SCHEMA, FILE_ENTRIES_OUTPUT_SCHEMA] : content ? [FILE_CONTENT_INPUT_SCHEMA, FILE_CONTENT_OUTPUT_SCHEMA] : null;
  const role = entries ? "entries" : content ? "content" : null;
  const openToUser = Array.isArray(action.audiences) && (action.audiences as unknown[]).includes("user");
  if (!schemas || declared?.role !== role || operation !== "query" || action.kind !== "query" || !["home", "project"].includes(String(action.scope))
    || !kindsValid || !openToUser || canonical(action.input_schema) !== canonical(schemas[0]) || canonical(action.output_schema) !== canonical(schemas[1])) {
    return [`能力 ${key} 没有兑现文件来源协议 v1：需要规范输入输出、查询类型、对本机用户开放、与角色一致的声明和对应文件种类的打开位置`];
  }
  return [];
}

export function placementDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const mover = isObjectMover(action as { input_type?: string; output_type?: string });
  const copier = isObjectCopier(action as { input_type?: string; output_type?: string });
  const mentions = [PLACEMENT_MOVE_INPUT_TYPE, PLACEMENT_MOVE_OUTPUT_TYPE, PLACEMENT_COPY_INPUT_TYPE, PLACEMENT_COPY_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions) return [];
  const schema = mover ? PLACEMENT_MOVE_INPUT_SCHEMA : copier ? PLACEMENT_COPY_INPUT_SCHEMA : null;
  const audiences = Array.isArray(action.audiences) ? action.audiences as unknown[] : [];
  const kinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  // Only a mover may be Home-scoped (a plugin that keeps its objects at Home and their belonging itself); copies stay in partitions.
  const scoped = action.scope === "project" || mover && action.scope === "home";
  if (!schema || operation !== "command" || action.kind !== "operation" || !scoped || kinds.length === 0
    || audiences.length !== 1 || audiences[0] !== "user"
    || canonical(action.input_schema) !== canonical(schema) || canonical(action.output_schema) !== canonical(PLACEMENT_RESULT_SCHEMA)) {
    return [`能力 ${key} 没有兑现放置协议 v1：需要规范输入输出、项目作用域（移动也可以是 Home 作用域）、只对本机用户开放的操作，以及对象种类`];
  }
  return [];
}

// ---- 「挂到…」 parts (batch 44 C1) and a background task's 「为哪个事件办」 parts --------------------------------------------------

const ATTACH_PREFIX = `${PLACEMENT_ATTACH_TYPE}.`;
/** The part an action's types claim, when they claim one of 「挂到…」's. */
function claimedAttachPart(action: Record<string, unknown>): PlacementAttachPart | "unknown" | null {
  const type = action.input_type;
  if (typeof type !== "string" || !type.startsWith(ATTACH_PREFIX)) return typeof action.output_type === "string" && action.output_type.startsWith(ATTACH_PREFIX) ? "unknown" : null;
  const part = type.slice(ATTACH_PREFIX.length).split(".")[0];
  return (PLACEMENT_ATTACH_PARTS as readonly string[]).includes(part ?? "") ? part as PlacementAttachPart : "unknown";
}

/**
 * A 「挂到…」 part takes and returns exactly the platform's shapes for it, with its operation, in the project, for the person; the
 * `bind` part is the attach that declares the relation (`attach.relation`), and a declared relation is on a `bind` part.
 */
export function attachRelationPartProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const part = claimedAttachPart(action), attach = isRecord(action.attach) ? action.attach : undefined;
  const declares = attach !== undefined && attach.relation !== undefined;
  if (part === null) return declares ? [`能力 ${key} 声明了「挂到…」关系，但不是平台给挂上这一部分的形状（defineAttachRelationAction("bind", …)）`] : [];
  if (part === "unknown" || !isAttachRelationPart(action as { input_type?: string; output_type?: string }, part)) return [`能力 ${key} 的「挂到…」输入输出类型不是平台给的任何一部分`];
  const schemas = PLACEMENT_ATTACH_SCHEMAS[part];
  const audiences = Array.isArray(action.audiences) ? action.audiences as unknown[] : [];
  const problems: string[] = [];
  if (canonical(action.input_schema) !== canonical(schemas.input) || canonical(action.output_schema) !== canonical(schemas.output)) problems.push(`能力 ${key} 的「挂到…」${part} 部分没有用平台给这一部分的输入输出结构`);
  if (operation !== PLACEMENT_ATTACH_OPERATION[part] || action.scope !== "project" || !audiences.includes("user")) problems.push(`能力 ${key} 的「挂到…」${part} 部分需要项目范围、对本机用户开放、与这一部分一致的查询/命令`);
  if (part === "bind" && !declares) problems.push(`能力 ${key} 是「挂到…」的挂上部分，需要在 attach.relation 里声明这个关系`);
  if (part !== "bind" && declares) problems.push(`能力 ${key} 的「挂到…」关系只能声明在挂上部分（bind）`);
  return problems;
}

/**
 * Across one Manifest: every part a declared relation names is an action of the same Manifest, in the platform's shape for that part,
 * and one kind is the target of one relation (placement would find two and refuse every operation on it).
 */
export function attachRelationListProblems(definitions: readonly unknown[]): string[] {
  const problems: string[] = [], kinds = new Set<unknown>();
  const find = (target: unknown) => isRecord(target) ? definitions.find(definition => isRecord(definition) && definition.capability_id === target.capability_id
    && definition.version === target.version) as Record<string, unknown> | undefined : undefined;
  for (const definition of definitions) {
    const action = isRecord(definition) && isRecord(definition.action) ? definition.action : undefined;
    const relation = action && isRecord(action.attach) && isRecord(action.attach.relation) ? action.attach.relation : undefined;
    if (!relation) continue;
    const kind = (action!.attach as Record<string, unknown>).item_kind;
    if (kinds.has(kind)) problems.push(`「挂到…」${String(kind)} 在本插件里声明了不止一次`);
    kinds.add(kind);
    for (const part of ["list", "release", "candidates", "create"] as const) {
      if (relation[part] === undefined) continue;
      const named = find(relation[part]);
      if (!named || !isRecord(named.action) || !isAttachRelationPart(named.action as { input_type?: string; output_type?: string }, part)) {
        problems.push(`「挂到…」关系 ${String(isRecord(action!.attach) ? action!.attach.attach_id : "")} 的 ${part} 不是本插件里平台给这一部分形状的能力`);
      }
    }
  }
  return problems;
}

const TASK_SERVES_OPERATION: Record<TaskServesRole, "query" | "command"> = { list: "query", bind: "command", release: "command", create: "command" };
/** A background task's 「为哪个事件办」 part: one of its four roles, with that role's operation, in the project. */
export function taskServesProblems(key: string, action: Record<string, unknown>, operation: unknown): string[] {
  const declared = action.task_serves;
  if (declared === undefined) return [];
  const role = isRecord(declared) ? declared.role : undefined;
  if (!isRecord(declared) || !(TASK_SERVES_ROLES as readonly unknown[]).includes(role) || Object.keys(declared).length !== 1
    || operation !== TASK_SERVES_OPERATION[role as TaskServesRole] || action.scope !== "project") {
    return [`能力 ${key} 的任务归属声明无效：需要角色（${TASK_SERVES_ROLES.join("、")}）、项目范围、与角色一致的查询/命令（用 defineTaskServesAction）`];
  }
  return [];
}
