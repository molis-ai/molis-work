import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { FORM_DRAFT_QUESTION } from "./prompts.js";
import { ActionError, defineArtifactPinAction, defineArtifactCompareAction, defineArtifactContinueAction, bindArtifactContinue, bindArtifactCompare, objectOrMissing, sameArtifactFields, bindObjectCopyHandler, bindObjectMoveHandler, defineObjectCopyAction, defineObjectMoveAction, type ActionDefinition, type ActionSchema, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { FORM_ARTIFACT_TYPE_ID, FORM_PROJECT_PLUGIN_ID, type FormRecord, type FormQuestionInput, type FormSubmissionRecord, type FormSubmissionSource } from "@molis-ai/molis-work-contracts/modules/form";
import { promoteForm, type FormLineHeadPort, type FormPublishArtifactPort, type FormReadArtifactPort } from "./promote.js";
import type { FormStore } from "./store.js";
import { createFormSearchHandlers, formSearchActions } from "./search.js";
import { formFillPageFilename, formFillPageHtml, formResultsCsv, formResultsCsvFilename } from "./fillpage.js";
import { formArtifactPreview, formArtifactPreviewHandler } from "./artifact-preview.js";

const text = { type: "string" }, id = { ...text, minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const optionFields = { id: text, label: text };
const questionFields = { id: text, type: { enum: ["text", "singleChoice", "multiChoice", "dropdown", "rating", "date"] }, title: { ...text, maxLength: 200 }, required: { type: "boolean" }, order: { type: "integer" } };
const question = object({ ...questionFields, options: array(object(optionFields)) }, Object.keys(questionFields));
const questionInput = object({ ...questionFields, options: array(object(optionFields, [])) }, []);
const recordFields = { id, project_id: id, title: text, description: text, status: { enum: ["draft", "published", "closed"] }, share_id: { type: ["string", "null"] }, questions: array(question), created_at: text, updated_at: text, version, artifact_id: text, artifact_version: { type: "integer", minimum: 0 } };
const record = object({ ...recordFields, publication_pending: object({ version, source_version: version }) }, Object.keys(recordFields));
const answers = { type: "object", additionalProperties: { ...text, maxLength: 4000 } };
const submission = object({ id, form_id: id, answers, submitted_at: text, form_version: { type: "integer", minimum: 1 }, questions: array(question),
  source: { enum: ["preview", "fill", "file", "agent", "mcp", "workflow", "plugin"] } }, ["id", "form_id", "answers", "submitted_at", "form_version", "questions", "source"]);
const changed = object({ form: record }), identity = { id, expected_version: version };
const read = ["form:read"], write = ["form:read", "form:write"];
type Identity = { id: string; expected_version?: number };
type Edit = Identity & { title?: string; description?: string; questions?: readonly FormQuestionInput[] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[] = operation === "query" ? read : write, execution?: ActionDefinition["action"]["execution"]): ActionDefinition<I, O> {
  return { capability_id: `form.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}), kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], subject_kinds: ["form"], input_schema: input, output_schema: output, permissions, ...(name === "questions.ai" ? { scheduling: "concurrent" as const } : {}) } };
}
export const formActions = {
  /** A pinned version as the 成果库 and side panel show it (artifact-positioning A4). */
  artifactPreview: formArtifactPreview,
  /** Pins the current revision on the spot, for a Goal handing it in (A5); the same publication as `promote`. */
  artifactPin: defineArtifactPinAction("form.artifacts.pin", "form", "问卷", [...write, "artifact:write"]),
  /** Whether a pinned version still matches the form object it came from (A4b, 「原文已改」); compares content, not revisions. */
  artifactCompare: defineArtifactCompareAction("form.artifacts.compare", "问卷", read),
  /** 「从这一版继续」 (A4b): a new 问卷 with the content of a pinned version; the version itself is unchanged. */
  artifactContinue: defineArtifactContinueAction("form.artifacts.continue", "问卷", write),
  list: define<Record<string, never>, { forms: FormRecord[]; ai_available: boolean; ai_unavailable_reason: string | null }>("list", "问卷列表", "读取当前项目问卷和 AI 加题可用性", "query", object({}), object({ forms: array(record), ai_available: { type: "boolean" }, ai_unavailable_reason: { type: ["string", "null"] } })),
  get: define<{ id: string }, { form: FormRecord }>("get", "读取问卷", "读取题目、选项、状态、版本和发布状态", "query", object({ id }), changed),
  create: define<{ title?: string }, { form: FormRecord }>("create", "新建问卷", "创建当前项目的草稿问卷", "command", object({ title: { ...text, maxLength: 80 } }, []), changed),
  update: define<Edit, { form: FormRecord }>("update", "编辑问卷", "替换指定字段或题目列表；提交读取版本以避免覆盖其他编辑", "command", object({ ...identity, title: { ...text, maxLength: 80 }, description: { ...text, maxLength: 2000 }, questions: { ...array(questionInput), maxItems: 40 } }, ["id"]), changed),
  publish: define<Identity, { form: FormRecord }>("publish", "开始收集答卷", "开始在这台电脑上收集答卷：本机填写页可以提交，也可以导出填写页文件发给别人，对方生成的答卷文件导回结果；不会生成外网链接，也不发布成果", "command", object(identity, ["id"]), changed),
  delete: define<Identity, { ok: true }>("delete", "删除问卷", "原子删除问卷和答卷；未完成的成果发布需先恢复", "command", object(identity, ["id"]), object({ ok: { const: true } })),
  generate: define<Identity & { prompt: string }, { form: FormRecord }>("questions.add", "按题目加题", "本地追加一题填空，以输入作为题目，不调用模型", "command", object({ ...identity, prompt: { ...text, maxLength: 200 } }, ["id", "prompt"]), changed),
  generateAi: define<Identity & { prompt: string }, { form: FormRecord }>("questions.ai", "AI 拟题并追加", "按明确提示拟一道填空题；调用当前文字模型，失败或问卷变化时不写入", "command", object({ ...identity, prompt: { ...id, maxLength: 2000 } }, ["id", "prompt"]), changed, [...write, "model:invoke"], { cost: "metered" }),
  submit: define<Identity & { answers: Record<string, string>; request_id?: string; source?: "preview" | "fill" }, { submission: FormSubmissionRecord }>("submit", "提交答卷", "按预览版本及题号提交文字答案；多选以换行分隔选项文字。request_id 用于同一次提交恢复。来源按调用方记录：只有本机界面的填写页和试填可以用 source 自称 fill 或 preview，助理、MCP、流程和插件的答卷一律记为各自的来源，source 对它们无效", "command", object({ ...identity, answers, request_id: { ...id, maxLength: 200 }, source: { enum: ["preview", "fill"] } }, ["id", "answers"]), object({ submission }), ["form:read", "form:submit"]),
  results: define<{ id: string }, { analysis: { form_id: string; submission_count: number }; submissions: FormSubmissionRecord[] }>("results", "读取答卷", "读取答卷及计数，新增答卷保留提交时题目；旧答卷快照为 null，不重建未知历史", "query", object({ id }), object({ analysis: object({ form_id: id, submission_count: { type: "integer", minimum: 0 } }), submissions: array(submission) })),
  promote: define<Identity, { form: FormRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "问卷存为成果", "发布固定问卷内容或恢复原发布；不包含答卷，后续编辑保留", "command", object(identity, ["id"]), object({ form: record, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...write, "artifact:write"]),
  close: define<Identity, { form: FormRecord }>("close", "停止收集答卷", "停止收集：本机填写页不再接受提交，已有答卷保留；之后可以重新开始收集", "command", object(identity, ["id"]), changed),
  importAnswers: define<{ id: string; files: { name: string; content: string }[] }, { imported: number; skipped: number; rejected: { name: string; reason: string }[] }>("answers.import", "导入答卷文件",
    "导入别人用填写页生成的答卷文件；同一份只算一次，属于其他问卷或内容无效的会列出原因、不写入", "command",
    object({ id, files: { ...array(object({ name: { ...text, maxLength: 200 }, content: { ...text, maxLength: 400000 } })), minItems: 1, maxItems: 200 } }),
    object({ imported: { type: "integer", minimum: 0 }, skipped: { type: "integer", minimum: 0 }, rejected: array(object({ name: text, reason: text })) }), ["form:read", "form:submit"]),
  csv: define<{ id: string }, { filename: string; mime_type: "text/csv"; content: string; count: number }>("results.csv", "导出答卷表格", "全部答卷按题目成列的 CSV（UTF-8，Excel、Numbers 可直接打开），含提交时间与来源", "query",
    object({ id }), object({ filename: text, mime_type: { const: "text/csv" }, content: text, count: { type: "integer", minimum: 0 } })),
  fillPage: define<{ id: string }, { filename: string; mime_type: "text/html"; content: string }>("fillpage", "导出填写页文件", "生成一个独立的 HTML 填写页：对方在自己的浏览器里填写，得到答卷文件发回；页面不上传任何内容", "query",
    object({ id }), object({ filename: text, mime_type: { const: "text/html" }, content: text })),
  move: defineObjectMoveAction("form.placement.move", ["form"], "问卷", write),
  copy: defineObjectCopyAction("form.placement.copy", ["form"], "问卷", write),
  searchEntries: formSearchActions.entries,
  subject: formSearchActions.subject,
};
export const FORM_ACTION_PERMISSIONS = [...new Set(Object.values(formActions).flatMap(d => d.action.permissions))];
export interface FormActionPorts {
  withStore<T>(run: (store: FormStore) => T): T;
  modelAvailability(): ActionAvailability;
  completeText?(prompt: InstructedPrompt, options: { signal?: AbortSignal; beforeDispatch?: () => Promise<void> }): Promise<string>;
  publishArtifact?: (input: Parameters<FormPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<FormPublishArtifactPort>;
  readArtifact?: (input: Parameters<FormReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<FormReadArtifactPort>;
  lineHead?: FormLineHeadPort;
}
/**
 * Where an answer came from is the call's, not the caller's word: the fill page and the trial fill are a person at the
 * Host's own page (user audience) and may say which; every other audience is recorded as itself, whatever `source` it sent.
 */
function submissionSource(caller: ActionCallContext, claimed: "preview" | "fill" = "preview"): Exclude<FormSubmissionSource, "file"> {
  return caller.audience === "user" ? claimed : caller.audience;
}
export function createFormActionHandlers(ports: FormActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  const promote = (id: string, caller: ActionCallContext, expectedVersion?: number) => ports.withStore(store => promoteForm(store, id, project(caller), value => ports.publishArtifact!(value, caller),
    { actorId: caller.actor_id, expectedVersion, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined, lineHead: ports.lineHead }));
  const publishable = () => ports.publishArtifact ? { available: true as const } : { available: false as const, code: "form.unavailable", reason: "当前环境不能发出成果" };
  return [
    formArtifactPreviewHandler,
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
      const title = (await ports.completeText(instructed(FORM_DRAFT_QUESTION, JSON.stringify({ request: input.prompt })), { signal: caller.signal, beforeDispatch: caller.beforeEffect })).trim();
      caller.signal?.throwIfAborted();
      if (!title || title.length > 200 || /[\r\n]/.test(title)) throw new ActionError("form.invalid", "模型没有返回有效题目，请调整提示后重试");
      await caller.beforeEffect();
      return ports.withStore(store => ({ form: store.generateQuestions(input.id, title, project(caller), current.version) }));
    }, () => ports.modelAvailability()),
    bind(formActions.submit, (input, caller) => ports.withStore(store => ({ submission: store.submit(input.id, input.answers, project(caller), { expectedVersion: input.expected_version, requestId: input.request_id, source: submissionSource(caller, input.source) }) }))),
    bind(formActions.close, (input, caller) => ports.withStore(store => ({ form: store.closeCollection(input.id, project(caller), input.expected_version) }))),
    bind(formActions.importAnswers, (input, caller) => ports.withStore(store => store.importAnswers(input.id, input.files, project(caller)))),
    bind(formActions.csv, (input, caller) => ports.withStore(store => {
      const form = store.get(input.id, project(caller));
      const submissions = store.listSubmissions(input.id, project(caller));
      return { filename: formResultsCsvFilename(form.title), mime_type: "text/csv" as const, content: formResultsCsv(form, submissions), count: submissions.length };
    })),
    bind(formActions.fillPage, (input, caller) => ports.withStore(store => {
      const form = store.get(input.id, project(caller));
      if (!form.questions.length) throw new ActionError("form.invalid", "还没有题目，先加题再导出填写页");
      return { filename: formFillPageFilename(form.title), mime_type: "text/html" as const, content: formFillPageHtml(form) };
    })),
    bindObjectMoveHandler(formActions.move, input => ports.withStore(store => {
      const form = store.relocate(input.subject.id, input.from_project_id, input.to_project_id);
      return { subject: { kind: "form", id: form.id }, project_id: form.project_id, revision: String(form.version) };
    })),
    bindObjectCopyHandler(formActions.copy, input => ports.withStore(store => {
      const form = store.duplicate(input.subject.id, input.from_project_id, input.to_project_id, input.request_id);
      return { subject: { kind: "form", id: form.id }, project_id: form.project_id, revision: String(form.version) };
    })),
    bind(formActions.results, (input, caller) => ports.withStore(store => {
      const submissions = store.listSubmissions(input.id, project(caller));
      return { analysis: { form_id: input.id, submission_count: submissions.length }, submissions };
    })),
    bind(formActions.promote, (input, caller) => promote(input.id, caller, input.expected_version), publishable),
    bind(formActions.artifactPin, (input, caller) => { const { artifact, recovered } = promote(input.subject_id, caller); return { artifact, recovered }; }, publishable),
    bindArtifactContinue(formActions.artifactContinue, [FORM_ARTIFACT_TYPE_ID], (artifact, caller) => ports.withStore(store => {
      const payload = (artifact.payload ?? {}) as Record<string, unknown>, at = project(caller);
      const created = store.create({ title: typeof payload.title === "string" ? payload.title : artifact.title, project_id: at });
      // A version the editor cannot take leaves no empty 问卷 behind.
      try { store.update(created.id, Object.fromEntries(["description", "questions"].filter(field => payload[field] !== undefined).map(field => [field, payload[field]])), at); }
      catch (error) { store.delete(created.id, at); throw error; }
      return { surface: FORM_PROJECT_PLUGIN_ID, id: created.id, title: created.title };
    })),
    bindArtifactCompare(formActions.artifactCompare, FORM_ARTIFACT_TYPE_ID, (id, caller) => objectOrMissing(() => ports.withStore(store => store.get(id, project(caller)))),
      (payload, object) => sameArtifactFields(payload, object, ["title", "description", "questions"]),
      // Moved to another project, it is not gone: only the owner can tell, from its Home-wide table.
      id => ports.withStore(store => objectOrMissing(() => store.get(id)) !== null)),
    ...createFormSearchHandlers(ports.withStore),
  ];
}
