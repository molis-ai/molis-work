import { createHash } from "node:crypto";
import type { PlanningMethodComposition, PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";

/** Keep host-specific Error classes outside the presentation package. */
export type McpPresentationErrorFactory = (code: string, message: string, details?: Record<string, unknown>) => Error;

function planningMethodCatalogId(methods: readonly PlanningMethodPack[]): string {
  const canonical = [...methods]
    .sort((left, right) => left.method_id.localeCompare(right.method_id))
    .map((method) => ({
      method_id: method.method_id,
      version: method.version,
      scope: method.scope,
      updated_at: method.updated_at,
      digest: createHash("sha256").update(JSON.stringify(method)).digest("hex"),
    }));
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24)}`;
}

function planningMethodSummary(method: PlanningMethodPack): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    method_id: method.method_id,
    version: method.version,
    scope: method.scope,
    kind: method.kind,
    name: method.name,
    summary: method.summary,
    applies_to: method.applies_to,
    domain_tags: method.domain_tags,
    enabled: method.enabled,
    created_at: method.created_at,
    updated_at: method.updated_at,
  };
  if ("overridden_scopes" in method) {
    summary.overridden_scopes = method.overridden_scopes;
  }
  if (method.event_types?.length) summary.event_types = method.event_types;
  if (method.default_requirements?.length) summary.default_requirements = method.default_requirements;
  return summary;
}

function planningMethodDetail(method: PlanningMethodPack): Record<string, unknown> {
  return { ...planningMethodSummary(method), instructions: method.instructions };
}

export function planningMethodResponse(
  methods: readonly PlanningMethodPack[],
  composition: PlanningMethodComposition,
  arguments_: Record<string, unknown>,
  createError: McpPresentationErrorFactory,
): Record<string, unknown> {
  const modernRead = Object.hasOwn(arguments_, "method_ids") || Object.hasOwn(arguments_, "include_instructions");
  const requestedIds = Array.isArray(arguments_.method_ids)
    ? [...new Set(arguments_.method_ids.map((value) => String(value).trim()).filter(Boolean))]
    : null;
  const byId = new Map(methods.map((method) => [method.method_id, method]));
  const missingIds = requestedIds?.filter((methodId) => !byId.has(methodId)) ?? [];
  if (missingIds.length) {
    throw createError(
      "planning_method.not_found",
      `找不到规划方法：${missingIds.join("、")}`,
      { missing_method_ids: missingIds, available_method_ids: methods.map((method) => method.method_id) },
    );
  }
  const selected = requestedIds == null
    ? [...methods]
    : requestedIds.map((methodId) => byId.get(methodId)!).filter(Boolean);
  const includeInstructions = arguments_.include_instructions !== false;
  const result: Record<string, unknown> = {
    catalog_id: planningMethodCatalogId(methods),
    returned_method_ids: selected.map((method) => method.method_id),
    include_instructions: includeInstructions,
    methods: modernRead
      ? selected.map((method) => includeInstructions ? planningMethodDetail(method) : planningMethodSummary(method))
      : selected,
    composition: modernRead
      ? { method_pack_ids: composition.method_pack_ids, method_names: composition.method_names }
      : composition,
  };
  return result;
}
