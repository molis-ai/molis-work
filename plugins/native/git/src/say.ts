/**
 * The upstream in the page's own words (user 2026-10-23 ⑧): the view gives its name and how far ahead and behind, and the page
 * says it. Empty when there is no upstream.
 */
export function sayUpstream(text: (value: string, values?: Record<string, string | number>) => string, upstream: { name: string; ahead: number; behind: number } | null): string {
  if (!upstream) return "";
  const { name, ahead, behind } = upstream;
  return text(ahead > 0 && behind > 0 ? "git.upstream.both" : ahead > 0 ? "git.upstream.ahead" : behind > 0 ? "git.upstream.behind" : "git.upstream.synced", { upstream: name, ahead, behind });
}
