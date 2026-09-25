import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parseFileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectTextStats, waitingStats, unavailableStats, countCodePoints, countLines, type TextStatsView } from "./core.js";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, number = { type: "integer", minimum: 0 };
const counts = { characters: number, utf8_bytes: number, lines: number };
const view = object({ phase: { enum: ["waiting", "unavailable", "ready"] }, message: text, recovery: text,
  source: object({ workspace_name: text, path: text, source_plugin_id: text, content_version: { type: "integer", minimum: 1 } }),
  ...counts }, ["phase", "message"]);
const base = { kind: "query" as const, scope: "project" as const, audiences: ["user", "agent", "workflow", "mcp"] as const, subject_kinds: ["text", "artifact"] };
export const textStatsActions = {
  state: { capability_id: "text-stats.state", version: 1, operation: "query", action: { ...base,
    title: "读取快照统计", description: "统计当前明确绑定的固定文本版本；输入缺失或不可用时保留状态，不读取当前磁盘", permissions: ["artifact:read"],
    input_schema: object({}), output_schema: object({ view }) } } as ActionDefinition<Record<string, never>, { view: TextStatsView }>,
  count: { capability_id: "text-stats.count", version: 1, operation: "query", action: { ...base,
    title: "统计文本", description: "计算给定文本的 Unicode 字符、UTF-8 字节和行数，不保存内容或改变输入绑定", permissions: [],
    input_schema: object({ text: { type: "string", maxLength: 2_000_000 } }), output_schema: object(counts) } } as ActionDefinition<{ text: string }, { characters: number; utf8_bytes: number; lines: number }>,
};
export const TEXT_STATS_ACTIONS = Object.values(textStatsActions);
export function textStatsActionHandlers(context: PluginStartContext): ActionHandlerBinding[] {
  return [{ ...textStatsActions.state, handle: () => {
    try {
      const record = context.services?.inputs?.read("text");
      if (!record) return { view: waitingStats() };
      if (record.availability !== "available" || record.lifecycle_state !== "active") return { view: unavailableStats() };
      return { view: projectTextStats({ snapshot: parseFileSnapshot(record.payload), source_plugin_id: record.producer_plugin_id, content_version: record.version }) };
    } catch { return { view: unavailableStats() }; }
  } }, { ...textStatsActions.count, handle: (_caller, input) => {
    const { text } = input as { text: string };
    return { characters: countCodePoints(text), utf8_bytes: new TextEncoder().encode(text).byteLength, lines: countLines(text) };
  } }];
}
