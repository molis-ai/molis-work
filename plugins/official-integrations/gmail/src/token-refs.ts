import type { GmailTokenRefs } from "./provider.js";

/** A Gmail source's stored token refs: the access, refresh and expiry refs of its connection. */
export function isGmailTokenRefs(value: unknown): value is GmailTokenRefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return [record.refresh, record.access, record.expiresAt].every((entry) => typeof entry === "string" && entry.length > 0);
}
