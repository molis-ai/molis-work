import { sessionsErrors, type ExternalSessionActivity, type ExternalSessionEntry } from "@molis-ai/molis-work-contracts/services/sessions";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import {
  SessionSourceFailure,
  type AdapterDiscoveryBatch,
  type AdapterReadOutput,
  type AdapterSourceContext,
  type ExternalSessionSourceAdapter,
} from "../ports.js";
import {
  isValidNativeId,
  makeEntry,
  normalizeIsoTimestamp,
  normalizeTitle,
  paginateAndSearchTranscript,
} from "./shared.js";

function classifyGhFailure(stderr: string): SessionSourceFailure {
  const lower = stderr.toLowerCase();
  if (lower.includes("auth login") || lower.includes("not logged in") || lower.includes("authentication") || lower.includes("http 401")) {
    return new SessionSourceFailure("login_expired", stderr || "GitHub CLI login expired", false);
  }
  return new SessionSourceFailure("read_error", stderr || "GitHub CLI agent-task command failed", true);
}

function mapCopilotState(raw: unknown): ExternalSessionActivity {
  if (typeof raw !== "string") return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "running" || lower === "in_progress" || lower === "queued" || lower === "pending") return "running";
  if (
    lower === "completed"
    || lower === "succeeded"
    || lower === "success"
    || lower === "failed"
    || lower === "cancelled"
    || lower === "canceled"
    || lower === "stopped"
  ) {
    return "idle";
  }
  return "unknown";
}

function parseCopilotLogEntries(rawLog: string): ExternalSessionEntry[] {
  const entries: ExternalSessionEntry[] = [];
  const buffer = Buffer.from(rawLog, "utf8");
  let offset = 0;

  interface BlockAccumulator {
    startOffset: number;
    role: ExternalSessionEntry["role"];
    at: string | null;
    stepName?: string;
    lines: string[];
  }
  let current: BlockAccumulator | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.lines.join("\n").trim();
    if (text) {
      entries.push(
        makeEntry({
          position: `byte:${current.startOffset}`,
          role: current.role,
          at: current.at,
          text,
          step: current.role === "tool_step" ? { name: current.stepName ?? "step", status: "ok" } : undefined,
        }),
      );
    }
    current = null;
  };

  while (offset < buffer.length) {
    let lineEnd = buffer.indexOf(0x0a, offset);
    if (lineEnd < 0) lineEnd = buffer.length;
    const rawLine = buffer.subarray(offset, lineEnd > offset && buffer[lineEnd - 1] === 0x0d ? lineEnd - 1 : lineEnd).toString("utf8");
    const lineOffset = offset;
    offset = lineEnd + 1;

    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Optional leading ISO timestamp like `2026-11-10T01:02:03Z ...`
    const tsMatch = /^(\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?)\s+(.*)$/u.exec(trimmed);
    const ts = tsMatch ? normalizeIsoTimestamp(tsMatch[1]) : null;
    const body = tsMatch ? tsMatch[2]! : trimmed;

    const userMatch = /^(?:\[user\]|user:|prompt:)\s*(.*)$/iu.exec(body);
    const toolMatch = /^(?:\[tool(?::([^\]]+))?\]|tool(?:\(([^)]+)\))?:)\s*(.*)$/iu.exec(body);
    const assistantMatch = /^(?:\[assistant\]|\[agent\]|assistant:|copilot:)\s*(.*)$/iu.exec(body);

    if (userMatch) {
      flush();
      current = { startOffset: lineOffset, role: "you", at: ts, lines: [userMatch[1]! || body] };
    } else if (toolMatch) {
      flush();
      const stepName = (toolMatch[1] ?? toolMatch[2] ?? "tool").trim() || "tool";
      current = { startOffset: lineOffset, role: "tool_step", at: ts, stepName, lines: [toolMatch[3]! || body] };
    } else if (assistantMatch) {
      flush();
      current = { startOffset: lineOffset, role: "tool", at: ts, lines: [assistantMatch[1]! || body] };
    } else if (current) {
      current.lines.push(rawLine);
    } else {
      current = { startOffset: lineOffset, role: "tool", at: ts, lines: [body] };
    }
  }
  flush();
  return entries;
}

export const copilotCodingAgentAdapter: ExternalSessionSourceAdapter = {
  entry_id: "copilot-coding-agent",

  async discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch> {
    if (cursor !== null) return { sessions: [], skipped_count: 0, next_cursor: null, total: 0 };
    if (!context.connection_id) {
      throw new SessionSourceFailure("connection_removed", "Missing GitHub CLI connection", false);
    }
    const discoverSpec = context.tool.sessions.discover;
    if (discoverSpec.via !== "command") {
      throw new SessionSourceFailure("version_mismatch", "Unexpected discover spec for copilot-coding-agent", false);
    }

    const result = await context.ports.connections.command(context.connection_id, context.entry_id, discoverSpec.argv, signal);
    if (result.exit_code !== 0) {
      throw classifyGhFailure(result.stderr);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout || "[]");
    } catch {
      throw new SessionSourceFailure("parse_error", "Invalid JSON from gh agent-task list", false);
    }
    if (!Array.isArray(parsed)) {
      throw new SessionSourceFailure("parse_error", "Expected JSON array from gh agent-task list", false);
    }

    const sessions = [];
    let skippedCount = 0;

    for (const item of parsed) {
      if (!isRecord(item)) {
        skippedCount++;
        continue;
      }
      const rawId = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "";
      if (!isValidNativeId(rawId)) {
        skippedCount++;
        continue;
      }
      const updatedAt = normalizeIsoTimestamp(item.updatedAt ?? item.completedAt ?? item.createdAt);
      if (!updatedAt) {
        skippedCount++;
        continue;
      }
      const repoLabel = typeof item.repository === "string"
        ? item.repository
        : isRecord(item.repository) && typeof item.repository.nameWithOwner === "string"
          ? item.repository.nameWithOwner
          : null;
      const baseTitle = normalizeTitle(item.name ?? item.pullRequestTitle);
      const title = baseTitle ?? (repoLabel ? normalizeTitle(`${repoLabel} #${rawId}`) : null);
      const prUrl = typeof item.pullRequestUrl === "string" && /^https:\/\//iu.test(item.pullRequestUrl.trim())
        ? item.pullRequestUrl.trim()
        : null;

      sessions.push({
        native_id: rawId,
        title,
        directory: null,
        last_activity_at: updatedAt,
        activity: mapCopilotState(item.state),
        return_target: prUrl ? { kind: "url" as const, label: prUrl } : null,
      });
    }

    return {
      sessions,
      skipped_count: skippedCount,
      next_cursor: null,
      total: parsed.length,
    };
  },

  async readHistory(context, nativeId, input, signal): Promise<AdapterReadOutput> {
    if (!isValidNativeId(nativeId)) {
      throw sessionsErrors.not_found("外部会话不存在或已被移除");
    }
    if (!context.connection_id) {
      throw sessionsErrors.needs_login("云端来源尚未连接账号");
    }
    const readSpec = context.tool.sessions.read;
    if (readSpec.via !== "command") {
      throw sessionsErrors.source_unsupported("该来源暂不支持读取对话内容");
    }
    const argv = readSpec.argv.map(part => (part === "{session_id}" ? nativeId : part));
    const result = await context.ports.connections.command(context.connection_id, context.entry_id, argv, signal);

    if (result.exit_code !== 0) {
      const lower = result.stderr.toLowerCase();
      if (lower.includes("not found") || lower.includes("could not find") || lower.includes("http 404")) {
        throw sessionsErrors.not_found("外部会话不存在或已被移除");
      }
      if (lower.includes("auth login") || lower.includes("authentication") || lower.includes("http 401")) {
        throw new SessionSourceFailure("login_expired", "GitHub CLI 登录状态已失效", false);
      }
      throw sessionsErrors.read_failed("读取 Copilot 编码 Agent 任务日志失败");
    }

    const entries = parseCopilotLogEntries(result.stdout);
    return paginateAndSearchTranscript(
      {
        entries,
        activity: "unknown",
        partial_stop: null,
      },
      input,
    );
  },
};
