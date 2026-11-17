import { sessionsErrors } from "@molis-ai/molis-work-contracts/services/sessions";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
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
  normalizeIsoTimestamp,
  normalizeTitle,
  paginateAndSearchTranscript,
  parseMessageJsonlLines,
  readJsonlLines,
  readWholeTextBounded,
  walkFilesUnderRoot,
  withFileTranscriptCache,
  type ParsedTranscriptResult,
} from "./shared.js";

const DISCOVERY_BATCH_SIZE = 50;
const DISCOVERY_SCAN_BYTES = 2 * 1024 * 1024;

interface KimiSessionFiles {
  /** Relative session directory (`<workdir-hash>/<session-id>`). */
  dir: string;
  context: string | null;
  wire: string | null;
  metadata: string | null;
  state: string | null;
  mtime: number;
}

function collectKimiSessions(files: readonly { relative: string; entry: { name: string; mtime_ms: number } }[]): KimiSessionFiles[] {
  const byDir = new Map<string, KimiSessionFiles>();
  for (const item of files) {
    const name = item.entry.name;
    if (name !== "context.jsonl" && name !== "wire.jsonl" && name !== "metadata.json" && name !== "state.json") continue;
    const parts = item.relative.split("/");
    if (parts.length < 2) continue;
    const dir = parts.slice(0, -1).join("/");
    const record = byDir.get(dir) ?? { dir, context: null, wire: null, metadata: null, state: null, mtime: 0 };
    if (name === "context.jsonl") record.context = item.relative;
    else if (name === "wire.jsonl") record.wire = item.relative;
    else if (name === "metadata.json") record.metadata = item.relative;
    else record.state = item.relative;
    record.mtime = Math.max(record.mtime, item.entry.mtime_ms);
    byDir.set(dir, record);
  }
  return [...byDir.values()]
    .filter(record => record.context !== null || record.wire !== null)
    .sort((a, b) => b.mtime - a.mtime || (a.dir < b.dir ? -1 : 1));
}

function nativeIdFromDir(dir: string): string {
  return dir.split("/").pop() ?? "";
}

async function readMetadata(
  context: AdapterSourceContext,
  relative: string | null,
  signal: AbortSignal,
): Promise<Record<string, unknown> | null> {
  if (!relative || !context.root) return null;
  const stat = await context.ports.files.stat(context.root, relative, signal);
  if (!stat) return null;
  try {
    const stream = await context.ports.files.open(context.root, relative, signal);
    const { text } = await readWholeTextBounded(stream, signal, 64 * 1024);
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readKimiJsonl(
  context: AdapterSourceContext,
  relative: string,
  signal: AbortSignal,
  maxBytes?: number,
): Promise<{ lines: Awaited<ReturnType<typeof readJsonlLines>>["lines"]; stopped: Awaited<ReturnType<typeof readJsonlLines>>["stopped"] }> {
  if (!context.root) throw sessionsErrors.not_found("外部会话不存在或已被移除");
  const stream = await context.ports.files.open(context.root, relative, signal);
  return readJsonlLines(stream, signal, maxBytes);
}

async function parseKimiTranscript(
  context: AdapterSourceContext,
  relative: string,
  signal: AbortSignal,
  discovery: boolean,
  fallbackMtimeMs = 0,
): Promise<{ meta: ReturnType<typeof extractJsonlMetadata>; parsed: ParsedTranscriptResult | null }> {
  const { lines, stopped } = await readKimiJsonl(context, relative, signal, discovery ? DISCOVERY_SCAN_BYTES : undefined);
  return {
    meta: extractJsonlMetadata(lines, fallbackMtimeMs),
    parsed: discovery ? null : parseMessageJsonlLines(lines, stopped),
  };
}

function metadataValues(metadata: Record<string, unknown> | null): {
  sessionId: string | null;
  title: string | null;
  directory: string | null;
  updatedAt: string | null;
  forkedFrom: string | null;
} {
  if (!metadata) return { sessionId: null, title: null, directory: null, updatedAt: null, forkedFrom: null };
  const rawId = metadata.session_id ?? metadata.sessionId ?? metadata.id;
  const rawParent = metadata.parentSession ?? metadata.forkedFrom ?? metadata.forked_from;
  const rawDir = metadata.work_dir ?? metadata.workdir ?? metadata.cwd ?? metadata.workingDirectory;
  return {
    sessionId: typeof rawId === "string" && isValidNativeId(rawId) ? rawId : null,
    title: normalizeTitle(metadata.title ?? metadata.name),
    directory: typeof rawDir === "string" && rawDir.trim() ? rawDir.trim() : null,
    updatedAt: normalizeIsoTimestamp(metadata.updated_at ?? metadata.last_updated),
    forkedFrom: typeof rawParent === "string" && isValidNativeId(rawParent) ? rawParent : null,
  };
}

export const kimiCodeAdapter: ExternalSessionSourceAdapter = {
  entry_id: "kimi-code",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (!context.root) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    const walked = await walkFilesUnderRoot(context.ports, context.root, signal, 4);
    const candidates = collectKimiSessions(walked.files);
    const startOffset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
    const batch = candidates.slice(startOffset, startOffset + DISCOVERY_BATCH_SIZE);

    let skippedCount = startOffset === 0 ? walked.skipped : 0;
    let unsupportedVersionFiles = 0;
    const sessions: AdapterDiscoveryBatch["sessions"] = [];

    for (const candidate of batch) {
      signal.throwIfAborted();
      const stem = nativeIdFromDir(candidate.dir);
      try {
        const metadata = metadataValues(await readMetadata(context, candidate.state ?? candidate.metadata, signal));
        const primaryPath = candidate.context ?? candidate.wire!;
        let parsed = await parseKimiTranscript(context, primaryPath, signal, true, candidate.mtime);
        if (!parsed.meta.hasSessionContent && candidate.wire && candidate.context) {
          const wire = await parseKimiTranscript(context, candidate.wire, signal, true, candidate.mtime);
          if (wire.meta.hasSessionContent) parsed = wire;
        }
        if (!parsed.meta.hasSessionContent) {
          if (parsed.meta.unsupportedVersionCount > 0) unsupportedVersionFiles++;
          skippedCount++;
          continue;
        }
        const nativeId = metadata.sessionId
          ?? (parsed.meta.sessionId && isValidNativeId(parsed.meta.sessionId) ? parsed.meta.sessionId : null)
          ?? (isValidNativeId(stem) ? stem : null);
        if (!nativeId) {
          skippedCount++;
          continue;
        }
        const lastActivity = metadata.updatedAt && metadata.updatedAt > parsed.meta.lastActivityAt
          ? metadata.updatedAt
          : parsed.meta.lastActivityAt;
        sessions.push({
          native_id: nativeId,
          title: metadata.title ?? parsed.meta.title,
          directory: metadata.directory ?? parsed.meta.cwd,
          last_activity_at: lastActivity,
          activity: "unknown" as const,
          forked_from_native_id: metadata.forkedFrom ?? parsed.meta.forkedFrom,
          return_target: buildCliResumeTarget(context.tool, nativeId),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        skippedCount++;
      }
    }

    if (startOffset === 0 && sessions.length === 0 && unsupportedVersionFiles > 0) {
      throw sessionSourceFailure("version_mismatch", "Kimi Code 会话记录版本暂不支持解析", false);
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
    const candidates = collectKimiSessions(walked.files);
    let matched: KimiSessionFiles | null = null;
    for (const candidate of candidates) {
      if (nativeIdFromDir(candidate.dir) === nativeId) { matched = candidate; break; }
      const metadata = metadataValues(await readMetadata(context, candidate.state ?? candidate.metadata, signal));
      if (metadata.sessionId === nativeId) { matched = candidate; break; }
      const parsed = await parseKimiTranscript(context, candidate.context ?? candidate.wire!, signal, true);
      if (parsed.meta.sessionId === nativeId) { matched = candidate; break; }
    }
    if (!matched) throw sessionsErrors.not_found("外部会话不存在或已被移除");

    const root = context.root;
    const relative = matched.context ?? matched.wire!;
    const transcript = await withFileTranscriptCache(context.ports, root, relative, signal, async () => {
      let parsed = await parseKimiTranscript(context, relative, signal, false) as { parsed: ParsedTranscriptResult };
      if (parsed.parsed.entries.length === 0 && matched!.wire && matched!.context) {
        const wire = await parseKimiTranscript(context, matched!.wire, signal, false) as { parsed: ParsedTranscriptResult };
        if (wire.parsed.entries.length > 0) parsed = wire;
      }
      return parsed.parsed;
    });
    return paginateAndSearchTranscript(transcript, input);
  },
};
