import type {
  ConnectorAccountState,
  ConnectorCapability,
  ConnectorDirectoryEntry,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID } from "@molis-ai/molis-work-integration-github";
import { CATALOG_CONNECTORS, setupLinksFor } from "@molis-ai/molis-work-integration-catalog";
import { gmailOAuthConfigured } from "./gmail-oauth.js";
import { GITHUB_CLIENT_ID_REF, connectorCredentialStatus } from "./connector-credentials.js";
import { notionOAuthConfigured, notionOAuthWorkspace } from "./notion-oauth.js";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { connectorMethodsFor } from "./host-connector-methods.js";

function storedConnectionMethod(connectorId: string, bound: boolean): "oauth" | "token" | "cli" | null {
  try {
    const store = createFileSecretStore();
    if (connectorId === "notion" && store.get("connector:notion:refresh")) return "oauth";
    if (connectorId === "feishu" && store.get("connector:feishu:auth_mode") === "cli") return "cli";
    if (connectorId === "gmail" && store.get("connector:gmail:refresh")) return "oauth";
  } catch { /* Account state reports store errors separately. */ }
  return bound ? "token" : null;
}

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
    summary: "Functions 和 Experiments 共用这里保存的账号连接。",
    token_label: "TypeSafe API Key", capabilities: capabilities("Functions", "Experiments", { inbound: true, outbound: true }),
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
    connector_id: "github",
    title: "GitHub",
    availability: "live",
    auth_kind: "github",
    group_id: "code",
    summary: "本机账号。Feed 拉未读通知，Functions 可勾已兑现动作。",
    capabilities: capabilities(
      "Feed 拉未读通知",
      `Functions 可勾查看当前账号（github.whoami）`,
      { inbound: true, outbound: true },
    ),
    outbound_note: `已兑现动作：查看当前 GitHub 账号（${GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID}）。判断只挑，不会自动调用。`,
    setup_links: setupLinksFor("github"),
  },
  {
    connector_id: "gmail",
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
    title: spec.title,
    availability: "live" as const,
    auth_kind: (spec.id === "notion" ? "notion" : spec.id === "feishu" ? "feishu" : "token") as "notion" | "feishu" | "token",
    group_id: spec.group_id,
    summary: spec.summary,
    token_label: spec.token_label,
    token_placeholder: spec.token_placeholder,
    auth_help: spec.auth_help,
    setup_links: spec.setup_links,
    capabilities: capabilities(spec.inbound, "Functions 可勾查看当前账号", { inbound: true, outbound: true }),
    outbound_note: "已兑现动作：查看当前账号。判断只挑，不会自动调用。",
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

export function connectorAccountStateFromCredential(bound: boolean, problem?: string): ConnectorAccountState {
  if (problem === "credential_unreadable") return "reauth_required";
  return bound ? "connected" : "disconnected";
}

export function githubClientIdConfigured(): boolean {
  try {
    if (peekSealedEntry(GITHUB_CLIENT_ID_REF)) return true;
  } catch { /* store unavailable → fall through to env */ }
  return Boolean(readProductEnv("GITHUB_CLIENT_ID"));
}

export function listConnectorSettingsCards() {
  return HOST_CONNECTOR_DIRECTORY.map((entry) => {
    if (entry.availability === "placeholder") {
      return {
        ...entry,
        account_state: "disconnected" as const,
        github_client_id_configured: false,
        gmail_oauth_configured: false,
      };
    }
    const credential = connectorCredentialStatus(entry.connector_id);
    return {
      ...entry,
      account_state: connectorAccountStateFromCredential(credential.bound, credential.problem),
      hint: credential.hint,
      github_client_id_configured: entry.auth_kind === "github" ? githubClientIdConfigured() : false,
      gmail_oauth_configured: entry.auth_kind === "gmail" ? gmailOAuthConfigured() : false,
      notion_oauth_configured: entry.auth_kind === "notion" ? notionOAuthConfigured() : false,
      connection_method: ["notion", "feishu", "gmail"].includes(entry.connector_id)
        ? storedConnectionMethod(entry.connector_id, credential.bound) : null,
      workspace_name: entry.connector_id === "notion" ? notionOAuthWorkspace() : null,
    };
  });
}
