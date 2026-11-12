import { randomUUID } from "node:crypto";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_NAME, AssistantStore } from "./assistant/assistant-store.js";
import { assistantWords } from "./assistant/assistant-saved-text.js";
import type { DirectoryReadOrigin, PluginDirectoryReadResult } from "@molis-ai/molis-work-contracts/platform/plugin-directory";

/**
 * Tells the person a plugin read a directory they granted (PG-049, user 2026-10-25): once for each call that read, whoever started it
 * (a kept background job once for each hour it reads in), as one of the Assistant's notices. It belongs to no work; Settings › 本机目录 keeps the full record.
 */
export function tellDirectoryRead(home: string, actorId: string, read: { plugin_name: string; folder: string; origin: DirectoryReadOrigin; outcome: PluginDirectoryReadResult["outcome"] }): void {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  try {
    const key = read.outcome === "denied" ? "workbench.assistant-directory.denied"
      : ["directory", "text", "bytes"].includes(read.outcome) ? "workbench.assistant-directory.read" : "workbench.assistant-directory.incomplete";
    new AssistantStore(db).raiseNotice(actorId, { kind: "directory-read", work_id: "", work_title: read.plugin_name,
      text: assistantWords(key, { plugin: read.plugin_name, folder: read.folder }), directory_origin: read.origin }, `directory-read:${randomUUID()}`);
  } finally { db.close(); }
}
