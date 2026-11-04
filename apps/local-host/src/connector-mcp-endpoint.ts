import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import type { McpServerConfiguration, StartMcpConnectionInput } from "./connector-mcp.js";
import type { PluginAuthMethodDeclaration, PluginMcpMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

/** The existing generic MCP connection entry also accepts complete remote server configurations. */
export const CUSTOM_MCP_SERVICE = "mcp-bearer";
/** Local launch/address exceptions stay here until BL-791; remote server data comes only from the declaration. */
export const LOCAL_MCP_SERVERS: Readonly<Record<string, McpServerConfiguration>> = {
  feishu: { endpoint: "https://open.feishu.cn/", stdio: true },
  lark: { endpoint: "https://open.larksuite.com/", stdio: true },
  figma: { endpoint: "http://127.0.0.1:3845/mcp", auth: "none" },
};

export function declaredMcpMethod(method: PluginAuthMethodDeclaration): method is PluginMcpMethodDeclaration {
  return method.kind === "mcp" && "endpoint" in method;
}

/** The one compilation point for a validated, serialized complete-address pattern. */
export function mcpServerFor(serviceId: string, method?: PluginMcpMethodDeclaration, requested?: string): McpServerConfiguration | undefined {
  const local = Object.hasOwn(LOCAL_MCP_SERVERS, serviceId) ? LOCAL_MCP_SERVERS[serviceId] : undefined;
  if (local && (serviceId !== "figma" || !requested || /^http:/iu.test(requested.trim()))) return local;
  if (!method) return undefined;
  return { endpoint: method.endpoint, auth: method.auth, ...(method.registration ? { registration: method.registration } : {}),
    ...(method.token_scheme ? { tokenScheme: method.token_scheme } : {}),
    ...(method.endpoint_pattern ? { endpointPattern: new RegExp(method.endpoint_pattern.source, method.endpoint_pattern.flags) } : {}) };
}

export function requiresMcpDeclaration(serviceId: string, endpoint: string, transport?: string): boolean {
  return serviceId !== CUSTOM_MCP_SERVICE && transport !== "stdio" && !(serviceId === "figma" && endpoint === LOCAL_MCP_SERVERS.figma!.endpoint) && serviceId !== "feishu" && serviceId !== "lark";
}
const invalid = (message: string) => connectorErrors["connector.mcp.configuration"](message);
export function mcpEndpointFor(servers: Readonly<Record<string, McpServerConfiguration>>, serviceId: string, requested?: string, testing = false): string {
  const custom = serviceId === CUSTOM_MCP_SERVICE, server = Object.hasOwn(servers, serviceId) ? servers[serviceId] : undefined;
  if (!custom && !server) throw invalid("这个服务尚未配置官方 MCP 地址");
  if (custom && !requested?.trim()) throw invalid("请填写自定义 MCP 地址");
  let endpoint: URL;
  try { endpoint = new URL(requested || server!.endpoint); } catch { throw invalid("MCP 地址无效"); }
  if (endpoint.username || endpoint.password || endpoint.hash || [...endpoint.searchParams.keys()].some(key => /^(auth|authorization|password|secret|token|access_token|refresh_token|api[_-]?key)$/i.test(key))) throw invalid("MCP 地址不能包含凭据；请使用受保护的凭据字段");
  if (!custom && (server!.endpointPattern ? !server!.endpointPattern.test(endpoint.href) : endpoint.href !== new URL(server!.endpoint).href)) throw invalid("MCP 地址必须匹配所选服务的官方地址；租户 ID 和 server name 需替换成实际值");
  if (endpoint.protocol !== "https:" && !(isLoopbackHttpUrl(endpoint) && (custom || testing || serviceId === "figma"))) throw invalid("远程 MCP 必须使用 HTTPS；HTTP 仅用于明确选择的本机回环服务");
  return endpoint.href;
}
export function mcpAuthentication(input: StartMcpConnectionInput, server: McpServerConfiguration): "none" | "bearer" | "oauth" {
  const token = input.token?.trim();
  if (input.authentication !== undefined && !["none", "bearer", "oauth"].includes(input.authentication)) throw invalid("请选择免登录、Bearer 或 OAuth");
  const expected = server.stdio ? (token ? "bearer" : "none") : server.auth === "none" ? "none" : token ? "bearer" : "oauth";
  const mode = input.serviceId === CUSTOM_MCP_SERVICE ? input.authentication ?? expected : expected;
  if (input.authentication !== undefined && input.authentication !== mode) throw invalid("所选认证方式不适用于此服务");
  if (token && (mode !== "bearer" || server.auth === "oauth" || server.auth === "none")) throw invalid("此接入方式不使用 Bearer 令牌");
  if (mode === "bearer" && !token) throw invalid("请在受保护的表单中填写 Bearer 令牌");
  return mode;
}
