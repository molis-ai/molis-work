import { ActionError, bindFileEntriesHandler, defineFileContentAction, defineFileEntriesAction, fileContentOf,
  type ActionDefinition, type ActionHandlerBinding, type FileEntry, type FileContentInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { ComputerRecords, type ComputerRecord } from "./computer-records.js";

/**
 * The per-round computer operation record as a file in the 文件 tab (specs/computer-use §5): the goal, the steps in
 * time order, the outcome and what was left undone, previewed as text. It is home-scoped and not registered for search
 * or memory (§6); keeping it as a 成果 is the person's separate choice through the 成果库. The redacted screenshots are
 * served by the computer HTTP endpoint, not inlined here.
 */
export const COMPUTER_RECORD_KIND = "computer_record";
export const COMPUTER_PROVIDER_ID = "io.molis.work.computer";

const kinds = [{ kind: COMPUTER_RECORD_KIND, title: "电脑操作记录", surface: "computer" }];

export const computerRecordActions = {
  entries: defineFileEntriesAction("computer.records.entries", kinds, "电脑操作记录", [], "home"),
  content: defineFileContentAction("computer.records.content", kinds, "电脑操作记录", [], "home"),
} as const;

const STEP_LABEL: Record<string, string> = { look: "看", act: "做", asked: "问", allowed: "已允许", declined: "被拒绝", refused: "拒绝", failed: "失败", note: "记" };

function dateLabel(iso: string): string {
  try { return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}

function titleOf(record: ComputerRecord): string {
  const goal = record.goal.trim().replace(/\s+/gu, " ");
  return `${goal ? goal.slice(0, 40) : "电脑操作"}（${dateLabel(record.started_at)}）`;
}

function renderMarkdown(record: ComputerRecord): string {
  const outcome = record.outcome === "completed" ? "完成" : record.outcome === "failed" ? "失败" : record.outcome === "stopped" ? "已停止" : "进行中";
  const lines = [
    `# 电脑操作记录`,
    record.goal ? `**目标**：${record.goal}` : "",
    `**开始**：${dateLabel(record.started_at)}　**结束**：${record.ended_at ? dateLabel(record.ended_at) : "（未结束）"}　**结果**：${outcome}`,
    record.conclusion ? `\n${record.conclusion}` : "",
    record.unfinished.length ? `\n**没做完的部分**：\n${record.unfinished.map(one => `- ${one}`).join("\n")}` : "",
    `\n## 步骤`,
  ];
  for (const [index, step] of record.steps.entries()) {
    const app = step.app ? `［${step.app.name}］` : "";
    const receipt = step.receipt ? `（${step.receipt.state}，动作 ${step.receipt.actions} 次${step.receipt.refusal ? `，拒绝：${step.receipt.refusal}` : ""}）` : "";
    const shot = step.shot ? `　截图：${step.shot}` : "";
    lines.push(`${index + 1}. [${dateLabel(step.at)}] ${STEP_LABEL[step.kind] ?? step.kind}　${app}${step.summary}${receipt}${shot}`);
  }
  if (!record.steps.length) lines.push("（没有记录到步骤）");
  if (record.shots_removed_at) lines.push(`\n（截图已按保留期清理，${dateLabel(record.shots_removed_at)}）`);
  return lines.filter(line => line !== "").join("\n");
}

/**
 * The record file-source's definitions and handlers, to be folded into an existing system provider's registration (the
 * Assistant's): the Host does not hand-register a new provider for it. `records` is read by home directory, so the file
 * source and the desk can hold their own instances of the same on-disk records.
 */
export function computerRecordFileSource(homeDirectory: string): { definitions: ActionDefinition[]; handlers: ActionHandlerBinding[] } {
  const records = new ComputerRecords(homeDirectory);
  const entries = (): FileEntry[] => records.list().map(record => ({
    subject: { kind: COMPUTER_RECORD_KIND, id: record.id },
    revision: record.ended_at ?? record.started_at,
    title: titleOf(record),
    folder: [],
    media_type: "text/markdown",
    size: 0,
    updated_at: record.ended_at ?? record.started_at,
    open: null,
  }));
  const handlers: ActionHandlerBinding[] = [
    bindFileEntriesHandler(computerRecordActions.entries, entries),
    { capability_id: computerRecordActions.content.capability_id, version: 1, handle: async (_caller, input) => {
      const subject = (input as FileContentInput).subject;
      const record = records.get(subject.id);
      if (!record) throw new ActionError("files.not_found", "这份电脑操作记录不在了");
      return fileContentOf({ subject, revision: record.ended_at ?? record.started_at, title: titleOf(record), media_type: "text/markdown", text: renderMarkdown(record) });
    } },
  ];
  return { definitions: Object.values(computerRecordActions), handlers };
}
