import { sessionsErrors } from "@molis-ai/molis-work-contracts/services/sessions";
import {
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
  discoveryCursor,
  nextDiscoveryCursor,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;
const DISCOVERY_SCAN_BYTES = 2 * 1024 * 1024;

/**
 * A session file, or a subagent's trajectory beside its session (`<project>/<session>/subagents/agent-<id>.jsonl`, batch 103-2): a
 * subagent is kept with the session it belongs to (`parent`), and the list leaves it out. Any other `agent-` file is not a session.
 */
function isClaudeSessionJsonl(relative: string, fileName: string): { candidate: boolean; stem: string; parent?: string } {
  if (!fileName.endsWith(".jsonl")) return { candidate: false, stem: "" };
  const stem = fileName.slice(0, -".jsonl".length);
  const parts = relative.split("/");
  if (parts.length === 4 && parts[2] === "subagents" && fileName.startsWith("agent-")) {
    return isValidNativeId(parts[1]) ? { candidate: true, stem, parent: parts[1] } : { candidate: false, stem: "" };
  }
  if (relative.includes("/subagents/") || fileName.startsWith("agent-")) {
    return { candidate: false, stem: "" };
  }
  return { candidate: true, stem };
}

export const claudeCodeAdapter: ExternalSessionSourceAdapter = {
  entry_id: "claude-code",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal, alreadyRead: number): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 3);
    const jsonlFiles = walked.files.filter(item => isClaudeSessionJsonl(item.relative, item.entry.name).candidate);
    const previous = discoveryCursor(cursor, alreadyRead);
    const startOffset = previous.offset;
    const batchFiles = jsonlFiles.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    let unsupportedVersionFiles = 0;
    const sessions = [];

    for (const item of batchFiles) {
      signal.throwIfAborted();
      const { stem, parent } = isClaudeSessionJsonl(item.relative, item.entry.name);
      if (!isValidNativeId(stem)) {
        skippedCount++;
        continue;
      }
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { lines } = await readJsonlLines(stream, signal, DISCOVERY_SCAN_BYTES);
        const meta = extractJsonlMetadata(lines, item.entry.mtime_ms, parent !== undefined);
        if (meta.validJsonCount === 0 || meta.sidechainOnly || !meta.hasSessionContent) {
          if (!meta.hasSessionContent && meta.unsupportedVersionCount > 0) {
            unsupportedVersionFiles++;
          }
          skippedCount++;
          continue;
        }
        // A subagent's records carry its session's id: the file's own name is the subagent's.
        const nativeId = parent ? stem : meta.sessionId && isValidNativeId(meta.sessionId) ? meta.sessionId : stem;
        sessions.push({
          native_id: nativeId,
          title: meta.title,
          directory: meta.cwd,
          last_activity_at: meta.lastActivityAt,
          activity: "unknown" as const,
          forked_from_native_id: parent ?? meta.forkedFrom,
          ...(parent ? { subagent: true as const } : {}),
          return_target: parent ? null : buildCliResumeTarget(context.tool, nativeId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: nextDiscoveryCursor(previous, batchFiles.length, jsonlFiles.length, sessions.length, unsupportedVersionFiles, "Claude Code"),
      total: jsonlFiles.length,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!context.root || !isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 3);
    let matchedRelative: string | null = null, subagent = false;
    for (const item of walked.files) {
      const check = isClaudeSessionJsonl(item.relative, item.entry.name);
      if (check.candidate && check.stem === nativeId) {
        matchedRelative = item.relative;
        subagent = check.parent !== undefined;
        break;
      }
    }
    if (!matchedRelative) {
      for (const item of walked.files) {
        const check = isClaudeSessionJsonl(item.relative, item.entry.name);
        if (!check.candidate || check.parent !== undefined) continue;
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
      return parseMessageJsonlLines(lines, stopped, subagent);
    });
    return paginateAndSearchTranscript(parsed, input);
  },
};
