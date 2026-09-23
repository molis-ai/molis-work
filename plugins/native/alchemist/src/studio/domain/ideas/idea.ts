import type { RevisionMeta } from "../kernel/revision.js";

export type IdeaLifecycle = "exploring" | "build" | "hold" | "drop" | "archived";

export interface Idea {
  id: string;
  directionId: string;
  lifecycle: IdeaLifecycle;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaVersionContent {
  title: string;
  highlight: string;
  targetUser: string;
  scenario: string;
  coreProblem: string;
  coreMechanism: string;
  valueProposition: string;
  whyItMayWork: string;
  assumptions: readonly string[];
  unknowns: readonly string[];
  mvp: {
    inScope: readonly string[];
    outOfScope: readonly string[];
  };
}

export interface IdeaVersion {
  id: string;
  ideaId: string;
  sourceCardId: string;
  sourceExplorationRunId: string;
  revision: RevisionMeta;
  content: IdeaVersionContent;
}
