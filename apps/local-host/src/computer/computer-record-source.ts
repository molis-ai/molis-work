import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, bindFileEntriesHandler, defineFileContentAction, defineFileEntriesAction, fileContentOf, FILE_ENTRIES_PAGE_LIMIT, LOCAL_PERSON_ACTOR_ID,
  type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type FileEntry, type FileContentInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { writeNativePluginJsonResponse } from "../native-plugin-http.js";
import { ComputerRecords, type ComputerRecord } from "./computer-records.js";

/**
 * The per-round computer operation record as a file in the 文件 tab (specs/computer-use §5): the goal, the steps in
 * time order, the outcome and what was left undone, previewed as text. It is home-scoped and not registered for search
 * or memory (§6); keeping it as a 成果 is the person's separate choice through the 成果库. The redacted screenshots are
 * served by the computer HTTP endpoint, not inlined here.
 */
export const COMPUTER_RECORD_KIND = "computer_record";
export const COMPUTER_PROVIDER_ID = "io.molis.work.computer";
/**
 * The id the 文件 tab sees once this source is folded into the Assistant's provider.
 * Kept as a literal so this file does not import the Assistant (that file already imports this one).
 */
export const COMPUTER_RECORD_SOURCE_ID = "io.molis.work.assistant.rules|computer.records.entries|1";

/** Records whose `project_id` is exactly the caller's project. No project selected lists only records with none. */
export function recordsOwnedBy(records: readonly ComputerRecord[], projectId: string | null): ComputerRecord[] {
  return records.filter(record => record.project_id === projectId);
}

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
  const entries = (caller: ActionCallContext): FileEntry[] => recordsOwnedBy(records.list(), caller.project_id).map(record => ({
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
    { capability_id: computerRecordActions.content.capability_id, version: 1, handle: async (caller, input) => {
      const subject = (input as FileContentInput).subject;
      const record = records.get(subject.id);
      if (!record || record.project_id !== caller.project_id) throw new ActionError("files.not_found", "这份电脑操作记录不在了");
      return fileContentOf({ subject, revision: record.ended_at ?? record.started_at, title: titleOf(record), media_type: "text/markdown", text: renderMarkdown(record) });
    } },
  ];
  return { definitions: Object.values(computerRecordActions), handlers };
}

/** The project list has no project, so the 文件 tab reads computer records that were never filed under one. */
export async function handleUnscopedComputerFiles(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string): Promise<boolean> {
  const route = /^\/api\/side\/files\/(sources|entries|content)$/u.exec(url.pathname)?.[1];
  if (!route) return false;
  const json = (status: number, body: unknown) => writeNativePluginJsonResponse(response, { status, body });
  if (request.method !== "GET") { json(405, { error: "不支持这个请求" }); return true; }
  const source = computerRecordFileSource(homeDirectory);
  const caller: ActionExecutionContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [], beforeEffect: async () => {} };
  const described = { id: COMPUTER_RECORD_SOURCE_ID, plugin_id: "io.molis.work.assistant.rules", title: "电脑操作记录", kinds };
  try {
    if (route === "sources") { json(200, { sources: [described] }); return true; }
    if (url.searchParams.get("source") !== COMPUTER_RECORD_SOURCE_ID) { json(404, { error: "这个文件来源已经不在了（插件可能已停用）" }); return true; }
    const entries = source.handlers.find(handler => handler.capability_id === computerRecordActions.entries.capability_id);
    const read = source.handlers.find(handler => handler.capability_id === computerRecordActions.content.capability_id);
    if (route === "entries") {
      const page = await entries!.handle(caller, { cursor: url.searchParams.get("cursor") || null, limit: FILE_ENTRIES_PAGE_LIMIT });
      json(200, { page });
      return true;
    }
    const kind = url.searchParams.get("kind") ?? "", id = url.searchParams.get("id") ?? "";
    if (kind !== COMPUTER_RECORD_KIND || !id) { json(400, { error: "没有说明要预览哪个文件" }); return true; }
    const content = await read!.handle(caller, { subject: { kind, id } });
    json(200, { content, via: "content" });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    json(/not_found$/u.test(code) ? 404 : 409, { error: error instanceof Error ? error.message : String(error), code });
    return true;
  }
}
