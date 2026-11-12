import type { GoalPresentationState } from "./tree-order.js";
export interface WorkStateExplanation {
  label: string;
  meaning: string;
  nextAction: string;
  howToContinue: string;
  actionKind:
    | "decide"
    | "start"
    | "view_progress"
    | "resolve_blocker"
    | "archive"
    | "restore"
    | "none";
}

interface WorkStateCopy {
  label: string;
  meaning: string;
  nextAction: string;
  howToContinue: string;
  actionKind: WorkStateExplanation["actionKind"];
}

export const WORK_STATE_COPY: Record<GoalPresentationState, WorkStateCopy> = {
  waiting_for_human: {
    label: "goals.state-waiting-for-human.label",
    meaning: "goals.state-waiting-for-human.meaning",
    nextAction: "goals.state-waiting-for-human.next-action",
    howToContinue: "goals.state-waiting-for-human.how-to-continue",
    actionKind: "decide",
  },
  executing: {
    label: "goals.state-executing.label",
    meaning: "goals.state-executing.meaning",
    nextAction: "goals.state-executing.next-action",
    howToContinue: "goals.state-executing.how-to-continue",
    actionKind: "view_progress",
  },
  execution_blocked: {
    label: "goals.state-execution-blocked.label",
    meaning: "goals.state-execution-blocked.meaning",
    nextAction: "goals.state-execution-blocked.next-action",
    howToContinue: "goals.state-execution-blocked.how-to-continue",
    actionKind: "resolve_blocker",
  },
  execution_pending: {
    label: "goals.state-execution-pending.label",
    meaning: "goals.state-execution-pending.meaning",
    nextAction: "goals.state-execution-pending.next-action",
    howToContinue: "goals.state-execution-pending.how-to-continue",
    actionKind: "start",
  },
  satisfied: {
    label: "goals.state-satisfied.label",
    meaning: "goals.state-satisfied.meaning",
    nextAction: "goals.state-satisfied.next-action",
    howToContinue: "goals.state-satisfied.how-to-continue",
    actionKind: "archive",
  },
  invalidated: {
    label: "goals.state-invalidated.label",
    meaning: "goals.state-invalidated.meaning",
    nextAction: "goals.state-invalidated.next-action",
    howToContinue: "goals.state-invalidated.how-to-continue",
    actionKind: "none",
  },
  trashed: {
    label: "goals.state-trashed.label",
    meaning: "goals.state-trashed.meaning",
    nextAction: "goals.state-trashed.next-action",
    howToContinue: "goals.state-trashed.how-to-continue",
    actionKind: "restore",
  },
  archived: {
    label: "goals.state-archived.label",
    meaning: "goals.state-archived.meaning",
    nextAction: "goals.state-archived.next-action",
    howToContinue: "goals.state-archived.how-to-continue",
    actionKind: "restore",
  },
};
