import type {
  GoalEventAdoptedPlanningRef,
  GoalEventAdoptedPlanningRequest,
  GoalEventPlanningMethodRef,
  GoalEventTypeDefinitionInput,
  PlanningMethodDefaultRequirement,
  PlanningMethodPack,
  PlanningMethodScope,
  ResolvedPlanningEventAdoption,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { BUILTIN_PLANNING_METHOD_PACKS } from "./method-packs.js";
import { sameTypeShape } from "../event-facts-validation.js";

export type PlanningAdoptionError = (code: string, message: string, details?: Record<string, unknown>) => Error;

export function instantiatePlanningRequirementId(goalId: string, templateRequirementId: string): string {
  return `goal:${goalId}:req:${templateRequirementId}`;
}

export function resolvePlanningEventAdoption(
  requested: readonly GoalEventAdoptedPlanningRequest[],
  sources: {
    effective: readonly PlanningMethodPack[];
    personal: readonly PlanningMethodPack[];
    project: readonly PlanningMethodPack[];
  },
  error: PlanningAdoptionError,
): ResolvedPlanningEventAdoption {
  const adopted: GoalEventAdoptedPlanningRef[] = [];
  const typesById = new Map<string, GoalEventTypeDefinitionInput>();
  const requirementsById = new Map<string, PlanningMethodDefaultRequirement>();
  const seen = new Set<string>();
  for (const item of requested) {
    const methodId = item.method_id?.trim();
    if (!methodId) throw error("event_config.invalid_planning", "采用的规划方法 ID 不能为空");
    const pack = lookupPlanningMethod(methodId, item.source, sources, error);
    if (item.version != null && item.version !== pack.version) {
      throw error(
        "event_config.planning_version_unavailable",
        `规划 ${methodId} 当前版本是 ${pack.version}，没有可读取的版本 ${item.version}`,
        { method_id: methodId, requested_version: item.version, current_version: pack.version, source: pack.scope },
      );
    }
    const ref: GoalEventAdoptedPlanningRef = {
      method_id: pack.method_id,
      version: pack.version,
      source: pack.scope,
    };
    const key = `${ref.source}:${ref.method_id}:${ref.version}`;
    if (seen.has(key)) throw error("event_config.duplicate_planning", `重复采用规划: ${methodId}`);
    seen.add(key);
    adopted.push(ref);
    const methodRef: GoalEventPlanningMethodRef = {
      method_id: pack.method_id,
      version: pack.version,
      source: pack.scope,
      name: pack.name,
    };
    for (const type of pack.event_types ?? []) {
      mergeAdoptedType(typesById, planningTypeForAdoption(type, pack, methodRef), methodRef, error);
    }
    for (const requirement of pack.default_requirements ?? []) {
      mergeAdoptedRequirement(requirementsById, requirement, methodRef, error);
    }
  }
  return {
    adopted_planning: adopted,
    types: [...typesById.values()],
    default_requirements: [...requirementsById.values()],
  };
}

function mergeAdoptedType(
  typesById: Map<string, GoalEventTypeDefinitionInput>,
  type: GoalEventTypeDefinitionInput,
  method: GoalEventPlanningMethodRef,
  error: PlanningAdoptionError,
): void {
  const current = typesById.get(type.type_id);
  if (!current) {
    typesById.set(type.type_id, type);
    return;
  }
  if (!sameTypeShape(current, type)) {
    throw error(
      "event_config.planning_type_conflict",
      `规划类型 ${type.type_id} 在不同方法中定义冲突，不能合并采用`,
      {
        type_id: type.type_id,
        methods: [
          ...(current.source?.contributing_methods ?? methodRefsFromSource(current)),
          method,
        ],
      },
    );
  }
  const contributing = current.source?.contributing_methods ?? methodRefsFromSource(current);
  if (!contributing.some((item) => item.method_id === method.method_id && item.version === method.version && item.source === method.source)) {
    contributing.push(method);
  }
  current.source = {
    kind: "planning",
    method_id: current.source?.method_id ?? method.method_id,
    method_version: current.source?.method_version ?? method.version,
    label: current.source?.label,
    contributing_methods: contributing,
  };
}

function mergeAdoptedRequirement(
  requirementsById: Map<string, PlanningMethodDefaultRequirement>,
  requirement: PlanningMethodDefaultRequirement,
  method: GoalEventPlanningMethodRef,
  error: PlanningAdoptionError,
): void {
  const current = requirementsById.get(requirement.requirement_id);
  if (!current) {
    requirementsById.set(requirement.requirement_id, {
      ...requirement,
      sources: [method],
    });
    return;
  }
  if (current.statement !== requirement.statement || (current.bound_type_id ?? "") !== (requirement.bound_type_id ?? "")) {
    throw error(
      "event_config.planning_requirement_conflict",
      `规划要求 ${requirement.requirement_id} 在不同方法中定义冲突，不能合并采用`,
      {
        requirement_id: requirement.requirement_id,
        methods: [...(current.sources ?? []), method],
      },
    );
  }
  const sources = current.sources ?? [];
  if (!sources.some((item) => item.method_id === method.method_id && item.version === method.version && item.source === method.source)) {
    sources.push(method);
  }
  current.sources = sources;
}

function methodRefsFromSource(type: GoalEventTypeDefinitionInput): GoalEventPlanningMethodRef[] {
  if (type.source?.kind !== "planning" || !type.source.method_id || type.source.method_version == null) return [];
  return [{
    method_id: type.source.method_id,
    version: type.source.method_version,
    source: "built_in",
    name: type.source.label,
  }];
}

function lookupPlanningMethod(
  methodId: string,
  source: PlanningMethodScope | undefined,
  sources: {
    effective: readonly PlanningMethodPack[];
    personal: readonly PlanningMethodPack[];
    project: readonly PlanningMethodPack[];
  },
  error: PlanningAdoptionError,
): PlanningMethodPack {
  const pool = source === "built_in"
    ? BUILTIN_PLANNING_METHOD_PACKS
    : source === "personal"
      ? sources.personal
      : source === "project"
        ? sources.project
        : sources.effective;
  const pack = pool.find((item) => item.method_id === methodId && item.enabled !== false);
  if (pack) return pack;
  throw error(
    "event_config.planning_not_found",
    source
      ? `在 ${source} 规划中找不到方法 ${methodId}`
      : `找不到规划方法 ${methodId}`,
    { method_id: methodId, source: source ?? null },
  );
}

function planningTypeForAdoption(
  type: GoalEventTypeDefinitionInput,
  pack: PlanningMethodPack,
  method: GoalEventPlanningMethodRef,
): GoalEventTypeDefinitionInput {
  return {
    type_id: type.type_id,
    version: type.version,
    name: type.name,
    purpose: type.purpose,
    semantic_family: type.semantic_family,
    source: {
      kind: "planning",
      method_id: pack.method_id,
      method_version: pack.version,
      label: pack.name,
      contributing_methods: [method],
    },
    fields: type.fields.map((field) => ({
      ...field,
      source: { kind: "planning", method_id: pack.method_id, label: pack.name },
    })),
  };
}
