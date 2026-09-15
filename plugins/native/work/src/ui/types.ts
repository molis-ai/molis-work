import type { RuntimeSessionCapabilities, RuntimeSessionCapabilityMode } from "@molis-ai/molis-work-contracts/services/runtime-host";

export interface ProjectOperationsProject {
  project_id: string;
  display_name: string;
}

export interface ProjectOperationsSlice {
  rootItems: string;
  directories: string;
  surfaces: string;
  overlays: string;
}

export interface ProjectSessionRecord {
  id: string;
  title: string;
  runtime: string;
  runtimeId: string;
  contentMode: "native" | "fallback" | "unavailable";
  resumeMode: RuntimeSessionCapabilityMode;
  state: "idle" | "archived";
  currentGoalId: string | null;
  currentGoal: string | null;
  goalHistory: string[];
  workspace: string;
  workspacePath: string | null;
  updated: string;
  updatedAt: string;
  summary: string;
}

export interface ProjectWorkspaceRecord {
  id: string;
  name: string;
  path: string;
  state: "healthy" | "missing" | "conflict";
  sessionCount: number;
  runtimes: string;
  updated: string;
  updatedAt?: string;
  projectLinked?: boolean;
  projectCount?: number;
  sessions?: readonly {
    id: string;
    title: string;
    runtime: string;
    state: string;
    updated: string;
  }[];
  summary: string;
}

export interface ProjectOperationsData {
  sessions: readonly ProjectSessionRecord[];
  workspaces: readonly ProjectWorkspaceRecord[];
  goals?: readonly { goal_id: string; title: string }[];
  projects?: readonly ProjectOperationsProject[];
  runtimes?: readonly {
    runtime_id: string;
    display_name: string;
    capabilities: RuntimeSessionCapabilities;
  }[];
}


export type WorkUiSurface = "root" | "directory" | "main" | "overlay";
export type WorkUiIconName = "activity" | "archive" | "back" | "chevron-down" | "chevron-right"
  | "external" | "filter" | "folder" | "info" | "lock" | "minus" | "plus" | "refresh"
  | "search" | "switch" | "terminal" | "target" | "history" | "x";
export interface WorkUiModel {
  project: ProjectOperationsProject | null;
  data?: ProjectOperationsData;
  icon: (name: WorkUiIconName) => string;
  text?: (value: string, vars?: Record<string, string | number>) => string;
}
