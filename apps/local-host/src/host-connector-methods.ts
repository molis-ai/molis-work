import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import { OFFICIAL_CONNECTOR_METHODS, officialMethodsFor } from "@molis-ai/molis-work-integration-catalog";
import type { PluginConnectionServiceDeclaration, PluginMcpMethodDeclaration, PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { isDeclaredOAuth } from "@molis-ai/molis-work-plugin-sdk/oauth";
import { oauthMethodOption } from "./connector-oauth-declarations.js";
import { OAUTH_CALLBACK, defaultOAuthCallbackHost, defaultOAuthCallbackPath } from "./connector-oauth-callback-paths.js";
import { declaredMcpMethod, mcpServerFor } from "./connector-mcp-endpoint.js";
import type { McpServerConfiguration } from "./connector-mcp.js";
import { builtinIntegrationDeclarations } from "./builtin-integrations.js";
import type { McpServiceOwner } from "./integration-registry.js";
import { productMcpClientEligible } from "./connector-mcp-configuration.js";
import { CONNECTOR_CLIS, cliAvailability } from "./connector-cli.js";
import { connectorProductAuth, productApiLoginReady, productDeviceLoginReady } from "./connector-product-auth.js";

function link(label: string, url: string): ConnectorSetupLink {
  if (!url.startsWith("https://")) throw new Error(`connector_method_link_must_be_https:${url}`);
  return { label, url };
}

const HOST_METHODS: Readonly<Record<string, readonly ConnectorMethodOption[]>> = {
  "model-api": [{
    kind: "token", support: "paste",
    note: "连接按模型供应商分别保存 API Key；选择供应商后在其官方后台取得密钥。",
    links: [
      link("OpenAI API Keys", "https://platform.openai.com/api-keys"),
      link("Anthropic API Keys", "https://console.anthropic.com/settings/keys"),
    ],
  }],
  typesafe: [{
    kind: "token", support: "paste",
    note: "TypeSafe API Key 用于 Functions；账号需已获 TypeSafe API 访问权限。",
    links: [link("TypeSafe Console · API Keys", "https://console.typesafe.ai/keys")],
  }],
  "image-api": [{
    kind: "token", support: "paste",
    note: "Images 支持 OpenAI Images 或 Gemini 协议；按选用的供应商取得 API Key。",
    links: [
      link("OpenAI API Keys", "https://platform.openai.com/api-keys"),
      link("Google AI Studio · API Keys", "https://aistudio.google.com/apikey"),
    ],
  }],
  "mcp-bearer": [
    {
      kind: "token", support: "paste",
      note: "这里保存远程 MCP 服务颁发的 Bearer Token；具体取得方式以服务商为准。",
      links: [link("了解 MCP 授权", "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization")],
    },
    {
      kind: "mcp", support: "in_app",
      note: "填写远程 MCP 地址，选择免登录、Bearer 或 OAuth；连接后自动发现服务提供的工具。密钥只在受保护表单填写。",
      mcp: { endpoint: "", client_registration: "dynamic" },
      links: [link("了解 MCP 客户端与服务器", "https://modelcontextprotocol.io/docs/learn/client-concepts")],
    },
  ],
};

/** Whether the platform's existing method presentation holds this service's ordering and links. */
export function hasConnectorMethods(connectorId: string): boolean {
  return Object.hasOwn(HOST_METHODS, connectorId) || Object.hasOwn(OFFICIAL_CONNECTOR_METHODS, connectorId);
}

/**
 * The ways to connect a declared service: the tables' when they hold it, with the OAuth option read from the declaration's `oauth`
 * method; otherwise the token method its declaration gives, and no other.
 */
export function connectorMethodsOf(declaration: PluginConnectionServiceDeclaration, owner?: McpServiceOwner): readonly ConnectorMethodOption[] {
  const oauth = (grant: PluginOAuthMethodDeclaration["grant"]) => declaration.auth.methods.find((method): method is PluginOAuthMethodDeclaration => isDeclaredOAuth(method) && method.grant === grant);
  const mcp = declaration.auth.methods.find(declaredMcpMethod);
  if (hasConnectorMethods(declaration.service_id)) return connectorMethodsFor(declaration.service_id, oauth("authorization_code"), oauth("device"), mcp ?? null, owner);
  const methods: ConnectorMethodOption[] = declaration.auth.methods.some(method => method.kind === "token")
    ? [{ kind: "token", support: "paste", note: declaration.auth_help ?? "", links: declaration.setup_links ?? [] }] : [];
  if (mcp) methods.push(mcpOption(declaration.service_id, { kind: "mcp", support: "external", note: declaration.auth_help ?? "", links: declaration.setup_links ?? [] }, mcpServerFor(declaration.service_id, mcp)!, owner));
  return methods;
}

/** The table's ways for a service; `oauth` is the service's declared OAuth method, without which the OAuth way stays the table's link. */
export function connectorMethodsFor(connectorId: string, oauth?: PluginOAuthMethodDeclaration, device?: PluginOAuthMethodDeclaration, declaredMcp?: PluginMcpMethodDeclaration | null, owner?: McpServiceOwner): readonly ConnectorMethodOption[] {
  const mcpMethod = declaredMcp === undefined ? builtinIntegrationDeclarations().connectionServices().find(entry => entry.declaration.service_id === connectorId)?.declaration.auth.methods.find(declaredMcpMethod) : declaredMcp ?? undefined;
  return HOST_METHODS[connectorId] ?? officialMethodsFor(connectorId).map(method => {
    if (method.kind === "oauth" && oauth) return { ...method, support: "in_app", login_ready: productApiLoginReady(connectorId, oauth), note: "在服务商官方页面登录并确认权限；每条连接独立刷新。",
      oauth: { ...oauthMethodOption(oauth), ...(defaultOAuthCallbackPath(connectorId) === OAUTH_CALLBACK ? {} : { callback_path: defaultOAuthCallbackPath(connectorId) }),
        ...(defaultOAuthCallbackHost(connectorId) ? { callback_host: defaultOAuthCallbackHost(connectorId) } : {}),
        ...(device ? { device: { login_ready: productDeviceLoginReady(connectorId) } } : {}) } };
    if (method.kind === "cli" && CONNECTOR_CLIS[connectorId]) return { ...method, support: "in_app", note: "在这里运行官方 CLI 登录，再用真实只读请求验证并连接当前账号。", cli: cliAvailability(connectorId) };
    const mcp = mcpServerFor(connectorId, mcpMethod);
    if (method.kind === "mcp" && mcp) return mcpOption(connectorId, method, mcp, owner);
    return method;
  });
}

function mcpOption(connectorId: string, method: ConnectorMethodOption, mcp: McpServerConfiguration, owner?: McpServiceOwner): ConnectorMethodOption {
  return { ...method, support: "in_app",
    login_ready: !mcp.stdio && mcp.auth !== "none" && !mcp.endpoint.includes("{") &&
      (mcp.registration !== "manual" || productMcpClientEligible(connectorId, owner) && Boolean(connectorProductAuth(connectorId, "mcp"))),
    mcp: { endpoint: mcp.endpoint, client_registration: mcp.registration ?? "dynamic",
      note: `默认地址的认证方式：${mcp.auth === "none" ? "无需鉴权" : mcp.auth === "oauth" ? "OAuth" : mcp.auth === "bearer" ? "Bearer" : "OAuth 或 Bearer"}。client_registration 仅描述 OAuth 客户端注册要求；Bearer 令牌在受保护表单填写。` },
    note: method.note.replace(/Molis Work 尚未[^。]*。?/gu, "") + " 在这里授权、发现工具并显式调用；服务商资格和许可仍需满足。" };
}
