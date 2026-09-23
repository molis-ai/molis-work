export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "interrupted";

export type RunStage = "planning" | "collecting" | "cross_checking" | "synthesizing";
