import type {
  ConnectorCapability,
  ConnectorDirectoryEntry,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { CATALOG_CONNECTORS, setupLinksFor } from "@molis-ai/molis-work-integration-catalog";
import { gmailOAuthConfigured } from "./gmail-oauth.js";
import { GITHUB_CLIENT_ID_REF } from "./github-oauth.js";
import { notionOAuthConfigured } from "./notion-oauth.js";
import { connectorMethodsFor } from "./host-connector-methods.js";

function capabilities(
  inbound: string,
  outbound: string,
  live: { inbound?: boolean; outbound?: boolean } = {},
): readonly ConnectorCapability[] {
  return [
    { label: inbound, fulfillment: live.inbound ? "live" : "unfulfilled" },
    { label: outbound, fulfillment: live.outbound ? "live" : "unfulfilled" },
  ];
}

const CONNECTOR_DIRECTORY_BASE: readonly ConnectorDirectoryEntry[] = [
  {
    connector_id: "model-api", title: "模型 API", availability: "live", auth_kind: "token", group_id: "work",
    summary: "为模型供应商保存多个 API Key，并在模型设置与 Jelly 中选择。",
    token_label: "模型 API Key", token_placeholder: "sk-…",
    capabilities: capabilities("模型推理", "Jelly 摘要与拆解", { inbound: true, outbound: true }),
  },
  {
    connector_id: "typesafe", title: "TypeSafe", availability: "live", auth_kind: "token", group_id: "work",
    summary: "Functions 使用这里保存的账号连接。",
    token_label: "TypeSafe API Key", capabilities: capabilities("Functions 调用", "Functions 账号选择", { inbound: true, outbound: true }),
  },
  {
    connector_id: "image-api", title: "图像模型 API", availability: "live", auth_kind: "token", group_id: "design",
    summary: "图像生成服务的 API Key；Images 中选择要使用的连接。",
    token_label: "图像 API Key", capabilities: capabilities("Images 生成", "图像任务", { inbound: true, outbound: true }),
  },
  {
    connector_id: "mcp-bearer", title: "远程 MCP", availability: "live", auth_kind: "token", group_id: "code",
    summary: "远程 MCP 服务的 Bearer 凭据；在 Coding 的 MCP 配置中选择。",
    token_label: "Bearer Token", capabilities: capabilities("MCP 工具与资源", "Coding Agent", { inbound: true, outbound: true }),
  },
  {
    connector_id: "github", feed_available: true,
    title: "GitHub",
    availability: "live",
    auth_kind: "github",
    group_id: "code",
    summary: "本机账号。Feed 拉未读通知，可在连接设置中检查账号。",
    capabilities: capabilities(
      "Feed 拉未读通知",
      "在连接设置中检查当前账号",
      { inbound: true, outbound: true },
    ),
    outbound_note: "连接设置可检查当前 GitHub 账号。Agent 可用能力以能力库为准。",
    setup_links: setupLinksFor("github"),
  },
  {
    connector_id: "gmail", feed_available: true,
    title: "Gmail",
    availability: "live",
    auth_kind: "gmail",
    group_id: "mail",
    summary: "本机账号。Feed 只读收信。",
    capabilities: capabilities("Feed 只读收信", "发送邮件", { inbound: true }),
    outbound_note: "出站动作未兑现：当前只读收信，不发送邮件。",
    setup_links: setupLinksFor("gmail"),
  },
  ...CATALOG_CONNECTORS.map((spec) => ({
    connector_id: spec.id,
    title: spec.id === "wechat" ? "企业微信" : spec.title,
    availability: "live" as const,
    auth_kind: (spec.id === "loom" ? "none" : spec.id === "notion" ? "notion" : spec.id === "feishu" ? "feishu" : "token") as "none" | "notion" | "feishu" | "token",
    group_id: spec.group_id,
    summary: spec.summary,
    token_label: spec.token_label,
    token_placeholder: spec.token_placeholder,
    auth_help: spec.auth_help,
    setup_links: spec.setup_links,
    feed_available: spec.feed_available !== false,
    capabilities: capabilities(spec.inbound, "在连接设置中检查当前账号", { inbound: spec.feed_available !== false, outbound: true }),
    outbound_note: "连接设置可检查当前账号。Agent 可用能力以能力库为准。",
  })),
];

export const HOST_CONNECTOR_DIRECTORY: readonly ConnectorDirectoryEntry[] = CONNECTOR_DIRECTORY_BASE.map((entry) => {
  const method_options = connectorMethodsFor(entry.connector_id);
  return {
    ...entry,
    method_options,
    setup_links: entry.setup_links?.length ? entry.setup_links : method_options.flatMap((method) => method.links),
  };
});

export function liveConnectorIds(): readonly string[] {
  return HOST_CONNECTOR_DIRECTORY.filter((row) => row.availability === "live").map((row) => row.connector_id);
}

export function githubClientIdConfigured(): boolean {
  try {
    if (peekSealedEntry(GITHUB_CLIENT_ID_REF)) return true;
  } catch { /* store unavailable → fall through to env */ }
  return Boolean(readProductEnv("GITHUB_CLIENT_ID"));
}

/** The services a connection can be made to, with whether their OAuth apps are configured; accounts are the connections themselves. */
export function listConnectorSettingsCards() {
  return HOST_CONNECTOR_DIRECTORY.map((entry) => entry.availability === "placeholder"
    ? { ...entry, github_client_id_configured: false, gmail_oauth_configured: false }
    : {
      ...entry,
      method_options: connectorMethodsFor(entry.connector_id),
      github_client_id_configured: entry.auth_kind === "github" ? githubClientIdConfigured() : false,
      gmail_oauth_configured: entry.auth_kind === "gmail" ? gmailOAuthConfigured() : false,
      notion_oauth_configured: entry.auth_kind === "notion" ? notionOAuthConfigured() : false,
    });
}
