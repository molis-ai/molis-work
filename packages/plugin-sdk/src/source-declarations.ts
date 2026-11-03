import {
  FILE_CONTENT_INPUT_SCHEMA, FILE_CONTENT_INPUT_TYPE, FILE_CONTENT_OUTPUT_SCHEMA, FILE_CONTENT_OUTPUT_TYPE,
  FILE_ENTRIES_INPUT_SCHEMA, FILE_ENTRIES_INPUT_TYPE, FILE_ENTRIES_OUTPUT_SCHEMA, FILE_ENTRIES_OUTPUT_TYPE,
  FRAGMENT_GRANULARITIES, FRAGMENT_INTENTS, FRAGMENT_OFFERS_INPUT_SCHEMA, FRAGMENT_OFFERS_INPUT_TYPE,
  FRAGMENT_OFFERS_OUTPUT_SCHEMA, FRAGMENT_OFFERS_OUTPUT_TYPE, FRAGMENT_ROLES,
  PLACEMENT_COPY_INPUT_TYPE, PLACEMENT_COPY_INPUT_SCHEMA, PLACEMENT_COPY_OUTPUT_TYPE, PLACEMENT_MOVE_INPUT_SCHEMA,
  PLACEMENT_MOVE_INPUT_TYPE, PLACEMENT_MOVE_OUTPUT_TYPE, PLACEMENT_RESULT_SCHEMA,
  SEARCH_ENTRIES_INPUT_SCHEMA, SEARCH_ENTRIES_INPUT_TYPE, SEARCH_ENTRIES_OUTPUT_SCHEMA, SEARCH_ENTRIES_OUTPUT_TYPE,
  PLACEMENT_RELATION_ROLES, isFileContentSource, isFileEntriesSource, isObjectCopier, isObjectMover, isSearchEntriesSource,
  type FileSourceKind, type FragmentOfferChoice, type PlacementRelationRole, type SearchSourceKind,
} from "@molis-ai/molis-work-contracts/platform/actions";

// The checks a Manifest's action declarations get for the four protocols the system reads a plugin's actions through: search
// sources, fragment offers, file sources and placement. `inspectActionDeclarations` is the one caller, and each returns its
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
    && (choice.requires === undefined || (Array.isArray(choice.requires) && choice.requires.length > 0 && choice.requires.every(item => item === "goal")));
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

// ---- the relations placement keeps for the person (PG-032) -------------------------------------------------------------------

const RELATION_NAME = /^[a-z][a-z0-9_]{1,30}$/;
/** What each part of a relation does to the world: reading parts are queries, the others commands. */
const RELATION_OPERATION: Record<PlacementRelationRole, "query" | "command"> = { list: "query", candidates: "query", bind: "command", release: "command", create: "command" };
const isRecordValue = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0 && value.length <= 120;

export function placementRelationProblems(key: string, action: Record<string, unknown>, operation: unknown): string[] {
  const declared = action.placement_relation;
  if (declared === undefined) return [];
  const role = isRecordValue(declared) ? declared.role : undefined;
  const known = (PLACEMENT_RELATION_ROLES as readonly unknown[]).includes(role);
  const target = isRecordValue(declared) ? declared.target : undefined;
  const targetOk = role === "list" ? isRecordValue(target) && hasText(target.kind) && hasText(target.noun) && Object.keys(target).length === 2 : target === undefined;
  const audiences = Array.isArray(action.audiences) ? action.audiences as unknown[] : [];
  if (!isRecordValue(declared) || !RELATION_NAME.test(String(declared.relation)) || !known || !targetOk
    || Object.keys(declared).some(field => !["relation", "role", "target"].includes(field))
    || operation !== RELATION_OPERATION[role as PlacementRelationRole] || action.scope !== "project" || !audiences.includes("user")) {
    return [`能力 ${key} 的放置关联声明无效：需要小写的关联名、角色（${PLACEMENT_RELATION_ROLES.join("、")}）、项目范围、对本机用户开放、与角色一致的查询/命令；只有 list 角色写 target（对方的对象种类和显示名词）`];
  }
  return [];
}

/** Across one Manifest: a relation's part is played by one action, and every relation has its `list` part, which names what the other end is. */
export function placementRelationListProblems(definitions: readonly unknown[]): string[] {
  const parts = new Map<string, Set<string>>();
  const problems: string[] = [];
  for (const definition of definitions) {
    const action = isRecordValue(definition) && isRecordValue(definition.action) ? definition.action : undefined;
    const declared = action?.placement_relation;
    if (!isRecordValue(declared) || !RELATION_NAME.test(String(declared.relation)) || !(PLACEMENT_RELATION_ROLES as readonly unknown[]).includes(declared.role)) continue;
    const roles = parts.get(String(declared.relation)) ?? new Set<string>();
    if (roles.has(String(declared.role))) problems.push(`放置关联 ${String(declared.relation)} 的 ${String(declared.role)} 角色被两个能力声明`);
    roles.add(String(declared.role));
    parts.set(String(declared.relation), roles);
  }
  for (const [relation, roles] of parts) if (!roles.has("list")) problems.push(`放置关联 ${relation} 缺少 list 角色：它写明对方是什么对象`);
  return problems;
}
