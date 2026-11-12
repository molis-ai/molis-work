/** The account cache owner for one page: partitioned when the Host gave a scope, otherwise refusing (fail closed). */
export interface AccountCacheOwner { clear(): Promise<void>; hasDrafts(): Promise<boolean> }

/** A page without the Host-provided page-session scope cannot prove which account partition it owns. */
export const ACCOUNT_CACHE_SCOPE_MISSING = 'ACCOUNT_CACHE_SCOPE_MISSING';
export function missingAccountCacheScope(): Error { return new Error(ACCOUNT_CACHE_SCOPE_MISSING); }

/**
 * `install` is the browser's real Storage/CacheStorage partition owner. Without the Host scope account preparation
 * and revocation must be refused rather than silently leaving all browser data under the shared keys.
 */
export function accountCacheOwner(scope: string | null, install: (scope: string) => AccountCacheOwner): AccountCacheOwner {
  if (!scope) {
    const refuse = () => Promise.reject(missingAccountCacheScope());
    return {clear: refuse, hasDrafts: refuse};
  }
  return install(scope);
}
