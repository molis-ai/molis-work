import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { createHash, randomUUID } from "node:crypto";
import { ActionError, bindArtifactPreview, defineArtifactPreviewAction, defineArtifactPinAction, defineArtifactCompareAction, defineArtifactContinueAction, bindArtifactContinue, bindArtifactCompare, objectOrMissing, sameArtifactFields, actionFieldValue, bindObjectCopyHandler, bindObjectMoveHandler, bindSearchEntriesHandler, bindFileEntriesHandler, defineFileContentAction, defineFileEntriesAction, defineFragmentOffersAction, fileContentOf, defineObjectCopyAction, defineObjectMoveAction, defineSearchEntriesAction, defineSubjectContextAction, subjectContext, type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { IMPORTED_DOCUMENT_TYPE, importedDocumentFile } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parsePagesBody } from "./document.js";
import { PAGES_ARTIFACT_TYPE_ID, type PagesBody, type PagesFolder, type PagesRecord, type PagesInputSnapshot, type PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_AI_COMMANDS, runPagesAi, type PagesAiRequest, type PagesAiResult } from "./ai.js";
import type { PagesImportFile, PreparedPagesImport } from "./import-files.js";
import { promotePagesDocument, type PagesPublishArtifactPort, type PagesReadArtifactPort } from "./promote.js";
import type { PagesStore } from "./store.js";
import { generatePagesFromMaterials } from "./generate.js";
import { pagesTemplateSummaries } from "./templates.js";
import { convertImportContent } from "./import-content.js";
import { pagesSchema, nodeFromUnknown } from "./schema.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { PAGES_FRAGMENT_CHOICES, preparePagesFragmentOffers } from "./fragment-offers.js";

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
// What an agent or a workflow writes: Markdown that Pages converts, or a body in Pages' own structure (checked before saving).
const writeFields = { ...fields,
  body: { ...body, description: "Pages 自己的文档结构（ProseMirror JSON，节点名用 Pages 的：paragraph、heading、bullet_list、ordered_list、list_item、table、table_row、table_header、table_cell 等）；由助理或流程写正文时优先用 markdown" },
  markdown: { type: "string", minLength: 1, maxLength: 1_000_000, description: "正文的 Markdown 写法（标题、列表、表格、引用、代码块都可以），由 Pages 转换成文档；与 body 只给一个" } };
const files = { ...array(object({ name: text, data: text })), minItems: 1, maxItems: 100 };
const prepared = object({ documents: array(object({ key: id, name: text, title: text, body, warnings: array(text) })), warnings: array(text) });
const version = { type: "integer", minimum: 1 };
const snapshot = object({ entry_id: id, item_id: id, revision: version, title: text, body: text, url: { type: ["string", "null"] }, source_label: text, captured_at: text, provenance: array({ type: "object" }) });
const generation = object({ request_id: id, project_id: id, request_hash: id, status: { enum: ["running", "failed", "completed"] }, document_id: { type: ["string", "null"] }, inputs: array(snapshot), instructions: text, title: text, error: { type: ["string", "null"] }, updated_at: text });
const requestIdentity = { request_id: { type: "string", minLength: 1, maxLength: 160 }, request_hash: { type: "string", minLength: 1, maxLength: 160 } };
const read = ["pages:read"], write = ["pages:write"];
type Fields = { title?: string; body?: PagesBody; folder_id?: string; starred?: boolean; goal_id?: string };
type WrittenFields = Fields & { markdown?: string };
/** The object kind every Pages action and surface names. */
export const PAGES_SUBJECT_KIND = "pages_document";
/** What Pages can start documents from: text it reads, and the Word, CSV and ZIP (e.g. Notion export) files it parses. */
export const PAGES_READABLE_FILE = /\.(?:md|markdown|txt|html?|csv|docx|zip)$/iu;
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[], execution?: ActionDefinition["action"]["execution"], scheduling?: ActionDefinition["action"]["scheduling"]): ActionDefinition<I, O> {
  return { capability_id: `pages.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}),
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    permissions, subject_kinds: [PAGES_SUBJECT_KIND], input_schema: input, output_schema: output,
    ...(operation === "command" && (output as { properties?: Record<string, unknown> }).properties?.document ? { result_subject: { id: "document.id", revision: "document.version" } } : {}),
    ...(scheduling ? { scheduling } : {}) } };
}
const withAction = <I, O>(definition: ActionDefinition<I, O>, extra: Partial<ActionDefinition["action"]>): ActionDefinition<I, O> => ({ ...definition, action: { ...definition.action, ...extra } });
const readOnly = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => withAction(definition, { effect: "read" });
export const pagesActions = {
  /** One document's current text, version and links, by the shared subject protocol (the Assistant, Home, references). */
  subject: defineSubjectContextAction("pages.subject.read", PAGES_SUBJECT_KIND, "文档", read),
  /** What can be done with part of a document; preparing reads and writes nothing (specs/archive/contextual-interaction §5.1). */
  fragmentOffers: defineFragmentOffersAction("pages.fragment.offers", [PAGES_SUBJECT_KIND], "文档片段可以做的事", read, PAGES_FRAGMENT_CHOICES),
  /** System search: every document of the project by version; its text is read back through `subject`. */
  searchEntries: defineSearchEntriesAction("pages.search.entries", [{ kind: PAGES_SUBJECT_KIND, title: "文档", surface: "pages" }], "文档", read),
  /** The side panel's file tab (specs/archive/side-panel): documents by folder; the preview reads the same `subject` text. */
  fileEntries: defineFileEntriesAction("pages.files.entries", [{ kind: PAGES_SUBJECT_KIND, title: "文档", surface: "pages" }], "Pages 文档", read),
  /** The document as Markdown, the same conversion Pages uses when it hands a page to another plugin. */
  fileContent: defineFileContentAction("pages.files.content", [{ kind: PAGES_SUBJECT_KIND, title: "文档", surface: "pages" }], "Pages 文档", read),
  /** A pinned version of a document as Markdown (artifact-positioning A4), for the 成果库 and the side panel. */
  artifactPreview: defineArtifactPreviewAction("pages.artifacts.preview", "文档", read),
  /** Pins a document's current revision on the spot, for a Goal handing it in (A5); the same publication as `promote`. */
  artifactPin: defineArtifactPinAction("pages.artifacts.pin", PAGES_SUBJECT_KIND, "文档", [...read, ...write, "artifact:write"]),
  /** Whether a pinned version still matches the pages object it came from (A4b, 「原文已改」); compares content, not revisions. */
  artifactCompare: defineArtifactCompareAction("pages.artifacts.compare", "文档", [...read]),
  /** 「从这一版继续」 (A4b): a new document from a version of a document, or from an imported text file Pages can read. */
  artifactContinue: defineArtifactContinueAction("pages.artifacts.continue", "文档", [...read, ...write]),
  /** Where a document lives (specs/archive/work-placement): moving keeps its id; copying makes an independent document. */
  move: defineObjectMoveAction("pages.placement.move", [PAGES_SUBJECT_KIND], "文档", [...read, ...write]),
  copy: defineObjectCopyAction("pages.placement.copy", [PAGES_SUBJECT_KIND], "文档", [...read, ...write]),
  list: define<Record<string, never>, { documents: PagesRecord[]; folders: PagesFolder[] }>("list", "文档列表", "读取当前项目全部文档和文件夹", "query", object({}), object({ documents: array(page), folders: array(folder) }), read),
  templates: define<Record<string, never>, { templates: ReturnType<typeof pagesTemplateSummaries> }>("templates", "文档模板", "查看可以用于创建文档的内置模板", "query", object({}), object({ templates: array(object({ id, title: text, summary: text })) }), read),
  get: define<{ id: string }, { document: PagesRecord }>("get", "读取文档", "读取当前项目的一篇文档", "query", object({ id }), object({ document: page }), read),
  // A new document can be taken back while no one has changed it, so the Assistant may create one when asked without a confirmation.
  create: withAction(define<WrittenFields & { template_id?: string }, { document: PagesRecord }>("create", "新建文档", "在当前项目创建正文或使用内置模板；正文可用 markdown 给出，由 Pages 转换", "command", object({ ...writeFields, template_id: text }, []), object({ document: page }), write),
    { undo: { capability_id: "pages.discard", version: 1, input: { id: "document.id", expected_version: "document.version" } } }),
  // Taking a document back removes it for good (only while unchanged): an agent calling it directly is asked every time.
  discard: withAction(define<{ id: string; expected_version: number }, { ok: true }>("discard", "撤销新建文档", "撤回刚新建的文档：只在它新建后没被改过时删除；改过就不删并说明", "command", object({ id, expected_version: version }), object({ ok: { const: true } }), write),
    { effect: "irreversible" }),
  // An edit by an agent or a workflow keeps what it replaced (change_id), so the person can take it back while nothing changed since.
  update: withAction(define<WrittenFields & { id: string; expected_version?: number }, { document: PagesRecord; change_id?: string | null }>("update", "修改文档", "修改文档；提供读取时的 version，避免覆盖其他编辑；正文可用 markdown 给出，由 Pages 转换", "command", object({ id, ...writeFields, expected_version: version }, ["id"]), { type: "object", properties: { document: page, change_id: { type: ["string", "null"] } }, required: ["document"], additionalProperties: false }, write),
    { undo: { capability_id: "pages.revert", version: 1, input: { change_id: "change_id" } } }),
  revert: define<{ change_id: string }, { document: PagesRecord }>("revert", "撤销对文档的修改", "把一次由助理或流程做的修改撤回到修改前；之后又被改过就不撤并说明", "command", object({ change_id: id }), object({ document: page }), write),
  delete: define<{ id: string }, { ok: true }>("delete", "删除文档", "永久删除当前项目的一篇文档", "command", object({ id }), object({ ok: { const: true } }), write),
  createFolder: define<{ title?: string }, { folder: PagesFolder }>("folders.create", "新建文件夹", "在当前项目创建文档文件夹", "command", object({ title: { type: "string", maxLength: 40 } }, []), object({ folder }), write),
  updateFolder: define<{ id: string; title?: string }, { folder: PagesFolder }>("folders.update", "修改文件夹", "修改当前项目文件夹名称", "command", object({ id, title: { type: "string", maxLength: 40 } }, ["id"]), object({ folder }), write),
  deleteFolder: define<{ id: string }, { ok: true }>("folders.delete", "删除文件夹", "删除文件夹并将文档移回根目录，保留文档", "command", object({ id }), object({ ok: { const: true } }), write),
  previewImport: define<{ files: PagesImportFile[] }, PreparedPagesImport>("import.preview", "预览导入", "解析上传的文档，不写入文档库", "query", object({ files }), prepared, read, undefined, "concurrent"),
  import: define<{ files: PagesImportFile[]; selected_keys: string[]; request_id: string; folder_id?: string }, { documents: PagesRecord[]; warnings: string[] }>("import", "导入文档", "提交预览选中的文档；同一请求标识可重试，保留已经导入后的编辑", "command",
    object({ files, selected_keys: { ...array(id), minItems: 1, maxItems: 100, uniqueItems: true }, request_id: { type: "string", pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" }, folder_id: text }, ["files", "selected_keys", "request_id"]), object({ documents: array(page), warnings: array(text) }), write, undefined, "concurrent"),
  importDocuments: define<{ request_id: string; request_hash: string; documents: { title: string; body: PagesBody }[]; folder_id?: string }, { documents: PagesRecord[] }>("documents.import", "保存材料文档", "批量保存已解析的文档；调用方提供已确认意图的稳定请求标识与摘要，重试返回原文档且不覆盖后续编辑", "command",
    object({ ...requestIdentity, documents: { ...array(object({ title: fields.title, body })), minItems: 1, maxItems: 1000 }, folder_id: text }, ["request_id", "request_hash", "documents"]), object({ documents: array(page) }), write),
  generations: define<Record<string, never>, { records: PagesGenerationRecord[] }>("generations.list", "文稿生成记录", "查看当前项目生成任务的输入快照、状态和文档引用", "query", object({}), object({ records: array(generation) }), read),
  generation: define<{ request_id: string }, { record: PagesGenerationRecord | null }>("generations.get", "读取生成任务", "读取一个稳定请求对应的生成记录；不存在时返回空", "query", object({ request_id: requestIdentity.request_id }), object({ record: { anyOf: [generation, { type: "null" }] } }), read),
  generate: define<{ request_id: string; request_hash: string; inputs: PagesInputSnapshot[]; title: string; instructions: string }, { document: PagesRecord; replayed: boolean }>("generate", "材料生成文稿", "按调用方提供的材料快照生成文稿并保存；同一请求重试使用原快照，保留已生成后的手工编辑", "command",
    object({ ...requestIdentity, inputs: { ...array(snapshot), minItems: 1, maxItems: 20 }, title: { ...fields.title, minLength: 1, pattern: "\\S" }, instructions: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" } }), object({ document: page, replayed: { type: "boolean" } }), [...read, ...write, "model:invoke"], { cost: "metered" }, "concurrent"),
  // Only proposes text: nothing in the document changes until the person applies it through `update`.
  ai: readOnly(define<PagesAiRequest & { id: string; expected_version?: number }, PagesAiResult>("ai", "文档写作助手", "使用文字模型生成候选正文；用户确认或后续动作负责写入，缺少模型时拒绝执行", "command",
    object({ id, command: { enum: PAGES_AI_COMMANDS.map(command => command.id) }, text: { type: "string", minLength: 1, maxLength: 180000, pattern: "\\S" }, style: { enum: ["concise", "expand", "formal", "casual"] }, expected_version: version }, ["id", "command", "text"]),
    object({ text, stub: { const: false }, command: text, style: text }, ["text", "stub", "command"]), [...read, "model:invoke"], { cost: "metered" }, "concurrent")),
  promote: define<{ id: string; goal_id?: string; expected_version?: number }, { document: PagesRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "发布文档成果", "将文档保存为成果；有未完成发布时恢复原快照，后续编辑可另存一版。可提供读取时的 version 避免过期发布", "command", object({ id, goal_id: fields.goal_id, expected_version: version }, ["id"]), object({ document: page, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...read, ...write, "artifact:write"]),
  extract: define<{ id: string }, { document: PagesRecord; cards: number; created: PagesRecord[] }>("extract", "提取任务与知识", "从文档提取任务卡和知识页，一次事务保存全部结果", "command", object({ id }), object({ document: page, cards: { type: "integer", minimum: 0 }, created: array(page) }), [...read, ...write]),
};
export const PAGES_ACTIONS: readonly ActionDefinition[] = Object.values(pagesActions);
export const PAGES_ACTION_PERMISSIONS = [...new Set(PAGES_ACTIONS.flatMap(definition => definition.action.permissions))];
export interface PagesActionPorts {
  withStore<T>(run: (store: PagesStore) => T): T;
  completeText?(prompt: InstructedPrompt, options: { signal?: AbortSignal; beforeDispatch?: () => Promise<void> }): Promise<string>;
  modelAvailability(): ActionAvailability;
  prepareImport(files: readonly PagesImportFile[], caller: ActionExecutionContext): Promise<PreparedPagesImport>;
  publishArtifact?: (input: Parameters<PagesPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<PagesPublishArtifactPort>;
  readArtifact?: (input: Parameters<PagesReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<PagesReadArtifactPort>;
}
export function createPagesActionHandlers(ports: PagesActionPorts): ActionHandlerBinding[] {
  const prepareImport = async (files: readonly PagesImportFile[], caller: ActionExecutionContext) => {
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    const prepared = await ports.prepareImport(files, caller);
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    return prepared;
  };
  const project = (caller: ActionCallContext) => {
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
    return caller.project_id;
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}),
  });
  const promote = (id: string, caller: ActionCallContext, goalId?: string, expectedVersion?: number) => ports.withStore(store => promotePagesDocument(store, id, project(caller),
    value => ports.publishArtifact!(value, caller), goalId, { actorId: caller.actor_id, expectedVersion, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined }));
  const publishable = () => ports.publishArtifact ? { available: true as const } : { available: false as const, code: "pages.unavailable", reason: "当前环境不能发出成果" };
  return [
    // The whole document (整篇) is prepared from its stored text; preparing never writes.
    bind(pagesActions.fragmentOffers, (input, caller) => ({ offers: preparePagesFragmentOffers(input, PAGES_SUBJECT_KIND, undefined, id => ports.withStore(store => {
      try { return String(actionFieldValue("body", store.get(id, project(caller)).body) ?? ""); } catch { return null; }
    })) })),
    bind(pagesActions.subject, (input, caller) => ports.withStore(store => {
      let document: PagesRecord;
      try { document = store.get(input.subject_id, project(caller)); }
      catch (error) { throw (error as { code?: string }).code === "pages.not_found" ? new ActionError("pages.not_found", "文档不存在或已删除") : error; }
      return subjectContext({ subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, revision: String(document.version), title: document.title || "未命名文档",
        content: actionFieldValue("body", document.body), goal_ids: document.goal_id ? [document.goal_id] : [], session_id: null, open: { surface: "pages", id: document.id } });
    })),
    bindSearchEntriesHandler(pagesActions.searchEntries, caller => ports.withStore(store => store.list(project(caller)).map(document => ({
      subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, revision: String(document.version), title: document.title || "未命名文档", summary: "",
      updated_at: document.updated_at, content: "context" as const, open: { surface: "pages", id: document.id } })))),
    bindFileEntriesHandler(pagesActions.fileEntries, caller => ports.withStore(store => {
      const folders = new Map(store.listFolders(project(caller)).map(folder => [folder.id, folder.title]));
      return store.list(project(caller)).map(document => ({
        subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, revision: String(document.version), title: document.title || "未命名文档",
        folder: document.folder_id && folders.get(document.folder_id) ? [folders.get(document.folder_id)!] : [], media_type: "text/markdown",
        size: null, updated_at: document.updated_at, open: { surface: "pages", id: document.id } }));
    })),
    bindArtifactPreview(pagesActions.artifactPreview, PAGES_ARTIFACT_TYPE_ID, artifact => {
      const payload = (artifact.payload ?? {}) as { title?: unknown; body?: unknown };
      const nodes: Array<Parameters<typeof nodesToMarkdown>[0][number]> = [];
      nodeFromUnknown(payload.body).forEach(node => { nodes.push(node); });
      const title = typeof payload.title === "string" && payload.title ? payload.title : artifact.title;
      return { media_type: "text/markdown", text: `# ${title}\n\n${nodesToMarkdown(nodes).trim()}\n` };
    }),
    bind(pagesActions.fileContent, (input, caller) => ports.withStore(store => {
      let document: PagesRecord;
      try { document = store.get(input.subject.id, project(caller)); }
      catch (error) { throw (error as { code?: string }).code === "pages.not_found" ? new ActionError("pages.not_found", "文档不存在或已删除") : error; }
      const nodes: Array<Parameters<typeof nodesToMarkdown>[0][number]> = [];
      nodeFromUnknown(document.body).forEach(node => { nodes.push(node); });
      const title = document.title || "未命名文档";
      return fileContentOf({ subject: input.subject, revision: String(document.version), title, media_type: "text/markdown", text: `# ${title}\n\n${nodesToMarkdown(nodes).trim()}\n` });
    })),
    bindObjectMoveHandler(pagesActions.move, input => ports.withStore(store => {
      const document = store.relocate(input.subject.id, input.from_project_id, input.to_project_id);
      return { subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, project_id: document.project_id, revision: String(document.version) };
    })),
    bindObjectCopyHandler(pagesActions.copy, input => ports.withStore(store => {
      const document = store.duplicate(input.subject.id, input.from_project_id, input.to_project_id, input.request_id);
      return { subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, project_id: document.project_id, revision: String(document.version) };
    })),
    bind(pagesActions.list, (_, caller) => ports.withStore(store => ({ documents: store.list(project(caller)), folders: store.listFolders(project(caller)) }))),
    bind(pagesActions.templates, () => ({ templates: pagesTemplateSummaries() })),
    bind(pagesActions.get, (input, caller) => ports.withStore(store => ({ document: store.get(input.id, project(caller)) }))),
    bind(pagesActions.create, (input, caller) => ports.withStore(store => ({ document: store.create({ ...written(input, caller, true), project_id: project(caller) }) }))),
    bind(pagesActions.update, (input, caller) => ports.withStore(store => {
      // The person's own editing (the Pages page, autosave) needs no taking back; what an agent or workflow changed does.
      if (caller.audience === "user") return { document: store.update(input.id, written(input, caller), project(caller)), change_id: null };
      const before = store.get(input.id, project(caller));
      const document = store.update(input.id, written(input, caller), project(caller));
      return { document, change_id: store.keepChange(before, document) };
    })),
    bind(pagesActions.revert, (input, caller) => ports.withStore(store => ({ document: store.revertChange(input.change_id, project(caller)) }))),
    bind(pagesActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller)); return { ok: true }; })),
    bind(pagesActions.discard, (input, caller) => ports.withStore(store => { store.discard(input.id, input.expected_version, project(caller)); return { ok: true }; })),
    bind(pagesActions.createFolder, (input, caller) => ports.withStore(store => ({ folder: store.createFolder({ ...input, project_id: project(caller) }) }))),
    bind(pagesActions.updateFolder, (input, caller) => ports.withStore(store => ({ folder: store.updateFolder(input.id, input, project(caller)) }))),
    bind(pagesActions.deleteFolder, (input, caller) => ports.withStore(store => { store.deleteFolder(input.id, project(caller)); return { ok: true }; })),
    bind(pagesActions.previewImport, (input, caller) => prepareImport(input.files, caller)),
    bind(pagesActions.import, async (input, caller) => {
      const prepared = await prepareImport(input.files, caller);
      const byKey = new Set(prepared.documents.map(document => document.key));
      if (input.selected_keys.some(key => !byKey.has(key))) throw new ActionError("pages.invalid", "选择的文档不在这批文件中，请重新预览");
      const documents = prepared.documents.filter(document => input.selected_keys.includes(document.key));
      const folder_id = input.folder_id?.trim() ?? "";
      const request_hash = createHash("sha256").update(JSON.stringify({ files: input.files, selected_keys: [...input.selected_keys].sort(), folder_id })).digest("hex");
      await caller.beforeEffect();
      return ports.withStore(store => ({ documents: store.importDocuments({ project_id: project(caller), request_id: input.request_id.toLowerCase(), request_hash, folder_id, documents }),
        warnings: [...new Set([...prepared.warnings, ...documents.flatMap(document => document.warnings)])] }));
    }),
    bindArtifactContinue(pagesActions.artifactContinue, [PAGES_ARTIFACT_TYPE_ID, IMPORTED_DOCUMENT_TYPE], async (artifact, caller) => {
      if (artifact.artifact_type_id === PAGES_ARTIFACT_TYPE_ID) {
        const payload = (artifact.payload ?? {}) as { title?: unknown; body?: unknown };
        const document = ports.withStore(store => store.create({ project_id: project(caller), title: typeof payload.title === "string" ? payload.title : artifact.title, body: parsePagesBody(payload.body) }));
        return { surface: "pages", id: document.id, title: document.title };
      }
      // An imported file Pages can read is parsed the way Pages imports files.
      const file = importedDocumentFile(artifact);
      if (!file || !PAGES_READABLE_FILE.test(file.filename)) throw new ActionError("pages.unsupported", "Pages 读不了这一版：支持 Markdown、TXT、HTML、CSV、Word 与 ZIP");
      const files = [{ name: file.filename, data: file.data_base64 ?? Buffer.from(file.text ?? "", "utf8").toString("base64") }];
      const prepared = await prepareImport(files, caller);
      const documents = prepared.documents;
      if (!documents.length) throw new ActionError("pages.invalid", "这一版没有可以继续的正文");
      const request_hash = createHash("sha256").update(JSON.stringify({ files, selected_keys: documents.map(document => document.key).sort(), folder_id: "" })).digest("hex");
      await caller.beforeEffect();
      const [first] = ports.withStore(store => store.importDocuments({ project_id: project(caller), request_id: randomUUID(), request_hash, folder_id: "", documents }));
      return { surface: "pages", id: first!.id, title: first!.title };
    }),
    bind(pagesActions.importDocuments, (input, caller) => ports.withStore(store => ({ documents: store.importDocuments({ ...input, project_id: project(caller) }) }))),
    bind(pagesActions.generations, (_, caller) => ports.withStore(store => ({ records: store.generations(project(caller)) }))),
    bind(pagesActions.generation, (input, caller) => ports.withStore(store => ({ record: store.generation(project(caller), input.request_id) }))),
    bind(pagesActions.generate, (input, caller) => {
      if (input.inputs.reduce((sum, item) => sum + item.body.length, 0) > 100_000) throw new ActionError("pages.invalid", "材料过长，请减少所选条目");
      const record: PagesGenerationRecord = { ...input, project_id: project(caller), status: "running", document_id: null, error: null, updated_at: new Date().toISOString() };
      return generatePagesFromMaterials(ports.withStore, record, ports.completeText ? prompt => ports.completeText!(prompt, { signal: caller.signal, beforeDispatch: caller.beforeEffect }) : undefined, caller.signal, caller.beforeEffect);
    }, () => ports.modelAvailability()),
    bind(pagesActions.ai, async (input, caller) => {
      const snapshot = ports.withStore(store => store.get(input.id, project(caller)));
      if (input.expected_version !== undefined && snapshot.version !== input.expected_version) throw new ActionError("pages.conflict", "文档已改变，请重新读取后生成");
      caller.signal?.throwIfAborted();
      const result = await runPagesAi(input, ports.completeText ? prompt => ports.completeText!(prompt, { signal: caller.signal, beforeDispatch: caller.beforeEffect }) : undefined);
      caller.signal?.throwIfAborted();
      const current = ports.withStore(store => store.get(input.id, project(caller)));
      if (current.version !== snapshot.version) throw new ActionError("pages.conflict", "生成期间文档已改变，请重新生成");
      return result;
    }, () => ports.modelAvailability()),
    bind(pagesActions.promote, (input, caller) => promote(input.id, caller, input.goal_id, input.expected_version), publishable),
    bind(pagesActions.artifactPin, (input, caller) => { const { artifact, recovered } = promote(input.subject_id, caller); return { artifact, recovered }; }, publishable),
    bindArtifactCompare(pagesActions.artifactCompare, PAGES_ARTIFACT_TYPE_ID, (id, caller) => objectOrMissing(() => ports.withStore(store => store.get(id, project(caller)))),
      (payload, object) => sameArtifactFields(payload, object, ["title", "body"])),
    bind(pagesActions.extract, (input, caller) => ports.withStore(store => store.extract(input.id, project(caller)))),
  ];
}

/**
 * What an agent, a workflow or MCP writes is what the editor can show. Markdown is converted by Pages itself; a body
 * must fit Pages' schema, or nothing is saved and the caller hears which names to use. (A body the editor cannot parse
 * opened as an empty page, and the next keystroke there saved the empty page over it.) The person's own editor always
 * writes its own structure.
 */
function written<T extends WrittenFields>(input: T, caller: ActionCallContext, creating = false): Omit<T, "markdown"> {
  const { markdown, ...rest } = input;
  if (markdown !== undefined) {
    if (rest.body !== undefined) throw new ActionError("pages.invalid", "markdown 与 body 只给一个");
    const converted = convertImportContent({ name: rest.title || "未命名文档", format: "markdown", content: markdown });
    // Only a new document takes its title from the Markdown; rewriting a body must not rename what the person titled.
    return { ...rest, ...(rest.title || !creating ? {} : { title: converted.title.slice(0, 80) }), body: converted.body };
  }
  if (rest.body === undefined || caller.audience === "user" || !rest.body.content?.length) return rest;
  try { pagesSchema.nodeFromJSON(rest.body).check(); }
  catch (error) {
    const names = Object.keys(pagesSchema.nodes).filter(name => name !== "doc" && name !== "text").join("、");
    throw new ActionError("pages.invalid", `正文不是 Pages 能显示的结构（${error instanceof Error ? error.message : String(error)}），没有保存。节点用 Pages 自己的名字（${names}），或改用 markdown 字段给出正文，由 Pages 转换。`);
  }
  return rest;
}
