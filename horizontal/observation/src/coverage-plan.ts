import type { ObservationCoverageState, ObservationEntry } from "@molis-ai/molis-work-contracts/services/observation";

/** One kind of fact this build records, or says it does not yet, and why (contract-design §8). Reasons are text keys, never sentences. */
export interface CoveragePlanEntry {
  readonly owner: string;
  readonly fact: string;
  readonly entries: readonly ObservationEntry[];
  readonly state: Extract<ObservationCoverageState, "complete" | "not_connected" | "unavailable" | "not_applicable" | "by_rule">;
  readonly reason?: string;
  readonly record_kind?: "flow" | "content";
}

/**
 * What this version connects (contract-design §8, OCL-08): batch 29's coverage page shows it next to what the register measured, and a test
 * checks it against the Host's real wiring. A kind of fact not here is not recorded by this build.
 */
/** A round's own events, recorded by agent-host from the runtime's stream (`prologue-run-observation.ts`). */
const AGENT_FACTS = ["run", "instructions", "skill", "materials", "prompt", "reply", "tool", "compaction", "memory", "guard", "waiting", "retry", "model", "changes", "subagent"];
/** The scheduled-clock `ObservationEntry` channel (shared across scheduler and gateway action rows). */
const SCHEDULE_ENTRY: ObservationEntry = "schedule";

export const OBSERVATION_COVERAGE_PLAN: readonly CoveragePlanEntry[] = [
  // This covers a plugin's protected source review and fixed-version comparison (each plugin registers its own rows), delivery between
  // plugins (`placement.convert` and the receiving plugin's own action),
  // and dynamic Skill/Kit scene candidate reads and bindings (`kit.catalog.list`, `skills.kit.report`, `skills.catalog.list`,
  // `skills.import.preview`, `skills.import.confirm`, `skills.drafts.adopt`, `plugins.install.preview`), and signed package repair through the two protected settings actions
  // (`plugins.installed.repair`, `plugins.home.installed.repair`).
  // Both signed-package install screens record the same plugins.install.confirm action exit, including an explicit discard of kept data.
  // Generated connection cards use the same connector binding and component-submit action exits; Studio icon selection belongs to the designer round.
  // Connector record binding, MCP configuration usage reports and connection list reads use this same action exit.
  // The action exit also covers the work line's `mainline.line.contains` and `background.tasks.decide` and Coding's `agent.reviews.pending-ids` and `agent.write-checks.read`.
  // A plugin's evidence holds (`services.evidence`, batch 109-1, in place of a plugin's own content-ledger actions) are part of its own
  // action or kept background job that makes them: releasing and reclaiming run only inside its own action (S-98), and the ledger keeps
  // references, never content.
  { owner: "service:gateway", fact: "action.call", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin", SCHEDULE_ENTRY, "host"], state: "complete" },
  { owner: "service:gateway", fact: "action.call.page_read_result", entries: ["workbench", "cli"], state: "by_rule", reason: "page_read_result_digest_only" },
  // A command line with no Home runs in its own process and keeps nothing (design §9 D5); the desktop shell starts no work over IPC yet.
  { owner: "service:gateway", fact: "action.call.cli_without_home", entries: ["cli"], state: "not_applicable", reason: "no_home_no_records" },
  { owner: "service:gateway", fact: "action.call.desktop_ipc", entries: ["desktop"], state: "not_applicable", reason: "no_desktop_work_entry" },
  // An action that declares its input an unsent draft, called by the person: kept as saved, by whom and when, never its words (OCL-11).
  // Any other caller's write through it keeps its content like any write.
  { owner: "service:gateway", fact: "action.call.draft_content", entries: ["workbench", "cli"], state: "by_rule", reason: "unsent_draft_not_kept" },
  { owner: "service:gateway", fact: "action.call.read_timing", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin"], state: "by_rule", reason: "reads_coalesced_per_minute" },
  // `agent.instructions`, `agent.skill`, and `agent.materials` cover `AgentTextMaterial.instruction_prompt_id` resolution
  // for registered plugin material instructions and parent-session short-handle (`s1..sN`) skill catalog reads.
  ...AGENT_FACTS.map(name => ({ owner: "service:agent", fact: `agent.${name}`, entries: ["agent"], state: "complete" } as const)),
  // Round and compaction events plus receipts from skill authoring, trial replay and the shared plugin model action port.
  { owner: "service:agent", fact: "agent.usage", entries: ["agent", "workbench", "cli", "mcp", "workflow", "plugin", "host"], state: "complete" },
  // An action tool's input and result are the action exit's record of that call; the round's record only links it.
  { owner: "service:agent", fact: "agent.tool.action_content", entries: ["agent"], state: "by_rule", reason: "kept_by_action_exit" },
  // Images shown to a round are runtime resources that do not outlive it; only that there was one, and which, is kept.
  { owner: "service:agent", fact: "agent.materials.image", entries: ["agent"], state: "unavailable", reason: "image_resources_not_kept" },
  // Each request the round's loop sent, as the runtime handed it to the Host (Prologue `onModelRequest`, #119); attachment bytes stay
  // placeholders there, and an image a round was shown is the row above. Compaction summaries and ephemeral ending-review runs are
  // outside the main loop's per-turn `onModelRequest` stream (ending-review still forwards `promptCache` for cache reuse).
  { owner: "service:agent", fact: "agent.model_request", entries: ["agent"], state: "complete" },
  { owner: "service:agent", fact: "agent.model_request.compaction", entries: ["agent"], state: "by_rule", reason: "runtime_reports_loop_turns_only" },
  // A subagent's round: its start and end are in the dispatching round's stream and each request it sent is recorded as its own run's work
  // (above), but the runtime streams the child's own events (replies, tools, usage) to nobody outside it, so they are not recorded; the
  // actions it calls are still the exit's records.
  { owner: "service:agent", fact: "agent.subagent.events", entries: ["agent"], state: "unavailable", reason: "child_stream_not_followed" },
  // Every wakeup of a project clock, in its own operation; the action it fired is the exit's record under the same call number.
  { owner: "service:scheduler", fact: "scheduler.wakeup", entries: [SCHEDULE_ENTRY], state: "complete" },
  // Each fallen-due entry of a partition's due registry handed to its (plugin, partition) instance (batch 108): succeeded when it raised a
  // reminder, no_action when it had none to raise, failed (and tried again) when the instance could not take it (`partition-observation.ts`).
  { owner: "service:scheduler", fact: "scheduler.due_wakeup", entries: [SCHEDULE_ENTRY], state: "complete" },
  // Each start and stop of a per-partition plugin instance, with why (opened, due, push, sync; idle, switched off, partition gone, Host
  // closing) and the error's code when it failed (`PartitionPluginAssembly` lifecycle, batch 108).
  { owner: "service:home", fact: "home.partition_plugin_lifecycle", entries: ["host"], state: "complete" },
  // The background pass that settles a carry a cut left half done (`placement-actions.ts`): the move that started it is the action exit's
  // record, the carries are the ledger's own history; each pass records how many it found and left (batch 108).
  { owner: "service:home", fact: "home.placement_carry_settle", entries: ["background"], state: "complete" },
  // Each panel write on an Assistant work, joined to that work; the call's content is the exit's, the rounds it started are the agent's.
  { owner: "service:assistant", fact: "assistant.work", entries: ["workbench"], state: "complete" },
  { owner: "service:home", fact: "home.selection", entries: ["workbench"], state: "complete" },
  // Portable person-settings sync channel (`horizontal/person-settings`, wired in `personal-config-sync.ts`): each change received and each
  // upload confirmed, never the setting's key or value (batch 108).
  { owner: "service:home", fact: "home.person_settings_sync", entries: ["background"], state: "complete" },
  { owner: "service:automation", fact: "automation.adoption", entries: ["workbench"], state: "complete" },
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
  { owner: "observation", fact: "observation.report", entries: ["workbench", "plugin"], state: "not_applicable", reason: "report_channel_itself" },
];
