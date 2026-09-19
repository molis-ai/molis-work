import type {
  AgentCapabilitySupport,
  AgentMcpServerHealth,
  AgentMcpToolRef,
  AgentSkillCatalogEntry,
  AgentSkillRef,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * What the user chose, and what the current run actually froze.
 *
 * These are different facts and the surface must show both. A selection changed
 * mid-run does not retroactively apply: the run is already frozen. Showing only
 * the selection would tell the user the run is using something it is not.
 */

export interface SkillRow {
  ref: AgentSkillRef;
  name: string;
  summary: string;
  source: "builtin" | "installed";
  selected: boolean;
  /** Why it cannot be used. Present exactly when it cannot. */
  unavailable?: string;
}

export interface McpToolRow {
  ref: AgentMcpToolRef;
  server_label: string;
  selected: boolean;
  unavailable?: string;
}

export interface McpServerRow {
  server: string;
  status: AgentMcpServerHealth["status"];
  tools: McpToolRow[];
}

/** Shared by every selection surface: is it usable, what is chosen, what is this run on. */
export interface SelectionFrame {
  /** False when the Runtime does not support this at all. */
  available: boolean;
  /** Why it is unavailable. Present exactly when `available` is false. */
  unavailable_reason?: string;
  selected_count: number;
  /**
   * True when the current selection differs from what the running run froze.
   *
   * The surface says "applies to the next task" rather than silently implying
   * the change took effect now.
   */
  applies_next_task: boolean;
}

export interface CodingSkillsView extends SelectionFrame {
  rows: SkillRow[];
  /** Exactly what the running run froze, or null when nothing is running. */
  this_run: AgentSkillRef[] | null;
}

export interface CodingMcpView extends SelectionFrame {
  servers: McpServerRow[];
  /** Selected tools whose server or tool no longer exists in the catalog. */
  stale: McpToolRow[];
  this_run: AgentMcpToolRef[] | null;
}

const skillKey = (ref: AgentSkillRef) => `${ref.skill_id}@${ref.version}`;
const toolKey = (ref: AgentMcpToolRef) => `${ref.server}/${ref.tool}`;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  return right.every((entry) => seen.has(entry));
}

export interface SkillsProjectionInput {
  support: AgentCapabilitySupport;
  catalog: readonly AgentSkillCatalogEntry[];
  selected: readonly AgentSkillRef[];
  /** What the running run froze; null when no run is active. */
  frozen: readonly AgentSkillRef[] | null;
}

export function projectSkills(input: SkillsProjectionInput): CodingSkillsView {
  if (input.support === "unsupported") {
    return {
      available: false,
      unavailable_reason: "这个运行时不支持方法",
      selected_count: 0,
      applies_next_task: false,
      rows: [],
      this_run: null,
    };
  }
  const chosen = new Set(input.selected.map(skillKey));
  const rows: SkillRow[] = input.catalog.map((entry) => {
    const ref: AgentSkillRef = { skill_id: entry.skill_id, version: entry.version };
    return {
      ref,
      name: entry.name,
      summary: entry.summary,
      source: entry.source,
      selected: chosen.has(skillKey(ref)),
      // A catalog entry the Host disabled stays listed, with the reason, rather
      // than disappearing — a method that vanished is harder to explain than
      // one that says why it cannot run.
      ...(entry.enabled ? {} : { unavailable: "这个方法已被停用" }),
    };
  });
  const frozen = input.frozen;
  return {
    available: true,
    selected_count: input.selected.length,
    applies_next_task: frozen !== null
      && !sameSet(input.selected.map(skillKey), frozen.map(skillKey)),
    rows,
    this_run: frozen === null ? null : [...frozen],
  };
}

export interface McpProjectionInput {
  support: AgentCapabilitySupport;
  servers: readonly AgentMcpServerHealth[];
  tools: readonly AgentMcpToolRef[];
  selected: readonly AgentMcpToolRef[];
  frozen: readonly AgentMcpToolRef[] | null;
}

export function projectMcp(input: McpProjectionInput): CodingMcpView {
  if (input.support === "unsupported") {
    return {
      available: false,
      unavailable_reason: "这个运行时不支持 MCP 工具",
      selected_count: 0,
      applies_next_task: false,
      servers: [],
      stale: [],
      this_run: null,
    };
  }
  const chosen = new Set(input.selected.map(toolKey));
  const known = new Set(input.tools.map(toolKey));
  const health = new Map(input.servers.map((entry) => [entry.server, entry.status]));

  const servers: McpServerRow[] = input.servers.map((server) => ({
    server: server.server,
    status: server.status,
    tools: input.tools
      .filter((tool) => tool.server === server.server)
      .map((tool) => ({
        ref: { ...tool },
        server_label: server.server,
        selected: chosen.has(toolKey(tool)),
        // A tool on a server that is down is listed and marked, not hidden:
        // the user chose it, and it should be visible why it will not run.
        ...(server.status === "ready" ? {} : { unavailable: "这个服务当前不可用" }),
      })),
  }));

  // Something the user selected that the catalog no longer offers. Dropping it
  // silently would make a selection disappear with no explanation.
  const stale: McpToolRow[] = input.selected
    .filter((tool) => !known.has(toolKey(tool)))
    .map((tool) => ({
      ref: { ...tool },
      server_label: tool.server,
      selected: true,
      unavailable: health.has(tool.server) ? "这个工具已经不在目录里" : "这个服务已经不在了",
    }));

  const frozen = input.frozen;
  return {
    available: true,
    selected_count: input.selected.length,
    applies_next_task: frozen !== null
      && !sameSet(input.selected.map(toolKey), frozen.map(toolKey)),
    servers,
    stale,
    this_run: frozen === null ? null : input.frozen!.map((tool) => ({ ...tool })),
  };
}
