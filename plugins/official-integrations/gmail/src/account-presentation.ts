import { normalizeGmailScope } from "./scope.js";
/** Interpret Gmail cursor identity and the read-only authorization shown to users. */
export function gmailAccountPresentation(cursor: unknown, accountLabel: string | null, scope: unknown) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const record = cursor as Record<string, unknown>;
  if (record.mode !== "live") return null;
  const accountEmail = typeof record.account_email === "string" && record.account_email.trim()
    ? record.account_email.trim().toLowerCase()
    : accountLabel;
  return {
    account_label: accountEmail,
    scope: normalizeGmailScope(record.scope ?? scope),
    authorization: {
      provider: "gmail",
      kind: "oauth_readonly",
      minimum_scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "openid",
        "email",
      ],
      molis_work_http_methods: ["GET"],
    },
  };
}
