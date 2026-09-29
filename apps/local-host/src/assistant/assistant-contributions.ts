/**
 * What each plugin contributes for the Assistant, read from the unified action directory, and what is missing with
 * why it matters. A plugin that follows the conventions is used without an Assistant branch of its own; one that does
 * not is named here with the exact gap, so its developer can close it.
 */
import { actionEffect, isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantContribution } from "@molis-ai/molis-work-contracts/services/assistant";

type Schema = { properties?: Record<string, { title?: unknown; description?: unknown }> };

export function assistantContributions(views: readonly ActionView[]): AssistantContribution[] {
  const agents = views.filter(view => view.action.audiences.includes("agent"));
  const providers = new Map<string, ActionView[]>();
  for (const view of agents) providers.set(view.provider.provider_id, [...providers.get(view.provider.provider_id) ?? [], view]);
  return [...providers.values()].map(rows => {
    const provider = rows[0]!.provider;
    const readers = rows.filter(view => isSubjectReader(view.action));
    const kinds = [...new Set(rows.flatMap(view => view.action.subject_kinds))];
    const readable = [...new Set(readers.flatMap(view => view.action.subject_kinds))];
    const commands = rows.filter(view => view.operation === "command" && actionEffect(view.action, view.capability_id) !== "read");
    const linked = commands.filter(view => view.action.result_subject || view.action.subject_kinds.length === 1);
    const searchable = rows.some(view => Boolean((view.action as { search_source?: unknown }).search_source));
    const undescribed = rows.filter(view => !view.action.description?.trim() || view.action.description.trim() === view.action.title.trim());
    const untitled = rows.filter(view => Object.values((view.action.input_schema as Schema | undefined)?.properties ?? {}).some(field => !field.title && !field.description));
    const gaps: AssistantContribution["gaps"] = [];
    if (kinds.length && !readable.length) gaps.push({ area: "context", text: `它的对象（${kinds.join("、")}）没有读取动作：助理不能回到对象读当前内容，也看不出你手动改过什么。按约定声明 subject.read（defineSubjectContextAction）。` });
    else for (const kind of kinds.filter(kind => !readable.includes(kind))) gaps.push({ area: "context", text: `对象种类 ${kind} 没有读取动作，助理不能读回这种对象。` });
    const unlinked = commands.filter(view => !linked.includes(view));
    if (unlinked.length) gaps.push({ area: "results", text: `${unlinked.length} 个修改动作没有说明结果是哪个对象（result_subject 或唯一的 subject_kinds）：助理改完后无法把结果关联回工作。例如：${unlinked.slice(0, 3).map(view => view.action.title).join("、")}` });
    if (undescribed.length) gaps.push({ area: "capabilities", text: `${undescribed.length} 个动作没有写清用途（描述为空或与标题相同）：助理难以判断何时该用。例如：${undescribed.slice(0, 3).map(view => view.action.title).join("、")}` });
    if (untitled.length) gaps.push({ area: "capabilities", text: `${untitled.length} 个动作的输入字段没有名称或说明：确认界面只能显示字段标识。例如：${untitled.slice(0, 3).map(view => view.action.title).join("、")}` });
    return { provider_id: provider.provider_id, title: provider.title, ...(provider.plugin_id ? { plugin_id: provider.plugin_id } : {}),
      actions: rows.length, reads: rows.filter(view => actionEffect(view.action, view.capability_id) === "read").length, changes: commands.length,
      readable_kinds: readable, linked_changes: linked.length, searchable, gaps };
  }).sort((a, b) => b.gaps.length - a.gaps.length || a.title.localeCompare(b.title, "zh-CN"));
}
