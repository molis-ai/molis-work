import type { AgentRuntimeCapabilityMatrix } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Pure projections behind Coding's three regions.
 *
 * Everything here turns facts into what the shell shows. No rendering, no I/O:
 * the interesting decisions — what counts as needing you, which tool pages are
 * genuinely usable — are decided once, here, and asserted in tests.
 */

export type CodingSessionState =
  | "running"
  | "waiting-answer"
  | "waiting-approval"
  | "failed"
  | "done";

export interface CodingSessionEntry {
  session_id: string;
  /** The user's own task title. Run ids are secondary facts and never the label. */
  title: string;
  state: CodingSessionState;
  updated_at: string;
  /** The Goal this session hangs under, when the user attached one. */
  goal_id?: string;
  goal_title?: string;
}

export type CodingDirectoryFilter = "all" | "running" | "needs-you";

/**
 * Sessions the user has to act on.
 *
 * This is a filter over the one list, not a second inbox: a session appears
 * because of its own state, never because something else recorded a copy of it.
 */
export function needsYou(entry: CodingSessionEntry): boolean {
  return entry.state === "waiting-answer"
    || entry.state === "waiting-approval"
    || entry.state === "failed";
}

export function filterSessions(
  entries: readonly CodingSessionEntry[],
  filter: CodingDirectoryFilter,
): CodingSessionEntry[] {
  if (filter === "all") return [...entries];
  if (filter === "running") return entries.filter((entry) => entry.state === "running");
  return entries.filter(needsYou);
}

export interface CodingSessionGroup {
  goal_id: string | null;
  /** Null goal renders as the "未关联目标" group, which always sorts last. */
  title: string;
  entries: CodingSessionEntry[];
}

/**
 * Group by Goal, not by directory: one project is one workspace, so grouping by
 * directory carries no information. Sessions with no Goal are a real group, not
 * a hidden remainder.
 */
export function groupByGoal(entries: readonly CodingSessionEntry[]): CodingSessionGroup[] {
  const groups = new Map<string, CodingSessionGroup>();
  const loose: CodingSessionEntry[] = [];
  for (const entry of entries) {
    if (entry.goal_id === undefined) {
      loose.push(entry);
      continue;
    }
    const existing = groups.get(entry.goal_id);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(entry.goal_id, {
      goal_id: entry.goal_id,
      title: entry.goal_title ?? entry.goal_id,
      entries: [entry],
    });
  }
  const ordered = [...groups.values()];
  if (loose.length > 0) {
    ordered.push({ goal_id: null, title: "未关联目标", entries: loose });
  }
  return ordered;
}

export type CodingToolPage = "result" | "browser" | "terminal" | "canvas";

export interface CodingToolAvailability {
  page: CodingToolPage;
  available: boolean;
  /** Why it cannot be used. Present exactly when `available` is false. */
  reason?: string;
}

export interface CodingToolInput {
  /** What the Runtime carrying this session actually supports. */
  capabilities: AgentRuntimeCapabilityMatrix;
  /** Whether this build can host an embedded web view at all. */
  embedded_browser: boolean;
}

/**
 * Which tool pages are genuinely usable.
 *
 * A page that cannot work is reported unavailable **with the reason**, and the
 * shell renders it that way rather than drawing an empty frame. Two of them are
 * unavailable today for reasons that are true, not temporary oversights:
 *
 * - the terminal shows receipts of commands a Run executed, and command
 *   execution is unsupported until it goes through the Host's approval queue;
 * - the browser needs a real web view, which the desktop shell has and the web
 *   build does not.
 */
export function toolAvailability(input: CodingToolInput): CodingToolAvailability[] {
  const commandSupported = input.capabilities.command === "supported";
  return [
    { page: "result", available: true },
    input.embedded_browser
      ? { page: "browser", available: true }
      : { page: "browser", available: false, reason: "这个版本没有内嵌浏览器，桌面版才有" },
    commandSupported
      ? { page: "terminal", available: true }
      : { page: "terminal", available: false, reason: "这个运行时的命令执行尚未接通宿主审批" },
    { page: "canvas", available: true },
  ];
}
