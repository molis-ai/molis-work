import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { listProjectRoots, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { GovernanceCollaborationModule, type GovernanceSqliteDatabase } from "@molis-ai/molis-work-module-governance-collaboration";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import {
  GoalsModule,
  GoalInputBindings,
  type GoalsSqliteDatabase,
  type PlanningMethodPack,
} from "@molis-ai/molis-work-module-goals";
import type { GoalEventAcknowledgementsApi, GoalsApplicationApi, GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { createGoalsApplication, GOALS_PLUGIN_ID, type GoalsApplication } from "@molis-ai/molis-work-plugin-goals";
import { LocalProjectDatabase } from "./project-database.js";
import { assertProjectPluginDatabase } from "./project-plugin-databases.js";
import type { GoalRecord, ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";



export type GoalTreeProposalListQuery = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalListQuery;
export type GoalTreeProposalListResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalListResult;
export type GoalTreeProposalCheckResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalCheckResult;
export type GoalTreeProposalDecisionResult = import("@molis-ai/molis-work-plugin-goals").GoalTreeProposalDecisionResult;
export type GoalTreeSemanticReview = import("@molis-ai/molis-work-plugin-goals").GoalTreeSemanticReview;

interface ActorWrite {
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  reason?: string;
}

export class GoalProjectApplication {
  private readonly goalsModule: GoalsModule;
  readonly governance: GovernanceApplicationApi;
  readonly goals: GoalsApplicationApi;
  readonly goalEvents: GoalsApplication["goalEvents"];
  readonly goalInputs: GoalInputBindingsApi;
  readonly goalAcknowledgements: GoalEventAcknowledgementsApi;
  readonly goalQueries: GoalsApplication["goalQueries"];
  readonly goalTree: GoalsApplication["goalTree"];
  readonly goalTreeSubmission: GoalsApplication["goalTreeSubmission"];
  readonly goalTreeCheck: GoalsApplication["goalTreeCheck"];
  readonly goalTreeDecision: GoalsApplication["goalTreeDecision"];
  readonly goalDecisionAttention: GoalsApplication["goalDecisionAttention"];
  /** Goals' own catch-up on opening, after the project has its board (S8: a library is made with its root row alone). */
  readonly projectOpened: GoalsApplication["projectOpened"];

  constructor(
    readonly store: LocalProjectDatabase,
    private readonly clock: () => Date = () => new Date(),
    private readonly personalPlanningMethodPacks: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]) = [],
  ) {
    const governanceModule = new GovernanceCollaborationModule({
      db: this.store.db as unknown as GovernanceSqliteDatabase,
      journal: this.store,
      now: () => this.clock().toISOString(),
    });
    this.governance = {
      provenance: governanceModule.provenance,
      query: governanceModule.query,
      records: governanceModule.records,
      decisions: governanceModule.decisions,
      eventDecisions: governanceModule.eventDecisions,
    };
    this.goalInputs = new GoalInputBindings(this.store.db, createContextLedger(this.store.db, {
      authorize: (access) => access.scope.kind === "personal",
      now: () => this.clock(),
    }));
    let goalsModule!: GoalsModule;
    goalsModule = new GoalsModule(
      this.store.db as unknown as GoalsSqliteDatabase,
      this.store,
      {
        validateRelationGraph: (projectId, input) => goalsModule.planning.validateRelationAddition(projectId, input),
      },
      {
        now: this.clock,
        personalPlanningMethodPacks: this.personalPlanningMethodPacks,
      },
    );
    this.goalsModule = goalsModule;
    this.goalAcknowledgements = goalsModule.acknowledgements;
    this.goals = {
      commands: goalsModule.commands,
      lifecycle: goalsModule.lifecycle,
      planning: goalsModule.planning,
    };
    const attention = new AttentionModule(this.store.db, {
      exists: (projectId, subjectType, subjectId) => subjectType === "goal_decision"
        && this.goalsModule.query.getGoal(projectId, subjectId) !== null,
    }, {
      eventSink: (event) => {
        this.store.appendEvent({
          eventId: `event-${randomUUID()}`,
          projectId: event.project_id,
          actorId: LOCAL_PERSON_ACTOR_ID,
          objectType: "inbox_entry",
          objectId: event.entry_id,
          type: event.type,
          reason: event.reason,
          payload: event.payload,
          at: event.at,
        });
      },
    });
    // Goals composes its own classes from these ports (D3); the Host keeps only what its callers use.
    const application = createGoalsApplication({
      goals: { ...this.goals, query: goalsModule.query, events: goalsModule.events },
      governance: this.governance, attention, clock: this.clock,
    });
    this.goalEvents = application.goalEvents;
    this.goalQueries = application.goalQueries;
    this.goalTree = application.goalTree;
    this.goalTreeSubmission = application.goalTreeSubmission;
    this.goalTreeCheck = application.goalTreeCheck;
    this.goalTreeDecision = application.goalTreeDecision;
    this.goalDecisionAttention = application.goalDecisionAttention;
    this.projectOpened = projectId => { this.ensureBoard(projectId); application.projectOpened(projectId); };
  }

  /**
   * The board of a project the platform made with its root row alone (S8: `initializeProjectDatabase`): made when the project is
   * opened, under the key and for the person that creating the project used to give it. A project that has its board, or that has
   * no root row (a library `goals.board.initialize` has yet to make a project of), is left as it is.
   * 2026-10-18 改: the Host's Goals assembly makes it until Goals is installed like any plugin (S9), whose `start()` does (PG-021).
   */
  private ensureBoard(projectId: string): void {
    if (this.goalsModule.query.getBoard(projectId) || !listProjectRoots(this.store.db).some(root => root.project_id === projectId)) return;
    this.initializeBoard({ project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, idempotency_key: `project-catalog-create-${projectId}` });
  }

  /**
   * A project's first records through the action: the library's root row, then Goals' board, in one transaction; a project that
   * has its root row keeps it. The tables are Goals' own (its Manifest declares them, S8) and the platform made them when the
   * library opened. When the library refused Goals' tables, this throws that refusal before it touches them (S-46).
   */
  initializeBoard(input: {
    project_id: string;
    actor_id: string;
    idempotency_key: string;
  }): { project_id: string; replayed: boolean; observed_event_cursor: number } {
    assertProjectPluginDatabase(this.store.db, GOALS_PLUGIN_ID);
    return this.store.db.transaction(() => {
      writeProjectRoot(this.store.db, input.project_id, this.clock().toISOString());
      return this.goals.commands.initializeBoard(input);
    }).immediate();
  }

  readProjectGuidance(projectId: string): ProjectGuidanceView {
    return this.goalQueries.readProjectGuidance(projectId);
  }

  setActiveGoal(
    projectId: string,
    input: { goal_id: string; reason: string },
    write: ActorWrite,
  ): { active_goal_id: string; replayed: boolean; observed_event_cursor: number } {
    return this.goals.commands.setActiveGoal(projectId, input, write);
  }

  /** A dedicated read path for a later trash UI/MCP; ordinary work lists exclude these Goals. */
  listTrashedGoals(projectId: string): GoalRecord[] {
    return this.goalQueries.listTrashedGoals(projectId);
  }

  getResolvedGoalPolicy(input: { project_id: string; goal_id: string }) {
    return this.goalQueries.getResolvedGoalPolicy(input);
  }

  readGoalContract(projectId: string, goalId: string) {
    return this.goalQueries.readGoalContract(projectId, goalId);
  }
}

export type MolisWorkDatabase = SqliteDatabase;
