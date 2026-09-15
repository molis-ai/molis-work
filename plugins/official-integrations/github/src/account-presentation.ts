/** Interpret GitHub notification cursor identity and the granted authorization shown to users. */
export function githubAccountPresentation(cursor: unknown, currentAccountLabel: string | null) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const record = cursor as Record<string, unknown>;
  if (record.provider !== "github") return null;
  const accountLabel = typeof record.account_login === "string" && record.account_login.trim()
    ? `@${record.account_login.trim()}`
    : currentAccountLabel;
  const scopes = Array.isArray(record.granted_scopes)
    ? record.granted_scopes.filter((scope): scope is string => typeof scope === "string" && Boolean(scope.trim()))
    : [];
  const authorizationKind = record.authorization_kind === "classic_pat_or_oauth_repo"
    ? "classic_pat_or_oauth_repo"
    : record.authorization_kind === "classic_pat_or_oauth_notifications"
      ? "classic_pat_or_oauth_notifications"
      : "unknown";
  const scopeCopy = authorizationKind === "classic_pat_or_oauth_repo"
    ? "GitHub 通知 · Molis Work 只调用 GET · classic repo scope（权限较宽）"
    : authorizationKind === "classic_pat_or_oauth_notifications"
      ? "GitHub 通知 · Molis Work 只调用 GET · notifications scope"
      : "GitHub 通知 · Molis Work 只调用 GET · scope 由真实拉取验证";
  return {
    account_label: accountLabel,
    scope: scopeCopy,
    authorization: {
      provider: "github",
      kind: authorizationKind,
      granted_scopes: scopes,
      molis_work_http_methods: ["GET"],
    },
  };
}
