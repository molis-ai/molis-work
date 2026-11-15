import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import {
  sessionSourceFailure,
  type AdapterDiscoveryBatch,
  type AdapterSourceContext,
  type ExternalSessionSourceAdapter,
} from "../ports.js";
import { isValidNativeId, normalizeIsoTimestamp, normalizeTitle } from "./shared.js";

export const qwenCodeAdapter: ExternalSessionSourceAdapter = {
  entry_id: "qwen-code",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (cursor !== null) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const spec = context.tool.sessions.discover;
    if (spec.via !== "command") {
      throw sessionSourceFailure("version_mismatch", "Unexpected discover spec for qwen-code", false);
    }
    const res = await context.ports.commands.run(context.entry_id, spec.argv, signal);
    if (res.exit_code !== 0) {
      throw sessionSourceFailure("read_error", res.stderr || "qwen sessions list failed", true);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.stdout || "[]");
    } catch {
      throw sessionSourceFailure("parse_error", "Invalid JSON from qwen sessions list", false);
    }
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.sessions)
        ? parsed.sessions
        : isRecord(parsed) && Array.isArray(parsed.items)
          ? parsed.items
          : isRecord(parsed) && Array.isArray(parsed.data)
            ? parsed.data
            : null;
    if (!items) {
      throw sessionSourceFailure("parse_error", "Expected session list array from qwen", false);
    }

    const sessions = [];
    let skippedCount = 0;

    for (const item of items) {
      if (!isRecord(item)) {
        skippedCount++;
        continue;
      }
      const rawId = item.id ?? item.session_id ?? item.sessionId;
      const nativeId = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
      if (!isValidNativeId(nativeId)) {
        skippedCount++;
        continue;
      }
      const updatedAt = normalizeIsoTimestamp(item.updated_at ?? item.updatedAt ?? item.timestamp ?? item.created_at ?? item.createdAt);
      if (!updatedAt) {
        skippedCount++;
        continue;
      }
      const rawDir = item.cwd ?? item.directory ?? item.work_dir ?? item.projectPath;
      sessions.push({
        native_id: nativeId,
        title: normalizeTitle(item.title ?? item.summary ?? item.prompt ?? item.name),
        directory: typeof rawDir === "string" && rawDir.trim() ? rawDir.trim() : null,
        last_activity_at: updatedAt,
        activity: "unknown" as const,
        return_target: null,
      });
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: null,
      total: items.length,
    };
  },
};
