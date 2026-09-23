export interface DirectionDto {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  source:
    | { kind: "user_input" }
    | { kind: "pulse_opportunity"; opportunityId: string; pulseReportId: string };
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface IdeaCardDto {
  id: string;
  explorationRunId: string;
  directionId: string;
  status: "candidate" | "discarded" | "kept";
  title: string;
  highlight: string;
  targetUser: string;
  scenario: string;
  problem: string;
  mechanism: string;
  valueProposition: string;
  whyItMayWork: string;
  assumptions: readonly string[];
  unknowns: readonly string[];
  mvp: { inScope: readonly string[]; outOfScope: readonly string[] };
  createdAt: string;
  discardedAt?: string;
  keptAt?: string;
  keptIdeaId?: string;
}

export interface ExplorationDto {
  id: string;
  directionId: string;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled" | "interrupted";
  runtimeLabel: string;
  understanding?: {
    summary: string;
    assumptions: readonly string[];
    unknowns: readonly string[];
    concreteness: "direction" | "specific_idea";
  };
  cards: readonly IdeaCardDto[];
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaSummaryDto {
  id: string;
  directionId: string;
  title: string;
  lifecycle: "exploring" | "build" | "hold" | "drop" | "archived";
  currentVersion: number;
  updatedAt: string;
}

export interface BootstrapDto {
  workspace: { id: string; name: string };
  actor: { id: string; name: string };
  directions: DirectionDto[];
  explorations: ExplorationDto[];
  ideas: IdeaSummaryDto[];
}
