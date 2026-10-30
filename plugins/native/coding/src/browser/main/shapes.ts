import type { AgentRunUsage } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { RunCard } from "../actions.js";
import type { CharacterRef } from "../characters.js";
import type { ModelChoice } from "../composer-model.js";
import type { UsageData } from "../usage-meter.js";
import type { PlanDraft } from "../plans.js";
import type { PlanEntry } from "../shapes.js";
import type { SubagentGroup } from "../subagents.js";

/** The JSON the Coding routes answer, as far as the main page reads it (src/routes-*.ts write it). */

export interface GoalSummary { readonly goal_id: string; readonly title: string; readonly work_status?: string }

export interface GoalChoice {
  readonly snapshot: {
    readonly goal: {
      readonly goal_id: string;
      readonly title: string;
      readonly outcome: string;
      readonly why: string;
      readonly business_logic: string;
      readonly in_scope: readonly string[];
      readonly out_of_scope: readonly string[];
      readonly constraints: readonly string[];
      readonly required_inputs: readonly string[];
      readonly promised_outputs: readonly string[];
      readonly [field: string]: unknown;
    };
    readonly state: {
      readonly agreement: { readonly version: number; readonly outcome?: string };
      readonly requirements: readonly { readonly statement: string; readonly human_decision_required?: boolean }[];
      readonly goal_event_cursor: number | string;
    };
  };
  readonly reference: { readonly artifact_id: string; readonly version?: number };
  readonly material: { readonly text: string };
}

export interface ArtifactRow {
  readonly reference: { readonly artifact_id: string; readonly version: number };
  readonly title: string;
  readonly kind: string;
  readonly saved_at: string;
  readonly file_count?: number;
  readonly archived?: boolean;
}

/** One entry of a round's conversation: the person's words, the model's reply, or a steer. */
export interface TurnView {
  readonly turn_id: string;
  readonly kind: string;
  readonly text: string;
  readonly html?: string;
  readonly sequence?: number;
  readonly steer?: { readonly id: string; readonly key?: string; readonly model_claim?: { readonly treatment?: string } };
}

/** One tool call of a round. */
export interface ActivityView {
  readonly call_id: string;
  readonly name: string;
  readonly target: string;
  readonly state: string;
  readonly sequence?: number;
  readonly output?: string;
  readonly at?: string | null;
}

/** A question the model asked and nobody has answered (src/routes-sessions.ts writes it). */
export interface PendingQuestion {
  readonly pending_id: string;
  readonly pending_revision: number;
  readonly sequence?: number;
  /** The card the Host drew for the question. */
  readonly html?: string;
  readonly answerable?: boolean;
  readonly parked?: boolean;
  readonly unavailable_reason?: string;
}

/** The round a question belongs to, as far as its card reads it. */
export type QuestionRun = Pick<RunView, "ref" | "phase" | "awaiting_input">;

/** What a round changed in the files, shown where it happened. */
export interface ChangeView {
  readonly turn: number;
  readonly sequence: number;
  readonly files: { path: string; byte_length: number; digest: string; checkpoint_id: string }[];
}

export interface CommandRef { readonly run_id: string; readonly call_id: string }
export interface CommandOutput extends CommandRef { readonly target?: string }

/** What the Host recorded of one command. */
export interface CommandReceipt {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number | null;
  readonly timed_out?: boolean;
  readonly cancelled?: boolean;
  readonly stop_reason?: string;
  readonly truncated?: boolean;
}

/** The setup a round was frozen with: what it was allowed to use. */
export interface FrozenSetup {
  readonly model_id: string;
  readonly role_id: string;
  readonly role_version: number;
  readonly directory?: { readonly canonical_path: string };
  readonly subagent_workspaces?: readonly { readonly workspace_id: string; readonly directory: { readonly canonical_path: string } }[];
  readonly skills: readonly { readonly name: string; readonly version: number }[];
  readonly action_tools?: readonly { readonly capability_id: string; readonly version: number; readonly provider_id: string }[];
  readonly mcp_tools?: readonly { readonly server: string; readonly server_label?: string; readonly tool: string; readonly version: number; readonly configuration_version?: number }[];
  readonly mcp_sources?: readonly { readonly server: string; readonly server_label?: string; readonly configuration_version: number }[];
  readonly character?: { readonly title: string; readonly reference: { readonly version: number } };
  readonly host_tools?: readonly string[];
  readonly text_materials: readonly { readonly title?: string; readonly source_artifact_id: string; readonly source_version: number }[];
  readonly compaction?: { readonly above_tokens: number; readonly version: number };
  readonly model_context?: { readonly window_tokens?: number };
}

/** A round as the session read gives it: loaded in full, or a summary of the rounds the page has not opened. */
export interface RunView {
  readonly ref: { readonly run_id: string };
  readonly phase: string;
  readonly stop_reason?: string;
  readonly turns: TurnView[];
  readonly activity: ActivityView[];
  readonly awaiting_input?: readonly PendingQuestion[];
  readonly turn_changes?: ChangeView[];
  readonly command_outputs?: readonly CommandOutput[];
  readonly frozen: FrozenSetup;
  readonly usage: AgentRunUsage;
  readonly step_board?: { terminal: boolean; nodes: { state: string }[] };
  readonly cards?: readonly RunCard[];
  readonly next_html?: string;
  readonly started_at?: string | null;
  readonly ended_at?: string | null;
  /** Set on the summary of a round the page has not opened. */
  readonly light?: boolean;
  readonly fingerprint?: string;
  /** The Host answered that the round is as the page already has it. */
  readonly unchanged?: boolean;
}

/** What closing an interrupted round would settle, as `GET /sessions/<id>/recovery` answers. */
export interface RecoveryRun {
  readonly run_id: string;
  readonly version: number;
  readonly can_close: boolean;
  readonly subagent?: { readonly subagent_id: string };
  readonly operations: readonly { readonly outcome: "completed" | "failed" | "not-dispatched" | "unknown"; readonly summary: string }[];
  readonly waiting?: number;
  readonly blockers: readonly string[];
}
export interface RecoveryReport {
  readonly runs: readonly RecoveryRun[];
  readonly inputs?: readonly { readonly text: string }[];
  readonly blockers: readonly string[];
}

export interface Checkpoint {
  readonly checkpoint_id: string;
  readonly label: string;
  readonly created_at: string;
  readonly origin_run_id?: string;
  readonly directory?: { readonly canonical_path: string };
  readonly rewound_at?: string;
}

/** A round that waits for another session before it starts. */
export interface QueuedRound {
  readonly note?: string;
  readonly waiting_for?: "reply" | "command" | "run";
  readonly after_title: string;
}

/** A session's start as the person left it: what the composer is set to. */
export interface SessionConfiguration {
  readonly intent: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly workspace_id: string;
  readonly reasoning_effort?: string;
  readonly writer_assignments?: readonly { readonly workspace_id: string; readonly task: string }[];
  readonly [field: string]: unknown;
}

/** `GET /sessions/<id>`: the open session, its newest rounds in full, and what the page needs of the rest. */
export interface SessionData extends UsageData {
  readonly session: SessionRecord & {
    readonly runtime_session_id: string;
    readonly queued_inputs?: readonly unknown[];
    readonly queued?: QueuedRound | null;
    readonly priority?: boolean;
    readonly goal_title?: string;
  };
  readonly runs: RunView[];
  readonly earlier?: RunView[];
  readonly earlier_fingerprint?: string;
  readonly recovery_required?: boolean;
  readonly checkpoint_busy?: boolean;
  readonly configuration?: SessionConfiguration | null;
  readonly mcp_sources?: readonly McpSourceRef[];
  readonly mcp_tools?: readonly McpToolRef[];
  readonly action_tools?: readonly { readonly capability_id: string; readonly version: number; readonly provider_id: string }[];
  readonly materials?: readonly unknown[];
  readonly character?: CharacterRef | null;
  readonly character_title?: string;
  readonly character_skill_ids?: readonly string[];
  readonly methods?: readonly MethodRef[];
  readonly question_drafts?: Readonly<Record<string, unknown>>;
  readonly draft?: string;
  readonly plan?: PlanDraft | null;
  readonly taskboard_plans?: readonly PlanEntry[];
  readonly subagents?: readonly SubagentGroup[];
  readonly error?: string;
}

/** A session in the project's list (the state read and the session read both give it). */
export interface SessionRecord {
  readonly session_id: string;
  readonly title: string;
  readonly runtime_id?: string;
  readonly goal_id?: string | null;
  readonly goal_title?: string;
  readonly updated_at: string;
  readonly priority?: boolean;
  readonly checkpoint_busy?: boolean;
  readonly state: string;
  readonly background_unreadable?: boolean;
  readonly steps?: { readonly mine?: number; readonly subtasks?: number; readonly unowned?: number };
  readonly [field: string]: unknown;
}

export interface WorkspaceRecord {
  readonly workspace_id: string;
  readonly canonical_path: string;
  readonly realpath_verified?: boolean;
  readonly [field: string]: unknown;
}

export interface McpSourceRef { readonly server: string; readonly server_label?: string; readonly configuration_version: number }
export interface McpToolRef { readonly server: string; readonly server_label?: string; readonly tool: string; readonly version: number; readonly configuration_version?: number }
export interface MethodRef { readonly skill_id: string; readonly version: number }

/** A method of the catalog (`GET /state`). */
export interface MethodEntry extends MethodRef { readonly name: string; readonly summary: string; readonly enabled: boolean }

export interface McpServer {
  readonly id: string;
  readonly label: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly health?: unknown;
  readonly resources?: readonly unknown[];
  readonly tools: readonly { readonly server: string; readonly tool: string; readonly label?: string; readonly description?: string; readonly version: number; readonly available: boolean; readonly configuration_version?: number }[];
}


/** `GET /state`: the project's sessions, models, directories and the runtime's roles. */
export interface StateRead {
  sessions: SessionRecord[];
  models: ModelChoice[];
  workspaces: WorkspaceRecord[];
  workspace?: WorkspaceRecord | null;
  readonly mcp?: readonly McpServer[];
  readonly methods?: readonly MethodEntry[];
  readonly runtimes: readonly { readonly runtime_id: string; readonly roles: readonly { readonly role_id: string; readonly available: boolean }[] }[];
  readonly project_runtime_id?: string;
  readonly [field: string]: unknown;
}

/** What a round is started with besides its words: the choices the session holds. */
export interface RoundSelection {
  readonly workspace_id: string;
  readonly methods: readonly MethodRef[];
  readonly action_tools?: readonly unknown[];
  readonly mcp_tools: readonly McpToolRef[];
  readonly mcp_sources: readonly McpSourceRef[];
  readonly materials: readonly unknown[];
  readonly character: CharacterRef | null;
  writer_assignments: readonly { readonly workspace_id: string; readonly task: string }[];
}

/** Other work under way that names the same files as the round about to start. */
export interface Overlap {
  readonly work_id: string;
  readonly title: string;
  readonly state: string;
  readonly task?: string;
  readonly paths: readonly string[];
}

/** `GET /sessions/<id>/runs/<run>/continuation`: how the Host would go on from where a round stopped. */
export interface ContinuationRead {
  readonly task?: string;
  readonly intent: string;
  readonly plan_revision?: number;
  readonly continue_step_board_of?: string;
  readonly continued_from?: { readonly session_id: string; readonly run_id: string };
}

export interface StartedRound {
  readonly digest?: { readonly source: string; readonly usage?: { readonly input: number; readonly output: number }; readonly problem?: string };
}

/** The Goal's fields as the progress record shows them. */
export interface GoalFacts {
  readonly title: string;
  readonly outcome?: string;
  readonly why?: string;
  readonly business_logic?: string;
  readonly in_scope?: readonly string[];
  readonly out_of_scope?: readonly string[];
  readonly constraints?: readonly string[];
  readonly required_inputs?: readonly string[];
  readonly promised_outputs?: readonly string[];
  readonly acceptance_criteria: readonly { readonly statement: string; readonly pass_condition: string; readonly decision_method: string }[];
}

/** `GET …/report/progress`: what a progress record would rest on, and the record when one was saved. */
export interface ProgressPreview {
  readonly title: string;
  readonly reference: { readonly artifact_id: string; readonly version: number };
  readonly report_goal: { readonly goal_id: string; readonly title: string; readonly goal_event_cursor: number | string; readonly agreement_version: number };
  current?: {
    readonly goal: GoalFacts;
    readonly state: {
      readonly agreement: { readonly version: number; readonly outcome?: string };
      readonly requirements: readonly { readonly statement: string; readonly human_decision_required?: boolean }[];
      readonly progress_summary?: { readonly summary: string };
      readonly goal_event_cursor: number | string;
    };
  } | null;
  recorded?: { readonly progress_summary: { readonly summary: string; readonly next_step?: string; readonly recorded_at: string } } | null;
}

/** The progress dialog's reading: which report it is for and what the Host said. */
export interface ProgressView { readonly id: string; readonly runId: string; preview: ProgressPreview | null; readonly ticket: number }

/** `GET …/report`: the report's text, and its saved version when there is one. */
export interface ReportRead {
  readonly html: string;
  readonly reference?: { readonly version: number } | null;
  readonly saved_at?: string;
  readonly report: { readonly goal?: unknown; readonly goal_source_error?: unknown };
}

/** Whether the saved report is the session's output. */
export interface ReportOutput { readonly selected: boolean; readonly current: unknown }
