import type {
  AgentRunUsage,
  AgentToolActivity,
  AgentTurnView,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Normalizes one CLI runtime's `stream-json` output into contract shapes.
 *
 * It reads only what the wire actually says. An unknown line is ignored rather
 * than guessed at, and usage stays unavailable until the runtime reports it —
 * a zero would read as "this run was free", which is a different claim.
 */

export interface CliStreamState {
  turns: AgentTurnView[];
  activity: AgentToolActivity[];
  usage: AgentRunUsage;
  /** Set once the runtime reports a terminal result. */
  result?: { ok: boolean; text: string; reason?: string };
  /** The runtime's own session id, when it reports one. */
  sessionId?: string;
}

export function emptyStreamState(): CliStreamState {
  return {
    turns: [],
    activity: [],
    usage: { tokens: { input: 0, output: 0 }, unavailable_reason: "运行时尚未报告用量" },
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Safe one-line summary of a tool's target. Never the whole input. */
function toolTarget(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  for (const key of ["file_path", "path", "command", "pattern", "query", "description"]) {
    const value = input[key];
    if (typeof value !== "string" || value === "") continue;
    return value.length <= 200 ? value : `${value.slice(0, 200)}…`;
  }
  return "";
}

/**
 * Apply one `stream-json` line. Returns true when the state changed, so a
 * caller can avoid waking observers for lines that carry nothing.
 */
export function applyCliStreamLine(state: CliStreamState, line: string, at: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not a protocol line. The runtime may print diagnostics; they are not events.
    return false;
  }
  const event = asRecord(parsed);
  if (!event) return false;
  const type = text(event.type);

  if (type === "system") {
    const sessionId = text(event.session_id);
    if (sessionId === "") return false;
    state.sessionId = sessionId;
    return true;
  }

  if (type === "assistant") {
    const message = asRecord(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    let changed = false;
    for (const item of content) {
      const block = asRecord(item);
      if (!block) continue;
      const blockType = text(block.type);
      if (blockType === "text") {
        const body = text(block.text);
        if (body === "") continue;
        state.turns.push({
          turn_id: `assistant-${state.turns.length + 1}`,
          kind: "assistant",
          text: body,
          at,
        });
        changed = true;
        continue;
      }
      if (blockType === "tool_use") {
        const callId = text(block.id);
        if (callId === "") continue;
        state.activity.push({
          call_id: callId,
          name: text(block.name),
          target: toolTarget(asRecord(block.input)),
          state: "started",
          summary: text(block.name),
          at,
        });
        changed = true;
      }
    }
    return changed;
  }

  if (type === "user") {
    const message = asRecord(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    let changed = false;
    for (const item of content) {
      const block = asRecord(item);
      if (!block || text(block.type) !== "tool_result") continue;
      const callId = text(block.tool_use_id);
      const index = state.activity.findIndex((entry) => entry.call_id === callId);
      if (index < 0) continue;
      const failed = block.is_error === true;
      state.activity[index] = {
        ...state.activity[index]!,
        state: failed ? "failed" : "completed",
        summary: failed ? `${state.activity[index]!.name} 失败` : state.activity[index]!.name,
        at,
      };
      changed = true;
    }
    return changed;
  }

  if (type === "result") {
    const usage = asRecord(event.usage);
    if (usage) {
      state.usage = {
        tokens: {
          input: count(usage.input_tokens),
          output: count(usage.output_tokens),
          ...(usage.cache_read_input_tokens === undefined
            ? {}
            : { cached_input: count(usage.cache_read_input_tokens) }),
        },
        ...(event.total_cost_usd === undefined
          ? {}
          : { cost_usd: count(event.total_cost_usd) }),
      };
    }
    const failed = event.is_error === true || text(event.subtype) !== "success";
    state.result = {
      ok: !failed,
      text: text(event.result),
      ...(failed ? { reason: text(event.subtype) || "运行时报告失败" } : {}),
    };
    if (state.result.text !== "") {
      state.turns.push({
        turn_id: `assistant-${state.turns.length + 1}`,
        kind: "assistant",
        text: state.result.text,
        at,
      });
    }
    return true;
  }

  return false;
}
