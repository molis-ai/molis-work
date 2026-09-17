import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";
import type { ConnectorCredentialStatus, FeedConnectorAccountPorts } from "./connector-account-ports.js";
import { stableId } from "./source-input.js";

export function ensureConnectorSources(feed: FeedApplication, boardId: string, ports: FeedConnectorAccountPorts): FeedSourceRecord[] {
  const now = new Date().toISOString();
  const ensure = (
    kind: "github" | "gmail",
    name: string,
    credentialRef: string,
    credential: ConnectorCredentialStatus,
  ): FeedSourceRecord => {
    const sourceId = stableId("feed-source", `${boardId}\u0000connector\u0000${kind}`);
    const canonicalDescription = kind === "github"
      ? "GitHub 未读通知；只有明确需要响应的通知进入 Inbox。"
      : "Gmail 只读邮件；每个账号独立游标，只有明确需要处理的邮件进入 Inbox。";
    try {
      const current = feed.getSource(boardId, sourceId);
      const nextStatus = current.status === "paused"
        ? "paused"
        : credential.problem
          ? "error"
          : credential.bound
          ? (current.status === "disconnected" ? "active" : current.status)
          : "disconnected";
      const nextError = credential.problem ?? (credential.bound ? current.last_error_code : null);
      const legacyDescriptions = kind === "github"
        ? [
            "GitHub Issues、PR 与 Review 请求；仅手动同步。",
            "GitHub Issues / Pull Requests assigned to you",
            "绑定 GitHub 后同步真实 Issues、PR 与 Review 请求",
          ]
        : [
            "Gmail 未读邮件；OAuth 凭据加密保存，仅手动同步。",
            "绑定 Gmail 后同步真实邮件与通知",
          ];
      const nextDescription = legacyDescriptions.includes(current.description)
        ? canonicalDescription
        : current.description;
      const nextConfig = kind === "gmail"
        ? { ...current.config, scope: ports.gmail.normalizeScope(current.config.scope) }
        : current.config;
      if (
        nextStatus !== current.status
        || current.credential_ref !== credentialRef
        || current.last_error_code !== nextError
        || current.description !== nextDescription
        || current.config.scope !== nextConfig.scope
      ) {
        return feed.upsertSource({
          ...current,
          status: nextStatus,
          credential_ref: credentialRef,
          last_error_code: nextError,
          description: nextDescription,
          config: nextConfig,
          updated_at: now,
        });
      }
      return current;
    } catch {
      return feed.upsertSource({
        board_id: boardId,
        source_id: sourceId,
        kind,
        definition_id: kind,
        sync_kind: kind,
        name,
        description: canonicalDescription,
        status: credential.problem ? "error" : credential.bound ? "active" : "disconnected",
        enabled: true,
        item_count: 0,
        origin: "molis_work",
        config: kind === "gmail" ? { scope: ports.gmail.defaultScope } : {},
        schedule: { mode: "manual" },
        cursor: {},
        credential_ref: credentialRef,
        account_label: null,
        last_sync_at: null,
        last_outcome: null,
        last_error_code: credential.problem ?? null,
        imported_at: now,
        updated_at: now,
      });
    }
  };
  const github = ports.credentialStatus("github");
  const gmail = ports.credentialStatus("gmail");
  return [
    ensure("github", "GitHub", ports.credentialRef("github"), github),
    ensure("gmail", "Gmail", ports.credentialRef("gmail"), gmail),
  ];
}
