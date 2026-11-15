import type { ObservationEntry, ObservationRecordKind, ObservationSourceClass } from "@molis-ai/molis-work-contracts/services/observation";

export interface ClassificationShape {
  readonly owner_kind: "plugin" | "service" | "shell";
  readonly owner_id: string | null;
  readonly fact: string;
  readonly entry: ObservationEntry | string;
  readonly audience?: string;
  readonly source_class?: ObservationSourceClass | string;
  readonly provider_id?: string | null;
  readonly operation?: string;
}

const FLOW_OWNERS = new Set(["io.molis.work.native.workflows", "workflows", "scheduler", "schedule", "connections"]);

/**
 * Map one stored record to its user-facing record kind (contract-design §16.1, docs/design/work-records/data.js):
 * - `present`: candidate lists, suggestions and feedback (`ui.candidates*`, `assistant.feedback`, `present.*`)
 * - `flow`: workflow steps, scheduled wakeups and background pulls
 * - `ai`: Agent rounds, model requests and MCP / Agent calls
 * - `content`: plugin-owned content facts, plugin write commands, and first-read / catch-up / imported material changes
 * - `user`: the person's own navigation, dwell, locate, grant changes and system commands
 *
 * Keeping one pure classifier ensures space breakdown, query filtering and manual clean-up agree on every row.
 */
export function classifyRecordKind(row: ClassificationShape): ObservationRecordKind {
  const { owner_kind, owner_id, fact, entry, audience, source_class, provider_id, operation } = row;
  if (
    fact === "ui.candidates" || fact.startsWith("ui.candidates.")
    || owner_id === "assistant" || fact.startsWith("assistant.")
    || fact.startsWith("present.")
  ) {
    return "present";
  }
  if (
    entry === "workflow" || entry === "schedule" || entry === "background"
    || (owner_id !== null && FLOW_OWNERS.has(owner_id))
    || fact.startsWith("scheduler.") || fact.startsWith("connections.") || fact.startsWith("io.molis.work.native.workflows.")
  ) {
    return "flow";
  }
  if (
    owner_id === "agent" || fact.startsWith("agent.")
    || entry === "agent" || entry === "mcp"
    || audience === "agent" || audience === "mcp"
  ) {
    return "ai";
  }
  if (
    owner_kind === "plugin"
    || source_class === "first_read" || source_class === "catch_up" || source_class === "imported"
    || (fact === "action.call" && operation === "command" && provider_id !== null && provider_id !== undefined && !provider_id.startsWith("system."))
  ) {
    return "content";
  }
  return "user";
}

/** Classify a coverage row or gap (`owner` formatted as `"shell" | "service:<id>" | "plugin:<id>" | "observation"`). */
export function classifyCoverageKind(owner: string, fact: string, entry: string): ObservationRecordKind {
  const owner_kind = owner === "shell" ? "shell" : owner.startsWith("plugin:") ? "plugin" : "service";
  const owner_id = owner.includes(":") ? owner.slice(owner.indexOf(":") + 1) : null;
  return classifyRecordKind({ owner_kind, owner_id, fact, entry });
}

/** Group a coverage entry or gap into the UI's three filter buckets (`entry`, `plugin`, `flow`). */
export function classifyScopeGroup(owner: string, entry: string): "entry" | "plugin" | "flow" {
  if (
    entry === "schedule" || entry === "workflow" || entry === "background"
    || owner === "service:scheduler" || owner === "service:connections" || owner === "plugin:io.molis.work.native.workflows"
  ) {
    return "flow";
  }
  if (owner.startsWith("plugin:")) return "plugin";
  return "entry";
}
