import { isId, isObject, isOutputPath, isText, isVersion } from "./action-declarations.js";
import { schemaFields, schemaPathExists } from "./schema-paths.js";
import { workExecutorSetProblems } from "./work-executor-declarations.js";

// The checks a group of action declarations gets as a whole: the actions one declaration points at (the undo command, the job's
// status query, the targets of fragment and subject options) must be declared in the same group, as the kind of action the
// pointer needs, in the same scope, and the places it names inside an input or an output must be in the schema. A "group" is one
// Manifest's `actions`, or the `definitions` of one `registerProvider` call. The kernel additionally checks a background status
// pointer against an already registered real query of the same provider, project and scope, to allow per-operation replacement;
// this function never invents such a target. Other cross-registration pointers are not found. A reference across providers is
// `required_actions`, checked when someone calls. Who may use a target (audiences, permissions, effect) is also for that moment.
//
// This is a separate pass from `inspectActionDeclarations`, which reads one definition at a time. A definition or a reference that
// is incomplete (`inspectActionDeclarations` reports that) is skipped, never reported twice. Problems come in the order of the
// definitions, then undo, background job, fragment options, subject options, result object; the work executor's set of roles comes
// last, once for the group. The one thing read here that the shape
// check does not read at all is `result_subject`, so a value of it that is not an object is reported here.

/** A definition complete enough to be pointed at or to point: its identity, its operation, and its action body. */
interface Declared {
  readonly key: string;
  readonly operation: unknown;
  readonly action: Record<string, unknown>;
}
type DeclaredGroup = ReadonlyMap<string, Declared>;
type Pointer = Record<string, unknown> & { readonly capability_id: string; readonly version: number };
/** One option of a fragment or subject query, read far enough to say which action it points at. */
interface Option { readonly offerId: string; readonly ref: string; readonly target: Declared | undefined; readonly subjectKinds: unknown }

/** Every cross-reference problem in a group of action declarations, or none. Anything that is not a list of definitions has none. */
export function inspectActionCrossReferences(definitions: unknown): string[] {
  const group = declaredGroup(definitions);
  return [...[...group.values()].flatMap(source => [
    ...undoProblems(source, group),
    ...backgroundJobProblems(source, group),
    ...fragmentTargetProblems(source, group),
    ...subjectTargetProblems(source, group),
    ...resultSubjectProblems(source),
  ]), ...workExecutorSetProblems([...group.values()])];
}

function declaredGroup(definitions: unknown): DeclaredGroup {
  const group = new Map<string, Declared>();
  for (const raw of Array.isArray(definitions) ? definitions : []) {
    if (!isObject(raw) || !isId(raw.capability_id) || !isVersion(raw.version) || !isObject(raw.action)) continue;
    const key = `${raw.capability_id}@${raw.version}`;
    if (!group.has(key)) group.set(key, { key, operation: raw.operation, action: raw.action });
  }
  return group;
}

// ---- undo -------------------------------------------------------------------------------------------------------------------

function undoProblems(source: Declared, group: DeclaredGroup): string[] {
  const undo = source.action.undo;
  if (source.operation !== "command" || !isObject(undo) || !isPointer(undo) || !isObject(undo.input)) return [];
  const fields = Object.entries(undo.input).map(([field, value]) => ({ field, path: outputPath(value) }));
  if (!fields.length || fields.some(({ path }) => path === undefined)) return [];
  const ref = referenceText(undo);
  const target = group.get(ref);
  const problems: string[] = [];
  if (!target) problems.push(`能力 ${source.key} 的撤销命令 ${ref} 不在同一提供方的声明里`);
  else if (target === source) problems.push(`能力 ${source.key} 的撤销命令不能是它自己`);
  else {
    if (target.operation !== "command" || target.action.scope !== source.action.scope) problems.push(`能力 ${source.key} 的撤销命令 ${ref} 不是同一范围的命令`);
    problems.push(...undoInputProblems(source, target, fields.map(({ field }) => field)));
  }
  for (const { path } of fields) {
    if (!schemaPathExists(source.action.output_schema, path!)) problems.push(`能力 ${source.key} 的撤销输入位置 ${path} 不在本次输出的合同里`);
  }
  return problems;
}

/** Each field the undo fills is an input of the undo command, and each input the undo command needs is filled. */
function undoInputProblems(source: Declared, target: Declared, filled: readonly string[]): string[] {
  const inputs = schemaFields(target.action.input_schema);
  return [
    ...filled.filter(field => !inputs.properties.includes(field)).map(field => `能力 ${source.key} 的撤销输入字段 ${field} 不是 ${target.key} 的输入`),
    ...inputs.required.filter(field => !filled.includes(field)).map(field => `能力 ${source.key} 的撤销输入缺少 ${target.key} 的必填输入 ${field}`),
  ];
}

/** The output path an undo input names: `"spark.id"`, or `["spark.id"]` for a value wrapped in a list. Nothing for any other shape. */
function outputPath(value: unknown): string | undefined {
  const path = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return isOutputPath(path) ? path as string : undefined;
}

// ---- background jobs --------------------------------------------------------------------------------------------------------

function backgroundJobProblems(source: Declared, group: DeclaredGroup): string[] {
  const job = source.action.background_job;
  if (source.operation !== "command" || !isObject(job) || !isObject(job.status) || !isPointer(job.status)) return [];
  const { id, input, state } = job;
  if (!isOutputPath(id) || !isOutputPath(input) || !isOutputPath(state)) return [];
  const ref = referenceText(job.status);
  const target = group.get(ref);
  const problems: string[] = [];
  if (!target || target.operation !== "query" || target.action.scope !== source.action.scope) {
    problems.push(`能力 ${source.key} 的后台任务状态查询 ${ref} 不在同一提供方的声明里，或不是同一范围的查询`);
  }
  if (!schemaPathExists(source.action.output_schema, id as string)) problems.push(`能力 ${source.key} 的任务标识位置 ${id} 不在本次输出的合同里`);
  if (target && !schemaPathExists(target.action.input_schema, input as string)) problems.push(`能力 ${source.key} 的状态查询输入位置 ${input} 不在 ${ref} 的输入合同里`);
  if (target && !schemaPathExists(target.action.output_schema, state as string)) problems.push(`能力 ${source.key} 的状态位置 ${state} 不在 ${ref} 的输出合同里`);
  return problems;
}

// ---- the actions fragment and subject options point at ----------------------------------------------------------------------

function fragmentTargetProblems(source: Declared, group: DeclaredGroup): string[] {
  return optionsOf(source, group, "fragment_offer_choices").flatMap(({ offerId, ref, target }) =>
    target?.action.scope === source.action.scope ? [] : [`能力 ${source.key} 的片段选项 ${offerId} 的目标动作 ${ref} 不在同一提供方的声明里，或范围不同`]);
}

/** Each option's target is in the group and in the source's scope, and handles the subject kinds the option is offered for. */
function subjectTargetProblems(source: Declared, group: DeclaredGroup): string[] {
  return optionsOf(source, group, "subject_offer_choices").flatMap(({ offerId, ref, target, subjectKinds }) => {
    const prefix = `能力 ${source.key} 的事项选项 ${offerId} 的目标动作 ${ref}`;
    if (!target || target.action.scope !== source.action.scope) return [`${prefix} 不在同一提供方的声明里，或范围不同`];
    const offered = offeredKinds(subjectKinds, source.action.subject_kinds);
    return offered === undefined || handlesKinds(target, offered) ? [] : [`${prefix} 不支持声明的事项类型`];
  });
}

function optionsOf(source: Declared, group: DeclaredGroup, field: string): Option[] {
  const choices = source.action[field];
  return (Array.isArray(choices) ? choices : []).flatMap((choice: unknown) => {
    if (!isObject(choice) || !isText(choice.offer_id) || !isObject(choice.action) || !isPointer(choice.action)) return [];
    const ref = referenceText(choice.action);
    return [{ offerId: choice.offer_id, ref, target: group.get(ref), subjectKinds: choice.subject_kinds }];
  });
}

/** The kinds an option is offered for: its query's, or its own when they are some of the query's. Nothing when they are not a list the shape check accepts. */
function offeredKinds(own: unknown, queryKinds: unknown): readonly string[] | undefined {
  if (!Array.isArray(queryKinds) || !queryKinds.every(isText)) return undefined;
  if (own === undefined) return queryKinds;
  return Array.isArray(own) && own.length > 0 && own.every(kind => queryKinds.includes(kind)) ? own : undefined;
}

/** A target that names no subject kinds handles any; otherwise it handles each kind the option is offered for. */
function handlesKinds(target: Declared, offered: readonly string[]): boolean {
  const handled = target.action.subject_kinds;
  return !Array.isArray(handled) || handled.length === 0 || offered.every(kind => handled.includes(kind));
}

// ---- the result object ------------------------------------------------------------------------------------------------------

/**
 * The places `result_subject` names (the object's id, and its revision when written) are in the output the action declares. Declared
 * at all, it is an object: the shape check does not read it, and a string would stop the Assistant after the change was made.
 */
function resultSubjectProblems(source: Declared): string[] {
  const declared = source.action.result_subject;
  if (declared === undefined || declared === null) return [];
  if (!isObject(declared)) return [`能力 ${source.key} 的结果对象声明必须是对象，写明 id（可加 revision）在输出里的路径`];
  const positions = declared.revision === undefined ? [declared.id] : [declared.id, declared.revision];
  return positions.flatMap(position => {
    if (typeof position !== "string") return [`能力 ${source.key} 的结果对象位置必须写成输出里的路径`];
    return schemaPathExists(source.action.output_schema, position) ? [] : [`能力 ${source.key} 的结果对象位置 ${position} 不在输出合同里`];
  });
}

// ---- small guards -----------------------------------------------------------------------------------------------------------

function isPointer(value: Record<string, unknown>): value is Pointer { return isId(value.capability_id) && isVersion(value.version); }
function referenceText(pointer: Pointer): string { return `${pointer.capability_id}@${pointer.version}`; }
