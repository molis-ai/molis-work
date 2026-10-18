import { ACTION_REFERENCE_SCHEMA, type ActionDefinition, type ActionReference } from "../platform/actions.js";

/** Each consumer reports its own live saved references; this is not a second binding store. */
export const CONNECTOR_USAGES_INPUT_TYPE = "molis.connector-usages.input.v1";
export const CONNECTOR_USAGES_OUTPUT_TYPE = "molis.connector-usages.output.v1";
export interface ConnectorUsagesInput { connection_id: string }
export interface ConnectorUsage {
  usage_id: string; title: string; detail?: string; enabled: boolean;
  /** Partial business input: object ids only, never credentials or trusted caller identity. */
  actions: Array<{ action: ActionReference; input: Record<string, unknown> }>;
}
const text = { type: "string", minLength: 1, maxLength: 1000 };
export const CONNECTOR_USAGES_INPUT_SCHEMA = { type: "object", properties: { connection_id: { ...text, maxLength: 160 } }, required: ["connection_id"], additionalProperties: false };
export const CONNECTOR_USAGE_SCHEMA = { type: "object", properties: { usage_id: text, title: text, detail: text, enabled: { type: "boolean" },
  actions: { type: "array", items: { type: "object", properties: { action: ACTION_REFERENCE_SCHEMA, input: { type: "object" } }, required: ["action", "input"], additionalProperties: false } } },
  required: ["usage_id", "title", "enabled", "actions"], additionalProperties: false };
export const CONNECTOR_USAGES_OUTPUT_SCHEMA = { type: "object", properties: { usages: { type: "array", items: CONNECTOR_USAGE_SCHEMA } }, required: ["usages"], additionalProperties: false };

export function defineConnectorUsagesAction(id: string, title: string, permissions: readonly string[], scope: "home" | "project"): ActionDefinition<ConnectorUsagesInput, { usages: ConnectorUsage[] }> {
  return { capability_id: id, version: 1, operation: "query", action: { title, description: "读取本模块实际引用所选连接的配置与已有业务操作；不读取凭据、不调用外部服务。", kind: "query", scope,
    audiences: ["user", "agent", "mcp"], permissions, subject_kinds: ["connector"], input_type: CONNECTOR_USAGES_INPUT_TYPE, output_type: CONNECTOR_USAGES_OUTPUT_TYPE,
    input_schema: CONNECTOR_USAGES_INPUT_SCHEMA, output_schema: CONNECTOR_USAGES_OUTPUT_SCHEMA } };
}
