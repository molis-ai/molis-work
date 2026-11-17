import { sessionsErrors, type ExternalSessionEntry } from "@molis-ai/molis-work-contracts/services/sessions";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { sessionSourceFailure, type AdapterDiscoveryBatch, type AdapterReadOutput, type AdapterSourceContext, type ExternalSessionSourceAdapter } from "../ports.js";
import {
  buildCliResumeTarget,
  isValidNativeId,
  makeEntry,
  normalizeIsoTimestamp,
  normalizeTitle,
  paginateAndSearchTranscript,
  readWholeTextBounded,
  walkFilesUnderRoot,
  withFileTranscriptCache,
  type ParsedTranscriptResult,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;

function isGeminiSessionJson(_relative: string, fileName: string): { candidate: boolean; stem: string } {
  if (!fileName.endsWith(".json")) return { candidate: false, stem: "" };
  if (fileName === "logs.json" || fileName === "settings.json" || fileName === "projects.json") {
    return { candidate: false, stem: "" };
  }
  return { candidate: true, stem: fileName.slice(0, -".json".length) };
}

function parseGeminiMessages(rawObj: Record<string, unknown>): ParsedTranscriptResult {
  const rawMessages = Array.isArray(rawObj.messages) ? rawObj.messages : [];
  const entries: ExternalSessionEntry[] = [];
  const sourceBytes: number[] = [];

  for (let msgIdx = 0; msgIdx < rawMessages.length; msgIdx++) {
    const msg = rawMessages[msgIdx];
    if (!isRecord(msg)) continue;
    const at = normalizeIsoTimestamp(msg.timestamp ?? msg.createdAt ?? msg.time);
    const rawType = typeof msg.type === "string" ? msg.type : typeof msg.role === "string" ? msg.role : "gemini";
    let partIdx = 0;
    const push = (entry: Omit<ExternalSessionEntry, "position" | "truncated">, rawByteLen: number) => {
      entries.push(makeEntry({ ...entry, position: `msg:${msgIdx}:${partIdx++}` }));
      sourceBytes.push(rawByteLen);
    };

    const role: ExternalSessionEntry["role"] =
      rawType === "user" || rawType === "human"
        ? "you"
        : rawType === "info" || rawType === "system" || rawType === "error"
          ? "note"
          : "tool";

    // Explicitly skip `msg.thoughts` so hidden reasoning never enters transcripts.
    const content = msg.content;
    if (typeof content === "string" && content.trim()) {
      push({ role, at, text: content }, Buffer.byteLength(content, "utf8"));
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (!isRecord(part)) continue;
        if ("thought" in part && part.thought === true) continue;
        if (typeof part.text === "string" && part.text.trim()) {
          push({ role, at, text: part.text }, Buffer.byteLength(part.text, "utf8"));
        } else if ("inlineData" in part || "fileData" in part) {
          push({ role: "note", at, text: "[附件未读取]" }, 16);
        } else if (isRecord(part.functionCall)) {
          const fnName = typeof part.functionCall.name === "string" ? part.functionCall.name : "tool";
          const argsText = part.functionCall.args !== undefined ? JSON.stringify(part.functionCall.args) : fnName;
          push({ role: "tool_step", at, text: argsText, step: { name: fnName, status: "unknown" } }, Buffer.byteLength(argsText, "utf8"));
        } else if (isRecord(part.functionResponse)) {
          const fnName = typeof part.functionResponse.name === "string" ? part.functionResponse.name : "tool";
          const respText = part.functionResponse.response !== undefined ? JSON.stringify(part.functionResponse.response) : "(response)";
          push({ role: "tool_step", at, text: respText, step: { name: fnName, status: "ok" } }, Buffer.byteLength(respText, "utf8"));
        }
      }
    }

    if (Array.isArray(msg.toolCalls)) {
      for (const call of msg.toolCalls) {
        if (!isRecord(call)) continue;
        const name = typeof call.name === "string" ? call.name : "tool";
        const statusRaw = typeof call.status === "string" ? call.status : "";
        const status: "ok" | "failed" | "unknown" =
          statusRaw === "error" || statusRaw === "failed" || statusRaw === "cancelled"
            ? "failed"
            : statusRaw === "success" || statusRaw === "ok" || statusRaw === "completed"
              ? "ok"
              : "unknown";
        const argsStr = call.args !== undefined ? JSON.stringify(call.args) : "";
        const resStr = typeof call.resultDisplay === "string"
          ? call.resultDisplay
          : typeof call.result === "string"
            ? call.result
            : call.result !== undefined
              ? JSON.stringify(call.result)
              : "";
        const combined = [argsStr, resStr].filter(Boolean).join("\n") || name;
        push({ role: "tool_step", at, text: combined, step: { name, status } }, Buffer.byteLength(combined, "utf8"));
      }
    }
  }

  return {
    entries,
    activity: "unknown",
    partial_stop: null,
    entry_source_bytes: sourceBytes,
  };
}

export const geminiCliAdapter: ExternalSessionSourceAdapter = {
  entry_id: "gemini-cli",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    const candidates = walked.files.filter(item => isGeminiSessionJson(item.relative, item.entry.name).candidate);
    const startOffset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const batch = candidates.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    let unsupportedVersionFiles = 0;
    const sessions = [];

    for (const item of batch) {
      signal.throwIfAborted();
      const { stem } = isGeminiSessionJson(item.relative, item.entry.name);
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { text } = await readWholeTextBounded(stream, signal, 4 * 1024 * 1024);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          unsupportedVersionFiles++;
          skippedCount++;
          continue;
        }
        if (!isRecord(parsed) || !Array.isArray(parsed.messages)) {
          unsupportedVersionFiles++;
          skippedCount++;
          continue;
        }
        const rawId = typeof parsed.sessionId === "string" ? parsed.sessionId : stem;
        if (!isValidNativeId(rawId)) {
          skippedCount++;
          continue;
        }
        let firstUserTitle: string | null = null;
        for (const m of parsed.messages) {
          if (!isRecord(m)) continue;
          const mType = typeof m.type === "string" ? m.type : m.role;
          if (mType === "user" || mType === "human") {
            if (typeof m.content === "string") {
              firstUserTitle = normalizeTitle(m.content);
            } else if (Array.isArray(m.content)) {
              for (const p of m.content) {
                if (isRecord(p) && typeof p.text === "string") {
                  firstUserTitle = normalizeTitle(p.text);
                  if (firstUserTitle) break;
                }
              }
            }
            if (firstUserTitle) break;
          }
        }
        const title = normalizeTitle(parsed.summary ?? parsed.title) ?? firstUserTitle;
        const cwd = typeof parsed.cwd === "string" && parsed.cwd.trim()
          ? parsed.cwd.trim()
          : typeof parsed.workingDirectory === "string" && parsed.workingDirectory.trim()
            ? parsed.workingDirectory.trim()
            : null;
        const lastActivityAt =
          normalizeIsoTimestamp(parsed.lastUpdated ?? parsed.updatedAt ?? parsed.startTime, item.entry.mtime_ms)
          ?? new Date(0).toISOString();

        sessions.push({
          native_id: rawId,
          title,
          directory: cwd,
          last_activity_at: lastActivityAt,
          activity: "unknown" as const,
          return_target: buildCliResumeTarget(context.tool, rawId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    if (startOffset === 0 && sessions.length === 0 && unsupportedVersionFiles > 0) {
      throw sessionSourceFailure("version_mismatch", "Gemini CLI 会话记录版本暂不支持解析", false);
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
      const check = isGeminiSessionJson(item.relative, item.entry.name);
      if (!check.candidate) continue;
      if (check.stem === nativeId) {
        matchedRelative = item.relative;
        break;
      }
      try {
        const stream = await context.ports.files.open(context.root, item.relative, signal);
        const { text } = await readWholeTextBounded(stream, signal, 4 * 1024 * 1024);
        const obj = JSON.parse(text) as unknown;
        if (isRecord(obj) && obj.sessionId === nativeId) {
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
    const transcript = await withFileTranscriptCache(context.ports, root, relative, signal, async () => {
      const stream = await context.ports.files.open(root, relative, signal);
      const { text, truncated } = await readWholeTextBounded(stream, signal);
      let obj: unknown;
      try {
        obj = JSON.parse(text);
      } catch {
        return {
          entries: [],
          activity: "unknown" as const,
          partial_stop: { code: "sessions.version_unreadable", at: null, retryable: false },
        };
      }
      if (!isRecord(obj) || !Array.isArray(obj.messages)) {
        return {
          entries: [],
          activity: "unknown" as const,
          partial_stop: { code: "sessions.version_unreadable", at: null, retryable: false },
        };
      }
      const parsed = parseGeminiMessages(obj);
      if (truncated && parsed.entries.length > 0) {
        return {
          ...parsed,
          partial_stop: {
            code: "sessions.read_failed",
            at: parsed.entries[parsed.entries.length - 1]!.position,
            retryable: false,
          },
        };
      }
      return parsed;
    });
    return paginateAndSearchTranscript(transcript, input);
  },
};
