import { goalErrors } from "./errors.js";
import type {
  ConfigureGoalEventsInput,
  GoalAcceptanceReading,
  GoalEventConfigurationPayload,
  GoalEventTypeDefinition,
  GoalRecord,
  ReportGoalWorkEventInput,
} from "../contract/goals.js";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import {
  assertNextTypeVersion,
  normalizeBinding,
  normalizePayload,
  normalizeTypeDefinition,
  sameTypeShape,
} from "./event-facts-validation.js";

export class GoalEventFactsConfig {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventFactsRepository,
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
      const type = normalizeTypeDefinition(raw, input.actor_id);
      if (seen.has(type.type_id)) {
        throw goalErrors["goals.event_config.duplicate_type_id"](`同一配置不能重复提交类型: ${type.type_id}`);
      }
      seen.add(type.type_id);
      const latest = this.records.config.latestType(goal.project_id, goal.goal_id, type.type_id);
      if (!latest) {
        if (type.version !== 1) {
          throw goalErrors["goals.event_config.invalid_type_version"](`新类型 ${type.type_id} 必须从版本 1 开始`);
        }
        this.records.config.insertType({ projectId: goal.project_id, goalId: goal.goal_id, type, createdAt: at, configVersion, actorId: input.actor_id });
        added.push(type);
        continue;
      }
      if (type.version < latest.version) {
        throw goalErrors["goals.event_config.cannot_rewrite_type"](`不能覆写已提交的类型版本: ${type.type_id} v${type.version}`);
      }
      if (type.version === latest.version) {
        if (!sameTypeShape(latest, type)) {
          throw goalErrors["goals.event_config.cannot_rewrite_type"](`不能改写已提交的类型版本: ${type.type_id} v${type.version}`);
        }
        continue;
      }
      if (type.version !== latest.version + 1) {
        throw goalErrors["goals.event_config.type_version_gap"](`类型 ${type.type_id} 的下一版本必须是 ${latest.version + 1}`);
      }
      assertNextTypeVersion(latest, type);
      this.records.config.insertType({ projectId: goal.project_id, goalId: goal.goal_id, type, createdAt: at, configVersion, actorId: input.actor_id });
      added.push(type);
    }
    return added;
  }

  applyBindings(
    goal: GoalRecord,
    input: ConfigureGoalEventsInput,
    addedTypes: GoalEventTypeDefinition[],
    configVersion: number,
    at: string,
  ) {
    const added: Array<{ type_id: string; requirement_id: string }> = [];
    for (const raw of input.requirement_bindings ?? []) {
      const binding = normalizeBinding(raw);
      this.requireTypeOnGoal(goal, binding.type_id, addedTypes);
      this.requireRequirementOnGoal(goal, binding.requirement_id, input.acceptance);
      if (this.records.requirements.bindingExists(goal.project_id, goal.goal_id, binding.type_id, binding.requirement_id)) continue;
      this.records.requirements.insertBinding({
        ...binding,
        project_id: goal.project_id,
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
    if (!typeId) throw goalErrors["goals.event_report.type_required"](`批次第 ${index + 1} 条缺少类型 ID`);
    if (!Number.isInteger(input.type_version) || input.type_version < 1) {
      throw goalErrors["goals.event_type.version_not_found"](`批次第 ${index + 1} 条的类型版本无效`);
    }
    const type = this.records.config.getType(goal.project_id, goal.goal_id, typeId, input.type_version);
    if (!type) {
      throw goalErrors["goals.event_type.version_not_found"](`类型 ${typeId} v${input.type_version} 不属于当前 Goal`);
    }
    const title = input.title?.trim();
    if (!title) throw goalErrors["goals.event_report.title_required"](`批次第 ${index + 1} 条缺少标题`);
    const fields = normalizePayload(type.fields, input.fields ?? {});
    return { type, title, fields };
  }

  private requireTypeOnGoal(goal: GoalRecord, typeId: string, addedTypes: GoalEventTypeDefinition[]): void {
    if (addedTypes.some((type) => type.type_id === typeId)) return;
    if (this.records.config.typeExistsOnGoal(goal.project_id, goal.goal_id, typeId)) return;
    throw goalErrors["goals.event_type.not_found"](`类型不属于当前 Goal: ${typeId}`);
  }

  /**
   * A binding names a requirement of this Goal: one the platform lists for it (the person may add them in the requirement column), one
   * Goals hung on it, or one of its acceptance criteria.
   */
  private requireRequirementOnGoal(goal: GoalRecord, requirementId: string, reading: GoalAcceptanceReading | undefined): void {
    if (reading?.requirements.some((requirement) => requirement.id === requirementId)) return;
    if (goal.acceptance_criteria.some((criterion) => criterion.criterion_id === requirementId)) return;
    const linked = this.records.requirements.linkedGoal(goal.project_id, requirementId);
    if (linked === goal.goal_id) return;
    if (linked || this.context.repository.criterionGoalId(requirementId)) {
      throw goalErrors["goals.event_config.cross_goal_requirement"](`要求 ${requirementId} 不属于当前 Goal`);
    }
    throw goalErrors["goals.event_config.requirement_not_found"](`要求不存在: ${requirementId}`);
  }
}

export function configurationPayload(raw: Record<string, unknown>): GoalEventConfigurationPayload {
  return {
    config_version: Number(raw.config_version) || 0,
    types: Array.isArray(raw.types) ? raw.types as GoalEventTypeDefinition[] : [],
    requirement_bindings: Array.isArray(raw.requirement_bindings)
      ? raw.requirement_bindings as GoalEventConfigurationPayload["requirement_bindings"]
      : [],
  };
}
