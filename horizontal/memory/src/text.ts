/**
 * Deterministic text rules of the memory service: recall keywords, sameness, and the gate's secret and
 * instruction shapes. No model is asked; the same text always gives the same answer.
 */

/** Recall keywords: Latin words of three or more characters, and every adjacent pair of Chinese characters. */
export function recallKeywords(text: string): string[] {
  const latin = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const han = [...text.matchAll(/[一-鿿]+/g)].flatMap(run => { const chars = [...run[0]]; return chars.length === 1 ? [chars[0]!] : chars.slice(0, -1).map((char, index) => char + chars[index + 1]); });
  return [...new Set([...latin, ...han])].slice(0, 60);
}

/** Share of the query's keywords found in the text (0–1); 0 for an empty query. */
export function keywordScore(keywords: readonly string[], text: string): number {
  if (!keywords.length) return 0;
  const haystack = text.toLowerCase();
  return keywords.filter(word => haystack.includes(word)).length / keywords.length;
}

/** Two memories say the same thing when they are equal apart from spacing, punctuation and case. */
export function sameText(left: string, right: string): boolean {
  return normalized(left) === normalized(right);
}

export function normalized(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Whether a quote is really in what the person said: found within one of their messages once spacing, punctuation and
 * case are set aside, and a stretch that means something — a whole message, or at least six characters in three or
 * more units (Chinese characters, words, numbers). A word or two out of a message is not “what they said”: it can be
 * found in almost anything. The gate and the Assistant's tools use this one rule for “the person's own words”.
 */
export function quotedFrom(quote: string, spoken: readonly string[]): boolean {
  const needle = normalized(quote), length = [...needle].length;
  if (length < 2) return false;
  const substantial = length >= 6 && (quote.normalize("NFKC").toLowerCase().match(/[一-鿿]|[a-z0-9]+/g) ?? []).length >= 3;
  return spoken.some(text => { const body = normalized(text); return body === needle || (substantial && body.includes(needle)); });
}

/** At least this share of a memory's wording has to be in the words it rests on. */
const RESTATES = 0.5;

/**
 * Whether a memory's text follows from the words it is said to rest on, so that recording it as “the person said” is
 * true: at least half of its wording (Chinese character pairs, words) is in the quote, and no number or word of three
 * or more letters (a name, an address) appears that neither the quote nor `context` (the project's name, which a text
 * may carry for scope) has. A paraphrase passes; a quote about something else, or a fragment, does not. Deterministic:
 * what it cannot tell apart is the same words meaning the opposite (a dropped “不”), so the person's quote stays on the
 * memory as its evidence for them to check.
 */
export function followsFrom(text: string, quote: string, context = ""): boolean {
  const source = `${quote} ${context}`;
  if ((text.toLowerCase().match(/[a-z]{3,}/g) ?? []).some(word => !source.toLowerCase().includes(word))) return false;
  const numbers = (value: string) => value.match(/(?<![A-Za-z\d])\d+(?:[.,]\d+)*(?![A-Za-z\d])/g) ?? [];
  const said = new Set(numbers(source));
  if (numbers(text).some(number => !said.has(number))) return false;
  return keywordScore(recallKeywords(text), quote) >= RESTATES;
}

const SECRET_SHAPES: readonly RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:password|passwd|pwd|secret|token|api[_ -]?key|access[_ -]?key)\s*[:=：]\s*\S{6,}/i,
  /(?:密码|口令|密钥|令牌|验证码)\s*(?:是|为|[:=：])\s*\S{4,}/,
  // A long run mixing letters and digits, as keys and tokens are; plain hex (commit ids, checksums) is not a secret.
  /\b(?![0-9a-f]{32,}\b)(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/,
];

/** Credentials and secrets never go into long-term memory (spec §6.2, §11). */
export function looksLikeSecret(text: string): boolean {
  return SECRET_SHAPES.some(shape => shape.test(text));
}

const INSTRUCTION_SHAPES: readonly RegExp[] = [
  /ignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier) (?:instructions?|rules?|prompts?)/i,
  /disregard (?:all |any )?(?:the )?(?:previous|prior|above|system)/i,
  /\b(?:system|developer) prompt\b/i,
  /you are now\b|act as (?:an? )?(?:admin|root|system)/i,
  /(?:忽略|无视|忘掉|不要理会)(?:之前|前面|上面|以上|所有|全部)?的?(?:指令|规则|提示|要求|设定)/,
  /(?:系统提示词|系统指令|开发者指令)/,
  /你现在(?:是|扮演)|从现在起你是/,
  /(?:不需要|无需|跳过|绕过)(?:用户)?(?:确认|审批|授权|批准)/,
  /(?:自动|直接)(?:执行|运行|删除|转账|发送)(?:所有|全部|任何)/,
  /<\s*(?:tool|function)_?call|\{\s*"(?:tool|name)"\s*:/i,
];

/**
 * Text that reads like an instruction to the model rather than a preference or fact: it is never written without the
 * person seeing it, only held as a candidate with the reason (spec §6.2).
 */
export function looksLikeInstruction(text: string): string | null {
  return INSTRUCTION_SHAPES.some(shape => shape.test(text)) ? "这段话像是在给 AI 下指令（例如要求忽略规则或跳过确认），不能自动记住，需要你看过再决定" : null;
}

/** How much two texts overlap by character pairs (0–1): enough to call two memories the same thing said twice. */
export function similarity(left: string, right: string): number {
  const pairs = (text: string) => { const chars = [...normalized(text)]; return new Set(chars.length < 2 ? chars : chars.slice(0, -1).map((char, index) => char + chars[index + 1])); };
  const a = pairs(left), b = pairs(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}
