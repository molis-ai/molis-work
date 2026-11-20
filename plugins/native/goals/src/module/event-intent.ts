import { goalIntentRequirements } from "../intent-requirements.js";
import type {
  CreateGoalIntentRequirementInput,
  CreateGoalIntentResult,
  GoalEventIntentApi,
  GoalHungRequirement,
  GoalIntentSourceKind,
} from "../contract/goals.js";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import type { GoalEventState } from "./event-state.js";

export class GoalEventIntent implements GoalEventIntentApi {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
    private readonly state: GoalEventState,
    private readonly actorKind: (kind: "user" | "runtime" | undefined) => "user" | "runtime" | null,
  ) {}

  replay(projectId: string, actorId: string, idempotencyKey: string, hash: string): CreateGoalIntentResult | null {
    return this.context.replay(projectId, actorId, "create_goal_intent", idempotencyKey, hash);
  }

  remember(
    projectId: string,
    actorId: string,
    idempotencyKey: string,
    hash: string,
    result: CreateGoalIntentResult,
    at: string,
  ): void {
    this.context.remember(projectId, actorId, "create_goal_intent", idempotencyKey, hash, result, at);
  }

  recordArtifacts(input: {
    project_id: string;
    goal_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    source_kind?: GoalIntentSourceKind;
    outcome?: string;
    requirements?: CreateGoalIntentRequirementInput[];
  }): GoalHungRequirement[] {
    const goal = this.context.requireGoal(input.project_id, input.goal_id);
    this.state.adoptOwner({
      project_id: input.project_id,
      goal_id: input.goal_id,
      actor_id: input.actor_id,
      source: "intent",
      outcome: input.outcome,
    });
    const at = this.context.now().toISOString();
    // Goals records only that it hung each requirement and where it came from; the requirement itself goes to the platform's
    // acceptance once this transaction has committed (`acceptance.requirements.set@1`, contract-design §10.3).
    const hung = goalIntentRequirements(input.goal_id, input.requirements);
    for (const requirement of hung) {
      this.records.requirements.insertLink({
        project_id: input.project_id, goal_id: input.goal_id, requirement_id: requirement.requirement_id,
        origin: { kind: "create_input" }, created_in_config_version: 0, created_at: at,
      });
    }
    this.state.insertSystem(goal, input.actor_id, this.actorKind(input.actor_kind), "保存原始意图", {
      operation: "intent_created",
      source_kind: input.source_kind ?? "web",
    });
    return hung;
  }
}
