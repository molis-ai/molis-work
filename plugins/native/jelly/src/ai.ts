import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { JELLY_DECOMPOSE } from "./prompts.js";
import { createHash, randomUUID } from "node:crypto";
import type { JellyPlan, JellyPlanAction, JellySchedule, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { jellySourceHash } from "./content.js";
import { jellyOccurrences } from "./calendar.js";
import { JellyError } from "./error.js";

export interface JellyAiPorts {
  completeJson?: (prompt: InstructedPrompt, options?: { signal?: AbortSignal }) => Promise<unknown>;
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
export interface JellyAiInput {
  kind: "decompose";
  source_type: "note" | "text";
  source_id?: string | null; text?: string; instructions?: string; today?: string; start_time?: number; manual?: boolean;
  selection?: { block_ids: string[]; text: string };
}
function sourceText(state: JellyWorkspace, input: JellyAiInput): string {
  if (input.source_type === "note") {
    const note = state.notes.find((n) => n.id === input.source_id && !n.archived_at);
    if (!note) throw new JellyError("jelly.not_found", "找不到原笔记");
    if (input.selection) {
      const ids = input.selection.block_ids;
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || typeof input.selection.text !== "string" || !input.selection.text.trim()) throw new JellyError("jelly.invalid", "请选择笔记中的连续正文");
      const selected = note.blocks.filter(block => ids.includes(block.id));
      const indices = selected.map(block => note.blocks.indexOf(block));
      if (selected.length !== ids.length || selected.some((block, index) => block.id !== ids[index]) || indices.some((index, n) => n > 0 && index !== indices[n - 1]! + 1) || !selected.map(block => block.text).join("\n").includes(input.selection.text)) throw new JellyError("jelly.source_changed", "选区已变化，请重新选择正文");
      return input.selection.text;
    }
    return note.blocks.map((b) => b.text).join("\n");
  }
  return input.text?.trim() ?? "";
}
function addDay(day: string, n: number): string { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** Propose free 15-minute slots; all-day records do not reserve timed capacity. */
export function scheduleJellyActions(state: JellyWorkspace, actions: JellyPlanAction[], today: string, firstMinute = 540, durations: number[] = []): JellyPlanAction[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today) || !Number.isFinite(Date.parse(today)) || !Number.isFinite(firstMinute)) throw new JellyError("jelly.invalid", "安排的日期或时间无效");
  const occupied: JellySchedule[] = jellyOccurrences(state, today, addDay(today, 6)).filter((item) => item.start_time !== null);
  return actions.map((action, index) => {
    const duration = [15, 30, 45, 60, 90].includes(durations[index]) ? durations[index]! : 30;
    let schedule: JellySchedule | null = null;
    for (let dayOffset = 0; dayOffset < 7 && !schedule; dayOffset++) {
      const day = addDay(today, dayOffset);
      for (let minute = dayOffset === 0 ? Math.max(540, Math.ceil(firstMinute / 15) * 15) : 540; minute + duration <= 1260; minute += 15) {
        const free = !occupied.some((item) => {
          if (item.start_date > day || item.end_date < day) return false;
          const start = item.start_date < day ? 0 : item.start_time!;
          const end = item.end_date > day ? 1440 : item.end_time!;
          return minute < end && minute + duration > start;
        });
        if (free) { schedule = { start_date: day, end_date: day, start_time: minute, end_time: minute + duration }; occupied.push(schedule); break; }
      }
    }
    return { ...action, duration_minutes: duration as JellyPlanAction["duration_minutes"], schedule };
  });
}

function cancelled(ports: JellyAiPorts): void { if (ports.signal?.aborted) throw new JellyError("jelly.cancelled", "整理已取消，原始材料保留"); }
async function complete(ports: JellyAiPorts, prompt: InstructedPrompt): Promise<unknown> {
  cancelled(ports);
  if (!ports.completeJson) throw new JellyError("jelly.ai_unavailable", "尚未配置文字模型。原始素材已保留，可以先转为笔记。");
  try { return await ports.completeJson(prompt, { signal: ports.signal }); }
  finally { cancelled(ports); }
}
export async function runJellyAi(state: JellyWorkspace, input: JellyAiInput, ports: JellyAiPorts): Promise<{ plan: JellyPlan; method: "model" | "manual" }> {
  if (!["note", "text"].includes(input.source_type)) throw new JellyError("jelly.invalid", "请选择原文");
  const text = sourceText(state, input);
  const sourceHash = jellySourceHash(state, input.source_type, input.source_id ?? null, text);
  if (input.kind !== "decompose") throw new JellyError("jelly.invalid", "未知的整理操作");
  if (!text.trim() || text.length > 80_000) throw new JellyError("jelly.invalid", "需要一段不超过 8 万字的原文");
  let entries: unknown[]; let questions: string[] = [];
  if (input.manual) entries = text.split(/\n+/u).filter((line) => line.trim()).slice(0, 30).map((title) => ({ title: title.replace(/^[-*#\d.\s]+/u, "").slice(0, 200), notes: "", minutes: 30 }));
  else {
    if (!ports.completeJson) throw new JellyError("jelly.ai_unavailable", "尚未配置文字模型。可以使用手工拆解，再逐项编辑和安排。");
    const result = await complete(ports, instructed(JELLY_DECOMPOSE, `用户补充：${input.instructions ?? ""}\n<原文>\n${text}\n</原文>`));
    entries = result && typeof result === "object" && "actions" in result && Array.isArray(result.actions) ? result.actions : [];
    questions = result && typeof result === "object" && "clarification_questions" in result && Array.isArray(result.clarification_questions) ? result.clarification_questions.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 3).map(q => q.slice(0, 500)) : [];
  }
  if ((!entries.length && !questions.length) || entries.length > 30) throw new JellyError("jelly.ai_invalid", "计划需要 1 至 30 个动作，请重试或手工拆解");
  const durations: number[] = [];
  let actions = entries.map((entry): JellyPlanAction => {
    if (!entry || typeof entry !== "object" || !("title" in entry) || typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 500) throw new JellyError("jelly.ai_invalid", "计划里有无效事项，未写入日历");
    durations.push("minutes" in entry && typeof entry.minutes === "number" ? entry.minutes : 30);
    const minutes = durations[durations.length - 1]!;
    return { id: randomUUID(), title: entry.title.trim(), notes: "notes" in entry && typeof entry.notes === "string" ? entry.notes.slice(0, 10000) : "", duration_minutes: ([15,30,45,60,90].includes(minutes) ? minutes : 30) as JellyPlanAction["duration_minutes"], category_id: "uncategorized", priority: "none", schedule: null };
  });
  if (input.today) actions = scheduleJellyActions(state, actions, input.today, input.start_time, durations);
  return { plan: { id: randomUUID(), title: text.split("\n")[0]!.slice(0, 100), source_type: input.source_type, source_id: input.source_id ?? null, source_hash: sourceHash, source_text: text, ...(input.selection ? { selection: structuredClone(input.selection) } : {}), ...(questions.length ? { clarification_questions: questions } : {}), actions, created_at: new Date().toISOString() }, method: input.manual ? "manual" : "model" };
}

export const jellyTextFingerprint = (text: string): string => createHash("sha256").update(text).digest("hex");
