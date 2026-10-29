import type {
  ConfigureGoalEventsApplicationInput,
  ConfigureGoalEventsInput,
  ConfigureGoalEventsResult,
  GoalIntentSourceKind,
  GoalEventAdoptedPlanningRequest,
  GoalEventConfigView,
  GoalEventFactsApi,
  GoalEventHistoryPage,
  GoalEventHistoryQuery,
  GoalEventLatestReports,
  GoalEventLatestReportsQuery,
  GoalEventListPage,
  GoalEventListQuery,
  GoalEventRequirementStatus,
  GoalEventTimelinePage,
  GoalWorkEventRecord,
  ReportGoalEventsInput,
  ReportGoalEventsRecordedResult,
  ResolvedPlanningEventAdoption,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext } from "./command-support.js";
import { GoalEventConfiguration } from "./event-facts-configure.js";
import { GoalEventFactsConfig } from "./event-facts-config.js";
import { GoalEventReads } from "./event-facts-reads.js";
import { GoalEventFactsRepository } from "./event-facts-repository.js";
import { GoalEventReporting } from "./event-facts-report.js";
import { applyGoalEventAgreementChange, readCurrentGoalEventRequirements } from "./event-facts-requirements.js";
import type { GoalEventCompletionContext } from "./event-state-completion.js";
import { GoalEventIntent } from "./event-intent.js";
import { GoalEventState } from "./event-state.js";
import { GoalEventStateRepository } from "./event-state-repository.js";
import { eventActorKind } from "./event-state-write.js";
import { requireWritableGoal } from "./goal-writable.js";
import { resolveGoalPolicy } from "./query.js";

export class GoalEventFacts implements GoalEventFactsApi {
  private readonly records: GoalEventFactsRepository;
  private readonly configWrites: GoalEventFactsConfig;
  readonly state: GoalEventState;
  readonly intent: GoalEventIntent;
  private readonly configuration: GoalEventConfiguration;
  private readonly reporting: GoalEventReporting;
  private readonly reads: GoalEventReads;

  constructor(private readonly context: GoalsCommandContext) {
    this.records = new GoalEventFactsRepository(context.repository.db);
    this.configWrites = new GoalEventFactsConfig(context, this.records);
    this.state = new GoalEventState(
      context,
      this.records,
      new GoalEventStateRepository(context.repository.db),
      {
        requireWritableGoal: (projectId, goalId) => requireWritableGoal(this.context, projectId, goalId),
        actorKind: (kind) => eventActorKind(kind),
        configVersion: (projectId, goalId) => this.records.config.getConfig(projectId, goalId)?.current_version ?? 0,
        readCurrentRequirements: (projectId, goalId) => this.readCurrentRequirements(projectId, goalId),
        applyAgreementChange: (input, goal) => applyGoalEventAgreementChange(this.context, this.records, this.configWrites, input, goal),
        readCompletionContext: (projectId, goalId) => this.readCompletionContext(projectId, goalId),
      },
    );
    this.intent = new GoalEventIntent(context, this.records, this.state, (kind) => eventActorKind(kind));
    this.configuration = new GoalEventConfiguration(context, this.records, this.configWrites, this.state);
    this.reporting = new GoalEventReporting(context, this.records, this.configWrites, this.state);
    this.reads = new GoalEventReads(context, this.records);
  }

  configure(input: ConfigureGoalEventsInput): ConfigureGoalEventsResult {
    return this.configuration.configure(input);
  }

  configureRequested(
    input: ConfigureGoalEventsApplicationInput,
    resolveAdoption: (projectId: string, requested: GoalEventAdoptedPlanningRequest[]) => ResolvedPlanningEventAdoption,
  ): ConfigureGoalEventsResult {
    return this.configuration.configureRequested(input, resolveAdoption);
  }

  report(input: ReportGoalEventsInput): ReportGoalEventsRecordedResult {
    return this.reporting.report(input);
  }

  readConfig(projectId: string, goalId: string): GoalEventConfigView {
    return this.configuration.readConfig(projectId, goalId);
  }

  listEvents(projectId: string, goalId: string, query: GoalEventListQuery = {}): GoalEventListPage {
    return this.reads.listEvents(projectId, goalId, query);
  }

  listLatestEvents(projectId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventHistoryPage {
    return this.reads.listLatestEvents(projectId, goalId, query);
  }

  listLatestTimeline(projectId: string, goalId: string, query: GoalEventHistoryQuery = {}): GoalEventTimelinePage {
    return this.reads.listLatestTimeline(projectId, goalId, query);
  }

  listLatestReports(projectId: string, goalId: string, query: GoalEventLatestReportsQuery = {}): GoalEventLatestReports {
    return this.reads.listLatestReports(projectId, goalId, query);
  }

  readEvent(projectId: string, goalId: string, eventId: string): GoalWorkEventRecord {
    return this.reads.readEvent(projectId, goalId, eventId);
  }

  readCurrentRequirements(projectId: string, goalId: string): GoalEventRequirementStatus[] {
    return readCurrentGoalEventRequirements(this.context, this.records, projectId, goalId);
  }

  readIntentSourceKind(projectId: string, goalId: string): GoalIntentSourceKind | null {
    return this.reads.readIntentSourceKind(projectId, goalId);
  }

  readObservedEventCursor(projectId: string): number {
    return this.context.repository.eventCursor(projectId);
  }

  private readCompletionContext(projectId: string, goalId: string): GoalEventCompletionContext {
    const openDependencies = this.context.repository.db.prepare(`
      SELECT g.goal_id, g.title, g.fulfillment_state
      FROM goal_relations r
      JOIN goals g ON g.goal_id = r.to_goal_id
      WHERE r.project_id = ? AND r.from_goal_id = ?
        AND r.type = 'depends_on' AND r.state = 'active'
      ORDER BY g.goal_id
    `).all(projectId, goalId) as Array<{ goal_id: string; title: string; fulfillment_state: string }>;
    return {
      open_dependencies: openDependencies
        .filter((row) => row.fulfillment_state !== "satisfied")
        .map((row) => ({ goal_id: row.goal_id, title: row.title })),
      human_approval_required: resolveGoalPolicy(this.context.repository.listActivePolicyBindings(projectId, goalId)).human_approval,
      blocking_risks: [],
    };
  }

  isEventStateOwner(projectId: string, goalId: string): boolean {
    this.context.requireGoal(projectId, goalId);
    return this.state.isEventStateOwner(projectId, goalId);
  }

  runImmediate<T>(operation: () => T): T {
    return this.context.repository.immediate(operation);
  }
}
