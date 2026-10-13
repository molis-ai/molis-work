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

/**
 * Two suggestions are the same suggestion when they are equal apart from spacing, punctuation and case. This is bookkeeping among suggestions (one is made once),
 * not a claim about what is kept: punctuation and symbols can turn a request round (“不，要” / “不要”, “>” / “<”), so whether a memory already says something is `sameWords`.
 */
export function sameText(left: string, right: string): boolean {
  return normalized(left) === normalized(right);
}

export function normalized(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** The full-width signs ￠ ￡ ￢ ￣ ￤ ￥ ￦ (U+FFE0–FFE6) and the half-width signs they stand for, in order. */
const SIGNS = "¢£¬¯¦¥₩";
/** Marks written another way: the Chinese full stop and enumeration comma, and the curly and corner quotation marks. */
const MARKS: Readonly<Record<string, string>> = { "。": ".", "、": ",", "“": '"', "”": '"', "「": '"', "」": '"', "『": '"', "』": '"', "‘": "'", "’": "'" };
/** An upper-case letter as its lower-case form; a character that merely lower-cases to a letter (the Kelvin sign) is left as it is. */
const lowered = (letter: string) => { const lower = letter.toLowerCase(); return lower.toUpperCase() === letter ? lower : letter; };

/**
 * A text with the differences that do not change what it says taken out; two texts are the same words only when this makes them equal. These are all of them:
 *  - letter case (an upper-case letter and its lower-case form);
 *  - the width of the full-width forms of the ASCII characters (U+FF01–FF5E: ！？，：；（）, letters, digits) and of the full-width signs ￠ ￡ ￢ ￣ ￤ ￥ ￦;
 *  - the kind of quotation mark (“ ” 「 」 『 』 ‘ ’), and 。 and 、 written as . and ,;
 *  - white space (Unicode White_Space: a run of it, a line break and the no-break and ideographic spaces included, is one space) and a space next to a Chinese character;
 *  - one sentence mark (. ! 。 ！) at the very end.
 * It is no Unicode normalization: a superscript, a circled digit, a Roman numeral, a fraction, a ligature, a unit sign, a Kangxi radical, a doubled mark (‼), a half-width kana
 * and a byte-order mark or other invisible character stay what they are, so 10⁵ is not 105 and a zero-width space is not a space. A comma is not a full stop (“不，要发给他” is
 * not “不要发给他”), a question mark is not a full stop, a word is a word, and the order is the order.
 */
export function fold(raw: string): string {
  return raw
    .replace(/[\uff01-\uff5e]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[\uffe0-\uffe6]/g, char => SIGNS[char.charCodeAt(0) - 0xffe0]!)
    .replace(/\p{Lu}/gu, lowered)
    .replace(/[。、“”「」『』‘’]/g, mark => MARKS[mark]!)
    .replace(/\p{White_Space}+/gu, " ")
    .replace(/(?<=\p{Script=Han}) | (?=\p{Script=Han})/gu, "")
    .replace(/^ | $/g, "")
    .replace(/(?<![.!])[.!]$/, "")
    .replace(/ $/, "");
}

/** Whether two texts are the same words (see `fold`). Two texts that are nothing but a mark are not "the same". */
export function sameWords(left: string, right: string): boolean {
  const folded = fold(left);
  return folded !== "" && folded === fold(right);
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
