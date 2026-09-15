import type {
  RuntimeSessionAdapter,
  RuntimeSessionAdapterResult,
  RuntimeSessionCapabilities,
  RuntimeSessionCapability,
  RuntimeSessionTransport,
} from "@molis-ai/molis-work-contracts/services/runtime-host";

const CODEX_CAPABILITIES: RuntimeSessionCapabilities = {
  create: "native",
  list: "native",
  discover: "native",
  read: "native",
  resume: "native",
  events: "native",
  handoff: "native",
};

const CODEX_METHODS: Partial<Record<RuntimeSessionCapability, string>> = {
  create: "thread/start",
  list: "thread/list",
  discover: "thread/list",
  resume: "thread/resume",
};

const CODEX_SESSION_TURN_PAGE_LIMIT = 50;

export class CodexRuntimeSessionAdapter implements RuntimeSessionAdapter {
  readonly runtime_id = "codex";
  readonly capabilities = CODEX_CAPABILITIES;

  constructor(private readonly transport: RuntimeSessionTransport) {}

  async invoke(
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult> {
    if (capability === "handoff") return this.handoff(input);
    try {
      if (capability === "events") {
        const listener = input.listener;
        if (typeof listener !== "function") return failed(capability, "Codex 事件订阅需要 listener");
        const unsubscribe = this.transport.subscribe(
          listener as (event: { method: string; params: unknown }) => void,
        );
        return ok(capability, { unsubscribe });
      }
      if (capability === "read") return ok(capability, await this.read(input));
      const method = CODEX_METHODS[capability];
      if (!method) return unsupported(capability, "Codex Adapter 未声明这项能力");
      return ok(capability, await this.transport.request(method, input));
    } catch (error) {
      return failed(
        capability,
        error instanceof Error ? error.message : String(error),
        capability === "create" ? { phase: "create", retryable: definitelyNotAccepted(error) } : undefined,
        runtimeErrorCode(error),
      );
    }
  }

  private async read(input: Record<string, unknown>): Promise<unknown> {
    const threadId = optionalString(input.threadId);
    if (!threadId) throw new Error("Codex Session 内容读取缺少 threadId");
    const metadata = objectValue(await this.transport.request("thread/read", {
      threadId,
      includeTurns: false,
    }));
    const nestedThread = recordValue(metadata.thread);
    const thread = nestedThread ?? (optionalString(metadata.id) ? metadata : null);
    if (!thread || !optionalString(thread.id)) return metadata;
    const page = objectValue(await this.transport.request("thread/turns/list", {
      threadId,
      limit: CODEX_SESSION_TURN_PAGE_LIMIT,
      sortDirection: "desc",
      itemsView: "summary",
    }));
    const turns = Array.isArray(page.data) ? [...page.data].reverse() : [];
    return {
      ...metadata,
      thread: { ...thread, turns },
      molis_work_history_page: {
        mode: "summary",
        turn_count: turns.length,
        has_earlier: typeof page.nextCursor === "string" && page.nextCursor.length > 0,
      },
    };
  }

  private async handoff(input: Record<string, unknown>): Promise<RuntimeSessionAdapterResult> {
    const prompt = optionalString(input.prompt);
    if (!prompt) return failed("handoff", "Codex Handoff 缺少已确认的 package 内容");
    let nativeSessionId = optionalString(input.existingThreadId);
    let thread: unknown = null;
    if (!nativeSessionId) {
      try {
        thread = await this.transport.request("thread/start", objectValue(input.threadStart));
        nativeSessionId = nativeSessionIdFromValue(thread);
        if (!nativeSessionId) {
          return failed(
            "handoff",
            "Codex 已响应新 Session 请求，但没有返回可识别的原生 Session ID",
            { phase: "create", retryable: false },
          );
        }
      } catch (error) {
        return failed(
          "handoff",
          error instanceof Error ? error.message : String(error),
          { phase: "create", retryable: true },
        );
      }
    }
    try {
      const turn = await this.transport.request("turn/start", {
        threadId: nativeSessionId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        turnTrigger: "molis_work_handoff",
      });
      return ok("handoff", { thread, threadId: nativeSessionId, turn });
    } catch (error) {
      return failed(
        "handoff",
        error instanceof Error ? error.message : String(error),
        {
          phase: "deliver",
          native_runtime_session_id: nativeSessionId,
          retryable: definitelyNotAccepted(error),
        },
      );
    }
  }
}

function ok(capability: RuntimeSessionCapability, value: unknown): RuntimeSessionAdapterResult {
  return { status: "ok", source: "native", capability, value };
}

function unsupported(capability: RuntimeSessionCapability, message: string): RuntimeSessionAdapterResult {
  return { status: "unsupported", capability, code: "runtime.capability_unavailable", message };
}

function failed(
  capability: RuntimeSessionCapability,
  message: string,
  recovery?: Extract<RuntimeSessionAdapterResult, { status: "failed" }>["recovery"],
  code: Extract<RuntimeSessionAdapterResult, { status: "failed" }>["code"] = "runtime.operation_failed",
): RuntimeSessionAdapterResult {
  return { status: "failed", capability, code, message, ...(recovery ? { recovery } : {}) };
}

function runtimeErrorCode(error: unknown): Extract<RuntimeSessionAdapterResult, { status: "failed" }>["code"] {
  if (!error || typeof error !== "object") return "runtime.operation_failed";
  return (error as { code?: unknown }).code === "runtime.response_too_large"
    ? "runtime.response_too_large"
    : "runtime.operation_failed";
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function definitelyNotAccepted(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const detail = error as { deliveryAccepted?: unknown; retryable?: unknown };
  return detail.deliveryAccepted === false && detail.retryable === true;
}

function nativeSessionIdFromValue(value: unknown): string | null {
  const record = objectValue(value);
  const thread = objectValue(record.thread);
  return optionalString(thread.id)
    ?? optionalString(record.threadId)
    ?? optionalString(record.thread_id)
    ?? optionalString(record.id);
}
