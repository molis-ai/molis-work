import { text, identifier, count, boolean, object, array, enumeration, eventType } from "./event-action-schemas.js";

const strings = array(text), version = { type: "integer", minimum: 1 };
const scopes = enumeration(["built_in", "personal", "project"]);
const kinds = enumeration(["meta", "work_type", "domain", "industry", "overlay", "custom"]);
const coverage = array(object({ area: text, label: text, question: text }));
const dependencies = array(object({ rule_id: text, statement: text, direction_hint: text }));
const defaultRequirements = array(object({ requirement_id: text, statement: text, bound_type_id: text, applies_when: text,
  sources: array(object({ method_id: text, version, source: scopes, name: text }, ["method_id", "version", "source"])) }, ["requirement_id", "statement"]));
const eventTypes = array({ ...eventType, required: ["type_id", "version", "name", "purpose", "fields"] });
const methodFields = { method_id: identifier, kind: kinds, name: text, summary: text, applies_to: strings, domain_tags: strings,
  steps: strings, required_coverage: coverage, dependency_rules: dependencies, evidence_requirements: strings,
  completion_checks: strings, failure_modes: strings, source_refs: strings, confidence: { type: "number", minimum: 0, maximum: 1 }, enabled: boolean };
export const planningMethodInputSchema = object({ ...methodFields, version, instructions: text, event_types: eventTypes,
  default_requirements: defaultRequirements }, Object.keys(methodFields));
export const planningMethodSchema = object({ ...methodFields, version, instructions: text, event_types: eventTypes, default_requirements: defaultRequirements,
  scope: scopes, created_at: text, updated_at: text, overridden_scopes: array(scopes) },
  [...Object.keys(methodFields), "version", "instructions", "event_types", "default_requirements", "scope", "created_at", "updated_at"]);
export const planningCompositionSchema = object({ method_pack_ids: strings, method_names: strings,
  method_paths: array(object({ method_id: text, method_name: text, kind: kinds, steps: strings, instructions: text })),
  required_coverage: coverage, dependency_rules: dependencies, evidence_requirements: strings, completion_checks: strings, failure_modes: strings });
export const planningGraphIssueSchema = object({ code: enumeration(["planning.goal_missing", "planning.goal_trashed", "planning.relation_self_reference",
  "planning.relation_duplicate", "planning.part_of_cycle", "planning.dependency_cycle", "planning.execution_cycle"]),
  message: text, goal_ids: strings, relation_ids: strings, path: strings });
export const planningImpactSchema = object({ changed_goal_ids: strings, affected_ancestors: strings, affected_dependents: strings,
  adjacent_dependencies: strings, reusable_open_goal_ids: strings, review_order: strings, graph_issues: array(planningGraphIssueSchema) });
export const planningSavedSchema = object({ method: planningMethodSchema, observed_event_cursor: count });
