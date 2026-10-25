import {
  DUE_REMINDERS_INPUT_TYPE, DUE_REMINDERS_OUTPUT_TYPE, DUE_REMINDER_COLLECTION_SCHEMA, DUE_REMINDER_WINDOW_SCHEMA,
  HOME_EVENTS_INPUT_TYPE, HOME_EVENTS_OUTPUT_TYPE, HOME_EVENT_COLLECTION_SCHEMA, HOME_EVENT_WINDOW_SCHEMA,
  SUBJECT_CONTEXT_INPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN,
  SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_PROJECT, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE,
  SUBJECT_OFFERS_INPUT_SCHEMA, SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_SCHEMA, SUBJECT_OFFERS_OUTPUT_TYPE,
  WORKFLOW_CONTENT_SCHEMAS, WORKFLOW_CONTENT_VERSIONS, validActionExecutionPolicy, validActionResultView, type WorkflowContentStation,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { contextDeclarationProblems } from "./context-declarations.js";
import {
  fileSourceDeclarationProblems, fragmentOfferDeclarationProblems, placementDeclarationProblems, searchSourceDeclarationProblems,
} from "./source-declarations.js";
import { workExecutorDeclarationProblems } from "./work-executor-declarations.js";

// The shape checks for a Manifest's `actions` and `action_scenes`, made when a Manifest is parsed, when a plugin registers its
// actions with the Kernel, and when an author calls `defineAction`. Moved here from the contracts package (W3-03): they run code,
// so they live with the other Manifest rules in the SDK. They return every problem, in the order the checks run, so an author sees
// the whole contract at once; that order and the wording are part of what an author reads.

/** Cheap manifest shape validation; the execution owner compiles JSON Schemas. */
export function inspectActionDeclarations(definitions: unknown, scenes: unknown): string[] {
  return [...definitionListProblems(definitions), ...sceneListProblems(scenes)];
}

function definitionListProblems(definitions: unknown): string[] {
  if (definitions === undefined) return [];
  if (!Array.isArray(definitions)) return ["actions 必须是数组"];
  const seen = new Set<string>();
  return definitions.flatMap(raw => definitionProblems(raw, seen));
}

function definitionProblems(raw: unknown, seen: Set<string>): string[] {
  if (!isObject(raw) || !isId(raw.capability_id) || !isVersion(raw.version)) return ["能力需要有效身份和版本"];
  const key = `${raw.capability_id}@${raw.version}`;
  const problems = seen.has(key) ? [`能力重复：${key}`] : [];
  seen.add(key);
  const action = raw.action;
  if (!isCompleteBody(action)) return [...problems, `能力 ${key} 的输入输出、权限或展示定义不完整`];
  return [
    ...problems,
    ...referenceProblems(key, action),
    ...threadProtocolProblems(key, raw.operation, action),
    ...subjectProtocolProblems(key, raw.operation, action),
    ...offerChoiceProblems(key, action),
    ...homeProtocolProblems(key, raw.operation, action),
    ...homeAggregateProblems(key, raw.operation, action),
    ...backgroundJobProblems(key, raw.operation, action),
    ...undoProblems(key, raw.operation, action),
    ...searchSourceDeclarationProblems(key, action, raw.operation, canonicalSchema),
    ...fragmentOfferDeclarationProblems(key, action, raw.operation, canonicalSchema),
    ...fileSourceDeclarationProblems(key, action, raw.operation, canonicalSchema),
    ...placementDeclarationProblems(key, action, raw.operation, canonicalSchema),
    ...workExecutorDeclarationProblems(key, action, raw.operation, canonicalSchema),
    ...workflowContentProblems(key, raw.version, raw.operation, action),
    ...operationKindProblems(key, raw.operation, action),
    ...contextDeclarationProblems(key, raw.operation, action),
  ];
}

function threadProtocolProblems(key: string, operation: unknown, action: ActionBody): string[] {
  const source = action.thread_source;
  if (source === undefined) return [];
  if (!isObject(source) || !["context", "reply"].includes(String(source.role)) || !isText(source.subject_kind)
    || !action.subject_kinds.includes(String(source.subject_kind)) || action.scope !== "project"
    || action.audiences.length !== 1 || action.audiences[0] !== "user"
    || operation !== (source.role === "context" ? "query" : "command")) return [`能力 ${key} 的评论协议需要项目范围、user audience 和匹配的查询/命令`];
  return [];
}

// ---- the action body --------------------------------------------------------------------------------------------------------

/** An action body that passed `isCompleteBody`: the fields every later check reads without testing them again. */
type ActionBody = Record<string, unknown> & { subject_kinds: string[]; audiences: string[] };

const ACTION_KINDS = ["query", "judgment", "operation", "navigation"];
const ACTION_SCOPES = ["home", "project"];
const ACTION_AUDIENCES = ["user", "agent", "workflow", "mcp", "plugin"];
const ACTION_EFFECTS = ["read", "write", "irreversible"];

function isCompleteBody(a: unknown): a is ActionBody {
  if (!isObject(a) || !isText(a.title) || !isText(a.description)) return false;
  if (!ACTION_KINDS.includes(String(a.kind)) || !ACTION_SCOPES.includes(String(a.scope))) return false;
  if ((a.scheduling !== undefined && a.scheduling !== "concurrent") || (a.authorship !== undefined && a.authorship !== "session")) return false;
  if (!isStrings(a.permissions) || !isStrings(a.subject_kinds) || !isStrings(a.audiences) || a.audiences.length === 0) return false;
  if (!a.audiences.every(audience => ACTION_AUDIENCES.includes(audience))) return false;
  if (a.effect !== undefined && !ACTION_EFFECTS.includes(String(a.effect))) return false;
  if (a.plugin !== undefined && a.plugin !== false) return false;
  return isObject(a.input_schema) && (a.output_schema === undefined || isObject(a.output_schema));
}

// ---- references to other scenes, views and actions --------------------------------------------------------------------------

function referenceProblems(key: string, a: ActionBody): string[] {
  const problems: string[] = [];
  if (a.result_scene !== undefined && (!isObject(a.result_scene) || !isId(a.result_scene.scene_id) || !isVersion(a.result_scene.version) || !isText(a.result_scene.provider_id))) {
    problems.push(`能力 ${key} 的结果场景引用无效`);
  }
  if (a.result_view !== undefined && !validActionResultView(a.result_view)) {
    problems.push(`能力 ${key} 的结果展示定义无效`);
  }
  if (a.execution !== undefined && !validActionExecutionPolicy(a.execution)) {
    problems.push(`能力 ${key} 的执行策略无效`);
  }
  if (a.required_scene !== undefined && (!isObject(a.required_scene) || !isId(a.required_scene.scene_id) || !isVersion(a.required_scene.version))) {
    problems.push(`能力 ${key} 的消费场景依赖无效`);
  }
  if (a.required_actions !== undefined && (!Array.isArray(a.required_actions)
    || a.required_actions.some(ref => !isObject(ref) || !isId(ref.capability_id) || !isVersion(ref.version)
      || (ref.provider_id !== undefined && !isId(ref.provider_id))))) {
    problems.push(`能力 ${key} 的能力依赖无效`);
  }
  return problems;
}

// ---- protocols that fix an action's input and output ------------------------------------------------------------------------

function subjectProtocolProblems(key: string, operation: unknown, a: ActionBody): string[] {
  const problems: string[] = [];
  if (a.output_type === SUBJECT_CONTEXT_TYPE || a.input_type === SUBJECT_REFERENCE_TYPE) {
    if (operation !== "query" || (a.scope !== "project" && a.scope !== "home") || a.kind !== "query" || !a.subject_kinds.length
      || a.input_type !== SUBJECT_REFERENCE_TYPE || a.output_type !== SUBJECT_CONTEXT_TYPE
      || canonicalSchema(a.input_schema) !== canonicalSchema(SUBJECT_CONTEXT_INPUT_SCHEMA)
      || ![SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_PROJECT, SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN].some(schema => canonicalSchema(a.output_schema) === canonicalSchema(schema))) {
      problems.push(`能力 ${key} 没有兑现对象上下文协议 v1 的输入输出合同`);
    }
  }
  if (a.input_type === SUBJECT_OFFERS_INPUT_TYPE || a.output_type === SUBJECT_OFFERS_OUTPUT_TYPE) {
    if (operation !== "query" || a.kind !== "query" || a.scope !== "project" || !a.subject_kinds.length
      || a.input_type !== SUBJECT_OFFERS_INPUT_TYPE || a.output_type !== SUBJECT_OFFERS_OUTPUT_TYPE
      || canonicalSchema(a.input_schema) !== canonicalSchema(SUBJECT_OFFERS_INPUT_SCHEMA)
      || canonicalSchema(a.output_schema) !== canonicalSchema(SUBJECT_OFFERS_OUTPUT_SCHEMA)) {
      problems.push(`能力 ${key} 没有兑现事项动作协议 v1 的输入输出合同`);
    }
  }
  return problems;
}

function offerChoiceProblems(key: string, a: ActionBody): string[] {
  if (a.subject_offer_choices === undefined) return [];
  const choices = a.subject_offer_choices;
  const subjectKinds = a.subject_kinds;
  if (a.input_type !== SUBJECT_OFFERS_INPUT_TYPE || a.output_type !== SUBJECT_OFFERS_OUTPUT_TYPE || !Array.isArray(choices)
    || choices.some(choice => !isObject(choice) || !isId(choice.offer_id) || !isText(choice.title) || choice.title.length > 120
      || !isObject(choice.action) || !isId(choice.action.capability_id) || !isVersion(choice.action.version) || choice.action.provider_id !== undefined
      || (choice.subject_kinds !== undefined && (!Array.isArray(choice.subject_kinds) || !choice.subject_kinds.length
        || choice.subject_kinds.some(kind => !subjectKinds.includes(kind)) || new Set(choice.subject_kinds).size !== choice.subject_kinds.length)))
    || new Set(choices.map(choice => choice.offer_id)).size !== choices.length) {
    return [`能力 ${key} 的事项推荐选项必须有唯一标识、名称及本提供方的目标动作版本`];
  }
  return [];
}

function homeProtocolProblems(key: string, operation: unknown, a: ActionBody): string[] {
  const problems: string[] = [];
  if (a.input_type === HOME_EVENTS_INPUT_TYPE || a.output_type === HOME_EVENTS_OUTPUT_TYPE) {
    if (operation !== "query" || a.kind !== "query" || a.scope !== "project" || !a.subject_kinds.length
      || a.input_type !== HOME_EVENTS_INPUT_TYPE || a.output_type !== HOME_EVENTS_OUTPUT_TYPE
      || canonicalSchema(a.input_schema) !== canonicalSchema(HOME_EVENT_WINDOW_SCHEMA)
      || canonicalSchema(a.output_schema) !== canonicalSchema(HOME_EVENT_COLLECTION_SCHEMA)) {
      problems.push(`${key} 首页事件查询必须使用完整规范合同`);
    }
  }
  if (a.input_type === DUE_REMINDERS_INPUT_TYPE || a.output_type === DUE_REMINDERS_OUTPUT_TYPE) {
    if (operation !== "query" || a.kind !== "query" || a.scope !== "home"
      || a.input_type !== DUE_REMINDERS_INPUT_TYPE || a.output_type !== DUE_REMINDERS_OUTPUT_TYPE
      || canonicalSchema(a.input_schema) !== canonicalSchema(DUE_REMINDER_WINDOW_SCHEMA)
      || canonicalSchema(a.output_schema) !== canonicalSchema(DUE_REMINDER_COLLECTION_SCHEMA)) {
      problems.push(`${key} 到期提醒查询必须是 Home 范围、使用完整规范合同`);
    }
  }
  return problems;
}

// ---- gathered by the Home across projects ------------------------------------------------------------------------------------

function homeAggregateProblems(key: string, operation: unknown, a: ActionBody): string[] {
  if (a.home_aggregate === undefined) return [];
  if (a.home_aggregate !== true || operation !== "query" || a.kind !== "query" || a.scope !== "project" || (a.effect !== undefined && a.effect !== "read")
    || (a.permissions as string[]).includes("model:invoke") || (isObject(a.execution) && a.execution.cost === "metered") || !isText(a.output_type)) {
    return [`能力 ${key} 的首页聚合声明必须是项目范围的只读查询，写明输出类型，不调用模型、不计费`];
  }
  return [];
}

/**
 * Whether the Home may gather this action across projects (PG-043): it declares `home_aggregate` and passes the rule its Manifest is
 * checked with. The Host asks again before each call, so a registration that skipped the check is still not called.
 */
export function isHomeAggregateQuery(definition: { readonly operation: string; readonly action: object }): boolean {
  const action = definition.action as Record<string, unknown>;
  return isCompleteBody(action) && action.home_aggregate === true && !homeAggregateProblems("", definition.operation, action).length;
}

// ---- background jobs and undo -----------------------------------------------------------------------------------------------

/** A dotted path into an action's output, such as `document.id`. */
export function isOutputPath(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}

function backgroundJobProblems(key: string, operation: unknown, a: ActionBody): string[] {
  if (a.background_job === undefined) return [];
  const job = a.background_job;
  const states = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.length > 0);
  if (operation !== "command" || !isObject(job) || !isObject(job.status) || !isId(job.status.capability_id) || !isVersion(job.status.version)
    || !isOutputPath(job.id) || !isOutputPath(job.input) || !isOutputPath(job.state) || !states(job.done) || !states(job.failed)) {
    return [`能力 ${key} 的后台任务声明必须是命令，并写明状态查询、任务标识与状态的位置和结束状态`];
  }
  return [];
}

function undoProblems(key: string, operation: unknown, a: ActionBody): string[] {
  if (a.undo === undefined) return [];
  const undo = a.undo;
  const fields = isObject(undo) && isObject(undo.input) ? Object.entries(undo.input) : [];
  if (operation !== "command" || a.effect === "irreversible" || !isObject(undo) || !isId(undo.capability_id) || !isVersion(undo.version) || !fields.length
    || fields.some(([, value]) => !(isOutputPath(value) || (Array.isArray(value) && value.length === 1 && isOutputPath(value[0]))))) {
    return [`能力 ${key} 的撤销声明必须是可撤回的命令，并写明同一提供方的撤销命令与其输入在本次输出里的位置`];
  }
  return [];
}

// ---- workflow content stations, and the operation an action's kind implies -------------------------------------------------

function workflowContentProblems(key: string, version: unknown, operation: unknown, a: ActionBody): string[] {
  if (a.workflow_content === undefined) return [];
  const w = a.workflow_content;
  if (!isObject(w) || !/^[a-z][a-z0-9-]{1,40}$/.test(String(w.id)) || !isText(w.title) || !isText(w.icon)
    || w.protocol !== 1 || !["list", "read", "receive", "create"].includes(String(w.role)) || (w.receives !== undefined && (w.receives !== false || w.role === "receive"))) {
    return [`能力 ${key} 的工作流内容合同无效`];
  }
  const role = w.role as WorkflowContentStation["role"];
  const schemas = WORKFLOW_CONTENT_SCHEMAS[role];
  // A role is declared in its current shape only: an older shape is refused when the plugin registers, not met at a call. Its action's
  // version may move up on its own, never below the role's current version: a lower number belonged to an older shape, and a step
  // saved against it must find nothing rather than the new shape under that number.
  const current = WORKFLOW_CONTENT_VERSIONS[role];
  const inputOk = a.input_type === `molis.workflow.content.${role}.input.v${current}` && canonicalSchema(a.input_schema) === canonicalSchema(schemas.input);
  const outputOk = a.output_type === `molis.workflow.content.${role}.output.v1` && canonicalSchema(a.output_schema) === canonicalSchema(schemas.output);
  const shapeOk = a.scope === "project" && a.audiences.includes("workflow") && operation === (role === "list" || role === "read" ? "query" : "command");
  if (inputOk && outputOk && shapeOk) return Number(version) >= current ? [] : [`能力 ${key} 的版本低于工作流内容协议 ${role} 的现行版本 ${current}`];
  const gap = shapeOk && outputOk ? "输入" : shapeOk && inputOk ? "输出" : "输入输出";
  return [`能力 ${key} 没有兑现工作流内容协议 ${role} v${current} 的${gap}合同`];
}

function operationKindProblems(key: string, operation: unknown, a: ActionBody): string[] {
  if (operation !== (a.kind === "query" || a.kind === "navigation" ? "query" : "command")) return [`能力 ${key} 的 operation 与 kind 不一致`];
  return [];
}

// ---- consumption scenes -----------------------------------------------------------------------------------------------------

function sceneListProblems(scenes: unknown): string[] {
  if (scenes === undefined) return [];
  if (!Array.isArray(scenes)) return ["action_scenes 必须是数组"];
  const seen = new Set<string>();
  const ruleKeys = new Set<string>();
  return scenes.flatMap(scene => sceneProblems(scene, seen, ruleKeys));
}

function sceneProblems(s: unknown, seen: Set<string>, ruleKeys: Set<string>): string[] {
  if (!isObject(s) || !isId(s.scene_id) || !isVersion(s.version)) return ["消费场景需要有效身份和版本"];
  const problems = [...sceneContractProblems(s), ...defaultRuleProblems(s, ruleKeys)];
  const key = `${s.scene_id}@${s.version}`;
  if (seen.has(key)) problems.push(`消费场景重复：${key}`);
  seen.add(key);
  if (!isCompleteScene(s)) problems.push(`消费场景 ${key} 的触发、输入输出或权限定义不完整`);
  return problems;
}

/** What a scene declares about its events and recommendations, in the order those are checked. */
function sceneContractProblems(s: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (s.event_schema !== undefined && !isObject(s.event_schema)) problems.push(`消费场景 ${s.scene_id} 的事件合同无效`);
  if (s.recommendation_source !== undefined && (s.recommendation_source !== "subject-offers" || s.result_type !== "molis.behavior-recommendation.v1")) {
    problems.push(`消费场景 ${s.scene_id} 的推荐来源合同无效`);
  }
  if (s.recommendation_labels !== undefined) {
    const schema = s.result_schema as { properties?: { suggested_behavior_ids?: { items?: { enum?: unknown } } } } | undefined;
    const keys = schema?.properties?.suggested_behavior_ids?.items?.enum;
    if (!isObject(s.recommendation_labels) || s.result_type !== "molis.behavior-recommendation.v1" || s.recommendation_source !== undefined || !Array.isArray(keys)
      || Object.entries(s.recommendation_labels).some(([label, value]) => !keys.includes(label) || !isText(value))) {
      problems.push(`消费场景 ${s.scene_id} 的推荐名称必须对应结果合同中的选项`);
    }
  }
  return problems;
}

const DEFAULT_RULE_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const DEFAULT_RULE_OPTION_KEY = /^[a-z][a-z0-9_.]{0,63}$/;

/** The rule a scene ships for itself: a finite choice with its own words, whose options are recommendations the scene can name. */
function defaultRuleProblems(s: Record<string, unknown>, ruleKeys: Set<string>): string[] {
  const rule = s.default_rule;
  if (rule === undefined) return [];
  const invalid = `消费场景 ${s.scene_id} 的默认规则无效`;
  if (!isObject(rule) || typeof rule.function_key !== "string" || !DEFAULT_RULE_KEY.test(rule.function_key) || !isText(rule.name) || rule.name.length > 80
    || !isText(rule.instructions) || rule.instructions.length > 4000 || !isStrings(rule.subject_kinds) || !Array.isArray(rule.options)
    || rule.options.length < 2 || rule.options.length > 20) return [invalid];
  const keys = rule.options.map(option => isObject(option) && typeof option.key === "string" && DEFAULT_RULE_OPTION_KEY.test(option.key) && isText(option.description) && option.description.length <= 200 ? option.key : null);
  if (keys.includes(null) || new Set(keys).size !== keys.length) return [invalid];
  const problems: string[] = [];
  const labels = s.recommendation_labels;
  if (isObject(labels) && keys.some(key => !(key as string in labels))) problems.push(`消费场景 ${s.scene_id} 的默认规则选项必须是它的推荐名称`);
  if (ruleKeys.has(rule.function_key)) problems.push(`默认规则重复：${rule.function_key}`);
  ruleKeys.add(rule.function_key);
  return problems;
}

function isCompleteScene(s: Record<string, unknown>): boolean {
  if (!isText(s.title) || !isText(s.description) || !isText(s.trigger) || !ACTION_SCOPES.includes(String(s.scope))) return false;
  if (!isStrings(s.permissions) || (s.configuration_permissions !== undefined && !isStrings(s.configuration_permissions))) return false;
  return isStrings(s.subject_kinds) && isObject(s.input_schema) && isObject(s.result_schema);
}

// ---- small guards -----------------------------------------------------------------------------------------------------------

/** The same schema written with its keys in another order is the same schema. */
function canonicalSchema(value: unknown): string {
  const sort = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(sort)
    : isObject(entry) ? Object.fromEntries(Object.keys(entry).sort().map(name => [name, sort(entry[name])])) : entry;
  return JSON.stringify(sort(value));
}

export function isObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
export function isText(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
export function isId(v: unknown): v is string { return isText(v) && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(v); }
export function isVersion(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function isStrings(v: unknown): v is string[] { return Array.isArray(v) && v.every(isText); }
