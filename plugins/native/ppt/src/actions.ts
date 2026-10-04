import { ActionError, defineArtifactPinAction, defineArtifactCompareAction, defineArtifactContinueAction, bindArtifactContinue, bindArtifactCompare, objectOrMissing, sameArtifactFields, bindObjectCopyHandler, bindObjectMoveHandler, defineObjectCopyAction, defineObjectMoveAction, type ActionDefinition, type ActionSchema, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { buildPptx, pptxFilename, PPTX_MIME_TYPE } from "./pptx.js";
import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { slidesFromMarkdown } from "./content-actions.js";
import { PPT_DRAFT_OUTLINE } from "./prompts.js";
import { PPT_ARTIFACT_TYPE_ID, PPT_PROJECT_PLUGIN_ID, type PptRecord, type PptSlideInput, PPT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/ppt";
import { promotePpt, type PptPublishArtifactPort, type PptReadArtifactPort } from "./promote.js";
import type { PptStore } from "./store.js";
import { createPptSearchHandlers, pptSearchActions } from "./search.js";
import { pptArtifactPreview, pptArtifactPreviewHandler } from "./artifact-preview.js";

const text = { type: "string" }, id = { ...text, minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const color = { ...text, pattern: "^#[0-9a-fA-F]{6}$" };
const slideFields = { id: text, title: text, bullets: { ...array(text), maxItems: 12 }, notes: text, order: { type: "integer" } };
const recordFields = { id, project_id: id, title: text, description: text, color_primary: color, color_background: color, color_text: color,
  slides: array(object(slideFields)), created_at: text, updated_at: text, version, artifact_id: text, artifact_version: { type: "integer", minimum: 0 } };
const record = object({ ...recordFields, publication_pending: object({ version, source_version: version }) }, Object.keys(recordFields));
const changed = object({ presentation: record }), identity = { id, expected_version: version };
const read = ["ppt:read"], write = ["ppt:read", "ppt:write"];
const outlineInput = object({ ...identity, text: { ...text, minLength: 1, maxLength: 20000 }, page_id: { ...id, maxLength: 200 }, replace: { type: "boolean" } }, ["id"]);
type Identity = { id: string; expected_version?: number };
/** Exactly one source: pasted text, or a Pages document read with the caller's own authority. */
type OutlineInput = Identity & { text?: string; page_id?: string; replace?: boolean };
type Edit = Identity & { title?: string; description?: string; color_primary?: string; color_background?: string; color_text?: string; slides?: readonly PptSlideInput[] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[] = operation === "query" ? read : write, execution?: ActionDefinition["action"]["execution"]): ActionDefinition<I, O> {
  // An action that waits on a model discloses the cost and runs beside the serial queue, like Forms' AI drafting.
  return { capability_id: `ppt.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}), kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], subject_kinds: [PPT_SUBJECT_KIND], input_schema: input, output_schema: output, permissions, ...(name === "outline_ai" ? { scheduling: "concurrent" as const } : {}) } };
}
export const pptActions = {
  /** A pinned version as the 成果库 and side panel show it (artifact-positioning A4). */
  artifactPreview: pptArtifactPreview,
  /** Pins the current revision on the spot, for a Goal handing it in (A5); the same publication as `promote`. */
  artifactPin: defineArtifactPinAction("ppt.artifacts.pin", PPT_SUBJECT_KIND, "演示稿", [...write, "artifact:write"]),
  /** Whether a pinned version still matches the ppt object it came from (A4b, 「原文已改」); compares content, not revisions. */
  artifactCompare: defineArtifactCompareAction("ppt.artifacts.compare", "演示稿", read),
  /** 「从这一版继续」 (A4b): a new 演示稿 with the content of a pinned version; the version itself is unchanged. */
  artifactContinue: defineArtifactContinueAction("ppt.artifacts.continue", "演示稿", write),
  list: define<Record<string, never>, { presentations: PptRecord[]; ai_available: boolean; ai_unavailable_reason: string | null }>("list", "演示稿列表", "读取当前项目的演示稿，以及当前调用方能否让模型整理大纲", "query", object({}),
    object({ presentations: array(record), ai_available: { type: "boolean" }, ai_unavailable_reason: { type: ["string", "null"] } })),
  get: define<{ id: string }, { presentation: PptRecord }>("get", "读取演示稿", "读取幻灯片、配色、版本和发布状态；id 来自列表或创建结果", "query", object({ id }), changed),
  create: define<{ title?: string }, { presentation: PptRecord }>("create", "新建演示稿", "创建带一页空白幻灯片的演示稿", "command", object({ title: { ...text, maxLength: 80 } }, []), changed),
  update: define<Edit, { presentation: PptRecord }>("update", "编辑演示稿", "替换指定字段或整组幻灯片；提交读取版本以避免覆盖其他编辑", "command", object({ ...identity, title: { ...text, maxLength: 80 }, description: { ...text, maxLength: 2000 }, color_primary: color, color_background: color, color_text: color,
    slides: { ...array(object(slideFields, [])), minItems: 1, maxItems: 40 } }, ["id"]), changed),
  delete: define<Identity, { ok: true }>("delete", "删除演示稿", "删除当前项目演示稿，待恢复的成果发布需先完成", "command", object(identity, ["id"]), object({ ok: { const: true } })),
  export: define<Identity, { filename: string; mime_type: "application/json"; content: string }>("export", "导出演示稿 JSON", "返回已保存演示稿的完整 JSON、文件名和 MIME 类型；不是 PPTX", "query", object(identity, ["id"]), object({ filename: text, mime_type: { const: "application/json" }, content: text })),
  promote: define<Identity, { presentation: PptRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "演示稿存为成果", "发布固定幻灯片与配色或恢复原发布；后续编辑保留", "command", object(identity, ["id"]), object({ presentation: record, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...write, "artifact:write"]),
  pptx: define<Identity, { filename: string; mime_type: typeof PPTX_MIME_TYPE; content_base64: string; slide_count: number }>("pptx", "导出 PowerPoint 文件",
    "按已保存的版本生成 .pptx（每页标题、要点、讲者备注与配色），PowerPoint、Keynote、WPS 可直接打开和放映；不含图片与图表", "query", object(identity, ["id"]),
    object({ filename: text, mime_type: { const: PPTX_MIME_TYPE }, content_base64: text, slide_count: { type: "integer", minimum: 1 } })),
  outline: define<OutlineInput, { presentation: PptRecord; slide_count: number }>("outline", "按文字生成大纲",
    "把一段要点或 Markdown 变成幻灯片：`#` 是演示稿标题，`##` 分页，列表成为要点，`>` 成为讲者备注；没有标题时每 6 条要点一页。也可以给 page_id 用一篇 Pages 文档的正文（以调用者自己的权限读取）。追加到现有页之后，或替换现有页；本地处理，不调用模型", "command",
    outlineInput, object({ presentation: record, slide_count: { type: "integer", minimum: 1 } })),
  outlineAi: define<OutlineInput, { presentation: PptRecord; slide_count: number }>("outline_ai", "AI 整理成大纲",
    "让当前文字模型把一段文字或一篇 Pages 文档整理成幻灯片大纲，再按标题分页；模型失败、返回空或演示稿已变化时不写入", "command",
    outlineInput, object({ presentation: record, slide_count: { type: "integer", minimum: 1 } }), [...write, "model:invoke"], { cost: "metered" }),
  outlinePages: define<Record<string, never>, { documents: Array<{ id: string; title: string; updated_at: string | null }> }>("outline_pages", "可做成大纲的文档",
    "列出当前项目里可以拿来生成大纲的 Pages 文档（以调用者自己的权限读取）；Pages 未启用或无权读取时返回空列表与原因", "query", object({}),
    object({ documents: array(object({ id, title: text, updated_at: { type: ["string", "null"] } })), unavailable_reason: { type: ["string", "null"] } }, ["documents"]), [...read, "pages:read"]),
  move: defineObjectMoveAction("ppt.placement.move", [PPT_SUBJECT_KIND], "演示稿", write),
  copy: defineObjectCopyAction("ppt.placement.copy", [PPT_SUBJECT_KIND], "演示稿", write),
  searchEntries: pptSearchActions.entries,
  files: pptSearchActions.files,
  subject: pptSearchActions.subject,
};
export const PPT_ACTION_PERMISSIONS = [...new Set(Object.values(pptActions).flatMap(definition => definition.action.permissions))];
export interface PptActionPorts {
  withStore<T>(run: (store: PptStore) => T): T;
  /** Whether the current text model can be asked; absent means no model in this environment. */
  modelAvailability?(): ActionAvailability;
  completeText?(prompt: InstructedPrompt, options: { signal?: AbortSignal }): Promise<string>;
  /** Pages documents through Pages' public content actions, with the caller's own authority; absent when Pages is not reachable. */
  listPages?(caller: ActionCallContext): Promise<Array<{ id: string; title: string; updated_at: string | null }>>;
  readPage?(pageId: string, caller: ActionCallContext): Promise<{ title: string; body: string }>;
  publishArtifact?: (input: Parameters<PptPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<PptPublishArtifactPort>;
  readArtifact?: (input: Parameters<PptReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<PptReadArtifactPort>;
}
/** Slides parsed from an outline join the deck after its pages, or replace them; a deck that is still one blank page is simply filled. */
function applyOutline(store: PptStore, input: { id: string; expected_version?: number; replace?: boolean }, projectId: string, markdown: string): { presentation: PptRecord; slide_count: number } {
  const current = store.get(input.id, projectId);
  if (input.expected_version !== undefined && current.version !== input.expected_version) throw new ActionError("ppt.conflict", "演示稿已改变，请重新读取后生成");
  const parsed = slidesFromMarkdown(markdown, current.title);
  const blank = current.slides.length === 1 && !current.slides[0]!.bullets.length && !current.slides[0]!.notes;
  const kept = input.replace || blank ? [] : current.slides.map(slide => ({ id: slide.id, title: slide.title, bullets: slide.bullets, notes: slide.notes }));
  const slides = [...kept, ...parsed.slides].slice(0, 40);
  const untitled = current.title === "未命名演示稿" && parsed.title && parsed.title !== current.title;
  const presentation = store.update(input.id, { slides, ...(untitled ? { title: parsed.title } : {}), expected_version: current.version }, projectId);
  return { presentation, slide_count: Math.min(parsed.slides.length, 40 - kept.length) };
}

export function createPptActionHandlers(ports: PptActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  // The text an outline is made from: what was pasted, or a Pages document as Markdown with its title as the deck title.
  const outlineSource = async (input: OutlineInput, caller: ActionCallContext): Promise<string> => {
    if ((input.text === undefined) === (input.page_id === undefined)) throw new ActionError("ppt.invalid", "请给出一段文字，或选一篇文档");
    if (input.text !== undefined) return input.text;
    if (!ports.readPage) throw new ActionError("actions.connection_required", "Pages 不可用，无法读取文档");
    const page = await ports.readPage(input.page_id!, caller);
    const body = page.body.trim();
    return /^#\s/u.test(body) ? body : `# ${page.title}\n\n${body}`;
  };
  const modelAvailability = (): ActionAvailability => ports.modelAvailability ? ports.modelAvailability() : { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  const promote = (id: string, caller: ActionCallContext, expectedVersion?: number) => ports.withStore(store => promotePpt(store, id, project(caller), value => ports.publishArtifact!(value, caller),
    { actorId: caller.actor_id, expectedVersion, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined }));
  const publishable = () => ports.publishArtifact ? { available: true as const } : { available: false as const, code: "ppt.unavailable", reason: "当前环境不能发出成果" };
  return [
    pptArtifactPreviewHandler,
    bind(pptActions.list, (_, caller) => {
      const ai = modelAvailability(), permitted = pptActions.outlineAi.action.permissions.every(p => caller.permissions.includes(p))
        && (!caller.allowed_capability_ids || caller.allowed_capability_ids.includes(pptActions.outlineAi.capability_id));
      return ports.withStore(store => ({ presentations: store.list(project(caller)), ai_available: ai.available && permitted,
        ai_unavailable_reason: !permitted ? "当前调用方未获 AI 整理大纲的授权" : ai.available ? null : ai.reason ?? "请先配置可用的文字模型" }));
    }),
    bind(pptActions.get, (input, caller) => ports.withStore(store => ({ presentation: store.get(input.id, project(caller)) }))),
    bind(pptActions.create, (input, caller) => ports.withStore(store => ({ presentation: store.create({ ...input, project_id: project(caller) }) }))),
    bind(pptActions.update, (input, caller) => ports.withStore(store => ({ presentation: store.update(input.id, input, project(caller)) }))),
    bind(pptActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller), input.expected_version); return { ok: true }; })),
    bind(pptActions.export, (input, caller) => ports.withStore(store => {
      const presentation = store.get(input.id, project(caller));
      if (input.expected_version !== undefined && input.expected_version !== presentation.version) throw new ActionError("ppt.conflict", "演示稿已改变，请重新读取后导出");
      return { filename: presentation.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") + ".json", mime_type: "application/json" as const, content: JSON.stringify(presentation, null, 2) };
    })),
    bind(pptActions.promote, (input, caller) => promote(input.id, caller, input.expected_version), publishable),
    bind(pptActions.artifactPin, (input, caller) => { const { artifact, recovered } = promote(input.subject_id, caller); return { artifact, recovered }; }, publishable),
    bindArtifactContinue(pptActions.artifactContinue, [PPT_ARTIFACT_TYPE_ID], (artifact, caller) => ports.withStore(store => {
      const payload = (artifact.payload ?? {}) as Record<string, unknown>, at = project(caller);
      const created = store.create({ title: typeof payload.title === "string" ? payload.title : artifact.title, project_id: at });
      // A version the editor cannot take leaves no empty 演示稿 behind.
      try { store.update(created.id, Object.fromEntries(["description", "color_primary", "color_background", "color_text", "slides"].filter(field => payload[field] !== undefined).map(field => [field, payload[field]])), at); }
      catch (error) { store.delete(created.id, at); throw error; }
      return { surface: PPT_PROJECT_PLUGIN_ID, id: created.id, title: created.title };
    })),
    bindArtifactCompare(pptActions.artifactCompare, PPT_ARTIFACT_TYPE_ID, (id, caller) => objectOrMissing(() => ports.withStore(store => store.get(id, project(caller)))),
      (payload, object) => sameArtifactFields(payload, object, ["title", "description", "color_primary", "color_background", "color_text", "slides"])),
    bind(pptActions.pptx, (input, caller) => ports.withStore(store => {
      const presentation = store.get(input.id, project(caller));
      if (input.expected_version !== undefined && input.expected_version !== presentation.version) throw new ActionError("ppt.conflict", "演示稿已改变，请重新读取后导出");
      return { filename: pptxFilename(presentation.title), mime_type: PPTX_MIME_TYPE, content_base64: Buffer.from(buildPptx(presentation)).toString("base64"), slide_count: presentation.slides.length };
    })),
    bind(pptActions.outlinePages, async (_input, caller) => {
      if (!ports.listPages) return { documents: [], unavailable_reason: "Pages 不可用" };
      try { return { documents: await ports.listPages(caller), unavailable_reason: null }; }
      catch (error) { return { documents: [], unavailable_reason: error instanceof Error ? error.message : "读不到 Pages 文档" }; }
    }),
    bind(pptActions.outline, async (input, caller) => {
      const source = await outlineSource(input, caller);
      return ports.withStore(store => applyOutline(store, input, project(caller), source));
    }),
    bind(pptActions.outlineAi, async (input, caller) => {
      const current = ports.withStore(store => store.get(input.id, project(caller)));
      if (input.expected_version !== undefined && current.version !== input.expected_version) throw new ActionError("ppt.conflict", "演示稿已改变，请重新读取后生成");
      const source = await outlineSource(input, caller);
      caller.signal?.throwIfAborted();
      if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
      const markdown = (await ports.completeText(instructed(PPT_DRAFT_OUTLINE, JSON.stringify({ text: source })), { signal: caller.signal })).trim();
      caller.signal?.throwIfAborted();
      if (!markdown) throw new ActionError("ppt.invalid", "模型没有返回大纲，请调整文字后重试");
      await caller.beforeEffect();
      return ports.withStore(store => applyOutline(store, { ...input, expected_version: current.version }, project(caller), markdown));
    }, () => modelAvailability()),
    bindObjectMoveHandler(pptActions.move, input => ports.withStore(store => {
      const presentation = store.relocate(input.subject.id, input.from_project_id, input.to_project_id);
      return { subject: { kind: PPT_SUBJECT_KIND, id: presentation.id }, project_id: presentation.project_id, revision: String(presentation.version) };
    })),
    bindObjectCopyHandler(pptActions.copy, input => ports.withStore(store => {
      const presentation = store.duplicate(input.subject.id, input.from_project_id, input.to_project_id, input.request_id);
      return { subject: { kind: PPT_SUBJECT_KIND, id: presentation.id }, project_id: presentation.project_id, revision: String(presentation.version) };
    })),
    ...createPptSearchHandlers(ports.withStore),
  ];
}
