import type { ConnectorCapability } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginConnectionServiceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

const live = (label: string): ConnectorCapability => ({ label, fulfillment: "live" });

/**
 * The connection services the platform itself consumes, declared in the same shape a plugin declares its own and registered in the
 * same registry (PG-046). When the plugins that use them (Functions, Images, Coding) run on the Runtime they declare them and these
 * leave (BL-525); what the platform keeps for itself, such as the model API keys, stays here.
 */
export const PLATFORM_CONNECTION_SERVICES: readonly PluginConnectionServiceDeclaration[] = [
  {
    service_id: "model-api", title: "模型 API", group_id: "work", auth_kind: "token",
    summary: "为模型供应商保存多个 API Key，并在模型设置与 Jelly 中选择。",
    auth: { methods: [{ kind: "token", label: "模型 API Key", placeholder: "sk-…" }] },
    capabilities: [live("模型推理"), live("Jelly 摘要与拆解")],
  },
  {
    service_id: "typesafe", title: "TypeSafe", group_id: "work", auth_kind: "token",
    summary: "Functions 使用这里保存的账号连接。",
    auth: { methods: [{ kind: "token", label: "TypeSafe API Key" }] },
    capabilities: [live("Functions 调用"), live("Functions 账号选择")],
  },
  {
    service_id: "image-api", title: "图像模型 API", group_id: "design", auth_kind: "token",
    summary: "图像生成服务的 API Key；Images 中选择要使用的连接。",
    auth: { methods: [{ kind: "token", label: "图像 API Key" }] },
    capabilities: [live("Images 生成"), live("图像任务")],
  },
  {
    service_id: "mcp-bearer", title: "远程 MCP", group_id: "code", auth_kind: "token",
    summary: "远程 MCP 服务的 Bearer 凭据；在 Coding 的 MCP 配置中选择。",
    auth: { methods: [{ kind: "token", label: "Bearer Token" }] },
    capabilities: [live("MCP 工具与资源"), live("Coding Agent")],
  },
];
