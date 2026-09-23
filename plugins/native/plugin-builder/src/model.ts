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
  | { op: "add" | "subtract" | "multiply" | "divide" | "concat" | "equal" | "gt"; left: Expr; right: Expr }
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
}
export interface Candidate extends Design { rationale: string }
export interface UiNode {
  id: string;
  kind: "heading" | "form" | "search" | "filter" | "collection" | "actions" | "summary";
  label: string;
}
export interface Behavior { calculations: CalculatedField[]; allowImport: boolean; allowExport: boolean }
export interface BuildSnapshot { design: Design | null; nodes: UiNode[]; behavior: Behavior | null }
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
  publishedAt: string;
}
export interface RecordRow { id: string; values: Record<string, RecordValue>; revision: number }
export class BuilderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BuilderError";
  }
}
