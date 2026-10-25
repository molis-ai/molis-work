import { randomUUID } from "node:crypto";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantStore } from "./assistant/assistant-store.js";
import type { DirectoryReadOrigin } from "./plugin-directory-store.js";

const BY: Record<DirectoryReadOrigin, string> = {
  person: "你在页面上发起", agent: "由 Agent 发起", workflow: "由工作流发起", mcp: "由外部客户端（MCP）发起", background: "由后台任务或定时发起",
};

/**
 * Tells the person a plugin read a directory they granted (PG-049, user 2026-10-25): once for each call that read, whoever started it
 * (a kept background job once for each hour it reads in), as one of the Assistant's notices. It belongs to no work; Settings › 本机目录 keeps the full record.
 */
export function tellDirectoryRead(home: string, actorId: string, read: { plugin_name: string; folder: string; origin: DirectoryReadOrigin }): void {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  try {
    new AssistantStore(db).raiseNotice(actorId, { kind: "directory-read", work_id: "", work_title: read.plugin_name,
      text: `「${read.plugin_name}」读取了你授权的本机目录「${read.folder}」（${BY[read.origin]}）。可在设置「本机目录」查看记录或撤回。` }, `directory-read:${randomUUID()}`);
  } finally { db.close(); }
}
