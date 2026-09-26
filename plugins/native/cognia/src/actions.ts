import type { ActionAvailability, ActionCallContext, ActionExecutionContext, ActionDefinition, ActionHandlerBinding, ActionSchema, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { generateCogniaDraft, type CogniaAiPorts } from "./ai.js";
import type { CogniaStore } from "./store.js";
import { COGNIA_LIMITS, requireCognia, type Domain, type Draft, type ImportFile, type Material, type Preview, type Receipt, type Source, type SourceKind } from "./types.js";
import * as s from "./action-schema.js";

const read = ["cognia:read"], write = [...read, "cognia:write"];
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions = operation === "query" ? read : write, concurrent = false, required_actions?: ActionDefinition["action"]["required_actions"]): ActionDefinition<I, O> {
  return { capability_id: `cognia.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "home", audiences: ["user", "workflow", "agent", "mcp"], permissions, subject_kinds: ["cognia_material"], input_schema: input, output_schema: output, ...(concurrent ? { scheduling: "concurrent" } : {}), ...(required_actions ? { required_actions } : {}) } };
}
type Summary = Omit<Material, "body" | "frontmatter"> & { excerpt: string };
type Filters = { query?: string; domain_id?: string; source_id?: string };
type ImportInput = { kind: SourceKind; name: string; files: ImportFile[]; locator?: string; source_id?: string; domain_id?: string | null };
type DirectoryInput = { path: string; kind: SourceKind; source_id?: string; domain_id?: string | null };
type Scan = { locator: string; name: string; files: ImportFile[] };
type Edit = { title: string; body: string; domain_id?: string | null };
type MaterialRef = { id: string; revision: number };
type AiInput = { material_ids?: string[]; material_refs?: MaterialRef[]; question?: string; domain_id?: string };
type Workspace = { materials: Summary[]; domains: Domain[]; sources: Source[]; drafts: Omit<Draft, "body" | "references">[]; ai_available: boolean; ai_runtime: string | null; ai_unavailable_reason: string | null; limits: typeof COGNIA_LIMITS };
const aiFields = { question: { ...s.id, maxLength: 2000 }, domain_id: s.text };
export const cogniaActions = {
  workspace: define<Filters, Workspace>("workspace.get", "读取 Cognia 知识库", "按搜索词、领域和来源读取资料摘要、领域、来源及待审阅草稿", "query", s.object({ query: { ...s.text, maxLength: 500 }, domain_id: s.text, source_id: s.text }, []), s.object({ materials: s.array(s.summary), domains: s.array(s.domain), sources: s.array(s.source), drafts: s.array(s.object(s.draftFields)), ai_available: { type: "boolean" }, ai_runtime: s.nullable(s.text), ai_unavailable_reason: s.nullable(s.text), limits: s.object(Object.fromEntries(Object.keys(COGNIA_LIMITS).map(key => [key, s.integer]))) })),
  search: define<Filters & { query: string }, { materials: Summary[] }>("material.search", "搜索 Cognia 资料", "只读搜索已导入知识，返回前 30 份资料的固定版本与正文前 600 字符；不读取任意路径", "query", s.object({ query: { ...s.id, pattern: "\\S" }, domain_id: s.text, source_id: s.text }, ["query"]), s.object({ materials: s.array(s.summary) })),
  read: define<{ id: string; revision?: number }, ReturnType<CogniaStore["detail"]>>("material.get", "读取 Cognia 资料", "读取当前或指定固定版本、原文、链接及来源引用；指定版本在当前资料删除后仍可读取", "query", s.readInput, s.detail),
  download: define<{ id: string; revision?: number }, { data: string; filename: string; mime: string }>("material.download", "下载 Cognia 原始文件", "返回指定资料版本的原始字节 Base64、文件名及 MIME；内容是不可信资料", "query", s.readInput, s.object({ data: s.text, filename: s.text, mime: s.text })),
  createDomain: define<{ name: string }, { domain: Domain }>("domain.create", "新建知识领域", "创建领域；同名领域返回原有身份", "command", s.object({ name: { ...s.id, maxLength: 120 } }), s.object({ domain: s.domain })),
  updateDomain: define<{ id: string; name: string }, { domain: Domain }>("domain.update", "重命名知识领域", "修改原领域名称，保留资料引用", "command", s.object({ id: s.id, name: { ...s.id, maxLength: 120 } }), s.object({ domain: s.domain })),
  deleteDomain: define<{ id: string }, { deleted: true }>("domain.delete", "删除知识领域", "将原领域资料、来源和草稿转为未分类；保留资料版本，移除该领域待提交预览", "command", s.object({ id: s.id }), s.deleted),
  updateSource: define<{ id: string; name: string }, { source: Source }>("source.update", "重命名导入来源", "修改导入来源显示名称；手工与知识库内置来源不可修改", "command", s.object({ id: s.id, name: { ...s.id, maxLength: 200 } }), s.object({ source: s.source })),
  deleteSource: define<{ id: string }, { deleted: true }>("source.delete", "删除导入来源", "删除来源及当前资料和预览；保留已引用的固定资料版本", "command", s.object({ id: s.id }), s.deleted),
  createMaterial: define<Edit, { material: Material }>("material.create", "新建手工资料", "在原知识库保存一份手工文本资料，建立第一个版本", "command", s.object(s.materialInput, ["title", "body"]), s.object({ material: s.material })),
  updateMaterial: define<Edit & { id: string }, { material: Material }>("material.update", "修改知识资料", "修改手工或知识库资料并新增版本；导入资料通过重新导入更新", "command", s.object({ id: s.id, ...s.materialInput }, ["id", "title", "body"]), s.object({ material: s.material })),
  deleteMaterial: define<{ id: string }, { deleted: true }>("material.delete", "删除当前资料", "删除当前资料，已保存的固定版本引用仍有效", "command", s.object({ id: s.id }), s.deleted),
  preview: define<ImportInput, { preview: Preview }>("import.preview", "预览文件导入", "校验上传的原始文件 Base64 并保存导入预览；locator 仅用于来源标识，不读取本机路径", "command", s.object({ ...s.importFields, files: s.files, locator: s.text }, ["kind", "name", "files"]), s.object({ preview: s.preview })),
  scan: define<{ path: string }, Scan>("directory.scan", "读取本机资料目录", "读取明确指定的绝对目录；跳过符号链接、隐藏及不支持的文件，遵守文件与批次大小限制", "query", s.object({ path: { ...s.id, maxLength: 2000 } }), s.object({ locator: s.text, name: s.text, files: s.files }), ["cognia:read-local-files"], true),
  previewDirectory: define<DirectoryInput, { preview: Preview }>("import.directory_preview", "预览本机目录导入", "通过授权目录读取形成导入预览；确认后才写入知识库", "command", s.object({ path: { ...s.id, maxLength: 2000 }, kind: s.kind, source_id: s.id, domain_id: s.nullable(s.text) }, ["path", "kind"]), s.object({ preview: s.preview }), [...write, "cognia:read-local-files"], true, [{ capability_id: "cognia.directory.scan", version: 1 }, { capability_id: "cognia.import.preview", version: 1 }]),
  commit: define<{ preview_id: string }, { receipt: Receipt }>("import.commit", "确认资料导入", "原子提交预览；相同预览重试返回原回执，冲突时不部分导入", "command", s.object({ preview_id: s.id }), s.object({ receipt: s.receipt })),
  cancel: define<{ preview_id: string }, { cancelled: true }>("import.cancel", "取消导入预览", "移除尚未提交的预览，已确认的导入保持有效", "command", s.object({ preview_id: s.id }), s.object({ cancelled: { const: true } })),
  synthesize: define<AiInput, { draft: Draft }>("knowledge.synthesize", "整理知识资料", "根据 1–5 份资料生成带引用的待审阅草稿；material_refs 明确固定版本，material_ids 读取执行时当前版本，二者择一。需明确采纳才写入知识库", "command", { ...s.object({ material_ids: { ...s.array(s.id), minItems: 1, maxItems: 5, uniqueItems: true }, material_refs: { ...s.array(s.object({ id: s.id, revision: s.revision })), minItems: 1, maxItems: 5, uniqueItems: true }, question: aiFields.question }, []), oneOf: [{ required: ["material_ids"] }, { required: ["material_refs"] }] }, s.object({ draft: s.draft }), [...write, "model:invoke"], true),
  query: define<AiInput & { question: string }, { draft: Draft }>("knowledge.query", "根据知识库回答问题", "在选定领域检索相关资料并生成有固定版本引用的草稿；无证据时不调用模型", "command", s.object(aiFields, ["question"]), s.object({ draft: s.draft }), [...write, "model:invoke"], true),
  draft: define<{ id: string }, { draft: Draft }>("draft.get", "读取审阅草稿", "读取尚未归档的草稿及生成时的固定版本证据", "query", s.object({ id: s.id }), s.object({ draft: s.draft })),
  saveDraft: define<{ id: string }, { material: Material }>("draft.save", "采纳知识草稿", "将草稿保存为知识库资料；重复采纳返回原资料，不重复创建", "command", s.object({ id: s.id }), s.object({ material: s.material })),
  archiveDraft: define<{ id: string }, { deleted: true }>("draft.archive", "归档审阅草稿", "移出待审阅列表，保留已采纳资料的来源引用", "command", s.object({ id: s.id }), s.deleted),
};
export const COGNIA_ACTIONS: readonly ActionDefinition[] = Object.values(cogniaActions);
export const COGNIA_ACTION_PERMISSIONS = [...new Set(COGNIA_ACTIONS.flatMap(definition => definition.action.permissions))];
export interface CogniaActionPorts {
  withStore<T>(run: (store: CogniaStore) => T): T;
  model(): CogniaAiPorts;
  ai(caller: ActionCallContext): CogniaAiPorts;
  actions(caller: ActionCallContext): BoundActionClient;
  scan(path: string, signal?: AbortSignal): Promise<Scan>;
}
export function createCogniaActionHandlers(ports: CogniaActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  const model = () => { try { return ports.model(); } catch { return {}; } };
  const available = (): ActionAvailability => { const ai = model(); return ai.completeText ? { available: true } : { available: false, code: "actions.connection_required", reason: ai.unavailableReason ?? "尚未配置可用的文字模型，请检查模型设置和服务连接" }; };
  const summarize = (material: Material, query?: string): Summary => { const { body, frontmatter: _, ...rest } = material; const term = query?.trim().split(/\s+/u)[0], index = term ? body.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) : -1; return { ...rest, excerpt: query === undefined ? body.slice(0, 600) : index < 0 ? "" : body.slice(Math.max(0, index - 60), index + 120) }; };
  return [
    bind(cogniaActions.workspace, input => ports.withStore(store => { const ai = model(); return { materials: store.materials(input.query ?? "", input.domain_id, input.source_id).map(m => summarize(m, input.query ?? "")), domains: store.domains(), sources: store.sources(), drafts: store.drafts().map(({ body: _, references: _refs, ...draft }) => draft), ai_available: !!ai.completeText, ai_runtime: ai.runtimeLabel ?? null, ai_unavailable_reason: ai.unavailableReason ?? null, limits: COGNIA_LIMITS }; })),
    bind(cogniaActions.search, input => ports.withStore(store => ({ materials: store.materials(input.query, input.domain_id, input.source_id).slice(0, 30).map(m => summarize(m)) }))),
    bind(cogniaActions.read, input => ports.withStore(store => store.detail(input.id, input.revision))),
    bind(cogniaActions.download, input => ports.withStore(store => { const { material, bytes } = store.download(input.id, input.revision); return { data: bytes.toString("base64"), filename: material.path.split("/").at(-1) ?? "material", mime: material.mime }; })),
    bind(cogniaActions.createDomain, input => ports.withStore(store => ({ domain: store.createDomain(input.name) }))),
    bind(cogniaActions.updateDomain, input => ports.withStore(store => ({ domain: store.renameDomain(input.id, input.name) }))),
    bind(cogniaActions.deleteDomain, input => ports.withStore(store => { store.deleteDomain(input.id); return { deleted: true }; })),
    bind(cogniaActions.updateSource, input => ports.withStore(store => ({ source: store.renameSource(input.id, input.name) }))),
    bind(cogniaActions.deleteSource, input => ports.withStore(store => { store.deleteSource(input.id); return { deleted: true }; })),
    bind(cogniaActions.createMaterial, input => ports.withStore(store => ({ material: store.createMaterial(input) }))),
    bind(cogniaActions.updateMaterial, input => ports.withStore(store => ({ material: store.updateMaterial(input.id, input) }))),
    bind(cogniaActions.deleteMaterial, input => ports.withStore(store => { store.deleteMaterial(input.id); return { deleted: true }; })),
    bind(cogniaActions.preview, input => ports.withStore(store => ({ preview: store.preview({ ...input, locator: input.locator ?? "upload" }) }))),
    bind(cogniaActions.scan, (input, caller) => ports.scan(input.path, caller.signal)),
    bind(cogniaActions.previewDirectory, async (input, caller) => { const actions = ports.actions(caller); const scanned = await actions.invoke(cogniaActions.scan, { path: input.path }); caller.signal?.throwIfAborted(); return actions.invoke(cogniaActions.preview, { ...scanned, kind: input.kind, source_id: input.source_id, domain_id: input.domain_id }); }),
    bind(cogniaActions.commit, input => ports.withStore(store => ({ receipt: store.commit(input.preview_id) }))),
    bind(cogniaActions.cancel, input => ports.withStore(store => { store.cancelPreview(input.preview_id); return { cancelled: true }; })),
    bind(cogniaActions.synthesize, async (input, caller) => ({ draft: await generateCogniaDraft(ports.withStore, { ...input, mode: "synthesize" }, { ...ports.ai(caller), beforeEffect: caller.beforeEffect }) }), available),
    bind(cogniaActions.query, async (input, caller) => ({ draft: await generateCogniaDraft(ports.withStore, { ...input, mode: "query" }, { ...ports.ai(caller), beforeEffect: caller.beforeEffect }) }), available),
    bind(cogniaActions.draft, input => ports.withStore(store => { const draft = store.drafts().find(d => d.id === input.id); requireCognia(draft, "草稿不存在", 404); return { draft }; })),
    bind(cogniaActions.saveDraft, input => ports.withStore(store => ({ material: store.saveDraft(input.id) }))),
    bind(cogniaActions.archiveDraft, input => ports.withStore(store => { store.archiveDraft(input.id); return { deleted: true }; })),
  ];
}
