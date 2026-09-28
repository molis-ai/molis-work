import { composeInstructedPrompt, instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { INFORMATION_PLANNER } from "./agent-definitions/system-prompts.js";
import type { FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { HostCompleteText } from "./host-complete-text.js";

/** Read-only proposals. Confirmed actions run through the existing plugin HTTP contracts. */
export async function planInformationWork(snapshot: FeedSnapshot, projectId: string, body: Record<string, unknown>, completeText?: HostCompleteText, authority?: Parameters<HostCompleteText>[1],
  /** The registered instructions as the person left them; without it, the shipped default. */
  resolve?: (prompt: InstructedPrompt) => string) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 4000) throw new Error("请用 1–4000 字说明要筛选或整理什么");
  if (!completeText) throw new Error("尚未配置助手模型");
  const sourceIds = new Set(snapshot.sources.filter(source => source.enabled).map(source => source.source_id));
  const items = snapshot.feed_items.slice(0, 20).map(item => ({ id: item.item_id, source_id: item.source_id, title: item.title, summary: item.summary.slice(0, 1000) }));
  const inbox = snapshot.inbox_entries.filter(entry => entry.subject_type === "feed_item" && ["open", "in_progress"].includes(entry.status))
    .slice(0, 20).map(entry => ({ entry_id: entry.entry_id, item_id: entry.subject_id, title: snapshot.feed_items.find(item => item.item_id === entry.subject_id)?.title ?? "" }));
  const context = { project_id: projectId, selected_item_id: items.some(item => item.id === body.selected_item_id) ? body.selected_item_id : null,
    sources: snapshot.sources.filter(source => sourceIds.has(source.source_id)).map(source => ({ source_id: source.source_id, name: source.name })), items, inbox };
  await authority?.beforeDispatch?.();
  const result = await completeText((resolve ?? (value => composeInstructedPrompt(value.instruction.body, value.data)))(
    instructed(INFORMATION_PLANNER, ["当前范围：" + JSON.stringify(context), "用户请求：" + prompt].join("\n\n"))), authority);
  await authority?.beforeDispatch?.();
  const cleaned = result.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed: { message?: unknown; action?: Record<string, unknown> | null };
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("助手没有返回有效方案，请重试"); }
  const message = typeof parsed.message === "string" ? parsed.message.slice(0, 4000) : "请检查以下方案后执行。";
  const action = parsed.action;
  if (action == null) return { message, action: null, context: { project_id: projectId, items: items.length, inbox: inbox.length } };
  const text = (key: string, max: number) => { const value = action[key]; if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("助手方案字段不完整，请重试"); return value.trim(); };
  if (action.kind === "configure_filter") {
    const source_id = text("source_id", 128); const sample_item_id = text("sample_item_id", 128);
    if (!sourceIds.has(source_id) || !items.some(item => item.id === sample_item_id && item.source_id === source_id)) throw new Error("助手选择的来源或样本不在当前项目");
    return { message: "已准备规则方案。点击后才会创建草稿并调用 Jev 试跑；试跑后再确认是否启用。", action: { kind: "configure_filter", source_id, sample_item_id, name: text("name", 80), instructions: text("instructions", 4000) }, context: { project_id: projectId, items: items.length, inbox: inbox.length } };
  }
  if (action.kind === "draft_pages") {
    const entry_ids = Array.isArray(action.entry_ids) ? [...new Set(action.entry_ids)] : [];
    if (!entry_ids.length || !entry_ids.every(id => typeof id === "string" && inbox.some(entry => entry.entry_id === id))) throw new Error("助手选择的材料不在当前 Inbox");
    return { message: "已准备写作要求。检查所选材料后点击生成，文稿才会保存到 Pages。", action: { kind: "draft_pages", entry_ids, title: text("title", 80), instructions: text("instructions", 4000) }, context: { project_id: projectId, items: items.length, inbox: inbox.length } };
  }
  throw new Error("助手提出了当前不支持的动作");
}
