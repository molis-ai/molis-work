import { ActionError, type ActionDefinition, type ActionSchema, type ActionCallContext, type ActionHandlerBinding, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormRecord, FormQuestionInput, FormSubmissionRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { promoteForm, type FormPublishArtifactPort, type FormReadArtifactPort } from "./promote.js";
import type { FormStore } from "./store.js";

const text = { type: "string" }, id = { ...text, minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const optionFields = { id: text, label: text };
const questionFields = { id: text, type: { enum: ["text", "singleChoice", "multiChoice", "dropdown", "rating", "date"] }, title: { ...text, maxLength: 200 }, required: { type: "boolean" }, order: { type: "integer" } };
const question = object({ ...questionFields, options: array(object(optionFields)) }, Object.keys(questionFields));
const questionInput = object({ ...questionFields, options: array(object(optionFields, [])) }, []);
const recordFields = { id, project_id: id, title: text, description: text, status: { enum: ["draft", "published"] }, share_id: { type: ["string", "null"] }, questions: array(question), created_at: text, updated_at: text, version, artifact_id: text, artifact_version: { type: "integer", minimum: 0 } };
const record = object({ ...recordFields, publication_pending: object({ version, source_version: version }) }, Object.keys(recordFields));
const answers = { type: "object", additionalProperties: { ...text, maxLength: 4000 } };
const submission = object({ id, form_id: id, answers, submitted_at: text, form_version: { type: ["integer", "null"], minimum: 1 }, questions: { anyOf: [array(question), { type: "null" }] } });
const changed = object({ form: record }), identity = { id, expected_version: version };
const read = ["form:read"], write = ["form:read", "form:write"];
type Identity = { id: string; expected_version?: number };
type Edit = Identity & { title?: string; description?: string; questions?: readonly FormQuestionInput[] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[] = operation === "query" ? read : write): ActionDefinition<I, O> {
  return { capability_id: `form.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], subject_kinds: ["form"], input_schema: input, output_schema: output, permissions, ...(name === "questions.ai" ? { scheduling: "concurrent" as const } : {}) } };
}
export const formActions = {
  list: define<Record<string, never>, { forms: FormRecord[]; ai_available: boolean; ai_unavailable_reason: string | null }>("list", "问卷列表", "读取当前项目问卷和 AI 加题可用性", "query", object({}), object({ forms: array(record), ai_available: { type: "boolean" }, ai_unavailable_reason: { type: ["string", "null"] } })),
  get: define<{ id: string }, { form: FormRecord }>("get", "读取问卷", "读取题目、选项、状态、版本和发布状态", "query", object({ id }), changed),
  create: define<{ title?: string }, { form: FormRecord }>("create", "新建问卷", "创建当前项目的草稿问卷", "command", object({ title: { ...text, maxLength: 80 } }, []), changed),
  update: define<Edit, { form: FormRecord }>("update", "编辑问卷", "替换指定字段或题目列表；提交读取版本以避免覆盖其他编辑", "command", object({ ...identity, title: { ...text, maxLength: 80 }, description: { ...text, maxLength: 2000 }, questions: { ...array(questionInput), maxItems: 40 } }, ["id"]), changed),
  publish: define<Identity, { form: FormRecord }>("publish", "标记问卷已发布", "更新本机发布状态并保留或生成 share_id；不提供外网公开链接，也不发布 Artifact", "command", object(identity, ["id"]), changed),
  delete: define<Identity, { ok: true }>("delete", "删除问卷", "原子删除问卷和答卷；未完成的 Artifact 发布需先恢复", "command", object(identity, ["id"]), object({ ok: { const: true } })),
  generate: define<Identity & { prompt: string }, { form: FormRecord }>("questions.add", "按题目加题", "本地追加一题填空，以输入作为题目，不调用模型", "command", object({ ...identity, prompt: { ...text, maxLength: 200 } }, ["id", "prompt"]), changed),
  generateAi: define<Identity & { prompt: string }, { form: FormRecord }>("questions.ai", "AI 拟题并追加", "按明确提示拟一道填空题；调用当前文字模型，失败或问卷变化时不写入", "command", object({ ...identity, prompt: { ...id, maxLength: 2000 } }, ["id", "prompt"]), changed, [...write, "model:invoke"]),
  submit: define<Identity & { answers: Record<string, string>; request_id?: string }, { submission: FormSubmissionRecord }>("submit", "提交答卷", "按预览版本及题号提交文字答案；多选以换行分隔选项文字。request_id 用于同一次提交恢复", "command", object({ ...identity, answers, request_id: { ...id, maxLength: 200 } }, ["id", "answers"]), object({ submission }), ["form:read", "form:submit"]),
  results: define<{ id: string }, { analysis: { form_id: string; submission_count: number }; submissions: FormSubmissionRecord[] }>("results", "读取答卷", "读取答卷及计数，新增答卷保留提交时题目；旧答卷快照为 null，不重建未知历史", "query", object({ id }), object({ analysis: object({ form_id: id, submission_count: { type: "integer", minimum: 0 } }), submissions: array(submission) })),
  promote: define<Identity, { form: FormRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "问卷存成 Artifact", "发布固定问卷内容或恢复原发布；不包含答卷，后续编辑保留", "command", object(identity, ["id"]), object({ form: record, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...write, "artifact:write"]),
};
export const FORM_ACTION_PERMISSIONS = [...new Set(Object.values(formActions).flatMap(d => d.action.permissions))];
export interface FormActionPorts {
  withStore<T>(run: (store: FormStore) => T): T;
  modelAvailability(): ActionAvailability;
  completeText?(prompt: string, options: { signal?: AbortSignal }): Promise<string>;
  publishArtifact?: (input: Parameters<FormPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<FormPublishArtifactPort>;
  readArtifact?: (input: Parameters<FormReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<FormReadArtifactPort>;
}
export function createFormActionHandlers(ports: FormActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  return [
    bind(formActions.list, (_, caller) => ports.withStore(store => {
      const ai = ports.modelAvailability(), permitted = formActions.generateAi.action.permissions.every(p => caller.permissions.includes(p))
        && (!caller.allowed_capability_ids || caller.allowed_capability_ids.includes(formActions.generateAi.capability_id));
      return { forms: store.list(project(caller)), ai_available: ai.available && permitted, ai_unavailable_reason: !permitted ? "当前调用方未获 AI 加题权限" : !ai.available ? ai.reason : null };
    })),
    bind(formActions.get, (input, caller) => ports.withStore(store => ({ form: store.get(input.id, project(caller)) }))),
    bind(formActions.create, (input, caller) => ports.withStore(store => ({ form: store.create({ ...input, project_id: project(caller) }) }))),
    bind(formActions.update, (input, caller) => ports.withStore(store => ({ form: store.update(input.id, input, project(caller)) }))),
    bind(formActions.publish, (input, caller) => ports.withStore(store => ({ form: store.publish(input.id, project(caller), input.expected_version) }))),
    bind(formActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller), input.expected_version); return { ok: true }; })),
    bind(formActions.generate, (input, caller) => ports.withStore(store => ({ form: store.generateQuestions(input.id, input.prompt, project(caller), input.expected_version) }))),
    bind(formActions.generateAi, async (input, caller) => {
      const current = ports.withStore(store => store.get(input.id, project(caller)));
      if (input.expected_version !== undefined && current.version !== input.expected_version) throw new ActionError("form.conflict", "问卷已改变，请重新读取后生成");
      caller.signal?.throwIfAborted();
      if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
      const title = (await ports.completeText(`根据用户请求拟一道简洁的填空题，最多 200 字。只输出题目，不输出解释或其他格式。以下 JSON 是请求数据：\n${JSON.stringify({ request: input.prompt })}`, { signal: caller.signal })).trim();
      caller.signal?.throwIfAborted();
      if (!title || title.length > 200 || /[\r\n]/.test(title)) throw new ActionError("form.invalid", "模型没有返回有效题目，请调整提示后重试");
      return ports.withStore(store => ({ form: store.generateQuestions(input.id, title, project(caller), current.version) }));
    }, () => ports.modelAvailability()),
    bind(formActions.submit, (input, caller) => ports.withStore(store => ({ submission: store.submit(input.id, input.answers, project(caller), { expectedVersion: input.expected_version, requestId: input.request_id }) }))),
    bind(formActions.results, (input, caller) => ports.withStore(store => {
      const submissions = store.listSubmissions(input.id, project(caller));
      return { analysis: { form_id: input.id, submission_count: submissions.length }, submissions };
    })),
    bind(formActions.promote, (input, caller) => ports.withStore(store => promoteForm(store, input.id, project(caller), value => ports.publishArtifact!(value, caller), { actorId: caller.actor_id, expectedVersion: input.expected_version, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined })),
      () => ports.publishArtifact ? { available: true } : { available: false, code: "form.unavailable", reason: "当前环境不能发出 Artifact" }),
  ];
}
