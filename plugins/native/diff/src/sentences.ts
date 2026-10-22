import { DIFF_MESSAGES } from "./messages.js";

/**
 * Sentences with a value in them (a path, a count) are written once, in Chinese, by whoever found the fact, and an Agent reads
 * them as written. Each has a template in `DIFF_MESSAGES`; the page finds which template a sentence is and says it again in its
 * own language with the same values. A sentence that is no template is a plain key and goes to the translator unchanged.
 */
const TEMPLATE_KEYS = ["diff.msg.no-change-in", "diff.msg.renamed", "diff.msg.hunk-count", "diff.msg.hunk-header"] as const;

const TEMPLATES = TEMPLATE_KEYS.map((key) => {
  const names: string[] = [];
  const source = DIFF_MESSAGES[key].zh.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_all, name: string) => { names.push(name); return "([\\s\\S]+?)"; });
  return { key, names, pattern: new RegExp(`^${source}$`, "u") };
});

/** `sentence` said by the page's translator `text`: a template's sentence with its own values, anything else as the key it is. */
export function pageSentence(text: (value: string, values?: Record<string, string | number>) => string, sentence: string): string {
  for (const { key, names, pattern } of TEMPLATES) {
    const found = pattern.exec(sentence);
    if (found) return text(key, Object.fromEntries(names.map((name, index) => [name, found[index + 1]!])));
  }
  return text(sentence);
}
