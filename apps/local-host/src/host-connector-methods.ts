import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import { officialMethodsFor } from "@molis-ai/molis-work-integration-catalog";
import { API_OAUTH_PROVIDERS } from "./connector-api-oauth-providers.js";
import { MCP_SERVERS } from "./connector-mcp.js";
import { CONNECTOR_CLIS, cliAvailability } from "./connector-cli.js";

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
    note: "TypeSafe API Key 用于 Functions 和 Experiments；账号需已获 TypeSafe API 访问权限。",
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
      note: "在 Coding 中填写远程 MCP 服务器 URL，再选择这里保存的账号连接。此入口不执行服务商的 OAuth。",
      links: [link("了解 MCP 客户端与服务器", "https://modelcontextprotocol.io/docs/learn/client-concepts")],
    },
  ],
};

export function connectorMethodsFor(connectorId: string): readonly ConnectorMethodOption[] {
  return HOST_METHODS[connectorId] ?? officialMethodsFor(connectorId).map(method => {
    const oauth = API_OAUTH_PROVIDERS[connectorId];
    if (method.kind === "oauth" && oauth) return { ...method, support: "in_app", note: "配置自己的官方应用后，在浏览器完成授权；每条连接独立刷新。",
      oauth: { client_secret_required: !oauth.optionalSecret, fields: oauth.fields ?? [], note: oauth.note } };
    if (method.kind === "cli" && CONNECTOR_CLIS[connectorId]) return { ...method, support: "in_app", note: "在这里运行官方 CLI 登录，再用真实只读请求验证并连接当前账号。", cli: cliAvailability(connectorId) };
    const mcp = MCP_SERVERS[connectorId];
    if (method.kind === "mcp" && mcp) return { ...method, support: "in_app", mcp: { endpoint: mcp.endpoint, client_registration: mcp.registration ?? "dynamic" }, note: method.note.replace(/Molis Work 尚未[^。]*。?/gu, "") + " 在这里授权、发现工具并显式调用；服务商资格和许可仍需满足。" };
    return method;
  });
}
