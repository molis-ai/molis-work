import type { RunStatus } from "../kernel/run.js";
import type { IdeaCard } from "./idea-card.js";

export interface DirectionUnderstanding {
  summary: string;
  assumptions: readonly string[];
  unknowns: readonly string[];
  concreteness: "direction" | "specific_idea";
}

export interface ExplorationRun {
  id: string;
  directionId: string;
  status: RunStatus;
  runtimeLabel: string;
  understanding?: DirectionUnderstanding;
  cards: readonly IdeaCard[];
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}
