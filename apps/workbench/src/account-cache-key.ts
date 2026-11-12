/** Shared by first-paint preference reads and the live account cache owner. */
export function accountCachePrefix(scope: string): string {
  return 'molis-account-cache:' + encodeURIComponent(scope) + ':';
}
