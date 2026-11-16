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
  extractJsonlMetadata,
  isValidNativeId,
  paginateAndSearchTranscript,
  parseMessageJsonlLines,
  readJsonlLines,
  walkFilesUnderRoot,
  withFileTranscriptCache,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;
const DISCOVERY_SCAN_BYTES = 2 * 1024 * 1024;

function isClaudeSessionJsonl(relative: string, fileName: string): { candidate: boolean; stem: string } {
  if (!fileName.endsWith(".jsonl")) return { candidate: false, stem: "" };
  if (relative.includes("/subagents/") || fileName.startsWith("agent-")) {
    return { candidate: false, stem: "" };
  }
  return { candidate: true, stem: fileName.slice(0, -".jsonl".length) };
}

function parseClaudeCursor(cursor: string | null): { offset: number; seenSessions: number; seenUnsupported: number } {
  if (!cursor) return { offset: 0, seenSessions: 0, seenUnsupported: 0 };
  const [rawOffset, rawSeen, rawUnsupported] = cursor.split(":");
  return {
    offset: Math.max(0, Number.parseInt(rawOffset ?? "0", 10) || 0),
    seenSessions: Math.max(0, Number.parseInt(rawSeen ?? "0", 10) || 0),
    seenUnsupported: Math.max(0, Number.parseInt(rawUnsupported ?? "0", 10) || 0),
  };
}

export const claudeCodeAdapter: ExternalSessionSourceAdapter = {
  entry_id: "claude-code",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 3);
    const jsonlFiles = walked.files.filter(item => isClaudeSessionJsonl(item.relative, item.entry.name).candidate);
    const { offset: startOffset, seenSessions, seenUnsupported } = parseClaudeCursor(cursor);
    const batchFiles = jsonlFiles.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    let unsupportedVersionFiles = 0;
    const sessions = [];

    for (const item of batchFiles) {
      signal.throwIfAborted();
      const { stem } = isClaudeSessionJsonl(item.relative, item.entry.name);
      if (!isValidNativeId(stem)) {
        skippedCount++;
        continue;
      }
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { lines } = await readJsonlLines(stream, signal, DISCOVERY_SCAN_BYTES);
        const meta = extractJsonlMetadata(lines, item.entry.mtime_ms);
        if (meta.validJsonCount === 0 || meta.sidechainOnly || !meta.hasSessionContent) {
          if (!meta.hasSessionContent && meta.unsupportedVersionCount > 0) {
            unsupportedVersionFiles++;
          }
          skippedCount++;
          continue;
        }
        const nativeId = meta.sessionId && isValidNativeId(meta.sessionId) ? meta.sessionId : stem;
        sessions.push({
          native_id: nativeId,
          title: meta.title,
          directory: meta.cwd,
          last_activity_at: meta.lastActivityAt,
          activity: "unknown" as const,
          forked_from_native_id: meta.forkedFrom,
          return_target: buildCliResumeTarget(context.tool, nativeId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    const nextOffset = startOffset + batchFiles.length;
    const totalSessions = seenSessions + sessions.length;
    const totalUnsupported = seenUnsupported + unsupportedVersionFiles;
    if (nextOffset >= jsonlFiles.length && totalSessions === 0 && totalUnsupported > 0) {
      throw sessionSourceFailure("version_mismatch", "Claude Code 会话记录版本暂不支持解析", false);
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: nextOffset < jsonlFiles.length ? `${nextOffset}:${totalSessions}:${totalUnsupported}` : null,
      total: jsonlFiles.length,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!context.root || !isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 3);
    let matchedRelative: string | null = null;
    for (const item of walked.files) {
      const check = isClaudeSessionJsonl(item.relative, item.entry.name);
      if (check.candidate && check.stem === nativeId) {
        matchedRelative = item.relative;
        break;
      }
    }
    if (!matchedRelative) {
      for (const item of walked.files) {
        const check = isClaudeSessionJsonl(item.relative, item.entry.name);
        if (!check.candidate) continue;
        try {
          const stream = await context.ports.files.open(context.root, item.relative, signal);
          const { lines } = await readJsonlLines(stream, signal, 64 * 1024);
          const meta = extractJsonlMetadata(lines, item.entry.mtime_ms);
          if (meta.sessionId === nativeId) {
            matchedRelative = item.relative;
            break;
          }
        } catch (error) {
          if (signal.aborted) throw error;
        }
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
