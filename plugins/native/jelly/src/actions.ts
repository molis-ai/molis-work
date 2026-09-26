import type { ActionAvailability, ActionCallContext, ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JellyItem, JellySeries, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { runJellyAi, type JellyAiInput, type JellyAiPorts } from "./ai.js";
import { jellyOccurrences, jellyProgress } from "./calendar.js";
import { jellySourceHash } from "./content.js";
import { JellyError } from "./error.js";
import { jellyNoteToHtml, jellyNoteToMarkdown } from "./markdown.js";
import type { JellyPreview, JellyStore } from "./store.js";
import { createJellyCommandHandlers, defineJellyAction as define, jellyCommandActions, JELLY_READ, JELLY_WRITE } from "./command-actions.js";
import * as s from "./action-schema.js";
import { jellyServiceActions } from "./service-actions.js";

type Range = { start: string; end: string };
type AiInput = Omit<JellyAiInput, "kind" | "manual">;
type AiResult = Awaited<ReturnType<typeof runJellyAi>> & { state?: JellyWorkspace };
const range = s.object({ start: s.date, end: s.date });
const aiInput = { ...s.object({ source_type: { enum: ["note", "inspiration", "text"] }, source_id: s.nullable(s.id), text: s.text, instructions: s.text, today: s.date, start_time: { type: "integer", minimum: 0, maximum: 1439 }, selection: s.selection }, ["source_type"]),
  allOf: [{ if: { properties: { source_type: { const: "text" } }, required: ["source_type"] },
    then: { properties: { text: { ...s.id, pattern: "\\S" } }, required: ["text"] },
    else: { properties: { source_id: s.id }, required: ["source_id"] } }],
};
const planOutput = s.object({ plan: s.plan, method: { enum: ["manual", "model"] } });
const progress = s.object({ start: s.date, end: s.date, today: s.date, total: s.revision, completed_count: s.revision, open_count: s.revision, overdue_count: s.revision, high_priority_open: s.revision, completed: s.array(s.occurrence), open: s.array(s.occurrence), overdue: s.array(s.occurrence), categories: s.array(s.object({ ...s.categoryFields, total: s.revision, completed: s.revision })), factual_summary: s.text });
export const jellyActions = {
  state: define<Record<string, never>, { state: JellyWorkspace; capabilities: { ai: boolean } }>("workspace.get", "读取 Jelly 工作区", "读取本机日历、笔记、灵感及当前版本；不会把项目授权扩展为私人数据授权", "query", s.object({}), s.object({ state: s.workspace, capabilities: s.object({ ai: s.boolean }) })),
  export: define<Record<string, never>, { workspace: JellyWorkspace }>("workspace.export", "导出 Jelly 备份", "读取完整工作区 JSON，保留原始导入来源和稳定引用", "query", s.object({}), s.object({ workspace: s.workspace })),
  calendar: define<Range, { revision: number; items: ReturnType<typeof jellyOccurrences> }>("calendar.list", "读取日历事项", "按日期展开一次性事项和重复实例，返回工作区 revision", "query", range, s.object({ revision: s.revision, items: s.array(s.occurrence) })),
  progress: define<Range & { today: string; category_ids?: string[] }, { progress: ReturnType<typeof jellyProgress> }>("calendar.progress", "读取日历进展", "汇总日期范围内完成、未完成、延期及分类事实，可按分类筛选", "query", s.object({ start: s.date, end: s.date, today: s.date, category_ids: s.array(s.id) }, ["start", "end", "today"]), s.object({ progress })),
  item: define<{ id: string }, { revision: number; item: JellyItem | JellySeries }>("item.get", "读取日历事项或系列", "使用已有 ID 读取一次性事项或重复系列，包括原始重复规则", "query", s.object({ id: s.id }), s.object({ revision: s.revision, item: { anyOf: [s.item, s.series] } })),
  categories: define<Record<string, never>, { revision: number; categories: JellyWorkspace["categories"] }>("category.list", "读取 Jelly 分类", "读取分类及当前工作区版本", "query", s.object({}), s.object({ revision: s.revision, categories: s.array(s.category) })),
  search: define<{ query: string }, { revision: number; items: (JellyItem | JellySeries)[]; notes: JellyWorkspace["notes"]; inspirations: JellyWorkspace["inspirations"] }>("search", "搜索 Jelly 内容", "搜索日历标题与随记、未归档笔记和灵感原文", "query", s.object({ query: { ...s.id, pattern: "\\S" } }), s.object({ revision: s.revision, items: s.array({ anyOf: [s.item, s.series] }), notes: s.array(s.note), inspirations: s.array(s.inspiration) })),
  exportNote: define<{ id: string; format?: "markdown" | "html" }, { content: string; filename: string; mime: string }>("note.export", "导出笔记正文", "将一篇笔记导出为 Markdown 或 HTML", "query", s.object({ id: s.id, format: { enum: ["markdown", "html"] } }, ["id"]), s.object({ content: s.text, filename: s.text, mime: s.text })),
  previewImport: define<{ source: unknown }, { preview: JellyPreview }>("workspace.import_preview", "预览 Jelly 备份导入", "校验完整备份，保存与来源及当前版本绑定的确认凭证；不导入内容", "command", s.object({ source: s.importSource }), s.object({ preview: s.preview })),
  previewNoteDelete: define<{ id: string }, { preview: JellyPreview }>("note.delete_preview", "预览笔记永久删除", "要求笔记已归档；列出关联影响并保存确认凭证", "command", s.object({ id: s.id }), s.object({ preview: s.preview })),
  previewInspirationDelete: define<{ id: string }, { preview: JellyPreview }>("inspiration.delete_preview", "预览灵感永久删除", "要求灵感已归档；保留已生成的笔记并保存确认凭证", "command", s.object({ id: s.id }), s.object({ preview: s.preview })),
  manualPlan: define<AiInput, AiResult>("plan.manual", "按原文逐行拆解", "将原文逐行形成待采纳任务，不使用模型，不写入笔记或日历", "query", aiInput, planOutput),
  modelPlan: define<AiInput, AiResult>("plan.generate", "模型拆解行动计划", "根据原文或笔记选区生成待采纳任务；不自动写入或执行任务", "command", aiInput, planOutput, [...JELLY_READ, "model:invoke"], "concurrent"),
  digest: define<AiInput, AiResult>("inspiration.summarize", "提炼素材摘要", "保留逐条证据；灵感来源在生成结束后重新检查原文和素材，再保存摘要", "command", aiInput, s.object({ digest: s.digest, state: s.workspace }, ["digest"]), [...JELLY_WRITE, "model:invoke"], "concurrent"),
};
export const JELLY_ACTIONS: readonly ActionDefinition[] = [...Object.values(jellyCommandActions), ...Object.values(jellyActions), ...Object.values(jellyServiceActions)];
export const JELLY_ACTION_PERMISSIONS = [...new Set(JELLY_ACTIONS.flatMap(definition => definition.action.permissions))];
export interface JellyActionPorts {
  withStore<T>(run: (store: JellyStore) => T): T;
  modelAvailability(): ActionAvailability;
  ai(caller: ActionCallContext): JellyAiPorts;
}
export function createJellyActionHandlers(ports: JellyActionPorts): ActionHandlerBinding[] {
  const read = <T>(run: (state: JellyWorkspace) => T) => ports.withStore(store => run(store.read()));
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  const ai = async (input: AiInput, kind: JellyAiInput["kind"], manual: boolean, caller: ActionCallContext): Promise<AiResult> => {
    caller.signal?.throwIfAborted();
    const before = read(state => state);
    const result = await runJellyAi(before, { ...input, kind, manual }, { ...(manual ? {} : ports.ai(caller)), signal: caller.signal });
    caller.signal?.throwIfAborted();
    if ("digest" in result && input.source_type === "inspiration" && input.source_id) {
      return ports.withStore(store => {
        const latest = store.read();
        if (jellySourceHash(latest, "inspiration", input.source_id!) !== result.digest.source_hash) throw new JellyError("jelly.conflict", "提炼时原文发生变化，请重新提炼");
        if (before.inspirations.find(source => source.id === input.source_id)?.material?.content_fingerprint !== latest.inspirations.find(source => source.id === input.source_id)?.material?.content_fingerprint) throw new JellyError("jelly.conflict", "提炼时素材已重新读取，请根据新内容重新提炼");
        return { ...result, state: store.execute({ type: "inspiration.update", id: input.source_id, patch: { digest: result.digest } }, latest.revision) };
      });
    }
    return result;
  };
  return [...createJellyCommandHandlers(ports.withStore),
    bind(jellyActions.state, () => read(state => ({ state, capabilities: { ai: ports.modelAvailability().available } }))),
    bind(jellyActions.export, () => ports.withStore(store => ({ workspace: store.export() }))),
    bind(jellyActions.calendar, input => read(state => ({ revision: state.revision, items: jellyOccurrences(state, input.start, input.end) }))),
    bind(jellyActions.progress, input => read(state => ({ progress: jellyProgress(state, input.start, input.end, input.today, input.category_ids) }))),
    bind(jellyActions.item, input => read(state => { const item = state.items.find(i => i.id === input.id) ?? state.series.find(i => i.id === input.id); if (!item) throw new JellyError("jelly.not_found", "事项不存在", 404); return { revision: state.revision, item }; })),
    bind(jellyActions.categories, () => read(state => ({ revision: state.revision, categories: state.categories }))),
    bind(jellyActions.search, input => read(state => {
      const query = input.query.trim().toLocaleLowerCase(), matches = (text: string) => text.toLocaleLowerCase().includes(query);
      return { revision: state.revision, items: [...state.items, ...state.series].filter(i => matches(i.title + "\n" + i.notes)), notes: state.notes.filter(i => !i.archived_at && matches(i.title + "\n" + i.blocks.map(b => b.text).join("\n"))), inspirations: state.inspirations.filter(i => !i.archived_at && matches(i.title + "\n" + i.raw_text + "\n" + (i.url ?? ""))) };
    })),
    bind(jellyActions.exportNote, input => read(state => {
      const note = state.notes.find(n => n.id === input.id); if (!note) throw new JellyError("jelly.not_found", "笔记不存在", 404);
      const html = input.format === "html";
      return { content: html ? jellyNoteToHtml(note) : jellyNoteToMarkdown(note), filename: note.title.replace(/[\/\\:*?"<>|]/gu, "-").slice(0, 100) + (html ? ".html" : ".md"), mime: html ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" };
    })),
    bind(jellyActions.previewImport, input => ports.withStore(store => ({ preview: store.previewImport(input.source) }))),
    bind(jellyActions.previewNoteDelete, input => ports.withStore(store => ({ preview: store.previewDelete(input.id) }))),
    bind(jellyActions.previewInspirationDelete, input => ports.withStore(store => ({ preview: store.previewDeleteInspiration(input.id) }))),
    bind(jellyActions.manualPlan, (input, caller) => ai(input, "decompose", true, caller)),
    bind(jellyActions.modelPlan, (input, caller) => ai(input, "decompose", false, caller), () => ports.modelAvailability()),
    bind(jellyActions.digest, (input, caller) => ai(input, "digest", false, caller), () => ports.modelAvailability()),
  ];
}
