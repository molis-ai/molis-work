import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

/** When Google asks to wait: `Retry-After` as seconds or as an HTTP date; absent or unreadable says nothing. */
function retryAfterAt(response: Response, now: number): string | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const at = /^\d+$/u.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : undefined;
}

/** Identity comes from the authenticated profile response, never from a saved display name. A 429 says it is a rate limit, and until when. */
export async function gmailHealthResponse(response: Response, now = Date.now()): ReturnType<IntegrationProviderPort["health"]> {
  if (response.status === 429) {
    const at = retryAfterAt(response, now);
    return { ok: false, status: "error", message: "Gmail health HTTP 429", failure: "rate_limited", ...(at ? { retryAfterAt: at } : {}) };
  }
  if (!response.ok) return { ok: false, status: "error", message: `Gmail health HTTP ${response.status}` };
  let profile: unknown;
  try { profile = await response.json(); }
  catch { return { ok: false, status: "error", message: "Gmail health returned malformed response" }; }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return { ok: false, status: "error", message: "Gmail health returned malformed profile" };
  const address = profile && typeof profile === "object" && "emailAddress" in profile && typeof profile.emailAddress === "string" ? profile.emailAddress.trim() : "";
  return { ok: true, status: "connected", message: `Gmail live ${address}`.trim(),
    ...(address ? { account: { login: address.toLowerCase() } } : {}),
  };
}
