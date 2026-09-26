import type { ContractDescriptor } from "./package.js";
import type { ActionReference } from "./actions.js";

export const platformPluginMcpContract = {
  contractId: "io.molis.work.platform.plugin-mcp.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/archive/plugin-outbound-mcp/spec.md",
} as const satisfies ContractDescriptor;

/** Tool arguments that only the Host may fill. A Plugin schema must not list them. */
export const MCP_IDENTITY_FIELDS = [
  "board_id",
  "database_path",
  "web_base_url",
  "actor_id",
  "actor_kind",
  "runtime_actor_id",
  "submitted_session_id",
] as const;

export type McpIdentityField = (typeof MCP_IDENTITY_FIELDS)[number];

export type PluginMcpEffect = "read" | "write";
export type PluginMcpAudience = "runtime" | "management" | "all";
export type PluginMcpScope = "home" | "project";

const TOOL_ID = /^[a-z0-9][a-z0-9_-]*$/u;

export interface PluginMcpExportDeclaration {
  tool_id: string;
  description: string;
  input_schema: PluginMcpInputSchema;
  effect: PluginMcpEffect;
  /** Omitted means runtime. */
  audience?: PluginMcpAudience;
  /** Omitted means the bound project must have this Plugin enabled. */
  scope?: PluginMcpScope;
  /** Compatibility tools require all referenced actions; declarations grant no authority. */
  required_actions?: readonly ActionReference[];
}

export interface PluginMcpInputSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface PluginMcpHandleRequest {
  readonly tool_id: string;
  readonly arguments: Record<string, unknown>;
}

export interface PluginMcpHandlerBinding {
  tool_id: string;
  handle(request: PluginMcpHandleRequest): string | Promise<string>;
}

/** Public MCP name. `plugin` is the short id (Functions → `functions`). */
export function mcpPublicToolName(plugin: string, toolId: string): string {
  return `molis_work_v1_${plugin}_${toolId}`;
}

/** Short id used in public names: last dotted segment of `io.molis.work.functions` → `functions`. */
export function mcpPluginSlug(pluginId: string): string {
  const segment = pluginId.split(".").at(-1) ?? pluginId;
  return segment;
}

export function inspectMcpExports(exports: PluginMcpExportDeclaration[] | undefined): string[] {
  if (exports === undefined) return [];
  if (!Array.isArray(exports)) return ["mcp_exports 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of exports) {
    if (!entry || typeof entry !== "object") {
      problems.push("mcp_exports 条目不合法");
      continue;
    }
    if (typeof entry.tool_id !== "string" || !TOOL_ID.test(entry.tool_id)) {
      problems.push("mcp_exports 的 tool_id 不合法");
      continue;
    }
    if (seen.has(entry.tool_id)) {
      problems.push(`mcp_exports 重复：${entry.tool_id}`);
      continue;
    }
    seen.add(entry.tool_id);
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      problems.push(`mcp_exports ${entry.tool_id} 缺少说明`);
    }
    if (entry.effect !== "read" && entry.effect !== "write") {
      problems.push(`mcp_exports ${entry.tool_id} 的 effect 必须是 read 或 write`);
    }
    if (entry.audience !== undefined
      && entry.audience !== "runtime"
      && entry.audience !== "management"
      && entry.audience !== "all") {
      problems.push(`mcp_exports ${entry.tool_id} 的 audience 不合法`);
    }
    if (entry.scope !== undefined && entry.scope !== "home" && entry.scope !== "project") {
      problems.push(`mcp_exports ${entry.tool_id} 的 scope 不合法`);
    }
    if ("enabled" in entry) {
      problems.push(`mcp_exports ${entry.tool_id} 不能登记开关`);
    }
    if ("name" in entry) {
      problems.push(`mcp_exports ${entry.tool_id} 不能登记对外正式名`);
    }
    if (entry.required_actions !== undefined) {
      if (!Array.isArray(entry.required_actions) || entry.required_actions.length === 0) {
        problems.push(`mcp_exports ${entry.tool_id} 的 required_actions 必须是非空数组`);
      } else {
        const references = new Set<string>();
        for (const reference of entry.required_actions) {
          if (!reference || typeof reference !== "object" || Array.isArray(reference)
            || Object.keys(reference).some(key => !["capability_id", "version", "provider_id"].includes(key))
            || typeof reference.capability_id !== "string" || !reference.capability_id.trim()
            || !Number.isSafeInteger(reference.version) || reference.version < 1
            || (reference.provider_id !== undefined && (typeof reference.provider_id !== "string" || !reference.provider_id.trim()))) {
            problems.push(`mcp_exports ${entry.tool_id} 的动作引用无效`);
            continue;
          }
          const key = JSON.stringify([reference.capability_id, reference.version, reference.provider_id ?? null]);
          if (references.has(key)) problems.push(`mcp_exports ${entry.tool_id} 的动作引用重复`);
          references.add(key);
        }
      }
    }
    problems.push(...inspectInputSchema(entry.tool_id, entry.input_schema));
  }
  return problems;
}

function inspectInputSchema(toolId: string, schema: PluginMcpInputSchema | undefined): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [`mcp_exports ${toolId} 的 input_schema 必须是对象`];
  }
  if (schema.type !== "object") {
    return [`mcp_exports ${toolId} 的 input_schema.type 必须是 object`];
  }
  const problems: string[] = [];
  const properties = schema.properties;
  if (properties !== undefined) {
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      problems.push(`mcp_exports ${toolId} 的 input_schema.properties 必须是对象`);
    } else {
      for (const field of MCP_IDENTITY_FIELDS) {
        if (Object.hasOwn(properties, field)) {
          problems.push(`mcp_exports ${toolId} 不能声明身份字段 ${field}`);
        }
      }
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string")) {
      problems.push(`mcp_exports ${toolId} 的 input_schema.required 必须是字符串数组`);
    }
  }
  return problems;
}
