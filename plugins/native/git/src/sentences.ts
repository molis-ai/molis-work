import { GIT_MESSAGES } from "./messages.js";
import type { GitSentenceTable } from "./say.js";

export { sayHostSentence, sayUpstream } from "./say.js";
export type { GitSentenceTable } from "./say.js";

/**
 * Sentences the Host and the actions write once, in Chinese, and an Agent reads as written. A sentence with a name, a path or a
 * count in it (a remote's host, the files a merge stopped on) has a template in `GIT_MESSAGES`; the page finds which template a
 * sentence is and says it again in its own language with the same values (`say.ts`). Any other sentence is a plain key.
 */
const TEMPLATE_KEYS = [...Object.keys(GIT_MESSAGES).filter((key) => key.startsWith("git.host.")), "git.op.create-branch", "git.op.resolve-file"] as const;

export const GIT_SENTENCE_TABLE: GitSentenceTable = TEMPLATE_KEYS.map((key) => {
  const zh: string = (GIT_MESSAGES as Record<string, { zh: string }>)[key]!.zh;
  const names: string[] = [];
  const source = zh.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_all, name: string) => { names.push(name); return "([\\s\\S]+?)"; });
  return [key, `^${source}$`, names, zh.replace(/\{\w+\}/g, "").length] as const;
}).sort((a, b) => b[3] - a[3]).map(([key, source, names]) => [key, source, names] as const);
