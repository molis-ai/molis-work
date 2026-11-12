/** Shared by first-paint preference reads and the live account cache owner. */
export function accountCachePrefix(scope: string): string {
  return 'molis-account-cache:' + encodeURIComponent(scope) + ':';
}

/**
 * The Host-provided page-session scope: the one place browser code reads it from the `molis-work-page-session`
 * meta (the proof is `<random>.<scope>`). Cache partitioning and stale-account detection both use this value, so
 * its extraction must not be copied into each consumer. A page without it has no proven account partition; that
 * is a refusal, not an empty scope (`account-transition.ts` fails closed).
 */
export function pageSessionScope(metaContent: string | null | undefined): string | null {
  const scope = metaContent?.split('.')[1];
  return scope ? scope : null;
}
