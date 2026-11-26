import { sessionsErrors } from "@molis-ai/molis-work-contracts/services/sessions";
import {
  sessionSourceFailure,
  type AdapterDiscoveryBatch,
  type AdapterReadOutput,
  type AdapterSourceContext,
  type ExternalSessionSourceAdapter,
} from "../ports.js";
import {
  buildCliResumeTarget,
  isValidNativeId,
  makeEntry,
  normalizeIsoTimestamp,
  normalizeTitle,
  paginateAndSearchTranscript,
} from "./shared.js";

export const codexAdapter: ExternalSessionSourceAdapter = {
  entry_id: "codex",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.ports.protocols) {
      throw sessionSourceFailure("tool_missing", "Codex app-server protocol port is not configured");
    }
    const response = await context.ports.protocols.codexThreadList(context.root ?? "", cursor, signal);
    const sessions = [];
    let skippedCount = 0;

    for (const thread of response.threads) {
      if (!isValidNativeId(thread.id)) {
        skippedCount++;
        continue;
      }
      const updatedAt = normalizeIsoTimestamp(thread.updated_at);
      if (!updatedAt) {
        skippedCount++;
        continue;
      }
      sessions.push({
        native_id: thread.id,
        title: normalizeTitle(thread.title),
        directory: thread.cwd?.trim() ? thread.cwd.trim() : null,
        last_activity_at: updatedAt,
        activity: thread.activity,
        forked_from_native_id: isValidNativeId(thread.parent_thread_id) ? thread.parent_thread_id : null,
        return_target: buildCliResumeTarget(context.tool, thread.id),
      });
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: response.next_cursor,
      total: null,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    if (!context.ports.protocols) {
      throw sessionsErrors.read_failed("Codex 协议读取端口不可用");
    }
    const response = await context.ports.protocols.codexThreadRead(context.root ?? "", nativeId, signal);
    const normalizedEntries = response.entries.map((entry, idx) =>
      makeEntry({
        position: entry.position || `turn:${idx}`,
        role: entry.role,
        at: entry.at,
        text: entry.text,
        truncated: entry.truncated,
        step: entry.step,
      }),
    );
    return paginateAndSearchTranscript(
      {
        entries: normalizedEntries,
        activity: response.activity,
        partial_stop: null,
      },
      input,
    );
  },
};
