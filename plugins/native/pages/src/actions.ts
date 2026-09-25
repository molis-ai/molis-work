import { createHash } from "node:crypto";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody, PagesFolder, PagesRecord, PagesInputSnapshot, PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_AI_COMMANDS, runPagesAi, type PagesAiRequest, type PagesAiResult } from "./ai.js";
import { preparePagesImport, type PagesImportFile, type PreparedPagesImport } from "./import-files.js";
import { promotePagesDocument, type PagesPublishArtifactPort, type PagesReadArtifactPort } from "./promote.js";
import type { PagesStore } from "./store.js";
import { generatePagesFromMaterials } from "./generate.js";
import { pagesTemplateSummaries } from "./templates.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1, pattern: "\\S" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const body = object({ type: { const: "doc" }, content: array({}) }, ["type"]);
const pageProperties = { id, project_id: id, title: text, body, folder_id: text, starred: { type: "boolean" }, goal_id: text,
  artifact_id: text, artifact_version: { type: "integer", minimum: 0 }, created_at: text, updated_at: text, version: { type: "integer", minimum: 1 } };
const page = object({ ...pageProperties, publication_pending: object({ version: { type: "integer", minimum: 1 }, source_version: { type: "integer", minimum: 1 }, goal_id: text }) }, Object.keys(pageProperties));
const folder = object({ id, project_id: id, title: text, created_at: text, updated_at: text });
const fields = { title: { type: "string", maxLength: 80 }, body, folder_id: text, starred: { type: "boolean" }, goal_id: { type: "string", maxLength: 80 } };
const files = { ...array(object({ name: text, data: text })), minItems: 1, maxItems: 100 };
const prepared = object({ documents: array(object({ key: id, name: text, title: text, body, warnings: array(text) })), warnings: array(text) });
const version = { type: "integer", minimum: 1 };
const snapshot = object({ entry_id: id, item_id: id, revision: version, title: text, body: text, url: { type: ["string", "null"] }, source_label: text, captured_at: text, provenance: array({ type: "object" }) });
const generation = object({ request_id: id, project_id: id, request_hash: id, status: { enum: ["running", "failed", "completed"] }, document_id: { type: ["string", "null"] }, inputs: array(snapshot), instructions: text, title: text, error: { type: ["string", "null"] }, updated_at: text });
const requestIdentity = { request_id: { type: "string", minLength: 1, maxLength: 160 }, request_hash: { type: "string", minLength: 1, maxLength: 160 } };
const read = ["pages:read"], write = ["pages:write"];
type Fields = { title?: string; body?: PagesBody; folder_id?: string; starred?: boolean; goal_id?: string };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[]): ActionDefinition<I, O> {
  return { capability_id: `pages.${name}`, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    permissions, subject_kinds: ["pages_document"], input_schema: input, output_schema: output } };
}
export const pagesActions = {
  list: define<Record<string, never>, { documents: PagesRecord[]; folders: PagesFolder[] }>("list", "文档列表", "读取当前项目全部文档和文件夹", "query", object({}), object({ documents: array(page), folders: array(folder) }), read),
  templates: define<Record<string, never>, { templates: ReturnType<typeof pagesTemplateSummaries> }>("templates", "文档模板", "查看可以用于创建文档的内置模板", "query", object({}), object({ templates: array(object({ id, title: text, summary: text })) }), read),
  get: define<{ id: string }, { document: PagesRecord }>("get", "读取文档", "读取当前项目的一篇文档", "query", object({ id }), object({ document: page }), read),
  create: define<Fields & { template_id?: string }, { document: PagesRecord }>("create", "新建文档", "在当前项目创建正文或使用内置模板", "command", object({ ...fields, template_id: text }, []), object({ document: page }), write),
  update: define<Fields & { id: string; expected_version?: number }, { document: PagesRecord }>("update", "修改文档", "修改文档；提供读取时的 version，避免覆盖其他编辑", "command", object({ id, ...fields, expected_version: version }, ["id"]), object({ document: page }), write),
  delete: define<{ id: string }, { ok: true }>("delete", "删除文档", "永久删除当前项目的一篇文档", "command", object({ id }), object({ ok: { const: true } }), write),
  createFolder: define<{ title?: string }, { folder: PagesFolder }>("folders.create", "新建文件夹", "在当前项目创建文档文件夹", "command", object({ title: { type: "string", maxLength: 40 } }, []), object({ folder }), write),
  updateFolder: define<{ id: string; title?: string }, { folder: PagesFolder }>("folders.update", "修改文件夹", "修改当前项目文件夹名称", "command", object({ id, title: { type: "string", maxLength: 40 } }, ["id"]), object({ folder }), write),
  deleteFolder: define<{ id: string }, { ok: true }>("folders.delete", "删除文件夹", "删除文件夹并将文档移回根目录，保留文档", "command", object({ id }), object({ ok: { const: true } }), write),
  previewImport: define<{ files: PagesImportFile[] }, PreparedPagesImport>("import.preview", "预览导入", "解析上传的文档，不写入文档库", "query", object({ files }), prepared, read),
  import: define<{ files: PagesImportFile[]; selected_keys: string[]; request_id: string; folder_id?: string }, { documents: PagesRecord[]; warnings: string[] }>("import", "导入文档", "提交预览选中的文档；同一请求标识可重试，保留已经导入后的编辑", "command",
    object({ files, selected_keys: { ...array(id), minItems: 1, maxItems: 100, uniqueItems: true }, request_id: { type: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" }, folder_id: text }, ["files", "selected_keys", "request_id"]), object({ documents: array(page), warnings: array(text) }), write),
  importDocuments: define<{ request_id: string; request_hash: string; documents: { title: string; body: PagesBody }[]; folder_id?: string }, { documents: PagesRecord[] }>("documents.import", "保存材料文档", "批量保存已解析的文档；调用方提供已确认意图的稳定请求标识与摘要，重试返回原文档且不覆盖后续编辑", "command",
    object({ ...requestIdentity, documents: { ...array(object({ title: fields.title, body })), minItems: 1, maxItems: 1000 }, folder_id: text }, ["request_id", "request_hash", "documents"]), object({ documents: array(page) }), write),
  generations: define<Record<string, never>, { records: PagesGenerationRecord[] }>("generations.list", "文稿生成记录", "查看当前项目生成任务的输入快照、状态和文档引用", "query", object({}), object({ records: array(generation) }), read),
  generation: define<{ request_id: string }, { record: PagesGenerationRecord | null }>("generations.get", "读取生成任务", "读取一个稳定请求对应的生成记录；不存在时返回空", "query", object({ request_id: requestIdentity.request_id }), object({ record: { anyOf: [generation, { type: "null" }] } }), read),
  generate: define<{ request_id: string; request_hash: string; inputs: PagesInputSnapshot[]; title: string; instructions: string }, { document: PagesRecord; replayed: boolean }>("generate", "材料生成文稿", "按调用方提供的材料快照生成文稿并保存；同一请求重试使用原快照，保留已生成后的手工编辑", "command",
    object({ ...requestIdentity, inputs: { ...array(snapshot), minItems: 1, maxItems: 20 }, title: { ...fields.title, minLength: 1, pattern: "\\S" }, instructions: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" } }), object({ document: page, replayed: { type: "boolean" } }), [...read, ...write, "model:invoke"]),
  ai: define<PagesAiRequest & { id: string; expected_version?: number }, PagesAiResult>("ai", "文档写作助手", "使用文字模型生成候选正文；用户确认或后续动作负责写入，缺少模型时拒绝执行", "command",
    object({ id, command: { enum: PAGES_AI_COMMANDS.map(command => command.id) }, text: { type: "string", minLength: 1, maxLength: 180000, pattern: "\\S" }, style: { enum: ["concise", "expand", "formal", "casual"] }, expected_version: version }, ["id", "command", "text"]),
    object({ text, stub: { const: false }, command: text, style: text }, ["text", "stub", "command"]), [...read, "model:invoke"]),
  promote: define<{ id: string; goal_id?: string; expected_version?: number }, { document: PagesRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "发布文档成果", "将文档保存为 Artifact；有未完成发布时恢复原快照，后续编辑可另存一版。可提供读取时的 version 避免过期发布", "command", object({ id, goal_id: fields.goal_id, expected_version: version }, ["id"]), object({ document: page, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...read, ...write, "artifact:write"]),
  extract: define<{ id: string }, { document: PagesRecord; cards: number; created: PagesRecord[] }>("extract", "提取任务与知识", "从文档提取任务卡和知识页，一次事务保存全部结果", "command", object({ id }), object({ document: page, cards: { type: "integer", minimum: 0 }, created: array(page) }), [...read, ...write]),
};
export const PAGES_ACTIONS: readonly ActionDefinition[] = Object.values(pagesActions);
export const PAGES_ACTION_PERMISSIONS = [...new Set(PAGES_ACTIONS.flatMap(definition => definition.action.permissions))];
export interface PagesActionPorts {
  withStore<T>(run: (store: PagesStore) => T): T;
  completeText?(prompt: string, options: { signal?: AbortSignal }): Promise<string>;
  modelAvailability(): ActionAvailability;
  publishArtifact?: (input: Parameters<PagesPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<PagesPublishArtifactPort>;
  readArtifact?: (input: Parameters<PagesReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<PagesReadArtifactPort>;
}
export function createPagesActionHandlers(ports: PagesActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => {
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
    return caller.project_id;
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}),
  });
  return [
    bind(pagesActions.list, (_, caller) => ports.withStore(store => ({ documents: store.list(project(caller)), folders: store.listFolders(project(caller)) }))),
    bind(pagesActions.templates, () => ({ templates: pagesTemplateSummaries() })),
    bind(pagesActions.get, (input, caller) => ports.withStore(store => ({ document: store.get(input.id, project(caller)) }))),
    bind(pagesActions.create, (input, caller) => ports.withStore(store => ({ document: store.create({ ...input, project_id: project(caller) }) }))),
    bind(pagesActions.update, (input, caller) => ports.withStore(store => ({ document: store.update(input.id, input, project(caller)) }))),
    bind(pagesActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller)); return { ok: true }; })),
    bind(pagesActions.createFolder, (input, caller) => ports.withStore(store => ({ folder: store.createFolder({ ...input, project_id: project(caller) }) }))),
    bind(pagesActions.updateFolder, (input, caller) => ports.withStore(store => ({ folder: store.updateFolder(input.id, input, project(caller)) }))),
    bind(pagesActions.deleteFolder, (input, caller) => ports.withStore(store => { store.deleteFolder(input.id, project(caller)); return { ok: true }; })),
    bind(pagesActions.previewImport, input => preparePagesImport(input.files)),
    bind(pagesActions.import, async (input, caller) => {
      const prepared = await preparePagesImport(input.files);
      const byKey = new Set(prepared.documents.map(document => document.key));
      if (input.selected_keys.some(key => !byKey.has(key))) throw new ActionError("pages.invalid", "选择的文档不在这批文件中，请重新预览");
      const documents = prepared.documents.filter(document => input.selected_keys.includes(document.key));
      const folder_id = input.folder_id?.trim() ?? "";
      const request_hash = createHash("sha256").update(JSON.stringify({ files: input.files, selected_keys: [...input.selected_keys].sort(), folder_id })).digest("hex");
      caller.signal?.throwIfAborted();
      return ports.withStore(store => ({ documents: store.importDocuments({ project_id: project(caller), request_id: input.request_id.toLowerCase(), request_hash, folder_id, documents }),
        warnings: [...new Set([...prepared.warnings, ...documents.flatMap(document => document.warnings)])] }));
    }),
    bind(pagesActions.importDocuments, (input, caller) => ports.withStore(store => ({ documents: store.importDocuments({ ...input, project_id: project(caller) }) }))),
    bind(pagesActions.generations, (_, caller) => ports.withStore(store => ({ records: store.generations(project(caller)) }))),
    bind(pagesActions.generation, (input, caller) => ports.withStore(store => ({ record: store.generation(project(caller), input.request_id) }))),
    bind(pagesActions.generate, (input, caller) => {
      if (input.inputs.reduce((sum, item) => sum + item.body.length, 0) > 100_000) throw new ActionError("pages.invalid", "材料过长，请减少所选条目");
      const record: PagesGenerationRecord = { ...input, project_id: project(caller), status: "running", document_id: null, error: null, updated_at: new Date().toISOString() };
      return generatePagesFromMaterials(ports.withStore, record, ports.completeText ? prompt => ports.completeText!(prompt, { signal: caller.signal }) : undefined, caller.signal);
    }, () => ports.modelAvailability()),
    bind(pagesActions.ai, async (input, caller) => {
      const snapshot = ports.withStore(store => store.get(input.id, project(caller)));
      if (input.expected_version !== undefined && snapshot.version !== input.expected_version) throw new ActionError("pages.conflict", "文档已改变，请重新读取后生成");
      caller.signal?.throwIfAborted();
      const result = await runPagesAi(input, ports.completeText ? prompt => ports.completeText!(prompt, { signal: caller.signal }) : undefined);
      caller.signal?.throwIfAborted();
      const current = ports.withStore(store => store.get(input.id, project(caller)));
      if (current.version !== snapshot.version) throw new ActionError("pages.conflict", "生成期间文档已改变，请重新生成");
      return result;
    }, () => ports.modelAvailability()),
    bind(pagesActions.promote, (input, caller) => ports.withStore(store => promotePagesDocument(store, input.id, project(caller), value => ports.publishArtifact!(value, caller), input.goal_id,
      { actorId: caller.actor_id, expectedVersion: input.expected_version, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined })),
      () => ports.publishArtifact ? { available: true } : { available: false, code: "pages.unavailable", reason: "当前环境不能发出 Artifact" }),
    bind(pagesActions.extract, (input, caller) => ports.withStore(store => store.extract(input.id, project(caller)))),
  ];
}
