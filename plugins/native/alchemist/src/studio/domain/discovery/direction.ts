export type DirectionSource =
  | { kind: "user_input" }
  | { kind: "pulse_opportunity"; opportunityId: string; pulseReportId: string };

export interface Direction {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  source: DirectionSource;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}
