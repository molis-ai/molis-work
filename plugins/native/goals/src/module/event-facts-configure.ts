import { randomUUID } from "node:crypto";
import type {
  ConfigureGoalEventsInput,
  ConfigureGoalEventsResult,
  GoalEventConfigView,
} from "../contract/goals.js";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import { goalErrors } from "./errors.js";
import type { GoalEventFactsConfig } from "./event-facts-config.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import type { GoalEventState } from "./event-state.js";
import { eventActorKind } from "./event-state-write.js";
import { requireWritableGoal } from "./goal-writable.js";

/** Registering a Goal's event types, requirement bindings, and reading the configuration back. */
export class GoalEventConfiguration {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
    private readonly configWrites: GoalEventFactsConfig,
    private readonly state: GoalEventState,
  ) {}

  configure(input: ConfigureGoalEventsInput): ConfigureGoalEventsResult {
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      expected_version: input.expected_version,
      types: input.types ?? [],
      requirement_bindings: input.requirement_bindings ?? [],
    });
    return this.context.repository.immediate(() => this.configureInTransaction(input, hash));
  }

  private configureInTransaction(
    input: ConfigureGoalEventsInput,
    hash: string,
  ): ConfigureGoalEventsResult {
      const replay = this.context.replay<Omit<ConfigureGoalEventsResult, "replayed">>(
        input.project_id, input.actor_id, "configure_goal_events", input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = requireWritableGoal(this.context, input.project_id, input.goal_id);
      const current = this.records.config.getConfig(input.project_id, input.goal_id);
      const currentVersion = current?.current_version ?? 0;
      if (input.expected_version !== currentVersion) {
        throw goalErrors["goals.event_config.version_conflict"](`配置版本已是 ${currentVersion}，不能用期望版本 ${input.expected_version} 覆盖`, { current_version: currentVersion, expected_version: input.expected_version });
      }

      const actorKind = eventActorKind(input.actor_kind);
      const nextVersion = currentVersion + 1;
      const at = this.context.now().toISOString();
      const addedTypes = this.configWrites.applyTypes(goal, input, nextVersion, at);
      const addedRequirements = this.configWrites.applyRequirements(goal, [], input.actor_id, addedTypes, nextVersion, at);
      const addedBindings = this.configWrites.applyBindings(goal, input, addedTypes, addedRequirements, nextVersion, at);
      if (addedTypes.length === 0 && addedBindings.length === 0) {
        throw goalErrors["goals.event_config.no_changes"]("配置没有增加类型、类型版本或绑定");
      }

      const eventId = `gevt-${randomUUID()}`;
      this.records.config.upsertConfig({
        project_id: goal.project_id,
        goal_id: goal.goal_id,
        current_version: nextVersion,
        updated_at: at,
        updated_by: input.actor_id,
      });
      this.records.config.insertConfigVersion({
        projectId: goal.project_id,
        goalId: goal.goal_id,
        version: nextVersion,
        actorId: input.actor_id,
        createdAt: at,
        configEventId: eventId,
      });
      const payload = {
        config_version: nextVersion,
        types: addedTypes,
        extra_requirements: addedRequirements,
        requirement_bindings: addedBindings,
      };
      const cursor = this.context.repository.appendEvent({
        eventId,
        projectId: goal.project_id,
        actorId: input.actor_id,
        type: "goal.event_config.updated",
        objectType: "goal_event_config",
        objectId: goal.goal_id,
        reason: "登记 Goal 局部事件配置",
        payload,
        at,
      });
      this.records.workEvents.insertWorkEvent({
        event_id: eventId,
        project_id: goal.project_id,
        goal_id: goal.goal_id,
        kind: "configuration",
        type_id: null,
        type_version: null,
        title: addedTypes.length === 1 ? `新增记录方式：${addedTypes[0]!.name}` : "更新当前 Goal 的事件配置",
        payload,
        actor_id: input.actor_id,
        actor_kind: actorKind,
        received_at: at,
        journal_seq: cursor,
        config_version: nextVersion,
      });
      this.state.adoptOwner({
        project_id: goal.project_id,
        goal_id: goal.goal_id,
        actor_id: input.actor_id,
        source: "configuration",
        outcome: goal.outcome,
      });
      const outcome = { config: this.configView(goal.project_id, goal.goal_id), event_id: eventId, observed_event_cursor: cursor };
      this.context.remember(goal.project_id, input.actor_id, "configure_goal_events", input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
  }

  readConfig(projectId: string, goalId: string): GoalEventConfigView {
    this.context.requireGoal(projectId, goalId);
    return this.configView(projectId, goalId);
  }

  private configView(projectId: string, goalId: string): GoalEventConfigView {
    const current = this.records.config.getConfig(projectId, goalId);
    return {
      project_id: projectId,
      goal_id: goalId,
      version: current?.current_version ?? 0,
      types: this.records.config.listLatestTypes(projectId, goalId),
      extra_requirements: this.records.requirements.listExtraRequirements(projectId, goalId),
      requirement_bindings: this.records.requirements.listBindings(projectId, goalId),
      updated_at: current?.updated_at ?? null,
      updated_by: current?.updated_by ?? null,
    };
  }
}
