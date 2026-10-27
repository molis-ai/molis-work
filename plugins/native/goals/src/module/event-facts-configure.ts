import { randomUUID } from "node:crypto";
import type {
  ConfigureGoalEventsApplicationInput,
  ConfigureGoalEventsInput,
  ConfigureGoalEventsResult,
  GoalEventAdoptedPlanningRequest,
  GoalEventConfigView,
  GoalEventTypeDefinitionInput,
  ResolvedPlanningEventAdoption,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";
import { goalErrors } from "./errors.js";
import type { GoalEventFactsConfig } from "./event-facts-config.js";
import { normalizeAdoptedPlanning } from "./event-facts-validation.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import type { GoalEventState } from "./event-state.js";
import { eventActorKind } from "./event-state-write.js";
import { requireWritableGoal } from "./goal-writable.js";
import { instantiatePlanningRequirementId } from "./planning/event-adoption.js";

/** Registering a Goal's event types, requirement bindings and adopted planning, and reading the configuration back. */
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
      adopted_planning: input.adopted_planning ?? [],
      requirement_bindings: input.requirement_bindings ?? [],
    });
    return this.context.repository.immediate(() => this.configureInTransaction(input, hash, false));
  }

  configureRequested(
    input: ConfigureGoalEventsApplicationInput,
    resolveAdoption: (projectId: string, requested: GoalEventAdoptedPlanningRequest[]) => ResolvedPlanningEventAdoption,
  ): ConfigureGoalEventsResult {
    const originalHash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      expected_version: input.expected_version,
      types: input.types ?? [],
      adopted_planning: input.adopted_planning ?? null,
      adopt_default_requirement_ids: input.adopt_default_requirement_ids ?? [],
      requirement_bindings: input.requirement_bindings ?? [],
      expected_agreement_version: input.expected_agreement_version ?? null,
    });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ConfigureGoalEventsResult, "replayed">>(
        input.project_id, input.actor_id, "configure_goal_events_request", input.idempotency_key, originalHash,
      );
      if (replay) return { ...replay, replayed: true };

      const requested = input.adopted_planning;
      const resolved = requested && requested.length > 0
        ? resolveAdoption(input.project_id, requested)
        : { adopted_planning: [] as ResolvedPlanningEventAdoption["adopted_planning"], types: [] as GoalEventTypeDefinitionInput[], default_requirements: [] };
      const selectedIds = new Set((input.adopt_default_requirement_ids ?? []).map((value) => value.trim()).filter(Boolean));
      if (selectedIds.size) {
        const available = new Map(resolved.default_requirements.map((requirement) => [requirement.requirement_id, requirement]));
        for (const requirementId of selectedIds) {
          if (!available.has(requirementId)) {
            throw goalErrors["goals.event_config.default_requirement_not_found"](`采用的规划里没有默认要求 ${requirementId}`, { requirement_id: requirementId });
          }
        }
      }
      const instantiated = resolved.default_requirements
        .filter((requirement) => selectedIds.has(requirement.requirement_id))
        .map((requirement) => ({
          requirement_id: instantiatePlanningRequirementId(input.goal_id, requirement.requirement_id),
          statement: requirement.statement,
          bound_type_id: requirement.bound_type_id,
          human_decision_required: false,
          source: {
            kind: "planning" as const,
            template_requirement_id: requirement.requirement_id,
            methods: requirement.sources ?? [],
          },
        }));
      if (instantiated.length && !Number.isInteger(input.expected_agreement_version)) {
        throw goalErrors["goals.event_agreement.expected_agreement_version_required"]("采用规划默认要求时需要 expected_agreement_version");
      }
      const innerInput: ConfigureGoalEventsInput = {
        project_id: input.project_id,
        goal_id: input.goal_id,
        actor_id: input.actor_id,
        actor_kind: input.actor_kind,
        expected_version: input.expected_version,
        idempotency_key: input.idempotency_key,
        types: [...resolved.types, ...(input.types ?? [])],
        requirement_bindings: input.requirement_bindings,
        ...(requested === undefined ? {} : { adopted_planning: resolved.adopted_planning }),
      };
      const innerHash = requestHash({
        project_id: innerInput.project_id,
        goal_id: innerInput.goal_id,
        expected_version: innerInput.expected_version,
        types: innerInput.types ?? [],
        adopted_planning: innerInput.adopted_planning ?? [],
        requirement_bindings: innerInput.requirement_bindings ?? [],
      });
      let result = this.configureInTransaction(innerInput, innerHash, instantiated.length > 0);
      if (instantiated.length) {
        const agreed = this.state.setAgreement({
          project_id: input.project_id,
          goal_id: input.goal_id,
          actor_id: input.actor_id,
          actor_kind: input.actor_kind,
          idempotency_key: `${input.idempotency_key}:defaults`,
          expected_config_version: result.config.version,
          expected_agreement_version: input.expected_agreement_version!,
          new_requirements: instantiated,
        });
        result = {
          config: this.configView(input.project_id, input.goal_id),
          event_id: agreed.event_id,
          observed_event_cursor: agreed.observed_event_cursor,
          replayed: result.replayed,
        };
      }
      this.context.remember(
        input.project_id,
        input.actor_id,
        "configure_goal_events_request",
        input.idempotency_key,
        originalHash,
        { config: result.config, event_id: result.event_id, observed_event_cursor: result.observed_event_cursor },
        this.context.now().toISOString(),
      );
      return result;
    });
  }

  private configureInTransaction(
    input: ConfigureGoalEventsInput,
    hash: string,
    pendingRequirementAdds = false,
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
      const adoptedPlanning = normalizeAdoptedPlanning(
        input.adopted_planning,
        currentVersion === 0 ? [] : this.records.config.listAdoptedPlanning(goal.project_id, goal.goal_id, currentVersion),
      );
      if (
        addedTypes.length === 0
        && addedBindings.length === 0
        && JSON.stringify(adoptedPlanning) === JSON.stringify(currentVersion === 0 ? [] : this.records.config.listAdoptedPlanning(goal.project_id, goal.goal_id, currentVersion))
      ) {
        if (!pendingRequirementAdds) {
          throw goalErrors["goals.event_config.no_changes"]("配置没有增加类型、类型版本、绑定或规划来源");
        }
        return {
          config: this.configView(goal.project_id, goal.goal_id),
          event_id: "",
          observed_event_cursor: this.context.repository.eventCursor(goal.project_id),
          replayed: false,
        };
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
        adoptedPlanning,
        createdAt: at,
        configEventId: eventId,
      });
      const payload = {
        config_version: nextVersion,
        types: addedTypes,
        extra_requirements: addedRequirements,
        requirement_bindings: addedBindings,
        adopted_planning: adoptedPlanning,
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
      adopted_planning: current ? this.records.config.listAdoptedPlanning(projectId, goalId, current.current_version) : [],
      extra_requirements: this.records.requirements.listExtraRequirements(projectId, goalId),
      requirement_bindings: this.records.requirements.listBindings(projectId, goalId),
      updated_at: current?.updated_at ?? null,
      updated_by: current?.updated_by ?? null,
    };
  }
}
