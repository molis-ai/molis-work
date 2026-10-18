import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Identity comes from the authenticated profile response, never from a saved display name. */
export async function gmailHealthResponse(response: Response): ReturnType<IntegrationProviderPort["health"]> {
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
