import type {
  ConnectorAccountState,
  ConnectorDirectoryEntry,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID } from "@molis-ai/molis-work-integration-github";
import { gmailOAuthConfigured } from "./gmail-oauth.js";
import { GITHUB_CLIENT_ID_REF, connectorCredentialStatus } from "./connector-credentials.js";

const NO_PACKAGE = "本机还没有官方 Integration 包，不建空包。";

function placeholder(
  connector_id: ConnectorDirectoryEntry["connector_id"],
  title: string,
  group_id: ConnectorDirectoryEntry["group_id"],
  summary: string,
  unavailable_reason = NO_PACKAGE,
): ConnectorDirectoryEntry {
  return {
    connector_id,
    title,
    availability: "placeholder",
    auth_kind: "none",
    group_id,
    summary,
    unavailable_reason,
  };
}

export const HOST_CONNECTOR_DIRECTORY: readonly ConnectorDirectoryEntry[] = [
  {
    connector_id: "github",
    title: "GitHub",
    availability: "live",
    auth_kind: "github",
    group_id: "code",
    summary: "本机账号。Feed 拉未读通知，Functions 可勾已兑现动作。",
    outbound_note: `已兑现动作：查看当前 GitHub 账号（${GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID}）。判断只挑，不会自动调用。`,
  },
  {
    connector_id: "gmail",
    title: "Gmail",
    availability: "live",
    auth_kind: "gmail",
    group_id: "mail",
    summary: "本机账号。Feed 只读收信。",
    outbound_note: "出站动作未兑现：当前只读收信，不发送邮件。",
  },
  placeholder("google-calendar", "Google Calendar", "mail", "日程与会议。"),
  placeholder("outlook", "Outlook", "mail", "邮件与日历。"),
  placeholder("google-drive", "Google Drive", "files", "Drive、Docs、Sheets、Slides。"),
  placeholder("onedrive", "OneDrive", "files", "个人与共享文件。"),
  placeholder("sharepoint", "SharePoint", "files", "站点与文档库。"),
  placeholder("dropbox", "Dropbox", "files", "云盘文件。"),
  placeholder("box", "Box", "files", "云盘文件。"),
  placeholder("notion", "Notion", "files", "页面与数据库。"),
  placeholder("slack", "Slack", "chat", "频道、消息与 Canvas。"),
  placeholder("teams", "Microsoft Teams", "chat", "消息、频道与聊天。"),
  placeholder("discord", "Discord", "chat", "服务器与频道。"),
  placeholder("feishu", "飞书", "chat", "消息、文档与日历。"),
  placeholder("wechat", "微信", "chat", "消息。", "微信个人号没有稳定官方开放接口，不装官方 MCP。"),
  placeholder("zoom", "Zoom", "chat", "会议与录制。"),
  placeholder("gitlab", "GitLab", "code", "仓库、Issue 与 MR。"),
  placeholder("bitbucket", "Bitbucket", "code", "仓库与 PR。"),
  placeholder("vercel", "Vercel", "code", "部署与预览。"),
  placeholder("cloudflare", "Cloudflare", "code", "Workers、Pages 与 DNS。"),
  placeholder("huggingface", "Hugging Face", "code", "模型、数据集与 Spaces。"),
  placeholder("sentry", "Sentry", "code", "错误与性能。"),
  placeholder("supabase", "Supabase", "code", "数据库、认证与存储。"),
  placeholder("linear", "Linear", "work", "Issue、项目与周期。"),
  placeholder("jira", "Jira", "work", "Issue 与项目。"),
  placeholder("confluence", "Confluence", "work", "知识库与页面。"),
  placeholder("asana", "Asana", "work", "任务与项目。"),
  placeholder("clickup", "ClickUp", "work", "任务与文档。"),
  placeholder("monday", "monday.com", "work", "看板与工作流。"),
  placeholder("airtable", "Airtable", "work", "表格与记录。"),
  placeholder("loom", "Loom", "work", "录像与评论。"),
  placeholder("figma", "Figma", "design", "设计稿与标注。"),
  placeholder("canva", "Canva", "design", "设计与导出。"),
  placeholder("adobe", "Adobe", "design", "创意工具。"),
  placeholder("salesforce", "Salesforce", "crm", "CRM 对象与记录。"),
  placeholder("hubspot", "HubSpot", "crm", "CRM 与营销。"),
  placeholder("intercom", "Intercom", "crm", "客户对话。"),
  placeholder("stripe", "Stripe", "crm", "支付与客户。"),
  placeholder("x", "X", "social", "帖子与账号。", "X 开放接口差，不装官方 MCP。"),
  placeholder("linkedin", "LinkedIn", "social", "职业社交。", "LinkedIn 开放接口差，不装官方 MCP。"),
];

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
