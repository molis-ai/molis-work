import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type {
  MolisWorkSessionEventRecord,
  MolisWorkSessionRecord,
  SessionContentResult,
  SessionResumeResult,
  SessionTimelineEvent,
  SessionTimelineKind,
} from "./types.js";

const MAX_TIMELINE_CONTENT = 200_000;
const MIN_BINARY_RUN_LENGTH = 4_096;

export class SessionContentService {
  constructor(
    private readonly registry: WorkSessionApi,
    private readonly adapters: RuntimeHostApi,
  ) {}

  async read(sessionId: string): Promise<SessionContentResult> {
    const session = this.registry.get(sessionId);
    const managed = this.registry.events(sessionId).map((event) => normalizeManagedEvent(session, event));
    const fallback = (): SessionContentResult => ({
      session,
      content_mode: managed.length > 0 ? "fallback" : "unavailable",
      events: sortTimeline(managed),
      native_error: null,
      native_history: null,
      partial_terminal_history: managed.some((event) => event.source === "goalboard_tui"),
    });
    if (!session.native_runtime_session_id) return fallback();

    const result = await this.adapters.invoke(session.runtime_id, "read", {
      threadId: session.native_runtime_session_id,
      includeTurns: true,
    });
    if (result.status === "unsupported") return fallback();
    if (result.status === "failed") {
      return {
        ...fallback(),
        content_mode: "failed",
        native_error: {
          code: result.code,
          message: result.code === "runtime.response_too_large"
            ? "这条 Session 的单项内容超过安全读取上限；Molis Work 已停止本次读取，服务仍可继续使用。"
            : "Runtime 内容读取失败。确认 Runtime 可用后重试。",
        },
      };
    }
    if (!hasCodexThreadReadShape(result.value)) {
      return {
        ...fallback(),
        content_mode: "failed",
        native_error: {
          code: "runtime.read_shape_unknown",
          message: "Runtime 返回了 Molis Work 不能识别的内容结构；已保留可验证的 Molis Work 记录。",
        },
      };
    }
    const native = normalizeCodexThreadRead(session, result.value);
    return {
      session,
      content_mode: "native",
      events: sortTimeline([...native, ...managed]),
      native_error: null,
      native_history: nativeHistory(result.value),
      partial_terminal_history: managed.some((event) => event.source === "goalboard_tui"),
    };
  }

  async resume(sessionId: string): Promise<SessionResumeResult> {
    const session = this.registry.get(sessionId);
    if (!session.native_runtime_session_id) {
      return {
        status: "unsupported",
        runtime_id: session.runtime_id,
        code: "runtime.native_session_unavailable",
        message: "这条 Session 还没有可由原 Runtime 加载的原生身份。",
        next_action: "create_handoff",
      };
    }
    const result = await this.adapters.invoke(session.runtime_id, "resume", {
      threadId: session.native_runtime_session_id,
      excludeTurns: true,
    });
    if (result.status === "ok") {
      return {
        status: "ok",
        runtime_id: session.runtime_id,
        native_runtime_session_id: session.native_runtime_session_id,
        value: result.value,
      };
    }
    return {
      status: result.status,
      runtime_id: session.runtime_id,
      code: result.code,
      message: result.status === "unsupported"
        ? "这个 Runtime 不能原生加载 Session；可以创建 Handoff 交给新 Session。"
        : result.message === "Codex Session 已经在另一个 Runtime 实例中运行。"
          ? "这条 Session 已经在另一个 Codex 窗口运行，无需重复加载。"
        : "原 Runtime 暂时无法加载这条 Session，请稍后重试。",
      next_action: result.status === "unsupported" ? "create_handoff" : "retry",
    };
  }
}

function nativeHistory(value: unknown): SessionContentResult["native_history"] {
  const root = record(value);
  const page = root ? record(root.molis_work_history_page) : null;
  if (!page || text(page.mode) !== "summary") return null;
  return {
    mode: "summary",
    turn_count: finiteNumber(page.turn_count) ?? 0,
    has_earlier: page.has_earlier === true,
  };
}

function hasCodexThreadReadShape(value: unknown): boolean {
  const root = record(value);
  if (!root) return false;
  const thread = record(root.thread) ?? root;
  return Array.isArray(thread.turns);
}

export function searchSessionTimeline(
  events: readonly SessionTimelineEvent[],
  query: string,
): SessionTimelineEvent[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...events];
  return events.filter((event) =>
    `${event.label}\n${event.content}`.toLocaleLowerCase().includes(normalized));
}

export function normalizeCodexThreadRead(
  session: MolisWorkSessionRecord,
  value: unknown,
): SessionTimelineEvent[] {
  const root = record(value);
  const thread = root ? record(root.thread) ?? root : null;
  if (!thread) return [];
  const turns = array(thread.turns);
  const events: SessionTimelineEvent[] = [];
  let sourceOrder = 0;
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = record(turns[turnIndex]);
    if (!turn) continue;
    const turnId = text(turn.id) || `turn-${turnIndex}`;
    const occurredAt = unixTimestamp(turn.startedAt) ?? unixTimestamp(turn.completedAt) ?? session.updated_at;
    const items = array(turn.items);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = record(items[itemIndex]);
      if (!item) continue;
      const mapped = mapCodexItem(item);
      if (!mapped) continue;
      events.push({
        event_id: `native:${text(item.id) || `${turnId}:${itemIndex}`}`,
        session_id: session.session_id,
        source: "runtime_native",
        kind: mapped.kind,
        label: mapped.label,
        content: clip(mapped.content),
        occurred_at: occurredAt,
        source_order: sourceOrder++,
        runtime_id: session.runtime_id,
        metadata: safeTimelineMetadata({
          turn_id: turnId,
          item_type: text(item.type),
          status: text(item.status),
          duration_ms: finiteNumber(item.durationMs),
          exit_code: finiteNumber(item.exitCode),
        }),
      });
    }
    const status = text(turn.status);
    if (status && status !== "completed") {
      events.push({
        event_id: `native:${turnId}:status`,
        session_id: session.session_id,
        source: "runtime_native",
        kind: "status",
        label: "执行状态",
        content: status === "failed"
          ? `本轮执行失败${text(record(turn.error)?.message) ? `：${text(record(turn.error)?.message)}` : ""}`
          : `本轮状态：${status}`,
        occurred_at: occurredAt,
        source_order: sourceOrder++,
        runtime_id: session.runtime_id,
        metadata: { turn_id: turnId, status },
      });
    }
  }
  return events;
}

function normalizeManagedEvent(
  session: MolisWorkSessionRecord,
  event: MolisWorkSessionEventRecord,
): SessionTimelineEvent {
  return {
    event_id: event.event_id,
    session_id: session.session_id,
    source: event.source,
    kind: event.kind,
    label: event.source === "goalboard_tui"
      ? event.kind === "terminal_output" ? "Molis Work TUI" : "TUI 状态"
      : labelForKind(event.kind),
    content: clip(event.content ?? "本地加密内容当前不可读取。"),
    occurred_at: event.occurred_at,
    source_order: event.source_order,
    runtime_id: session.runtime_id,
    metadata: safeTimelineMetadata({ ...event.metadata, content_available: event.content_available }),
  };
}

function mapCodexItem(item: Record<string, unknown>): { kind: SessionTimelineKind; label: string; content: string } | null {
  const type = text(item.type);
  if (type === "userMessage") {
    return { kind: "user_message", label: "用户", content: userMessageContent(item.content) };
  }
  if (type === "agentMessage") {
    return { kind: "runtime_message", label: "Codex", content: text(item.text) };
  }
  if (type === "commandExecution") {
    return {
      kind: "tool",
      label: "命令执行",
      content: [text(item.command), text(item.aggregatedOutput)].filter(Boolean).join("\n\n"),
    };
  }
  if (type === "mcpToolCall") {
    return {
      kind: "tool",
      label: `工具 · ${[text(item.server), text(item.tool)].filter(Boolean).join("/")}`,
      content: [`状态：${text(item.status) || "unknown"}`, printable(item.result), printable(item.error)].filter(Boolean).join("\n\n"),
    };
  }
  if (["dynamicToolCall", "collabAgentToolCall", "subAgentActivity", "webSearch", "imageView", "sleep"].includes(type)) {
    return {
      kind: "tool",
      label: labelForCodexType(type),
      content: [text(item.tool), text(item.query), text(item.status), printable(item.result)].filter(Boolean).join("\n"),
    };
  }
  if (type === "fileChange" || type === "imageGeneration") {
    return {
      kind: "artifact",
      label: type === "fileChange" ? "文件变更" : "生成图片",
      content: printable(item.changes ?? item.result ?? item.status),
    };
  }
  if (type === "functionCallOutput") {
    return { kind: "tool", label: `工具结果 · ${text(item.name)}`, content: printable(item.output) };
  }
  if (type === "plan") return { kind: "status", label: "执行计划", content: text(item.text) };
  if (type === "reasoning") {
    return { kind: "status", label: "Runtime 推理摘要", content: array(item.summary).map(text).filter(Boolean).join("\n") };
  }
  if (type === "enteredReviewMode") return { kind: "status", label: "状态", content: "进入 Review 模式" };
  if (type === "exitedReviewMode") return { kind: "status", label: "状态", content: "退出 Review 模式" };
  if (type === "contextCompaction") return { kind: "status", label: "状态", content: "上下文已压缩" };
  if (type === "hookPrompt") return null;
  return type ? { kind: "status", label: "Runtime 事件", content: labelForCodexType(type) } : null;
}

function userMessageContent(value: unknown): string {
  return array(value).map((entry) => {
    const input = record(entry);
    if (!input) return "";
    if (text(input.text)) return text(input.text);
    if (text(input.path)) return `[本地图片] ${text(input.path)}`;
    if (text(input.url)) return `[图片] ${text(input.url)}`;
    return text(input.type) ? `[${text(input.type)}]` : "";
  }).filter(Boolean).join("\n");
}

function sortTimeline(events: readonly SessionTimelineEvent[]): SessionTimelineEvent[] {
  const sourceRank: Record<SessionTimelineEvent["source"], number> = {
    runtime_native: 0,
    goalboard: 1,
    goalboard_tui: 2,
  };
  return [...events].sort((left, right) =>
    Date.parse(left.occurred_at) - Date.parse(right.occurred_at)
    || sourceRank[left.source] - sourceRank[right.source]
    || left.source_order - right.source_order
    || left.event_id.localeCompare(right.event_id));
}

function labelForKind(kind: SessionTimelineKind): string {
  return {
    user_message: "用户",
    runtime_message: "Runtime",
    tool: "工具",
    approval: "等待确认",
    status: "执行状态",
    artifact: "产物",
    terminal_output: "终端输出",
  }[kind];
}

function labelForCodexType(type: string): string {
  return ({
    dynamicToolCall: "动态工具",
    collabAgentToolCall: "协作 Agent",
    subAgentActivity: "Subagent",
    webSearch: "网页搜索",
    imageView: "查看图片",
    sleep: "等待",
  } as Record<string, string>)[type] ?? type;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unixTimestamp(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function printable(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return sanitizeTimelineText(value);
  try {
    return JSON.stringify(
      value,
      (_key, item: unknown) => typeof item === "string" ? sanitizeTimelineText(item) : item,
      2,
    );
  } catch {
    return sanitizeTimelineText(String(value));
  }
}

function clip(value: string): string {
  const sanitized = sanitizeTimelineText(value);
  return sanitized.length > MAX_TIMELINE_CONTENT
    ? `${sanitized.slice(0, MAX_TIMELINE_CONTENT)}\n…内容已截断`
    : sanitized;
}

function sanitizeTimelineText(value: string): string {
  return value
    .replace(
      /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,[a-z0-9+/_=-]{256,}/gi,
      (_match, mimeType: string) => `[${mimeType} 二进制内容已省略]`,
    )
    .replace(
      new RegExp(`[a-z0-9+/_-]{${MIN_BINARY_RUN_LENGTH},}={0,2}`, "gi"),
      "[长二进制内容已省略]",
    );
}

function safeTimelineMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (/authorization|cookie|credential|password|secret|token|body|content|env/i.test(key)) continue;
    if (typeof item === "string") output[key] = item.slice(0, 500);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) output[key] = item;
  }
  return output;
}
