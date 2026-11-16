import { sessionsErrors, type ExternalSessionEntry } from "@molis-ai/molis-work-contracts/services/sessions";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { sessionSourceFailure, type AdapterDiscoveryBatch, type AdapterReadOutput, type AdapterSourceContext, type ExternalSessionSourceAdapter } from "../ports.js";
import {
  buildCliResumeTarget,
  extractJsonlMetadata,
  isValidNativeId,
  makeEntry,
  normalizeIsoTimestamp,
  paginateAndSearchTranscript,
  readJsonlLines,
  truncateEntryText,
  walkFilesUnderRoot,
  withFileTranscriptCache,
  type JsonlLineRecord,
  type ParsedTranscriptResult,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;
const DISCOVERY_SCAN_BYTES = 2 * 1024 * 1024;

function extractPiNativeIdFromStem(stem: string): string {
  const underscoreIdx = stem.indexOf("_");
  if (underscoreIdx > 0) {
    const after = stem.slice(underscoreIdx + 1);
    if (isValidNativeId(after)) return after;
  }
  return stem;
}

function extractPiForkParent(rawParent: unknown): string | null {
  if (typeof rawParent !== "string" || !rawParent.trim()) return null;
  if (isValidNativeId(rawParent)) return rawParent;
  const base = rawParent.split(/[\\/]/u).pop() ?? "";
  if (base.endsWith(".jsonl")) {
    const candidate = extractPiNativeIdFromStem(base.slice(0, -".jsonl".length));
    if (isValidNativeId(candidate)) return candidate;
  }
  return null;
}

function parsePiJsonlLines(lines: readonly JsonlLineRecord[], initialStopped: { code: string; retryable: boolean } | null): ParsedTranscriptResult {
  const entries: ExternalSessionEntry[] = [];
  const sourceBytes: number[] = [];
  const toolCallIndex = new Map<string, number>();
  let partialStop: { code: string; at: string | null; retryable: boolean } | null = null;
  let nonEmptyLines = 0;
  let parseErrors = 0;

  for (const record of lines) {
    const trimmed = record.line.trim();
    if (!trimmed) continue;
    nonEmptyLines++;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      parseErrors++;
      if (entries.length > 0) {
        partialStop = { code: "sessions.version_unreadable", at: entries[entries.length - 1]!.position, retryable: false };
        break;
      }
      continue;
    }
    if (!isRecord(obj)) continue;
    if (obj.type === "session" || obj.type === "model_change" || obj.type === "thinking_level_change") continue;

    const at = normalizeIsoTimestamp(obj.timestamp ?? obj.created_at);
    const msg = isRecord(obj.message) ? obj.message : obj;
    const role = typeof msg.role === "string" ? msg.role : typeof obj.type === "string" ? obj.type : "";
    let part = 0;
    const push = (entry: Omit<ExternalSessionEntry, "position" | "truncated">) => {
      entries.push(makeEntry({ ...entry, position: `byte:${record.offset}:${part++}` }));
      sourceBytes.push(record.byteLength);
      return entries.length - 1;
    };

    if (role === "toolResult") {
      const toolCallId = typeof msg.toolCallId === "string" ? msg.toolCallId : undefined;
      const toolName = typeof msg.toolName === "string" ? msg.toolName : "tool";
      const isError = msg.isError === true;
      const resultText = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.filter(isRecord).map(c => (typeof c.text === "string" ? c.text : "")).filter(Boolean).join("\n")
          : "";
      if (toolCallId && toolCallIndex.has(toolCallId)) {
        const prevIdx = toolCallIndex.get(toolCallId)!;
        const prev = entries[prevIdx]!;
        const combined = resultText ? `${prev.text}\n${resultText}` : prev.text;
        const truncated = truncateEntryText(combined);
        entries[prevIdx] = {
          ...prev,
          text: truncated.text,
          truncated: prev.truncated || truncated.truncated,
          step: { name: prev.step?.name ?? toolName, status: isError ? "failed" : "ok" },
        };
      } else {
        push({ role: "tool_step", at, text: resultText || "(tool result)", step: { name: toolName, status: isError ? "failed" : "ok" } });
      }
      continue;
    }

    const content = msg.content;
    if (typeof content === "string" && content.trim()) {
      push({ role: role === "user" ? "you" : role === "system" ? "note" : "tool", at, text: content });
      continue;
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block)) continue;
        const bType = typeof block.type === "string" ? block.type : "";
        if (bType === "thinking" || bType === "redacted_thinking" || bType === "reasoning") continue;
        if (bType === "image" || bType === "file" || bType === "audio") {
          push({ role: "note", at, text: "[附件未读取]" });
          continue;
        }
        if (bType === "text" && typeof block.text === "string" && block.text.trim()) {
          push({ role: role === "user" ? "you" : "tool", at, text: block.text });
          continue;
        }
        if (bType === "toolCall" || bType === "tool_use") {
          const name = typeof block.name === "string" ? block.name : "tool";
          const args = block.arguments !== undefined ? JSON.stringify(block.arguments) : block.input !== undefined ? JSON.stringify(block.input) : name;
          const idx = push({ role: "tool_step", at, text: args, step: { name, status: "unknown" } });
          if (typeof block.id === "string") toolCallIndex.set(block.id, idx);
        }
      }
    }
  }

  if (entries.length === 0 && nonEmptyLines > 0 && parseErrors === nonEmptyLines) {
    return {
      entries: [],
      activity: "unknown",
      partial_stop: { code: "sessions.version_unreadable", at: null, retryable: false },
    };
  }

  if (!partialStop && initialStopped && entries.length > 0) {
    partialStop = {
      code: initialStopped.code,
      at: entries[entries.length - 1]!.position,
      retryable: initialStopped.retryable,
    };
  }

  return {
    entries,
    activity: "unknown",
    partial_stop: partialStop,
    entry_source_bytes: sourceBytes,
  };
}

export const piAgentAdapter: ExternalSessionSourceAdapter = {
  entry_id: "pi-agent",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    const jsonlFiles = walked.files.filter(item => item.entry.name.endsWith(".jsonl"));
    const startOffset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const batch = jsonlFiles.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    let unsupportedVersionFiles = 0;
    const sessions = [];

    for (const item of batch) {
      signal.throwIfAborted();
      const stem = extractPiNativeIdFromStem(item.entry.name.slice(0, -".jsonl".length));
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { lines } = await readJsonlLines(stream, signal, DISCOVERY_SCAN_BYTES);
        const meta = extractJsonlMetadata(lines, item.entry.mtime_ms);
        if (meta.validJsonCount === 0) {
          skippedCount++;
          continue;
        }
        if (!meta.hasSessionContent) {
          if (meta.unsupportedVersionCount > 0) unsupportedVersionFiles++;
          skippedCount++;
          continue;
        }
        let headerParent: string | null = meta.forkedFrom;
        if (!headerParent && lines.length > 0) {
          try {
            const first = JSON.parse(lines[0]!.line) as unknown;
            if (isRecord(first)) headerParent = extractPiForkParent(first.parentSession);
          } catch { /* ignore */ }
        }
        const nativeId = meta.sessionId && isValidNativeId(meta.sessionId) ? meta.sessionId : stem;
        if (!isValidNativeId(nativeId)) {
          skippedCount++;
          continue;
        }
        sessions.push({
          native_id: nativeId,
          title: meta.title,
          directory: meta.cwd,
          last_activity_at: meta.lastActivityAt,
          activity: "unknown" as const,
          forked_from_native_id: headerParent,
          return_target: buildCliResumeTarget(context.tool, nativeId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    if (startOffset === 0 && sessions.length === 0 && unsupportedVersionFiles > 0) {
      throw sessionSourceFailure("version_mismatch", "Pi Agent 会话记录版本暂不支持解析", false);
    }

    const nextOffset = startOffset + batch.length;
    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: nextOffset < jsonlFiles.length ? String(nextOffset) : null,
      total: jsonlFiles.length,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!context.root || !isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    let matchedRelative: string | null = null;
    for (const item of walked.files) {
      if (!item.entry.name.endsWith(".jsonl")) continue;
      const stem = extractPiNativeIdFromStem(item.entry.name.slice(0, -".jsonl".length));
      if (stem === nativeId) {
        matchedRelative = item.relative;
        break;
      }
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { lines } = await readJsonlLines(stream, signal, 32 * 1024);
        const meta = extractJsonlMetadata(lines, item.entry.mtime_ms);
        if (meta.sessionId === nativeId) {
          matchedRelative = item.relative;
          break;
        }
      } catch (error) {
        if (signal.aborted) throw error;
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
      return parsePiJsonlLines(lines, stopped);
    });
    return paginateAndSearchTranscript(parsed, input);
  },
};
