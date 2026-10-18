/** Non-sensitive identity returned by the authenticated GitHub /user endpoint. */
export interface GithubAccountIdentity { login: string; account_id?: string }
export function githubAccountIdentity(raw: unknown): GithubAccountIdentity | undefined {
  if (!raw || typeof raw !== "object" || !("login" in raw) || typeof raw.login !== "string" || !raw.login.trim()) return undefined;
  const id = "id" in raw && typeof raw.id === "number" && Number.isSafeInteger(raw.id) && raw.id > 0 ? String(raw.id) : undefined;
  return { login: raw.login.trim(), ...(id ? { account_id: id } : {}) };
}
export function grantedScopes(response: Response): string[] {
  return (response.headers.get("x-oauth-scopes") ?? "").split(",").map(scope => scope.trim()).filter(Boolean).sort();
}
