import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import {
  SessionSourceFailure,
  type AdapterDiscoveryBatch,
  type AdapterSourceContext,
  type ExternalSessionSourceAdapter,
} from "../ports.js";
import { buildCliResumeTarget, isValidNativeId, normalizeIsoTimestamp, normalizeTitle } from "./shared.js";

function extractItemsArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.sessions)) return parsed.sessions;
    if (Array.isArray(parsed.results)) return parsed.results;
    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.data)) return parsed.data;
  }
  throw new SessionSourceFailure("parse_error", "Unexpected JSON shape from droid search", false);
}

export const droidAdapter: ExternalSessionSourceAdapter = {
  entry_id: "droid",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (cursor !== null) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const spec = context.tool.sessions.discover;
    if (spec.via !== "command") {
      throw new SessionSourceFailure("version_mismatch", "Unexpected discover spec for droid", false);
    }
    const res = await context.ports.commands.run(context.entry_id, spec.argv, signal);
    if (res.exit_code !== 0) {
      throw new SessionSourceFailure("read_error", res.stderr || "droid search exited with error", true);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.stdout || "[]");
    } catch {
      throw new SessionSourceFailure("parse_error", "Invalid JSON from droid search", false);
    }
    const items = extractItemsArray(parsed);
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
      const updatedAt = normalizeIsoTimestamp(item.updated_at ?? item.updatedAt ?? item.last_activity_at ?? item.created_at ?? item.createdAt);
      if (!updatedAt) {
        skippedCount++;
        continue;
      }
      const rawDir = item.cwd ?? item.directory ?? item.working_directory ?? item.project_dir;
      sessions.push({
        native_id: nativeId,
        title: normalizeTitle(item.title ?? item.summary ?? item.name),
        directory: typeof rawDir === "string" && rawDir.trim() ? rawDir.trim() : null,
        last_activity_at: updatedAt,
        activity: item.status === "running" || item.active === true ? ("running" as const) : ("unknown" as const),
        return_target: buildCliResumeTarget(context.tool, nativeId),
      });
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: null,
      total: items.length,
    };
  },

  async searchTool(context, query, limit, signal): Promise<{ native_ids: string[]; skipped_count: number }> {
    const spec = context.tool.sessions.search;
    if (spec.via !== "command") {
      throw new SessionSourceFailure("version_mismatch", "Droid search capability not configured", false);
    }
    const argv = spec.argv.map(part => (part === "{query}" ? query : part));
    const res = await context.ports.commands.run(context.entry_id, argv, signal);
    if (res.exit_code !== 0) {
      throw new SessionSourceFailure("read_error", res.stderr || "droid search failed", true);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.stdout || "[]");
    } catch {
      throw new SessionSourceFailure("parse_error", "Invalid JSON from droid search", false);
    }
    const items = extractItemsArray(parsed);
    const ids: string[] = [];
    let skipped = 0;
    for (const item of items) {
      if (!isRecord(item)) {
        skipped++;
        continue;
      }
      const rawId = item.id ?? item.session_id ?? item.sessionId;
      const nativeId = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
      if (!isValidNativeId(nativeId)) {
        skipped++;
        continue;
      }
      ids.push(nativeId);
      if (ids.length >= limit) break;
    }
    return { native_ids: ids, skipped_count: skipped };
  },
};
