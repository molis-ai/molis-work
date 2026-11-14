import type { ObservationCoverageState, ObservationEntry } from "@molis-ai/molis-work-contracts/services/observation";

/** One kind of fact this build records, or says it does not yet, and why (contract-design §8). Reasons are text keys, never sentences. */
export interface CoveragePlanEntry {
  readonly owner: string;
  readonly fact: string;
  readonly entries: readonly ObservationEntry[];
  readonly state: Extract<ObservationCoverageState, "complete" | "not_connected" | "unavailable" | "not_applicable" | "by_rule">;
  readonly reason?: string;
}

/**
 * What this version connects (contract-design §8, OCL-08): batch 29's coverage page shows it next to what the register measured, and a test
 * checks it against the Host's real wiring. A kind of fact not here is not recorded by this build.
 */
/** A round's own events, recorded by agent-host from the runtime's stream (`prologue-run-observation.ts`). */
const AGENT_FACTS = ["run", "instructions", "skill", "materials", "prompt", "reply", "tool", "usage", "compaction", "memory", "guard", "waiting", "retry", "model", "changes"];

export const OBSERVATION_COVERAGE_PLAN: readonly CoveragePlanEntry[] = [
  { owner: "service:gateway", fact: "action.call", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin", "schedule", "host"], state: "complete" },
  { owner: "service:gateway", fact: "action.call.page_read_result", entries: ["workbench", "cli"], state: "by_rule", reason: "page_read_result_digest_only" },
  // A command line with no Home runs in its own process and keeps nothing (design §9 D5); the desktop shell starts no work over IPC yet.
  { owner: "service:gateway", fact: "action.call.cli_without_home", entries: ["cli"], state: "not_applicable", reason: "no_home_no_records" },
  { owner: "service:gateway", fact: "action.call.desktop_ipc", entries: ["desktop"], state: "not_applicable", reason: "no_desktop_work_entry" },
  // An action that declares its input an unsent draft: kept as saved, by whom and when, never its words (OCL-11).
  { owner: "service:gateway", fact: "action.call.draft_content", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin"], state: "by_rule", reason: "unsent_draft_not_kept" },
  { owner: "service:gateway", fact: "action.call.read_timing", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin"], state: "by_rule", reason: "reads_coalesced_per_minute" },
  ...AGENT_FACTS.map(name => ({ owner: "service:agent", fact: `agent.${name}`, entries: ["agent"], state: "complete" } as const)),
  // An action tool's input and result are the action exit's record of that call; the round's record only links it.
  { owner: "service:agent", fact: "agent.tool.action_content", entries: ["agent"], state: "by_rule", reason: "kept_by_action_exit" },
  // Images shown to a round are runtime resources that do not outlive it; only that there was one, and which, is kept.
  { owner: "service:agent", fact: "agent.materials.image", entries: ["agent"], state: "unavailable", reason: "image_resources_not_kept" },
  // Each request the round's loop sent, as the runtime handed it to the Host (Prologue `onModelRequest`, #119); attachment bytes stay
  // placeholders there, and an image a round was shown is the row above. A compaction summary's request is not reported by the runtime.
  { owner: "service:agent", fact: "agent.model_request", entries: ["agent"], state: "complete" },
  { owner: "service:agent", fact: "agent.model_request.compaction", entries: ["agent"], state: "by_rule", reason: "runtime_reports_loop_turns_only" },
  // Every wakeup of a project clock, in its own operation; the action it fired is the exit's record under the same call number.
  { owner: "service:scheduler", fact: "scheduler.wakeup", entries: ["schedule"], state: "complete" },
  // Each panel write on an Assistant work, joined to that work; the call's content is the exit's, the rounds it started are the agent's.
  { owner: "service:assistant", fact: "assistant.work", entries: ["workbench"], state: "complete" },
  // Grants whose owner keeps no history: a folder grant's row is deleted, an MCP grant is written over. Given by the person (in Settings, at the
  // folder chooser, through a task's categories) or taken by the Host after an uninstall or a folder that changed.
  { owner: "service:grants", fact: "grants.directory", entries: ["workbench", "host"], state: "complete" },
  { owner: "service:grants", fact: "grants.mcp", entries: ["workbench", "plugin", "host"], state: "complete" },
  // Consents keep their own history (granted_at, revoked_at, never deleted); the call that changed one is the action exit's record.
  { owner: "service:grants", fact: "grants.consent", entries: ["workbench", "host"], state: "by_rule", reason: "owner_keeps_history" },
  // A pull from a bound account, classed by what it read (§5): first read without a cursor, catch-up on a rebuilt one. The provider's work
  // inside the Host is in the class's scope; a sandboxed provider's callbacks run outside the Host's async context and are not.
  { owner: "service:connections", fact: "connections.pull", entries: ["background"], state: "complete" },
  { owner: "service:connections", fact: "connections.pull.sandbox_scope", entries: ["background"], state: "unavailable", reason: "sandbox_callbacks_outside_scope" },
  // The shell's own stages (apps/workbench work-records.ts), through its route: what the focused pane shows, the lists it presents (search
  // results, the context toolbar, the Assistant's starters, a Home item's offers) in the order shown, and how finding a chosen result went.
  // Choosing, taking or putting away an action is the Host call it makes, the exit's record; clicking is never adopting or reading.
  ...["open", "dwell", "candidates", "locate"].map(name => ({ owner: "shell", fact: `ui.${name}`, entries: ["workbench"], state: "complete" } as const)),
  // Time on an object and scrolling are summed per object per minute (design §9 D3): one look's own seconds are not kept.
  { owner: "shell", fact: "ui.dwell.single_look", entries: ["workbench"], state: "by_rule", reason: "dwell_summed_per_minute" },
  // A plugin's page is an isolated document: the shell does not see it scroll, and the plugin reports its own stages if it has any.
  { owner: "shell", fact: "ui.dwell.plugin_page_scroll", entries: ["workbench"], state: "unavailable", reason: "isolated_page_scroll_not_seen" },
  // Each handoff of a run, reported by Workflows as itself: the handoff's text stays in the run and is named, the action a station ran is
  // the exit's record under the same call. An action result over 20,000 characters is kept by the run as its size only.
  { owner: "plugin:io.molis.work.native.workflows", fact: "io.molis.work.native.workflows.step", entries: ["plugin"], state: "complete" },
  { owner: "plugin:io.molis.work.native.workflows", fact: "io.molis.work.native.workflows.step.action_result", entries: ["plugin"], state: "by_rule", reason: "large_action_result_size_only" },
  { owner: "observation", fact: "observation.report", entries: ["workbench", "plugin"], state: "not_applicable", reason: "report_channel_itself" },
];
