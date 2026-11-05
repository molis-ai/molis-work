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

/**
 * Move a consumer's live references from one connection of a service to another (spec assistant-service-connections §13.4).
 * Each consumer declares its own switch, paired with its usages read; `connectors.usages.switch@1` reaches it only as a
 * nested call carrying the person's own context. Only a person decides which account a plugin or model uses.
 */
export const CONNECTOR_USAGES_SWITCH_INPUT_TYPE = "molis.connector-usages-switch.input.v1";
export const CONNECTOR_USAGES_SWITCH_OUTPUT_TYPE = "molis.connector-usages-switch.output.v1";
export interface ConnectorUsagesSwitchInput {
  from_connection_id: string; to_connection_id: string;
  /** `usage_id`s this consumer reported for `from_connection_id`; absent means all of them. */
  usage_ids?: string[];
}
export interface ConnectorUsagesSwitchResult {
  switched: string[];
  /** `code` is a stable `<owner>.<reason>` error code the page words; never free text. */
  refused: Array<{ usage_id: string; code: string }>;
}
const connectionId = { ...text, maxLength: 160 };
export const CONNECTOR_USAGES_SWITCH_INPUT_SCHEMA = { type: "object", properties: { from_connection_id: connectionId, to_connection_id: connectionId,
  usage_ids: { type: "array", items: text, maxItems: 1000 } }, required: ["from_connection_id", "to_connection_id"], additionalProperties: false };
export const CONNECTOR_USAGES_SWITCH_OUTPUT_SCHEMA = { type: "object", properties: { switched: { type: "array", items: text },
  refused: { type: "array", items: { type: "object", properties: { usage_id: text, code: { ...text, maxLength: 200 } }, required: ["usage_id", "code"], additionalProperties: false } } },
  required: ["switched", "refused"], additionalProperties: false };

export function defineConnectorUsagesSwitchAction(id: string, title: string, permissions: readonly string[], scope: "home" | "project"): ActionDefinition<ConnectorUsagesSwitchInput, ConnectorUsagesSwitchResult> {
  return { capability_id: id, version: 1, operation: "command", action: { title, description: "把本模块里用到一个账号的地方换成同一服务的另一个账号；换过去的与没换的分开列出，账号本身不动。", kind: "operation", effect: "write", scope,
    audiences: ["user"], permissions, subject_kinds: ["connector"], input_type: CONNECTOR_USAGES_SWITCH_INPUT_TYPE, output_type: CONNECTOR_USAGES_SWITCH_OUTPUT_TYPE,
    input_schema: CONNECTOR_USAGES_SWITCH_INPUT_SCHEMA, output_schema: CONNECTOR_USAGES_SWITCH_OUTPUT_SCHEMA } };
}
