import type {
  HostCapabilityDefinition,
  LocalHostProjectClient,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalEventApplication } from "./goal-event-application.js";

/** Management writes take no caller identity. The host records the person on this machine. */
type WithoutActor<T> = Omit<T, "actor_id" | "actor_kind">;

/**
 * Every write below is a management entry, so each is `host_only`: the person on this machine is recorded as the writer, and a
 * plugin that lists one under capabilities.consumes is refused (`actions.host_only`) instead of being recorded as that person. A
 * plugin writes through a registered action, which takes its identity from the call context.
 */

export interface GoalEventEntryApi {
  createIntent: GoalEventApplication["createIntent"];
  listGoals: GoalEventApplication["listGoals"];
  readState: GoalEventApplication["readState"];
  configure: GoalEventApplication["configure"];
  report: GoalEventApplication["report"];
  listEvents: GoalEventApplication["listEvents"];
  listLatestEvents: GoalEventApplication["listLatestEvents"];
  listLatestTimeline: GoalEventApplication["listLatestTimeline"];
  readEvent: GoalEventApplication["readEvent"];
  recordProgress: GoalEventApplication["recordProgress"];
  applyConcern: GoalEventApplication["applyConcern"];
  requestDecision: GoalEventApplication["requestDecision"];
  citeDecision: GoalEventApplication["citeDecision"];
  recordTrustedDecision: GoalEventApplication["recordTrustedDecision"];
  setAgreement: GoalEventApplication["setAgreement"];
  submitClosure: GoalEventApplication["submitClosure"];
  resumeWork: GoalEventApplication["resumeWork"];
  recordNote: GoalEventApplication["recordNote"];
}

export const createGoalIntentCapability = {
  capability_id: "io.molis.work.goals.events.create-intent",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["createIntent"]>[0]>,
  ReturnType<GoalEventEntryApi["createIntent"]>
>;

export const listGoalDirectoryCapability = {
  capability_id: "io.molis.work.goals.events.list-goals",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<
  Parameters<GoalEventEntryApi["listGoals"]>[0],
  ReturnType<GoalEventEntryApi["listGoals"]>
>;

export const readGoalEventStateCapability = {
  capability_id: "io.molis.work.goals.events.read-state",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ project_id: string; goal_id: string }, ReturnType<GoalEventEntryApi["readState"]>>;

export const configureGoalEventsCapability = {
  capability_id: "io.molis.work.goals.events.configure",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["configure"]>[0]>,
  ReturnType<GoalEventEntryApi["configure"]>
>;

export const reportGoalEventsCapability = {
  capability_id: "io.molis.work.goals.events.report",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["report"]>[0]>,
  ReturnType<GoalEventEntryApi["report"]>
>;

export const listGoalEventsCapability = {
  capability_id: "io.molis.work.goals.events.list",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{
  project_id: string;
  goal_id: string;
  after_cursor?: number;
  limit?: number;
}, ReturnType<GoalEventEntryApi["listEvents"]>>;

export const listLatestGoalEventsCapability = {
  capability_id: "io.molis.work.goals.events.list-latest",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{
  project_id: string;
  goal_id: string;
  before_cursor?: number;
  limit?: number;
}, ReturnType<GoalEventEntryApi["listLatestEvents"]>>;

export const listLatestGoalTimelineCapability = {
  capability_id: "io.molis.work.goals.events.timeline",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{
  project_id: string;
  goal_id: string;
  before_cursor?: number;
  limit?: number;
}, ReturnType<GoalEventEntryApi["listLatestTimeline"]>>;

export const readGoalEventCapability = {
  capability_id: "io.molis.work.goals.events.read",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{
  project_id: string;
  goal_id: string;
  event_id: string;
}, ReturnType<GoalEventEntryApi["readEvent"]>>;

export function createGoalEventEntryClient(client: LocalHostProjectClient) {
  return {
    createIntent: (input: WithoutActor<Parameters<GoalEventEntryApi["createIntent"]>[0]>) =>
      client.invoke(createGoalIntentCapability, input),
    listGoals: (input: Parameters<GoalEventEntryApi["listGoals"]>[0]) =>
      client.invoke(listGoalDirectoryCapability, input),
    readState: (projectId: string, goalId: string) =>
      client.invoke(readGoalEventStateCapability, { project_id: projectId, goal_id: goalId }),
    configure: (input: WithoutActor<Parameters<GoalEventEntryApi["configure"]>[0]>) =>
      client.invoke(configureGoalEventsCapability, input),
    report: (input: WithoutActor<Parameters<GoalEventEntryApi["report"]>[0]>) =>
      client.invoke(reportGoalEventsCapability, input),
    listEvents: (projectId: string, goalId: string, query?: { after_cursor?: number; limit?: number }) =>
      client.invoke(listGoalEventsCapability, { project_id: projectId, goal_id: goalId, ...query }),
    listLatestEvents: (projectId: string, goalId: string, query?: { before_cursor?: number; limit?: number }) =>
      client.invoke(listLatestGoalEventsCapability, { project_id: projectId, goal_id: goalId, ...query }),
    listLatestTimeline: (projectId: string, goalId: string, query?: { before_cursor?: number; limit?: number }) =>
      client.invoke(listLatestGoalTimelineCapability, { project_id: projectId, goal_id: goalId, ...query }),
    readEvent: (projectId: string, goalId: string, eventId: string) =>
      client.invoke(readGoalEventCapability, { project_id: projectId, goal_id: goalId, event_id: eventId }),
    recordProgress: (input: WithoutActor<Parameters<GoalEventEntryApi["recordProgress"]>[0]>) =>
      client.invoke(recordGoalProgressCapability, input),
    applyConcern: (input: WithoutActor<Parameters<GoalEventEntryApi["applyConcern"]>[0]>) =>
      client.invoke(applyGoalConcernCapability, input),
    requestDecision: (input: WithoutActor<Parameters<GoalEventEntryApi["requestDecision"]>[0]>) =>
      client.invoke(requestGoalDecisionCapability, input),
    citeDecision: (input: WithoutActor<Parameters<GoalEventEntryApi["citeDecision"]>[0]>) =>
      client.invoke(citeGoalDecisionCapability, input),
    recordTrustedDecision: (input: Parameters<GoalEventEntryApi["recordTrustedDecision"]>[0]) =>
      client.invoke(recordGoalUserDecisionCapability, input),
    setAgreement: (input: WithoutActor<Parameters<GoalEventEntryApi["setAgreement"]>[0]>) =>
      client.invoke(setGoalEventAgreementCapability, input),
    submitClosure: (input: WithoutActor<Parameters<GoalEventEntryApi["submitClosure"]>[0]>) =>
      client.invoke(submitGoalEventClosureCapability, input),
    resumeWork: (input: WithoutActor<Parameters<GoalEventEntryApi["resumeWork"]>[0]>) =>
      client.invoke(resumeGoalEventWorkCapability, input),
    recordNote: (input: WithoutActor<Parameters<GoalEventEntryApi["recordNote"]>[0]>) =>
      client.invoke(recordGoalNoteCapability, input),
  };
}

export const recordGoalProgressCapability = {
  capability_id: "io.molis.work.goals.events.progress",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["recordProgress"]>[0]>,
  ReturnType<GoalEventEntryApi["recordProgress"]>
>;

export const applyGoalConcernCapability = {
  capability_id: "io.molis.work.goals.events.concern",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["applyConcern"]>[0]>,
  ReturnType<GoalEventEntryApi["applyConcern"]>
>;

export const requestGoalDecisionCapability = {
  capability_id: "io.molis.work.goals.events.decision-request",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["requestDecision"]>[0]>,
  ReturnType<GoalEventEntryApi["requestDecision"]>
>;

export const citeGoalDecisionCapability = {
  capability_id: "io.molis.work.goals.events.cite-decision",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["citeDecision"]>[0]>,
  ReturnType<GoalEventEntryApi["citeDecision"]>
>;

export const recordGoalUserDecisionCapability = {
  capability_id: "io.molis.work.goals.events.decide",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  Parameters<GoalEventEntryApi["recordTrustedDecision"]>[0],
  ReturnType<GoalEventEntryApi["recordTrustedDecision"]>
>;

export const setGoalEventAgreementCapability = {
  capability_id: "io.molis.work.goals.events.agree",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["setAgreement"]>[0]>,
  ReturnType<GoalEventEntryApi["setAgreement"]>
>;

export const submitGoalEventClosureCapability = {
  capability_id: "io.molis.work.goals.events.close",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["submitClosure"]>[0]>,
  ReturnType<GoalEventEntryApi["submitClosure"]>
>;

export const resumeGoalEventWorkCapability = {
  capability_id: "io.molis.work.goals.events.resume",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["resumeWork"]>[0]>,
  ReturnType<GoalEventEntryApi["resumeWork"]>
>;

export const recordGoalNoteCapability = {
  capability_id: "io.molis.work.goals.events.note",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["recordNote"]>[0]>,
  ReturnType<GoalEventEntryApi["recordNote"]>
>;
