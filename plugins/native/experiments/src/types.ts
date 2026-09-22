export type ModelKind = "jev" | "laya" | "grok";
export interface Participant {
  id: string; name: string; kind: ModelKind; model: string;
  executable?: string; checkpoint?: string; revision?: string; effort?: "xhigh";
}
export interface TaskDefinition {
  instructions: string;
  criteria: { key: string; description: string }[];
  positive_key?: string; insufficient_key?: string;
  function_snapshot?: { id: string; version: number | null; config_hash: string; model: string };
}
export interface CaseInput {
  id: string; label: string; input: string; source: string;
  reference: string | null; reference_status: "unlabeled" | "agent" | "human"; rationale: string;
}
export interface ExperimentInput { name: string; task: TaskDefinition; cases: CaseInput[]; participants: Participant[] }
export interface ModelRequest { task: Pick<TaskDefinition, "instructions" | "criteria">; input: string }
export interface ModelAnswer {
  isolation?: { tool_count: number; external_instructions: number; memory: boolean; effort_verified: boolean };
  choice: string; model: string; effort?: string; reason?: string;
  probabilities?: Record<string, number>; confidence?: number;
  input_tokens: number | null; output_tokens: number | null;
  model_ms: number | null; startup_ms: number | null;
  reported_cost_usd: number | null; cost_basis: string;
  session_id?: string; runtime_version?: string; device?: string; input_characters?: number;
}
export interface Cell {
  case_id: string; participant_id: string; status: "pending" | "running" | "ok" | "failed" | "cancelled";
  attempts: number; duration_ms: number | null; answer?: ModelAnswer; error?: string;
}
export interface Review { case_id: string; reference: string; note: string; at: string; actor: "human" }
export interface Experiment extends ExperimentInput {
  id: string; hash: string; created_at: string; started_at?: string; finished_at?: string;
  status: "ready" | "running" | "completed" | "cancelled" | "interrupted";
  cells: Cell[]; reviews: Review[];
}
export interface ExecutionPort {
  evaluate(participant: Participant, request: ModelRequest, signal: AbortSignal): Promise<ModelAnswer>;
  close(): void;
}
