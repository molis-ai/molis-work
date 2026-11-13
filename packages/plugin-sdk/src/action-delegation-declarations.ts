import type { ActionDelegationDeclaration, ActionDelegationOperation, ActionDelegationTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import { isRecord } from "./json-value.js";

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const canonical = (value: unknown): value is string => typeof value === "string" && value === value.trim();
const uniqueStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));

function targetShape(value: unknown): value is ActionDelegationTarget {
  if (!isRecord(value) || !exactKeys(value, ["key", "title", "kind", "field"], ["default_value", "allowed_values"])
    || ![value.key, value.title, value.kind, value.field].every(text)) return false;
  if (Object.hasOwn(value, "default_value") && !canonical(value.default_value)) return false;
  if (Object.hasOwn(value, "allowed_values") && (!Array.isArray(value.allowed_values) || value.allowed_values.length === 0
    || !value.allowed_values.every(canonical) || new Set(value.allowed_values).size !== value.allowed_values.length)) return false;
  return !Object.hasOwn(value, "default_value") || value.allowed_values === undefined
    || Array.isArray(value.allowed_values) && value.allowed_values.includes(value.default_value);
}

function operationShape(value: unknown): value is ActionDelegationOperation {
  if (!isRecord(value) || !exactKeys(value, ["key", "title", "fields", "targets", "when"]) || !text(value.key) || !text(value.title)
    || !uniqueStrings(value.fields) || !uniqueStrings(value.targets) || !value.targets.length) return false;
  // Every effect field activates its operation; an omitted trigger must not hide a supplied effect field.
  return value.when === "always" || uniqueStrings(value.when) && value.when.length > 0
    && value.when.length === value.fields.length && value.when.every(field => Array.isArray(value.fields) && value.fields.includes(field));
}

function declarationShape(value: unknown): value is ActionDelegationDeclaration {
  return isRecord(value) && exactKeys(value, ["targets", "operations", "control_fields"])
    && Array.isArray(value.targets) && value.targets.length > 0 && value.targets.every(targetShape)
    && new Set(value.targets.map(target => target.key)).size === value.targets.length
    && Array.isArray(value.operations) && value.operations.length > 0 && value.operations.every(operationShape)
    && new Set(value.operations.map(operation => operation.key)).size === value.operations.length
    && uniqueStrings(value.control_fields);
}

function inputProperties(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema) || schema.type !== "object" || schema.additionalProperties !== false || !isRecord(schema.properties)) return undefined;
  if (["$ref", "allOf", "anyOf", "oneOf", "if", "then", "else", "not", "patternProperties", "dependentSchemas", "dependentRequired"]
    .some(key => Object.hasOwn(schema, key))) return undefined;
  return schema.properties;
}

function targetFieldValid(target: ActionDelegationTarget, properties: Record<string, unknown>): boolean {
  if (!Object.hasOwn(properties, target.field)) return false;
  const field = properties[target.field];
  return isRecord(field) && field.type === "string" && !["$ref", "allOf", "anyOf", "oneOf", "if", "not"].some(key => Object.hasOwn(field, key));
}

function classifiedFields(declaration: ActionDelegationDeclaration, properties: Record<string, unknown>): boolean {
  const targetKeys = new Set(declaration.targets.map(target => target.key));
  const targetFields = new Set(declaration.targets.map(target => target.field));
  const usedTargets = new Set<string>(), effectFields = new Set<string>();
  for (const operation of declaration.operations) {
    for (const target of operation.targets) {
      if (!targetKeys.has(target)) return false;
      usedTargets.add(target);
    }
    for (const field of operation.fields) {
      if (!Object.hasOwn(properties, field) || effectFields.has(field)) return false;
      effectFields.add(field);
    }
  }
  if (usedTargets.size !== targetKeys.size) return false;
  for (const field of declaration.control_fields) {
    if (!Object.hasOwn(properties, field) || targetFields.has(field) || effectFields.has(field)) return false;
  }
  return Object.keys(properties).every(field => targetFields.has(field) || effectFields.has(field) || declaration.control_fields.includes(field));
}

/** Shared by authoring, Manifest installation, registration and actual-input extraction. */
export function actionDelegationDeclarationProblems(key: string, action: Record<string, unknown>): string[] {
  if (action.delegation === undefined) return [];
  if (!declarationShape(action.delegation)) return [`能力 ${key} 的 delegation 需要不重复的有限目标、操作和控制字段`];
  const properties = inputProperties(action.input_schema);
  if (!properties) return [`能力 ${key} 的 delegation 只接受封闭的顶层对象输入，不接受动态键或组合 schema`];
  if (!action.delegation.targets.every(target => targetFieldValid(target, properties))) return [`能力 ${key} 的 delegation 目标必须指向直接的 string 输入字段`];
  if (!classifiedFields(action.delegation, properties)) return [`能力 ${key} 的 delegation 必须覆盖全部输入字段，每个业务字段只归一个操作，控制字段不能选择目标`];
  return [];
}
