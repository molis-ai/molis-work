import { Buffer } from "node:buffer";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EXTERNAL_SESSION_HISTORY_MAX, EXTERNAL_SESSION_LIST_MAX, sessionsActions,
  type ExternalSessionEntry, type ExternalSessionHistoryOutput, type ExternalSessionListOutput, type ExternalSessionRow, type ExternalSessionRowSummary,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { ImportFile } from "./context-onboarding-store.js";

/**
 * Existing work in other AI tools, brought into a project's onboarding round (batch 35 item 1, SRB-09). The round reads as the project's
 * AI: through the public `sessions.list@1` and `sessions.history.read@1`, by a caller that is not the person, so the project's AI read
 * permit decides (sessions-rebuild contract design §7.4). Only sessions filed to the project (confirmed or automatic) in tools the
 * person allowed are read; Onboarding keeps no reader, index or tool list of its own. Each session becomes one Markdown file in the
 * round, its entries in order with who said each and when, so the organizer can keep the person's words, the tool's replies and its
 * receipts apart and date what happened by the record, not by today.
 */

/** The newest sessions of the project, and of each the latest entries: a round is about where the work stands. */
export const ONBOARDING_SESSIONS_LIMITS = { sessions: 40, entries: 400, entry_chars: 6_000 } as const;

/** The file name a session is read under; `sessionKeyOf` reads it back so adoption can keep one material per session. */
export const sessionFilePath = (session_key: string) => `sessions/${session_key}.md`;
export function sessionKeyOf(path: string): string | null {
  const match = /^sessions\/([^/]+)\.md$/u.exec(path);
  return match ? match[1]! : null;
}

/** Why the round could not read the sessions, said to the person; the round's other sources still go on. */
export class OnboardingSessionsRefusal extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

const ROLE: Record<ExternalSessionEntry["role"], string> = { you: "你", tool: "工具", tool_step: "工具步骤", note: "说明" };

function entryText(entry: ExternalSessionEntry): string {
  const head = [ROLE[entry.role], entry.step ? `${entry.step.name}（${entry.step.status === "ok" ? "成功" : entry.step.status === "failed" ? "失败" : "结果未知"}）` : "", entry.at ?? "时间未知"].filter(Boolean).join(" · ");
  const characters = [...entry.text];
  const body = characters.length > ONBOARDING_SESSIONS_LIMITS.entry_chars ? characters.slice(0, ONBOARDING_SESSIONS_LIMITS.entry_chars).join("") + "…" : entry.text;
  return `### ${head}\n\n${body}${entry.truncated || characters.length > ONBOARDING_SESSIONS_LIMITS.entry_chars ? "\n\n（这一条只读到一部分）" : ""}`;
}

/** What the material is called: the tool's own title (untrusted, and redacted for the AI), else the tool's name. */
const sessionTitle = (row: ExternalSessionRow | ExternalSessionRowSummary) => [...(row.title?.trim() || `${row.tool.display_name} 会话`)].slice(0, 200).join("");

function sessionMarkdown(row: ExternalSessionRow | ExternalSessionRowSummary, entries: readonly ExternalSessionEntry[], partial: boolean, older: boolean): string {
  const title = sessionTitle(row);
  const lines = [
    `# ${title}`,
    "",
    `工具：${row.tool.display_name}${row.directory ? ` · 目录：${row.directory}` : ""} · 最后活动：${row.last_activity_at}`,
    "",
    "以下是这个工具记下的原文，照原样排：「你」是本人说的，「工具」是工具的回复，「工具步骤」是工具执行的回执。时间是当时发生的时间。",
    older ? "\n更早的记录没有读进来，这里只有最近的部分。" : "",
    partial ? "\n这次只读到一部分，没读到的不在这里。" : "",
  ];
  return lines.filter(line => line !== "").join("\n") + "\n\n" + entries.map(entryText).join("\n\n") + "\n";
}

function refusal(error: unknown): never {
  if (error instanceof ActionError) {
    if (error.code === "sessions.project_ai_read_off") throw new OnboardingSessionsRefusal("这个项目的 AI 还不能读外部会话：许可没打开。只有你能打开它；没打开，这一步不整理会话。", error.code);
    if (error.code === "actions.dependency_missing" || error.code === "actions.forbidden") throw new OnboardingSessionsRefusal("这里读不了外部会话，请先在「外部会话」里允许读取这些工具。", error.code);
  }
  throw error;
}

/** The project's sessions as this round's files, newest first; one that cannot be read is skipped with its reason. */
export async function readOnboardingSessions(client: BoundActionClient, signal?: AbortSignal): Promise<{ name: string; locator: string; files: ImportFile[]; titles: Record<string, string> }> {
  const rows: (ExternalSessionRow | ExternalSessionRowSummary)[] = [];
  let cursor: string | null = null;
  try {
    do {
      signal?.throwIfAborted();
      const page: ExternalSessionListOutput = await client.invoke(sessionsActions.list, { view: "project", limit: Math.min(EXTERNAL_SESSION_LIST_MAX, ONBOARDING_SESSIONS_LIMITS.sessions), ...(cursor ? { cursor } : {}) });
      rows.push(...page.sessions);
      cursor = page.next_cursor;
    } while (cursor && rows.length < ONBOARDING_SESSIONS_LIMITS.sessions);
  } catch (error) { refusal(error); }
  if (!rows.length) throw new OnboardingSessionsRefusal("这个项目还没有 AI 能读的外部会话：先在「外部会话」里把会话归到这个项目。", "sessions.none");
  const files: ImportFile[] = [], titles: Record<string, string> = {};
  for (const row of rows.slice(0, ONBOARDING_SESSIONS_LIMITS.sessions)) {
    signal?.throwIfAborted();
    const path = sessionFilePath(row.session_key);
    titles[path] = sessionTitle(row);
    try {
      const entries: ExternalSessionEntry[] = [];
      let before: string | null = null, partial = false, older = false;
      do {
        const page: ExternalSessionHistoryOutput = await client.invoke(sessionsActions.historyRead, { session_key: row.session_key, limit: EXTERNAL_SESSION_HISTORY_MAX, ...(before ? { from: { before } } : {}) });
        entries.unshift(...page.entries);
        partial ||= page.read_state === "partial";
        before = page.older_cursor;
        if (partial) break;
      } while (before && entries.length < ONBOARDING_SESSIONS_LIMITS.entries);
      older = Boolean(before);
      if (!entries.length) { files.push({ path, reason: "这个会话没有读到内容" }); continue; }
      files.push({ path, bytes: Buffer.from(sessionMarkdown(row, entries.slice(-ONBOARDING_SESSIONS_LIMITS.entries), partial, older)) });
    } catch (error) {
      if (error instanceof ActionError && error.code === "sessions.project_ai_read_off") refusal(error);
      if (signal?.aborted) throw error;
      files.push({ path, reason: error instanceof Error ? `读不了：${error.message}` : "读不了这个会话" });
    }
  }
  return { name: "外部会话", locator: "sessions", files, titles };
}
