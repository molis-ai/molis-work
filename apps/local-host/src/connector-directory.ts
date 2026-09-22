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

export const HOST_CONNECTOR_DIRECTORY: readonly ConnectorDirectoryEntry[] = [
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
    auth_kind: "token" as const,
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
    };
  });
}
