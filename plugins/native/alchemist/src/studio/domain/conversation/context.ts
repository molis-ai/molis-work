export type ConversationContext =
  | { kind: "surface"; label: string; surface: "ideas" | "pulse" | "decisions" }
  | { kind: "direction"; label: string; directionId: string }
  | {
      kind: "idea";
      label: string;
      ideaId: string;
      version: number | "draft";
      panel: "brief" | "market" | "cost" | "decision";
    }
  | { kind: "pulse"; label: string; pulseReportId: string };
