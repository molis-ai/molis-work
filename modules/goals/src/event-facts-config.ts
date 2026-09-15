import type {
  ConfigureGoalEventsInput,
  GoalEventConfigurationPayload,
  GoalEventExtraRequirement,
  GoalEventExtraRequirementInput,
  GoalEventTypeDefinition,
  GoalRecord,
  ReportGoalWorkEventInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import {
  assertNextTypeVersion,
  normalizeBinding,
  normalizeJudgments,
  normalizeNewRequirement,
  normalizePayload,
  normalizeTypeDefinition,
  sameTypeShape,
  type EventFactsError,
} from "./event-facts-validation.js";

export class GoalEventFactsConfig {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
    private readonly error: EventFactsError,
  ) {}

  applyTypes(
    goal: GoalRecord,
    input: ConfigureGoalEventsInput,
    configVersion: number,
    at: string,
  ): GoalEventTypeDefinition[] {
    const added: GoalEventTypeDefinition[] = [];
    const seen = new Set<string>();
    for (const raw of input.types ?? []) {
      const type = normalizeTypeDefinition(this.error, raw, input.actor_id);
      if (seen.has(type.type_id)) {
        throw this.context.error("event_config.duplicate_type_id", `同一配置不能重复提交类型: ${type.type_id}`);
      }
      seen.add(type.type_id);
      const latest = this.records.latestType(goal.board_id, goal.goal_id, type.type_id);
      if (!latest) {
        if (type.version !== 1) {
          throw this.context.error("event_config.invalid_type_version", `新类型 ${type.type_id} 必须从版本 1 开始`);
        }
        this.records.insertType({ boardId: goal.board_id, goalId: goal.goal_id, type, createdAt: at, configVersion, actorId: input.actor_id });
        added.push(type);
        continue;
      }
      if (type.version < latest.version) {
        throw this.context.error("event_config.cannot_rewrite_type", `不能覆写已提交的类型版本: ${type.type_id} v${type.version}`);
      }
      if (type.version === latest.version) {
        if (!sameTypeShape(latest, type)) {
          throw this.context.error("event_config.cannot_rewrite_type", `不能改写已提交的类型版本: ${type.type_id} v${type.version}`);
        }
        continue;
      }
      if (type.version !== latest.version + 1) {
        throw this.context.error("event_config.type_version_gap", `类型 ${type.type_id} 的下一版本必须是 ${latest.version + 1}`);
      }
      assertNextTypeVersion(this.error, latest, type);
      this.records.insertType({ boardId: goal.board_id, goalId: goal.goal_id, type, createdAt: at, configVersion, actorId: input.actor_id });
      added.push(type);
    }
    return added;
  }

  applyRequirements(
    goal: GoalRecord,
    rawRequirements: GoalEventExtraRequirementInput[],
    actorId: string,
    addedTypes: GoalEventTypeDefinition[],
    configVersion: number,
    at: string,
  ) {
    const added: GoalEventExtraRequirement[] = [];
    const seen = new Set<string>();
    for (const raw of rawRequirements) {
      const requirement = normalizeNewRequirement(this.error, raw);
      if (seen.has(requirement.requirement_id)) {
        throw this.context.error("event_config.duplicate_requirement", `同一配置不能重复新增要求: ${requirement.requirement_id}`);
      }
      seen.add(requirement.requirement_id);
      if (goal.acceptance_criteria.some((criterion) => criterion.criterion_id === requirement.requirement_id)) {
        throw this.context.error("event_config.requirement_exists", `要求 ID 已用于现有验收标准: ${requirement.requirement_id}`);
      }
      const existing = this.records.getExtraRequirement(requirement.requirement_id);
      if (existing) {
        throw this.context.error("event_config.requirement_exists", `要求 ID 已存在: ${requirement.requirement_id}`);
      }
      if (requirement.bound_type_id) this.requireTypeOnGoal(goal, requirement.bound_type_id, addedTypes);
      const stored: GoalEventExtraRequirement = {
        requirement_id: requirement.requirement_id,
        statement: requirement.statement,
        bound_type_id: requirement.bound_type_id,
        created_in_config_version: configVersion,
        actor_id: actorId,
        source: requirement.source,
        human_decision_required: requirement.human_decision_required === true,
        current_status: "active",
        revision: 1,
        support_valid_after_seq: 0,
      };
      this.records.insertRequirement({
        ...stored,
        board_id: goal.board_id,
        goal_id: goal.goal_id,
        created_at: at,
      });
      added.push(stored);
    }
    return added;
  }

  applyBindings(
    goal: GoalRecord,
    input: ConfigureGoalEventsInput,
    addedTypes: GoalEventTypeDefinition[],
    addedRequirements: Array<{ requirement_id: string; bound_type_id?: string }>,
    configVersion: number,
    at: string,
  ) {
    const added: Array<{ type_id: string; requirement_id: string }> = [];
    for (const raw of input.requirement_bindings ?? []) {
      const binding = normalizeBinding(this.error, raw);
      this.requireTypeOnGoal(goal, binding.type_id, addedTypes);
      this.requireRequirementOnGoal(goal, binding.requirement_id, addedRequirements);
      if (this.records.bindingExists(goal.board_id, goal.goal_id, binding.type_id, binding.requirement_id)) continue;
      this.records.insertBinding({
        ...binding,
        board_id: goal.board_id,
        goal_id: goal.goal_id,
        created_in_config_version: configVersion,
        created_at: at,
      });
      added.push(binding);
    }
    return added;
  }

  prepareReport(goal: GoalRecord, input: ReportGoalWorkEventInput, index: number) {
    const typeId = input.type_id?.trim();
    if (!typeId) throw this.context.error("event_report.type_required", `批次第 ${index + 1} 条缺少类型 ID`);
    if (!Number.isInteger(input.type_version) || input.type_version < 1) {
      throw this.context.error("event_type.version_not_found", `批次第 ${index + 1} 条的类型版本无效`);
    }
    const type = this.records.getType(goal.board_id, goal.goal_id, typeId, input.type_version);
    if (!type) {
      throw this.context.error("event_type.version_not_found", `类型 ${typeId} v${input.type_version} 不属于当前 Goal`);
    }
    const title = input.title?.trim();
    if (!title) throw this.context.error("event_report.title_required", `批次第 ${index + 1} 条缺少标题`);
    const fields = normalizePayload(this.error, type.fields, input.fields ?? {});
    const judgments = normalizeJudgments(this.error, input.judgments);
    for (const judgment of judgments) this.requireJudgableRequirement(goal, judgment.requirement_id, type.type_id);
    return { type, title, fields, judgments };
  }

  private requireJudgableRequirement(goal: GoalRecord, requirementId: string, typeId: string): void {
    const onGoal = goal.acceptance_criteria.some((criterion) => criterion.criterion_id === requirementId);
    const extra = this.records.getExtraRequirement(requirementId);
    if (extra && extra.board_id === goal.board_id && extra.goal_id === goal.goal_id) {
      this.assertCompatibleType(goal, requirementId, typeId, extra.bound_type_id);
      return;
    }
    if (onGoal) {
      this.assertCompatibleType(goal, requirementId, typeId);
      return;
    }
    if (extra) {
      throw this.context.error("event_report.cross_goal_reference", `要求 ${requirementId} 不属于当前 Goal`);
    }
    const ownerGoalId = this.context.repository.criterionGoalId(requirementId);
    if (ownerGoalId && ownerGoalId !== goal.goal_id) {
      throw this.context.error("event_report.cross_goal_reference", `要求 ${requirementId} 不属于当前 Goal`);
    }
    throw this.context.error("event_report.requirement_not_found", `要求不存在: ${requirementId}`);
  }

  private assertCompatibleType(
    goal: GoalRecord,
    requirementId: string,
    typeId: string,
    extraBoundTypeId?: string,
  ): void {
    const boundTypeIds = new Set<string>();
    for (const binding of this.records.listBindings(goal.board_id, goal.goal_id)) {
      if (binding.requirement_id === requirementId) boundTypeIds.add(binding.type_id);
    }
    if (extraBoundTypeId) boundTypeIds.add(extraBoundTypeId);
    if (boundTypeIds.size === 0 || boundTypeIds.has(typeId)) return;
    throw this.context.error(
      "event_report.incompatible_requirement",
      `要求 ${requirementId} 只接受绑定类型的报告，不能用 ${typeId} 更新当前判断`,
      { requirement_id: requirementId, type_id: typeId, bound_type_ids: [...boundTypeIds] },
    );
  }

  private requireTypeOnGoal(goal: GoalRecord, typeId: string, addedTypes: GoalEventTypeDefinition[]): void {
    if (addedTypes.some((type) => type.type_id === typeId)) return;
    if (this.records.typeExistsOnGoal(goal.board_id, goal.goal_id, typeId)) return;
    throw this.context.error("event_type.not_found", `类型不属于当前 Goal: ${typeId}`);
  }

  private requireRequirementOnGoal(
    goal: GoalRecord,
    requirementId: string,
    addedRequirements: Array<{ requirement_id: string }>,
  ): void {
    if (addedRequirements.some((item) => item.requirement_id === requirementId)) return;
    if (goal.acceptance_criteria.some((criterion) => criterion.criterion_id === requirementId)) return;
    const extra = this.records.getExtraRequirement(requirementId);
    if (extra && extra.board_id === goal.board_id && extra.goal_id === goal.goal_id) return;
    if (extra || this.context.repository.criterionGoalId(requirementId)) {
      throw this.context.error("event_config.cross_goal_requirement", `要求 ${requirementId} 不属于当前 Goal`);
    }
    throw this.context.error("event_config.requirement_not_found", `要求不存在: ${requirementId}`);
  }
}

export function configurationPayload(raw: Record<string, unknown>): GoalEventConfigurationPayload {
  return {
    config_version: Number(raw.config_version) || 0,
    types: Array.isArray(raw.types) ? raw.types as GoalEventTypeDefinition[] : [],
    extra_requirements: Array.isArray(raw.extra_requirements)
      ? raw.extra_requirements as GoalEventConfigurationPayload["extra_requirements"]
      : [],
    requirement_bindings: Array.isArray(raw.requirement_bindings)
      ? raw.requirement_bindings as GoalEventConfigurationPayload["requirement_bindings"]
      : [],
    adopted_planning: Array.isArray(raw.adopted_planning)
      ? raw.adopted_planning as GoalEventConfigurationPayload["adopted_planning"]
      : [],
  };
}
