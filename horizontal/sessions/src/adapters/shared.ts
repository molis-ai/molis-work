import {
  EXTERNAL_SESSION_ENTRY_MAX_BYTES,
  EXTERNAL_SESSION_HISTORY_DEFAULT,
  EXTERNAL_SESSION_HISTORY_MAX,
  EXTERNAL_SESSION_PAGE_MAX_BYTES,
  EXTERNAL_SESSION_SCAN_MAX_BYTES,
  sessionsErrors,
  type ExternalSessionActivity,
  type ExternalSessionEntry,
  type ExternalSessionHistoryInput,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { EXTERNAL_SESSION_NATIVE_ID_PATTERN, type ExternalToolEntry } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { cutCharacters, cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { SessionSourceFailure, type AdapterReadOutput, type SessionDirectoryEntry, type SessionsPorts } from "../ports.js";

export function isValidNativeId(value: string): boolean;
export function isValidNativeId(value: unknown): value is string;
export function isValidNativeId(value: unknown): boolean {
  return typeof value === "string" && EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(value);
}

export function normalizeIsoTimestamp(value: unknown, fallbackMs?: number): string | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value < 1e11 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (fallbackMs !== undefined && Number.isFinite(fallbackMs) && fallbackMs > 0) {
    return new Date(fallbackMs).toISOString();
  }
  return null;
}

export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/gu, " ").trim();
  if (!collapsed) return null;
  return cutCharacters(collapsed, 200);
}

export function buildCliResumeTarget(tool: ExternalToolEntry, nativeId: string): { kind: "command"; label: string } | null {
  const resume = tool.sessions.resume;
  const command = tool.terminal?.command ?? tool.detect?.commands[0];
  if (!command || resume.via !== "command") return null;
  const parts = [command, ...resume.argv.map(arg => (arg === "{session_id}" ? nativeId : arg))];
  return { kind: "command", label: parts.join(" ") };
}

export function truncateEntryText(raw: string, maxBytes = EXTERNAL_SESSION_ENTRY_MAX_BYTES): { text: string; truncated: boolean } {
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength <= maxBytes) return { text: raw, truncated: false };
  // Approximate UTF-16 bound first, then tighten until UTF-8 byte length fits cleanly on code-point boundary.
  let candidate = cutHead(raw, maxBytes);
  while (Buffer.byteLength(candidate, "utf8") > maxBytes && candidate.length > 0) {
    const excess = Buffer.byteLength(candidate, "utf8") - maxBytes;
    const step = Math.max(1, Math.floor(excess / 3));
    candidate = cutHead(candidate, Math.max(0, candidate.length - step));
  }
  return { text: candidate, truncated: true };
}

export function makeEntry(input: {
  position: string;
  role: ExternalSessionEntry["role"];
  at: string | null;
  text: string;
  step?: ExternalSessionEntry["step"];
}): ExternalSessionEntry {
  const { text, truncated } = truncateEntryText(input.text);
  return {
    position: input.position,
    role: input.role,
    at: input.at,
    text,
    truncated,
    ...(input.step ? { step: input.step } : {}),
  };
}

export function literalRanges(text: string, query: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!query) return ranges;
  let index = 0;
  while (index <= text.length - query.length) {
    const found = text.indexOf(query, index);
    if (found < 0) break;
    ranges.push([found, found + query.length]);
    index = found + Math.max(1, query.length);
  }
  return ranges;
}

export interface ParsedTranscriptResult {
  entries: ExternalSessionEntry[];
  activity: ExternalSessionActivity;
  partial_stop: { code: string; at: string | null; retryable: boolean } | null;
  entry_source_bytes?: number[];
}

export function paginateAndSearchTranscript(
  parsed: ParsedTranscriptResult,
  input: Omit<ExternalSessionHistoryInput, "session_key">,
): AdapterReadOutput {
  const allEntries = parsed.entries;
  if (allEntries.length === 0) {
    if (parsed.partial_stop) {
      if (parsed.partial_stop.code === "sessions.version_unreadable") {
        throw sessionsErrors.version_unreadable("当前版本的会话记录格式无法解析");
      }
      throw sessionsErrors.read_failed("未能从外部工具读到会话内容");
    }
    throw sessionsErrors.read_failed("外部会话暂无可读记录");
  }

  const limit = Math.min(Math.max(1, input.limit ?? EXTERNAL_SESSION_HISTORY_DEFAULT), EXTERNAL_SESSION_HISTORY_MAX);
  const indexByPosition = new Map<string, number>();
  allEntries.forEach((item, idx) => indexByPosition.set(item.position, idx));

  const resolveIndex = (pos: string): number => {
    const idx = indexByPosition.get(pos);
    if (idx === undefined) throw sessionsErrors.cursor_invalid("会话位置无效或已不在记录中");
    return idx;
  };

  let startIndex = 0;
  let endIndexExclusive = allEntries.length;

  if (!input.from) {
    // Newest page: walk backwards from end within `limit` and `EXTERNAL_SESSION_PAGE_MAX_BYTES`.
    let bytes = 0;
    let count = 0;
    let idx = allEntries.length - 1;
    while (idx >= 0 && count < limit) {
      const entryBytes = Buffer.byteLength(allEntries[idx]!.text, "utf8");
      if (count > 0 && bytes + entryBytes > EXTERNAL_SESSION_PAGE_MAX_BYTES) break;
      bytes += entryBytes;
      count++;
      idx--;
    }
    startIndex = idx + 1;
    endIndexExclusive = allEntries.length;
  } else if ("before" in input.from) {
    const target = resolveIndex(input.from.before);
    endIndexExclusive = target;
    let bytes = 0;
    let count = 0;
    let idx = target - 1;
    while (idx >= 0 && count < limit) {
      const entryBytes = Buffer.byteLength(allEntries[idx]!.text, "utf8");
      if (count > 0 && bytes + entryBytes > EXTERNAL_SESSION_PAGE_MAX_BYTES) break;
      bytes += entryBytes;
      count++;
      idx--;
    }
    startIndex = Math.max(0, idx + 1);
  } else if ("after" in input.from) {
    const target = resolveIndex(input.from.after);
    startIndex = target + 1;
    let bytes = 0;
    let count = 0;
    let idx = startIndex;
    while (idx < allEntries.length && count < limit) {
      const entryBytes = Buffer.byteLength(allEntries[idx]!.text, "utf8");
      if (count > 0 && bytes + entryBytes > EXTERNAL_SESSION_PAGE_MAX_BYTES) break;
      bytes += entryBytes;
      count++;
      idx++;
    }
    endIndexExclusive = idx;
  } else if ("around" in input.from) {
    const center = resolveIndex(input.from.around);
    const halfBefore = Math.floor((limit - 1) / 2);
    startIndex = Math.max(0, center - halfBefore);
    endIndexExclusive = Math.min(allEntries.length, startIndex + limit);
    let bytes = 0;
    let trimmedEnd = startIndex;
    while (trimmedEnd < endIndexExclusive) {
      const entryBytes = Buffer.byteLength(allEntries[trimmedEnd]!.text, "utf8");
      if (trimmedEnd > center && bytes + entryBytes > EXTERNAL_SESSION_PAGE_MAX_BYTES) break;
      if (trimmedEnd <= center && bytes + entryBytes > EXTERNAL_SESSION_PAGE_MAX_BYTES && trimmedEnd > startIndex) {
        startIndex++;
        bytes = 0;
        trimmedEnd = startIndex;
        continue;
      }
      bytes += entryBytes;
      trimmedEnd++;
    }
    endIndexExclusive = Math.max(center + 1, trimmedEnd);
  }

  const pageEntries = allEntries.slice(startIndex, endIndexExclusive);
  const olderCursor = startIndex > 0 && pageEntries.length > 0 ? pageEntries[0]!.position : null;
  const newerCursor = endIndexExclusive < allEntries.length && pageEntries.length > 0
    ? pageEntries[pageEntries.length - 1]!.position
    : null;

  let matches: Array<{ position: string; ranges: Array<[number, number]> }> = [];
  let search: { scanned_all: boolean; next_cursor: string | null } | null = null;

  if (input.query !== undefined) {
    let scanStart = 0;
    if (input.from && "after" in input.from) {
      scanStart = resolveIndex(input.from.after) + 1;
    }
    let scannedBytes = 0;
    let scannedAll = true;
    let nextSearchCursor: string | null = null;
    for (let i = scanStart; i < allEntries.length; i++) {
      const item = allEntries[i]!;
      const rawBytes = parsed.entry_source_bytes?.[i] ?? Buffer.byteLength(item.text, "utf8");
      if (i > scanStart && scannedBytes + rawBytes > EXTERNAL_SESSION_SCAN_MAX_BYTES) {
        scannedAll = false;
        nextSearchCursor = allEntries[i - 1]!.position;
        break;
      }
      scannedBytes += rawBytes;
      const found = literalRanges(item.text, input.query);
      if (found.length > 0) {
        matches.push({ position: item.position, ranges: found });
      }
    }
    search = { scanned_all: scannedAll, next_cursor: nextSearchCursor };
  }

  const stopped = parsed.partial_stop;
  return {
    entries: pageEntries,
    older_cursor: olderCursor,
    newer_cursor: newerCursor,
    matches,
    search,
    read_state: stopped ? "partial" : "complete",
    stopped,
    activity: parsed.activity,
  };
}

export interface JsonlLineRecord {
  offset: number;
  byteLength: number;
  line: string;
}

/**
 * Streams a UTF-8 file up to `maxBytes`, yielding each line with its exact starting byte offset so `position` remains
 * invariant across future appends (SRB-10).
 */
export async function readJsonlLines(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes = EXTERNAL_SESSION_SCAN_MAX_BYTES * 2,
): Promise<{ lines: JsonlLineRecord[]; stopped: { code: string; retryable: boolean } | null }> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let stopped: { code: string; retryable: boolean } | null = null;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (totalBytes + value.byteLength > maxBytes) {
        const allowed = maxBytes - totalBytes;
        if (allowed > 0) chunks.push(Buffer.from(value.subarray(0, allowed)));
        totalBytes = maxBytes;
        stopped = { code: "sessions.read_failed", retryable: false };
        break;
      }
      chunks.push(Buffer.from(value));
      totalBytes += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    const retryable = error instanceof SessionSourceFailure ? error.retryable : true;
    stopped = { code: "sessions.read_failed", retryable };
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }

  const buffer = Buffer.concat(chunks);
  const lines: JsonlLineRecord[] = [];
  let lineStart = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x0a) {
      const end = i > lineStart && buffer[i - 1] === 0x0d ? i - 1 : i;
      const line = buffer.subarray(lineStart, end).toString("utf8");
      lines.push({ offset: lineStart, byteLength: i - lineStart + 1, line });
      lineStart = i + 1;
    }
  }
  if (lineStart < buffer.length) {
    const end = buffer[buffer.length - 1] === 0x0d ? buffer.length - 1 : buffer.length;
    const line = buffer.subarray(lineStart, end).toString("utf8");
    lines.push({ offset: lineStart, byteLength: buffer.length - lineStart, line });
  }
  return { lines, stopped };
}

export async function readWholeTextBounded(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes = EXTERNAL_SESSION_SCAN_MAX_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (total + value.byteLength > maxBytes) {
        const remain = maxBytes - total;
        if (remain > 0) chunks.push(Buffer.from(value.subarray(0, remain)));
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(value));
      total += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

interface TranscriptCacheEntry {
  key: string;
  expires_at: number;
  parsed: ParsedTranscriptResult;
}

const TRANSCRIPT_CACHE_MAX = 16;
const TRANSCRIPT_CACHE_TTL_MS = 30_000;
const transcriptCache = new Map<string, TranscriptCacheEntry>();

export async function withFileTranscriptCache(
  ports: SessionsPorts,
  root: string,
  relative: string,
  signal: AbortSignal,
  load: () => Promise<ParsedTranscriptResult>,
): Promise<ParsedTranscriptResult> {
  const stat = await ports.files.stat(root, relative, signal);
  const now = (ports.clock ?? (() => new Date()))().getTime();
  if (stat) {
    const cacheKey = `${root}\0${relative}\0${stat.size}\0${stat.mtime_ms}`;
    const hit = transcriptCache.get(cacheKey);
    if (hit && hit.expires_at > now) return hit.parsed;
    const parsed = await load();
    if (!parsed.partial_stop) {
      transcriptCache.set(cacheKey, { key: cacheKey, expires_at: now + TRANSCRIPT_CACHE_TTL_MS, parsed });
      while (transcriptCache.size > TRANSCRIPT_CACHE_MAX) {
        const oldest = transcriptCache.keys().next().value;
        if (!oldest) break;
        transcriptCache.delete(oldest);
      }
    }
    return parsed;
  }
  return load();
}

export async function walkFilesUnderRoot(
  ports: SessionsPorts,
  root: string,
  signal: AbortSignal,
  maxDepth = 4,
): Promise<{ files: Array<{ relative: string; entry: SessionDirectoryEntry }>; skipped: number }> {
  const files: Array<{ relative: string; entry: SessionDirectoryEntry }> = [];
  let skipped = 0;
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    signal.throwIfAborted();
    let entries: readonly SessionDirectoryEntry[];
    try {
      entries = await ports.files.list(root, rel, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      if (rel === "") throw error;
      skipped++;
      return;
    }
    for (const item of entries) {
      const childRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.kind === "file") {
        files.push({ relative: childRel, entry: item });
      } else if (item.kind === "directory") {
        await walk(childRel, depth + 1);
      }
    }
  };
  await walk("", 0);
  files.sort((a, b) => b.entry.mtime_ms - a.entry.mtime_ms || (a.relative < b.relative ? -1 : 1));
  return { files, skipped };
}

/**
 * Shared parser for JSONL message-style local session logs (Claude Code, Qoder CN, Kimi Code, MiniMax Code).
 * Preserves append-stable byte offsets, omits `thinking` / reasoning blocks, turns attachments into `note`, and pairs tool steps.
 */
export function parseMessageJsonlLines(lines: readonly JsonlLineRecord[], initialStopped: { code: string; retryable: boolean } | null): ParsedTranscriptResult {
  const entries: ExternalSessionEntry[] = [];
  const sourceBytes: number[] = [];
  const toolUseIndex = new Map<string, number>();
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
        partialStop = {
          code: "sessions.version_unreadable",
          at: entries[entries.length - 1]!.position,
          retryable: false,
        };
        break;
      }
      continue;
    }
    if (!isRecord(obj)) continue;

    const at = normalizeIsoTimestamp(obj.timestamp ?? obj.created_at ?? obj.time);
    const type = typeof obj.type === "string" ? obj.type : undefined;
    if (type === "summary" || type === "file-history-snapshot" || type === "queue-operation") continue;

    const msg = isRecord(obj.message) ? obj.message : obj;
    const rawRole = typeof msg.role === "string" ? msg.role : type;
    const content = msg.content;
    let part = 0;
    const push = (entry: Omit<ExternalSessionEntry, "position" | "truncated">) => {
      const built = makeEntry({ ...entry, position: `byte:${record.offset}:${part++}` });
      entries.push(built);
      sourceBytes.push(record.byteLength);
      return entries.length - 1;
    };

    if (typeof content === "string") {
      if (rawRole === "user" || rawRole === "human") {
        if (content.trim()) push({ role: "you", at, text: content });
      } else if (rawRole === "assistant" || rawRole === "model") {
        if (content.trim()) push({ role: "tool", at, text: content });
      } else if (rawRole === "tool") {
        const toolName = typeof msg.name === "string" ? msg.name : typeof obj.tool_name === "string" ? obj.tool_name : "tool";
        const isErr = msg.is_error === true || obj.is_error === true;
        push({ role: "tool_step", at, text: content, step: { name: toolName, status: isErr ? "failed" : "ok" } });
      } else if (rawRole === "system" || type === "system") {
        if (content.trim()) push({ role: "note", at, text: content });
      }
      continue;
    }

    if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block)) continue;
        const blockType = typeof block.type === "string" ? block.type : "";
        // Never emit hidden reasoning / thinking blocks (contract-design §6.3).
        if (blockType === "thinking" || blockType === "redacted_thinking" || blockType === "reasoning") continue;
        if (blockType === "image" || blockType === "document" || blockType === "audio" || blockType === "file") {
          push({ role: "note", at, text: "[附件未读取]" });
          continue;
        }
        if (blockType === "text" && typeof block.text === "string") {
          if (!block.text.trim()) continue;
          push({ role: rawRole === "user" || rawRole === "human" ? "you" : "tool", at, text: block.text });
          continue;
        }
        if (blockType === "tool_use" || blockType === "toolCall") {
          const name = typeof block.name === "string" ? block.name : "tool";
          const summary = block.input !== undefined ? JSON.stringify(block.input) : block.arguments !== undefined ? JSON.stringify(block.arguments) : name;
          const idx = push({ role: "tool_step", at, text: summary, step: { name, status: "unknown" } });
          const id = typeof block.id === "string" ? block.id : undefined;
          if (id) toolUseIndex.set(id, idx);
          continue;
        }
        if (blockType === "tool_result") {
          const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined;
          const isError = block.is_error === true;
          const resultText = typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.filter(isRecord).map(c => (typeof c.text === "string" ? c.text : "")).filter(Boolean).join("\n")
              : "";
          if (toolUseId && toolUseIndex.has(toolUseId)) {
            const prevIdx = toolUseIndex.get(toolUseId)!;
            const prev = entries[prevIdx]!;
            const combined = resultText ? `${prev.text}\n${resultText}` : prev.text;
            const truncated = truncateEntryText(combined);
            entries[prevIdx] = {
              ...prev,
              text: truncated.text,
              truncated: prev.truncated || truncated.truncated,
              step: { name: prev.step?.name ?? "tool", status: isError ? "failed" : "ok" },
            };
          } else {
            push({
              role: "tool_step",
              at,
              text: resultText || "(tool result)",
              step: { name: "tool", status: isError ? "failed" : "ok" },
            });
          }
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

export function extractJsonlMetadata(lines: readonly JsonlLineRecord[], fallbackMtimeMs: number): {
  sessionId: string | null;
  title: string | null;
  cwd: string | null;
  lastActivityAt: string;
  forkedFrom: string | null;
  validJsonCount: number;
} {
  let sessionId: string | null = null;
  let title: string | null = null;
  let firstUserText: string | null = null;
  let cwd: string | null = null;
  let lastActivityAt: string | null = null;
  let forkedFrom: string | null = null;
  let validJsonCount = 0;

  for (const record of lines) {
    const trimmed = record.line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(obj)) continue;
    validJsonCount++;

    if (!sessionId) {
      const candidateId = obj.sessionId ?? obj.session_id ?? (obj.type === "session" ? obj.id : undefined);
      if (typeof candidateId === "string") sessionId = candidateId;
    }
    if (!cwd) {
      const candidateCwd = obj.cwd ?? obj.work_dir ?? obj.workingDirectory ?? obj.directory;
      if (typeof candidateCwd === "string" && candidateCwd.trim()) cwd = candidateCwd.trim();
    }
    if (!forkedFrom) {
      const parent = obj.parentSession ?? obj.forkedFrom ?? obj.forked_from;
      if (typeof parent === "string" && isValidNativeId(parent)) forkedFrom = parent;
    }
    if (obj.type === "summary" && typeof obj.summary === "string") {
      const normalized = normalizeTitle(obj.summary);
      if (normalized) title = normalized;
    }
    if (typeof obj.title === "string" && !title) {
      title = normalizeTitle(obj.title);
    }
    const ts = normalizeIsoTimestamp(obj.timestamp ?? obj.created_at ?? obj.updated_at ?? obj.time);
    if (ts && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;

    if (!firstUserText) {
      const msg = isRecord(obj.message) ? obj.message : obj;
      const role = typeof msg.role === "string" ? msg.role : obj.type;
      if (role === "user" || role === "human") {
        if (typeof msg.content === "string") {
          firstUserText = normalizeTitle(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
              const t = normalizeTitle(block.text);
              if (t) { firstUserText = t; break; }
            }
          }
        }
      }
    }
  }

  return {
    sessionId,
    title: title ?? firstUserText,
    cwd,
    lastActivityAt: lastActivityAt ?? normalizeIsoTimestamp(undefined, fallbackMtimeMs) ?? new Date(0).toISOString(),
    forkedFrom,
    validJsonCount,
  };
}
