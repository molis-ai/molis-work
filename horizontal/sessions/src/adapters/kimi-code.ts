import { sessionsErrors } from "@molis-ai/molis-work-contracts/services/sessions";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { AdapterDiscoveryBatch, AdapterReadOutput, AdapterSourceContext, ExternalSessionSourceAdapter } from "../ports.js";
import {
  buildCliResumeTarget,
  extractJsonlMetadata,
  isValidNativeId,
  normalizeIsoTimestamp,
  normalizeTitle,
  paginateAndSearchTranscript,
  parseMessageJsonlLines,
  readJsonlLines,
  readWholeTextBounded,
  walkFilesUnderRoot,
  withFileTranscriptCache,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;
const DISCOVERY_SCAN_BYTES = 2 * 1024 * 1024;

function resolveKimiCandidate(relative: string, fileName: string): { candidate: boolean; stem: string; metaSibling: string | null } {
  if (!fileName.endsWith(".jsonl")) return { candidate: false, stem: "", metaSibling: null };
  // Kimi Code writes `<workdir-hash>/<session-id>/context.jsonl` alongside optional `wire.jsonl` and `metadata.json`.
  if (fileName === "wire.jsonl") return { candidate: false, stem: "", metaSibling: null };
  if (fileName === "context.jsonl") {
    const parts = relative.split("/");
    const parent = parts.length >= 2 ? parts[parts.length - 2]! : "";
    const metaSibling = parts.length >= 2 ? [...parts.slice(0, -1), "metadata.json"].join("/") : "metadata.json";
    return { candidate: parent.length > 0, stem: parent, metaSibling };
  }
  return { candidate: true, stem: fileName.slice(0, -".jsonl".length), metaSibling: null };
}

export const kimiCodeAdapter: ExternalSessionSourceAdapter = {
  entry_id: "kimi-code",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    const candidates = walked.files.filter(item => resolveKimiCandidate(item.relative, item.entry.name).candidate);
    const startOffset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const batch = candidates.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    const sessions = [];

    for (const item of batch) {
      signal.throwIfAborted();
      const info = resolveKimiCandidate(item.relative, item.entry.name);
      if (!isValidNativeId(info.stem)) {
        skippedCount++;
        continue;
      }
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { lines } = await readJsonlLines(stream, signal, DISCOVERY_SCAN_BYTES);
        const meta = extractJsonlMetadata(lines, item.entry.mtime_ms);
        if (meta.validJsonCount === 0) {
          skippedCount++;
          continue;
        }
        let metaTitle: string | null = null;
        let metaCwd: string | null = null;
        let metaUpdated: string | null = null;
        if (info.metaSibling) {
          const siblingStat = await context.ports.files.stat(context.root, info.metaSibling, signal);
          if (siblingStat) {
            try {
              const metaStream = await context.ports.files.open(context.root, info.metaSibling, signal);
              const { text } = await readWholeTextBounded(metaStream, signal, 64 * 1024);
              const parsedMeta = JSON.parse(text) as unknown;
              if (isRecord(parsedMeta)) {
                metaTitle = normalizeTitle(parsedMeta.title ?? parsedMeta.name);
                if (typeof parsedMeta.work_dir === "string" && parsedMeta.work_dir.trim()) metaCwd = parsedMeta.work_dir.trim();
                else if (typeof parsedMeta.cwd === "string" && parsedMeta.cwd.trim()) metaCwd = parsedMeta.cwd.trim();
                metaUpdated = normalizeIsoTimestamp(parsedMeta.updated_at ?? parsedMeta.last_updated);
              }
            } catch { /* ignore optional metadata.json error */ }
          }
        }
        const nativeId = meta.sessionId && isValidNativeId(meta.sessionId) ? meta.sessionId : info.stem;
        sessions.push({
          native_id: nativeId,
          title: metaTitle ?? meta.title,
          directory: meta.cwd ?? metaCwd,
          last_activity_at: metaUpdated && metaUpdated > meta.lastActivityAt ? metaUpdated : meta.lastActivityAt,
          activity: "unknown" as const,
          forked_from_native_id: meta.forkedFrom,
          return_target: buildCliResumeTarget(context.tool, nativeId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    const nextOffset = startOffset + batch.length;
    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: nextOffset < candidates.length ? String(nextOffset) : null,
      total: candidates.length,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!context.root || !isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    let matchedRelative: string | null = null;
    for (const item of walked.files) {
      const info = resolveKimiCandidate(item.relative, item.entry.name);
      if (info.candidate && info.stem === nativeId) {
        matchedRelative = item.relative;
        break;
      }
    }
    if (!matchedRelative) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    const root = context.root;
    const relative = matchedRelative;
    const parsed = await withFileTranscriptCache(context.ports, root, relative, signal, async () => {
      const stream = await context.ports.files.open(root, relative, signal);
      const { lines, stopped } = await readJsonlLines(stream, signal);
      return parseMessageJsonlLines(lines, stopped);
    });
    return paginateAndSearchTranscript(parsed, input);
  },
};
