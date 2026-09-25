export type RecordValue = string | number | boolean | string[];
export interface Field {
  id: string;
  label: string;
  type: "text" | "url" | "number" | "tags" | "boolean";
  required: boolean;
}
export type Expr =
  | { op: "literal"; value: RecordValue }
  | { op: "field"; id: string }
  | { op: "add" | "subtract" | "multiply" | "divide" | "concat" | "equal" | "gt" | "contains" | "and" | "or"; left: Expr; right: Expr }
  | { op: "if"; condition: Expr; then: Expr; else: Expr };
export interface CalculatedField { id: string; label: string; expression: Expr }
export interface Presentation {
  title?: string;
  description?: string;
  image?: string;
  metadata?: string;
  link?: string;
  tags?: string;
  addLabel?: string;
}
export interface Design {
  id: string;
  title: string;
  description: string;
  journey: string[];
  acceptance: string[];
  fields: Field[];
  calculations: CalculatedField[];
  layout: "cards" | "list" | "table";
  allowImport: boolean;
  allowExport: boolean;
  presentation?: Presentation;
  /** Number fields or calculations whose sum across records means something; absent means every numeric one. */
  totals?: string[];
}
/** Example records travel with a proposal so it can be judged with content; they are never real data. */
export interface Candidate extends Design { rationale: string; samples?: Record<string, RecordValue>[] }
export interface UiNode {
  id: string;
  kind: "heading" | "form" | "search" | "filter" | "collection" | "actions" | "summary";
  label: string;
}
export interface Behavior { calculations: CalculatedField[]; allowImport: boolean; allowExport: boolean }
export interface BuildSnapshot { design: Design | null; nodes: UiNode[]; behavior: Behavior | null; connected?: string[] }
/** One visible, real unit of agent work. Statuses only change when the underlying state changes. */
export interface BuildStep {
  id: string;
  agent: "design" | "ui" | "behavior" | "host";
  action: "understand" | "propose" | "decide" | "plan" | "place" | "remove" | "connect" | "verify";
  label: string;
  status: "queued" | "active" | "done" | "waiting" | "failed" | "cancelled";
  target?: string;
  operation?: "read" | "save" | "search" | "filter" | "export" | "calculate";
  detail?: string;
  /** How a part was chosen from the spec board. Jev and rule selections are never merged. */
  selection?: PartSelection;
  at: string;
}
export interface PartSelection {
  source: "jev" | "rule" | "user";
  candidates: string[];
  choice: string;
  model?: string;
  elapsedMs?: number;
  confidence?: number | null;
  reason?: string;
}
export interface RunConfiguration { workspace_id: string; provider_id: string; model_id: string }
export interface BuildRun extends RunConfiguration {
  token: string;
  stage: "design" | "ui" | "behavior";
  session_id?: string;
  run_id?: string;
  phase: string;
}
export interface BuildDocument extends BuildSnapshot {
  id: string;
  revision: number;
  title: string;
  brief: string;
  example?: "inspiration";
  phase: "draft" | "clarifying" | "choosing" | "building" | "paused" | "ready" | "failed";
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  questions: string[];
  candidates: Candidate[];
  pendingNodes: UiNode[];
  /** Example records of the chosen proposal; saved through the real save path once saving is wired. */
  samples?: Record<string, RecordValue>[];
  samplesSaved?: boolean;
  /** Placed node ids whose behavior is wired; absent on legacy drafts, where behavior means all. */
  connected?: string[];
  steps?: BuildStep[];
  /** A change request being worked on; the design run returns one revised design for it. */
  revising?: { message: string; target?: { id: string; kind: UiNode["kind"]; label: string } };
  /** A model answer the host rejected; the same role gets it back with the reason, at most twice in a row. */
  repair?: { stage: "design" | "behavior"; attempt: number; error: string; answer: string };
  /** True while parts are still being chosen from the spec board. */
  assembling?: boolean;
  configuration?: RunConfiguration;
  runs?: BuildRun[];
  active: { token: string; stage: "design" | "ui" | "behavior"; session_id?: string; run_id?: string; provider_id?: string; model_id?: string; workspace_id?: string; baseRevision: number } | null;
  selection?: { source: "jev" | "manual"; model?: string; elapsedMs?: number; reason: string };
  error: string | null;
  history: BuildSnapshot[];
  createdAt: string;
  updatedAt: string;
}
export interface Release {
  buildId: string;
  pluginId: string;
  version: number;
  design: Design;
  nodes: UiNode[];
  behavior: Behavior;
  /** True means direct compatibility; false requires Plugin Runtime's upgrade preflight. */
  compatibleWithPrevious?: boolean;
  publishedAt: string;
}
export interface RecordRow { id: string; values: Record<string, RecordValue>; revision: number }
export class BuilderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BuilderError";
  }
}
