import { GIT_MESSAGES } from "./messages.js";

/**
 * Sentences the Host and the actions write once, in Chinese, and an Agent reads as written. A sentence with a name, a path or a
 * count in it (a remote's host, the files a merge stopped on) has a template in `GIT_MESSAGES`; the page finds which template a
 * sentence is and says it again in its own language with the same values. Any other sentence is a plain key.
 */
const TEMPLATE_KEYS = [...Object.keys(GIT_MESSAGES).filter((key) => key.startsWith("git.host.")), "git.op.create-branch", "git.op.resolve-file"] as const;

/** `[key, pattern source, value names]`, the longest fixed text first so that a sentence goes to the most specific template. */
export type GitSentenceTable = ReadonlyArray<readonly [key: string, source: string, names: readonly string[]]>;

export const GIT_SENTENCE_TABLE: GitSentenceTable = TEMPLATE_KEYS.map((key) => {
  const zh: string = (GIT_MESSAGES as Record<string, { zh: string }>)[key]!.zh;
  const names: string[] = [];
  const source = zh.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_all, name: string) => { names.push(name); return "([\\s\\S]+?)"; });
  return [key, `^${source}$`, names, zh.replace(/\{\w+\}/g, "").length] as const;
}).sort((a, b) => b[3] - a[3]).map(([key, source, names]) => [key, source, names] as const);

/**
 * `sentence` said by the page's translator `text`. Self-contained, so the page's script can carry it with `toString()`: a plain
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
 * says it. Self-contained, so the page's script can carry it with `toString()`; empty when there is no upstream.
 */
export function sayUpstream(text: (value: string, values?: Record<string, string | number>) => string, upstream: { name: string; ahead: number; behind: number } | null): string {
  if (!upstream) return "";
  const { name, ahead, behind } = upstream;
  return text(ahead > 0 && behind > 0 ? "git.upstream.both" : ahead > 0 ? "git.upstream.ahead" : behind > 0 ? "git.upstream.behind" : "git.upstream.synced", { upstream: name, ahead, behind });
}
