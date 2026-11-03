/** `[key, pattern source, value names]`, the longest fixed text first so that a sentence goes to the most specific template. */
export type GitSentenceTable = ReadonlyArray<readonly [key: string, source: string, names: readonly string[]]>;

/**
 * The page's side of the Host's sentences: the functions the Git client bundle imports. They know no message table (the page is
 * handed `GIT_SENTENCE_TABLE`, built in `sentences.ts` from `GIT_MESSAGES`), so the bundle does not carry the dictionary.
 *
 * `sentence` said by the page's translator `text`: a plain
 * key is translated as it is; a template's sentence is said with its own values (a list of files in the page's list style, a
 * `reason` that is itself one of these sentences said the same way); anything else, such as Git's own words, stays as it is.
 */
export function sayHostSentence(text: (value: string, values?: Record<string, string | number>) => string, table: GitSentenceTable, sentence: string): string {
  if (typeof sentence !== "string" || sentence === "") return sentence;
  const known = text(sentence);
  if (known !== sentence) return known;
  for (const [key, source, names] of table) {
    const found = new RegExp(source, "u").exec(sentence);
    if (!found) continue;
    const values: Record<string, string> = {};
    names.forEach((name, index) => {
      const value = found[index + 1]!;
      values[name] = name === "files" ? value.split("、").join(text("git.list.joiner")) : name === "reason" ? sayHostSentence(text, table, value) : value;
    });
    return text(key, values);
  }
  return sentence;
}

/**
 * The upstream in the page's own words (user 2026-10-23 ⑧): the view gives its name and how far ahead and behind, and the page
 * says it. Empty when there is no upstream.
 */
export function sayUpstream(text: (value: string, values?: Record<string, string | number>) => string, upstream: { name: string; ahead: number; behind: number } | null): string {
  if (!upstream) return "";
  const { name, ahead, behind } = upstream;
  return text(ahead > 0 && behind > 0 ? "git.upstream.both" : ahead > 0 ? "git.upstream.ahead" : behind > 0 ? "git.upstream.behind" : "git.upstream.synced", { upstream: name, ahead, behind });
}
