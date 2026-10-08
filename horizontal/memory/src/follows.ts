/**
 * Whether a memory's text follows from the words it is said to rest on: the check behind recording it as “the person
 * said so”. No model is asked; the same two texts always give the same answer.
 *
 * A text follows when nothing in it is new. Every character, word, number and address of it is in the person's words
 * (or in `around`: the project's name, the memory a correction replaces); how they are put together may differ in one
 * place. What does not count as new:
 * - Chinese particles, conjunctions and prepositions (的、了、都、在、按…), the framing of a memory (用户、偏好、以后、
 *   本项目…), English function words and the person/preference/“always” framing, and word endings (answers, answered);
 * - a ban said another way (别、不要、不能、禁止 · don't, never, avoid), and verbs that only put something somewhere
 *   (put, list, write, show…): what they act on must still be theirs.
 * What does, whatever the length of either text: a character or word the person did not use, a number (Arabic or
 * Chinese numerals) or address (@, ., /, :, letters with digits) they did not write, a negation added, dropped or
 * moved to other words, and more than one place where their words are joined that they did not join (Chinese
 * character pairs, English words next to each other; a joint that touches a numeral is never allowed). A text with
 * nothing in it to compare (only framing) follows from nothing.
 *
 * What it cannot tell apart is two sentences of the same words that mean different things in a way no join shows; so
 * the person's quote stays on the memory as the evidence for them to check.
 */
export function followsFrom(text: string, quote: string, around: string | readonly string[] = []): boolean {
  const others = ([] as string[]).concat(around).map(prepare);
  const mine = prepare(text), said = prepare(quote), mineUnits = unitsOf(mine);
  const refs = [said, ...others].map(unitsOf);
  return hasContent(mineUnits) && allKnown(mineUnits, refs) && joinsOnce(mine, mineUnits, refs) && keepsNegation(mine, said, others);
}

/** Every character, word, number and address of the text is in the words it rests on. */
function allKnown(mine: Units, refs: readonly Units[]): boolean {
  const known = (pick: (units: Units) => Iterable<string>) => new Set(refs.flatMap(units => [...pick(units)]));
  const numbers = known(units => units.numbers), ids = known(units => units.ids), words = known(units => units.words), chars = known(units => units.runs.join(""));
  return mine.numbers.every(number => numbers.has(number)) && mine.ids.every(id => ids.has(id)) && mine.words.every(word => words.has(word)) && [...mine.runs.join("")].every(char => chars.has(char));
}

/** The text joins their words in at most one place they did not join (Chinese character pairs, English words next to each other), and never at a numeral. */
function joinsOnce(mine: string, mineUnits: Units, refs: readonly Units[]): boolean {
  const joined = new Set(refs.flatMap(units => pairsOf([units.runs.join("")]))), next = new Set(refs.flatMap(units => nextWords(units.sequence)));
  const newPairs = pairsOf(mineUnits.runs).filter(pair => !joined.has(pair));
  const newNext = mine.split(CLAUSE).flatMap(clause => nextWords(unitsOf(clause).sequence)).filter(pair => !next.has(pair));
  return !newPairs.some(pair => NUMERAL.test(pair)) && newPairs.length + newNext.length <= 1;
}

/** What they ban stays banned, and what they did not ban is not banned: no unit of the text changes sides. */
function keepsNegation(mine: string, said: string, others: readonly string[]): boolean {
  const own = sides(mine), theirs = sides(said), neutral = others.flatMap(other => [...polarityUnits(other)]);
  const banned = new Set([...polarityUnits(theirs.negated), ...neutral]), plain = new Set([...polarityUnits(theirs.plain), ...neutral]);
  return ![...polarityUnits(own.negated)].some(unit => plain.has(unit) && !banned.has(unit)) && ![...polarityUnits(own.plain)].some(unit => banned.has(unit) && !plain.has(unit));
}

/* ---- Chinese ---- */

/** Grammar that colours a sentence without asking anything; said or left out, the request is the same. */
const HAN_GLUE = /[的了着吗呢吧啊呀嘛啦哦都也就还又且而及与和并把被让对向从到于以为在按由将是时候这那些其该此里要会]/g;
/** What frames a memory (whose it is, that it stands for later, which project) rather than what it asks. */
const HAN_FRAMING = /个人偏好|用户|偏好|习惯|希望|要求|必须|务必|应该|应当|记住|记得|以后|今后|往后|日后|下次|每次|总是|一直|始终|本项目|该项目|当前项目|这个项目|此项目/g;
/** One ban said many ways (别、勿、不要、不能、禁止、避免…), and a bare 不 except where it only begins a word (不同、不过…). */
const HAN_BAN = /不(?:能|可以|可|得|许|准)|禁止|严禁|避免|切勿|千万别|别|勿|莫/g;
const HAN_NOT = /不(?!同|过|管|论|但|仅|然|错|少|如|妨|断|免|禁|由|光|只)/g;
/** A negation mark, as the text now holds it: ◆ (Chinese), ◇ (English), or a word that denies. */
const NEGATION = /◆|◇|没|无(?!论)|非(?!常)|未(?!来)/;
const NUMERALS = "零〇一二三四五六七八九十百千万亿两半几";
const NUMERAL = new RegExp(`[${NUMERALS}]`);
/** 个 after a numeral counts (三个月 is not 三月); anywhere else it is a measure word like the others. */
const COUNTER = new RegExp(`(?<![${NUMERALS}])个`, "g");
/** Where a clause ends: sentence punctuation, but not the dot or comma inside an address or a number (x@y.com, 1,000). */
const CLAUSE = /[;!?\n。、]|(?<![A-Za-z0-9])[,.:]|[,.:](?![A-Za-z0-9])/;

/* ---- English ---- */

const FUNCTION_WORDS = new Set(("a an the and or but if then so as at by for from in into of on onto out per than that this these those to via with within about "
  + "am are be been being is was were do does did done have has had having will would shall should must it its itself i me my mine myself we us our ours you your yours he him his she her hers "
  + "they them their theirs there here what which who whom whose when where why how just very really quite too even still yet ever now once also").split(" "));

function undouble(word: string): string {
  return /([b-df-hj-np-tv-z])\1$/.test(word) && !/(?:ll|ss|zz|dd|ff)$/.test(word) ? word.slice(0, -1) : word;
}

/** A word without its endings (meetings, answered, concisely → meet, answer, concis), enough to tell one word's forms from other words. */
function stem(word: string): string {
  let rest = word;
  if (rest.length > 4 && /ies$/.test(rest)) rest = `${rest.slice(0, -3)}y`;
  else if (rest.length > 4 && /(?:ss|sh|ch|x|z)es$/.test(rest)) rest = rest.slice(0, -2);
  else if (rest.length > 3 && /[^su]s$/.test(rest)) rest = rest.slice(0, -1);
  if (rest.length > 4 && /ing$/.test(rest)) rest = undouble(rest.slice(0, -3));
  else if (rest.length > 3 && /[^e]ed$/.test(rest)) rest = undouble(rest.slice(0, -2));
  if (rest.length > 4 && /ly$/.test(rest)) rest = rest.slice(0, -2);
  return rest.length > 2 && rest.endsWith("e") ? rest.slice(0, -1) : rest;
}

/** What frames a memory in English, as the Chinese framing above: whose it is, that it is preferred and meant to last. */
const FRAMING_WORDS = new Set(["user", "person", "prefer", "preference", "want", "always", "please", "remember", "note", "future"].map(stem));
/** Verbs that only put something somewhere: which one a text uses does not change what it asks, what they act on does. */
const PLACING = new Map(["put", "place", "list", "write", "show", "add", "include", "mention"].map(word => [stem(word), "put"] as const));

/* ---- both ---- */

/** The text with what does not count taken out and the negations marked, so that two ways of saying one thing read alike. */
function prepare(raw: string): string {
  return raw.normalize("NFKC").toLowerCase()
    .replace(/\b(?:e\.g|i\.e)\.?/g, " ")
    .replace(/\b(?:can|won)['’]t\b|\bcannot\b/g, "◇").replace(/n['’]t\b/g, " ◇").replace(/['’](?:s|re|ve|ll|d|m)\b/g, "")
    .replace(/(?<![\w@./-])(?:not|never|no|nor|neither|without|avoid)(?![\w@/-]|\.\w)/g, "◇")
    .replace(HAN_FRAMING, "").replace(/使用/g, "用").replace(HAN_BAN, "◆").replace(HAN_NOT, "◆")
    .replace(HAN_GLUE, "").replace(COUNTER, "");
}

interface Units {
  /** Runs of Chinese characters (◆ marks a negation). */
  runs: string[];
  /** English words, as stems; not the function words and the framing. */
  words: string[];
  /** Addresses and codes: anything with @ . / : or letters and digits together. */
  ids: string[];
  numbers: string[];
  /** The English words in order, with ◇ where a negation stands. */
  sequence: string[];
}

function unitsOf(prepared: string): Units {
  const units: Units = { runs: prepared.match(/[一-鿿◆]+/g) ?? [], words: [], ids: [], numbers: [], sequence: [] };
  const number = (value: string) => value.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  for (const chunk of prepared.replace(/[一-鿿◆]/g, " ").match(/◇|\d{1,3}(?:,\d{3})+(?:\.\d+)?|[\p{L}\d]+(?:[._@/:+#-][\p{L}\d]+)*/gu) ?? []) {
    if (chunk === "◇") units.sequence.push(chunk);
    else if (/^\d+(?:[.,]\d+)*$/.test(chunk)) units.numbers.push(number(chunk));
    else if (/[._@/:+#]/.test(chunk)) units.ids.push(chunk);
    else for (const part of chunk.split("-")) {
      if (/^\d+$/.test(part)) units.numbers.push(number(part));
      else if (!/^\p{L}+$/u.test(part)) units.ids.push(part);
      else if (!FUNCTION_WORDS.has(part) && !FRAMING_WORDS.has(stem(part))) { const word = PLACING.get(stem(part)) ?? stem(part); units.words.push(word); units.sequence.push(word); }
    }
  }
  return units;
}

const hasContent = (units: Units) => units.runs.some(run => run.replace(/◆/g, "")) || units.words.length > 0 || units.ids.length > 0 || units.numbers.length > 0;
const pairsOf = (runs: readonly string[]) => runs.flatMap(run => { const chars = [...run]; return chars.slice(0, -1).map((char, index) => char + chars[index + 1]); });
const nextWords = (sequence: readonly string[]) => sequence.slice(0, -1).map((word, index) => `${word} ${sequence[index + 1]}`);

/** Each clause cut at its first negation: what comes before it, and what it reaches (from the mark to the clause's end). */
function sides(prepared: string): { plain: string; negated: string } {
  const plain: string[] = [], negated: string[] = [];
  for (const clause of prepared.split(CLAUSE)) {
    const at = clause.search(NEGATION);
    plain.push(at < 0 ? clause : clause.slice(0, at));
    negated.push(at < 0 ? "" : clause.slice(at));
  }
  return { plain: plain.join(" "), negated: negated.join(" ") };
}

/** The pieces a negation's reach is told by: Chinese character pairs and English words. */
function polarityUnits(prepared: string): Set<string> {
  const units = unitsOf(prepared);
  return new Set([...pairsOf(units.runs), ...units.words]);
}
