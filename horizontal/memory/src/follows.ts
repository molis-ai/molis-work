/**
 * Whether a memory's text follows from the words it is said to rest on: the check behind recording it as “the person
 * said so”. No model is asked; the same two texts always give the same answer.
 *
 * Both texts are read as words: Chinese characters, English words (without their endings), numbers and addresses.
 * Not words: Chinese particles (的、了、都、在、按…), the framing of a memory (用户、偏好、以后、本项目…), English function
 * words and the person/preference/“always” framing, and the verbs that only put something somewhere (put, list, write,
 * show…). A ban said another way is the same ban, in either language (别、不要、不能、禁止、拒绝、停止、取消、关闭、跳过、
 * 排除、少 · don't, never, avoid, refuse, stop, quit, cancel, turn off, skip, exclude, fewer), and so is what an
 * exception or a replacement names (除了、除非、代替 · except, unless, instead of). A text is cut into statements — at
 * sentence punctuation, a line break, a space between two Chinese characters, at the words that turn against what came
 * before (但是、不过、而是 · but, however) and at the words that join statements (和、并且、以及 · and, or). A negation
 * reaches the rest of its clause, past a joining word and not past a turning one, so every word is read with whether it
 * is under one: “问我” after “改名前不用” is not “问我” after “删文件前要”. A clause that takes something out (除非…、
 * …除外 · unless…, except…) belongs to the statement beside it: the statement before it, or the one after when it comes
 * first. Leaving it out leaves out a negation.
 *
 * A text follows when it can be laid out, in order, as stretches that each run unbroken through one source — the quote,
 * or a text in `around` (the memory a correction replaces) or the project's name — with every word on the same side of a
 * negation as there, and nothing in it that is not theirs. The first stretch of each source is free, and so is a stretch
 * that goes on into the next statement of its source (a number is not run into the word after it unless the text ends
 * the statement there too: “五十万，人数” is not “五十万人数”). Beyond that the text may make one edit in all: join a stretch to
 * another of the statement it is in; put a whole statement of theirs after any stretch of its source (a topic carried
 * to the statement after it, “周报别放最后，先写风险” → “周报先写风险”; a statement left out or moved); or put in one
 * Chinese character of the statement it is in (是 said as 指). What a stretch leaves out of the statement it lies in —
 * in front of it and after it — is never a negation or a number: “客户名单发给外部顾问” is not what “……发给外部顾问是不
 * 允许的” says. Only a topic carried to the next statement may leave behind the rest of its own statement, a negation
 * of it but never a number, nor a ban said after the words it is about. A number, a numeral or an address is theirs exactly
 * and stays with the words before it: no edit next to one or among the three words before it. Stretches of another source
 * in between do not hide an edit. At least one word of the text is the quote's.
 *
 * The project's name is lent only as a label for the memory's scope: all of it (or all of it with “项目” / “project”),
 * and only in front of a whole statement of theirs or after one — never in place of the words a statement leaves out at
 * its end or its beginning (a pronoun that begins or ends the statement counts as its word for this: I put…, send it to me), and never set into the middle
 * of one. “周报发给王总” is not “周报发给我” in a project called “王总季度汇报”.
 *
 * What it cannot tell apart is two sentences made of the same words that mean different things in a way no edit shows
 * (one sentence, no punctuation and no “and” between two facts), a word of degree or a condition taken out (可以、
 * 尽量、通常、如果、……之前先问我 · may, usually, if…, …only after I approve), a clause that turns against the one before
 * it and limits it (“……，但是合同要问”), or a judgement that has no word of negation in it (“……是个坏主意”), so the
 * person's quote stays on the memory as the evidence for them to check. A text too tangled to settle in a fixed number
 * of steps does not follow.
 */
export function followsFrom(text: string, quote: string, around: string | readonly string[] = [], project: string | null = null): boolean {
  const mine = statementsOf(text).flat();
  const lent = [around].flat().filter(words => words.trim()), labels = labelsOf(project);
  const names = new Set(labels.map((_, index) => 1 + lent.length + index));
  return mine.some(word => !word.mark) && laidOver(mine, [quote, ...lent, ...labels].map(statementsOf), names);
}

/**
 * What the first clause of a text does to the statement beside it: it takes something out of it (除非…, unless…, …除外: “except”, which belongs to the
 * statement before it, or after it when it comes first), or only judges the one before it (“这是不允许的”, “that is not OK”: “verdict”); otherwise null.
 * Such a clause is read with that statement and is not left out with it.
 */
export function limitsBeside(text: string): "except" | "verdict" | null {
  const first = readStatements(text)[0];
  return first?.some(word => word.except) ? "except" : first && isVerdict(first) ? "verdict" : null;
}

/** The ways a project's name is written as a label: by itself, or with the word for a project. */
function labelsOf(project: string | null): string[] {
  const name = project?.trim();
  return name ? [name, `${name}项目`, `项目${name}`, `${name} project`, `project ${name}`] : [];
}

/** The edits a text may make, how many words an edit keeps clear of before a number (the number and the three words before it stay together), and the steps taken before a text this tangled is given up on (it then does not follow). */
const EDITS = 1;
const TIED = 4;
const WORK = 50_000;

/* ---- the texts as words ---- */

/** Grammar that colours a sentence without asking anything; said or left out, the request is the same. */
const HAN_GLUE = /里面|里头|当中|其中|[的了着吗呢吧啊呀嘛啦哦都也就还又把被让对向从到于以为在按由将是时候这那些其该此里要会之]/g;
/** Words that join two statements (和、并且、而且、以及、同时、另外…): the statements are told apart, but a negation before them still reaches those after. */
const HAN_AND = /并且|而且|以及|同时|另外|此外|还有|或者|然后|和|与|及|并|而|且|或/g;
/** Words that turn against what came before (但是、不过、然而、否则…): they end a clause, and a negation with it. */
const HAN_BUT = /(?<!不)但是|(?<!不)但|不过|可是|然而|否则|不然|相反|反而|而是|却/g;
/** Words that take something out of what was said (除非、除了…): a new clause that is under a negation. */
const HAN_EXCEPT = /除非|除了|除开|除去/g;
/** What frames a memory (whose it is, that it stands for later, which project) rather than what it asks. */
const HAN_FRAMING = /个人偏好|用户|偏好|习惯|希望|要求|必须|务必|应该|应当|记住|记得|以后|今后|往后|日后|下次|每次|总是|一直|始终|一定|一律|统一|一下|一些|本项目|该项目|当前项目|这个项目|此项目/g;
/** One ban said many ways (别、勿、不要、不能、禁止、避免、拒绝…), and a bare 不 except where it only begins a word (不同、不过…). */
const HAN_BAN = new RegExp([
  "不(?:能|可以|可|得|许|許|准|準)", "禁止|严禁|嚴禁|禁用", "避免|切勿|切忌|千万别|千萬別|别|別|勿|莫", "拒绝|拒絕|杜绝|杜絕|谢绝|謝絕|拒",
  // stop, quit, cease, halt, suspend · cancel, turn off, switch off · skip, omit, exclude, block
  "停止|停掉|停用|停下|暂停|暫停|终止|終止|中止|制止", "取消|关闭|關閉|关掉|關掉", "跳过|跳過|略过|略過|省略|排除|屏蔽", "违规|違規|违禁|違禁|违法|違法|违反|違反|犯规|要不得|行不通|免谈|反对|反對",
  // fewer, less, reduce: 少 by itself, but not 多少、至少、最少、年少、稀少、缺少、不少, nor 少数、少年、少于 (less than)
  "很少|极少|極少|鲜少|鮮少|减少|減少|削减|削減|(?<![多至最年稀缺不])少(?![数數年女爷爺校林于於过過])", "代替|取代|替代",
].join("|"), "g");
const HAN_NOT = /不(?!同|过|管|论|但|仅|然|错|少|如|妨|断|免|禁|由|光|只)/g;
const NUMERALS = "零〇一二三四五六七八九十百千万亿两半几";
const NUMERAL = new RegExp(`[${NUMERALS}]`);
/** 个 after a numeral counts (三个月 is not 三月); anywhere else it is a measure word like the others. */
const COUNTER = new RegExp(`(?<![${NUMERALS}])个`, "g");
/** Where a clause ends: sentence punctuation, but not the dot or comma inside an address or a number (x@y.com, 1,000). */
const CLAUSE = /[;!?\n。、]|(?<![A-Za-z0-9])[,.:]|[,.:](?![A-Za-z0-9])/;

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

/** Pronouns are filler (“Cc my manager” is “Cc manager”), but one that begins or ends a statement says who does it or to whom (I put risks first, send it to me): a project's name does not take its place. */
const PRONOUNS = new Set("i me my mine myself we us our ours you your yours he him his she her hers they them their theirs it its itself".split(" "));

/** What frames a memory in English, as the Chinese framing above: whose it is, that it is preferred and meant to last. */
const FRAMING_WORDS = new Set(["user", "person", "prefer", "preference", "want", "always", "please", "remember", "note", "future"].map(stem));
/** Verbs that say no (avoid, refuse, stop, skip…): a ban like don't, whatever their ending. The same bans as in HAN_BAN. */
const BAN_WORDS = new Set(["avoid", "refuse", "forbid", "forbidden", "forbade", "prohibit", "disallow", "ban", "reject", "deny", "denied", "decline", "withhold", "refrain", "abstain", "forgo", "oppose",
  "illegal", "unlawful", "improper", "impermissible", "unacceptable", "inappropriate", "unwise", "unsafe",
  "stop", "quit", "cease", "halt", "discontinue", "suspend", "pause", "cancel", "cancelled", "disable", "skip", "bypass", "omit", "exclude", "block",
  "less", "fewer", "minimize", "minimise", "reduce", "curb"].map(stem));
/** Verbs that only put something somewhere: which one a text uses does not change what it asks, what they act on does. */
const PLACING = new Map(["put", "place", "list", "write", "show", "add", "include", "mention"].map(word => [stem(word), "put"] as const));

/** The text with what does not count taken out, the negations marked (◆ Chinese, ◇ English; ◈ ◊ when the word takes something out) and the words that join statements marked (·), so that two ways of saying one thing read alike. */
function prepare(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(/[◆◇◈◊·]/g, " ")
    .replace(/(?<=[〇一-鿿])[ \t]+(?=[〇一-鿿])/g, ";")
    .replace(/\b(?:e\.g|i\.e)\.?/g, " ")
    .replace(/\b(?:can|won)['’]t\b|\bcannot\b/g, "◇").replace(/n['’]t\b/g, " ◇").replace(/['’](?:s|re|ve|ll|d|m)\b/g, "")
    .replace(/\b(less|fewer)\s+than\b/g, "$1_than")
    .replace(/(?<![\w@./-])but\s+not(?![\w@/-])/g, ";◊")
    .replace(/(?<![\w@./-])(?:not|never|no|nor|neither|without|avoid|nothing|nobody|none|nowhere|rarely|seldom|hardly|barely|scarcely|(?:turn|switch|shut)\s+off|leave\s+out|hold\s+off|off[\s-]limits|out\s+of\s+the\s+question|no-go)(?![\w@/-]|\.\w)/g, "◇")
    .replace(/(?<![\w@./-])(?:and|or|then|while|plus)(?![\w@/-]|\.\w)/g, "·")
    .replace(/(?<![\w@./-])(?:unless|except(?:\s+for)?|excluding|not\s+including|with\s+the\s+exception\s+of|apart\s+from|aside\s+from|save\s+for|barring|instead\s+of|rather\s+than|in\s+place\s+of|other\s+than|as\s+opposed\s+to)(?![\w@/-]|\.\w)/g, ";◊")
    .replace(/(?<![\w@./-])(?:but|however|whereas|although|though|otherwise|instead)(?![\w@/-]|\.\w)/g, ";")
    .replace(HAN_FRAMING, "").replace(/(?:千万|万万|绝对|坚决|永远|完全|根本|决)(?=[不别没无未])/g, "").replace(/[这那](?:样|么|种|件事|点|事)/g, "").replace(/使用/g, "用").replace(/不包括|不包含|不含/g, ";◈").replace(HAN_BAN, "◆").replace(HAN_NOT, "◆")
    .replace(HAN_EXCEPT, ";◈").replace(/除外|例外/g, "◈;").replace(HAN_BUT, ";").replace(HAN_AND, "·").replace(HAN_GLUE, "").replace(COUNTER, "");
}

/** One word of a text. */
interface Word {
  /** The word itself, with ~ in front when a negation earlier in its clause reaches it. */
  key: string;
  /** A Chinese character, an English word, or an anchor: a number, a numeral, an address or a code. */
  kind: "han" | "word" | "anchor";
  /** The mark of a negation, not a word of the request. */
  mark: boolean;
  /** The mark of a negation that takes something out of what is said beside it (除非, unless, …除外). */
  except?: boolean;
  /** The first word of a statement of its text. */
  head?: boolean;
  /** A pronoun began the statement before this word, or ended it after it (and was left out as filler). */
  pronounBefore?: boolean;
  pronounAfter?: boolean;
}

/** A negation (a mark, or a word that denies), a Chinese character, a sign that goes with a number (50%, $5, ≥ 3), or a run of letters and digits (a number, an address, a word). */
const LETTERS = "(?:(?![〇一-鿿])[\\p{L}\\p{N}])+";
const TOKEN = new RegExp(`(?<mark>◆|◇|◈|◊|[没沒]|[无無](?![论論])|非(?!常)|未(?![来來]))|(?<han>[〇一-鿿])|(?<sign>[%‰$€£¥₹°<>≤≥=≠±])|(?<run>\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|${LETTERS}(?:[._@/:+#-]${LETTERS})*)`, "gu");

/**
 * The statements of a text, each as the words it is read as; a statement with nothing in it is left out. A clause that takes something out goes with
 * the statement beside it, and a clause that only judges (“……，这是不允许的”) with the one before it.
 */
function statementsOf(raw: string): Word[][] {
  const out: Word[][] = [];
  let waiting: Word[] = []; // a clause that takes something out and comes first, with nothing before it: it goes with the statement after it
  for (const words of readStatements(raw)) {
    if (out.length && isVerdict(words)) out[out.length - 1]!.push(...words);
    else if (!words.some(word => word.except)) { out.push([...waiting, ...words]); waiting = []; }
    else if (out.length) out[out.length - 1]!.push(...words);
    else waiting.push(...words);
  }
  if (waiting.length) out.push(waiting);
  return out.map(words => words.map((word, index) => ({ ...word, head: index === 0 })));
}

/** The statements of a text as they stand, each as the words it is read as; a statement with nothing in it is left out. A sign goes with its number (500%, $500, ≥ 3). */
function readStatements(raw: string): Word[][] {
  const statements: Word[][] = [];
  for (const clause of prepare(raw).split(CLAUSE)) {
    let negated = false;
    for (const part of clause.split("·")) {
      const words: Word[] = [];
      let held = ""; // a sign that comes before its number, waiting for it
      const add = (key: string, kind: Word["kind"], mark = false, except = false) => words.push({ key: negated ? `~${key}` : key, kind, mark, ...(except ? { except } : {}) });
      const flush = () => { if (held) add(held, "anchor"); held = ""; };
      const tokens = [...part.matchAll(TOKEN)];
      for (const found of tokens) {
        const { mark, han, sign, run } = found.groups!;
        if (sign) {
          const last = words[words.length - 1];
          if ("%‰°".includes(sign) && !held && last && /^~?\d/.test(last.key)) last.key += sign;
          else { flush(); held = sign; }
        } else if (mark) { flush(); const key = mark === "◈" ? "◆" : mark === "◊" ? "◇" : mark; add(key, key === "◇" ? "word" : "han", true, key !== mark); negated = true; }
        else if (han) { if (NUMERAL.test(han) && held) { add(held + han, "anchor"); held = ""; } else { flush(); add(han, NUMERAL.test(han) ? "anchor" : "han"); } }
        else for (const [key, kind] of wordsOf(run!)) {
          if (held && /^\d/.test(key)) { add(held + key, "anchor"); held = ""; }
          else { flush(); add(key, kind, key === "◇"); if (key === "◇") negated = true; }
        }
      }
      flush();
      if (words.length) {
        words[0]!.head = true;
        if (PRONOUNS.has(tokens[0]!.groups!.run ?? "")) words[0]!.pronounBefore = true;
        if (PRONOUNS.has(tokens[tokens.length - 1]!.groups!.run ?? "")) words[words.length - 1]!.pronounAfter = true;
        statements.push(words);
      }
    }
  }
  return statements;
}

/** A run of letters and digits as numbers, addresses and codes (anchors) and English words (stems, without function words and framing). */
function wordsOf(run: string): Array<[string, Word["kind"]]> {
  const number = (value: string) => value.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (/^\d+(?:[.,]\d+)*$/.test(run)) return [[number(run), "anchor"]];
  if (/[._@/:+#]/.test(run)) return [[run, "anchor"]];
  return run.split("-").flatMap((part): Array<[string, Word["kind"]]> => {
    if (/^\d+$/.test(part)) return [[number(part), "anchor"]];
    if (!/^\p{L}+$/u.test(part)) return [[part, "anchor"]];
    if (BAN_WORDS.has(stem(part))) return [["◇", "word"]];
    return FUNCTION_WORDS.has(part) || FRAMING_WORDS.has(stem(part)) ? [] : [[PLACING.get(stem(part)) ?? stem(part), "word"]];
  });
}

/** Words that judge what came before them (允许、行、可能 · allowed, OK, acceptable). */
const JUDGES_HAN = new Set(["允许", "许可", "可能", "可行", "应该", "应当", "合适", "妥当", "正确", "接受", "同意", "行", "能", "对", "好", "妥", "做", "干", "办"]);
const JUDGES_WORDS = new Set(["allow", "allowed", "permit", "permitted", "ok", "okay", "acceptable", "fine", "possible", "appropriate", "advisable", "good", "idea", "right", "correct", "proper", "wise"].map(stem));

/**
 * Where a ban said after the words it is about begins (“……是不允许的”, “……绝对不行”, “…… is not OK”): the position of the
 * last mark of a negation, when it ends the statement or only a word that judges follows it; otherwise -1.
 */
function verdictIn(words: readonly Word[]): number {
  const mark = words.map(word => word.mark).lastIndexOf(true), rest = words.slice(mark + 1).map(word => word.key.replace(/^~/, ""));
  return mark >= 0 && rest.length <= 3 && (!rest.length || JUDGES_HAN.has(rest.join("")) || rest.every(key => JUDGES_WORDS.has(key))) ? mark : -1;
}

/** A clause that is only a ban and a word that judges it (“这是不允许的”, “不行”, “It is not allowed”): it says no to the statement before it. */
const isVerdict = (words: readonly Word[]): boolean => words[0]!.mark && verdictIn(words) === 0;

/* ---- laying the text over their words ---- */

/** Where a word stands in the sources: which source, which statement of it (where that begins and where it ends), whether it opens or closes that statement, whether it is a mark of a negation or a number, and whether it is a word of the quote. */
interface Spot { key: string; source: number; statement: number; lead: number; last: number; head: boolean; tail: boolean; guard: boolean; number: boolean; said: boolean; before: boolean; after: boolean }

/**
 * A partial layout: the first words of the text are laid, the latest stretch has reached `cur`, and where each source's
 * earlier stretches ended is `ended` (-1: none yet; the entry of the latest stretch's own source is read from `cur`).
 * `open`: the latest stretch began as a whole statement after others and must end at the end of one.
 */
interface Layout { cur: number; open: boolean; ended: readonly number[]; edits: number; said: boolean }

/** Whether the text can be laid over the sources (the first is the quote) with the edits allowed. `names` are the sources that are the project's name. */
function laidOver(mine: readonly Word[], sources: readonly Word[][][], names: ReadonlySet<number> = new Set()): boolean {
  const spots: Spot[] = [], where = new Map<string, number[]>(), keysIn: Array<Set<string>> = [], firstOf: number[] = [], lastOf: number[] = [], verdictAt: number[] = [];
  sources.forEach((statements, source) => {
    firstOf[source] = spots.length;
    for (const words of statements) {
      const lead = spots.length, verdict = verdictIn(words);
      verdictAt.push(verdict < 1 ? -1 : lead + verdict);
      words.forEach((word, index) => spots.push({ key: word.key, source, statement: keysIn.length, lead, last: lead + words.length - 1, head: index === 0, tail: index === words.length - 1, guard: word.mark || word.kind === "anchor", number: word.kind === "anchor", said: source === 0 && !word.mark,
        before: index === 0 && !!word.pronounBefore, after: index === words.length - 1 && !!word.pronounAfter }));
      keysIn.push(new Set(words.map(word => word.key)));
    }
    lastOf[source] = spots.length - 1;
    spots.push({ key: "", source, statement: -1, lead: -1, last: -1, head: false, tail: false, guard: false, number: false, said: false, before: false, after: false }); // no stretch runs from one source into the next
  });
  spots.forEach((spot, index) => { if (spot.key) (where.get(spot.key) ?? where.set(spot.key, []).get(spot.key)!).push(index); });
  const guardsBefore = [0]; // guardsBefore[n]: the marks of a negation and the numbers among the first n spots
  const numbersBefore = [0]; // numbersBefore[n]: the numbers among the first n spots
  for (const spot of spots) { guardsBefore.push(guardsBefore[guardsBefore.length - 1]! + (spot.guard ? 1 : 0)); numbersBefore.push(numbersBefore[numbersBefore.length - 1]! + (spot.number ? 1 : 0)); }
  /** Nothing left out between these two places is a negation or a number. */
  const leftOutNone = (from: number, to: number) => to <= from || guardsBefore[to]! === guardsBefore[from]!;
  /** What a stretch that ends at this word leaves out of its statement after it is no negation and no number. */
  const tailKept = (at: number) => leftOutNone(at + 1, spots[at]!.last + 1);
  /** What a stretch that ends at this word leaves out of its statement after it is a number, or a ban said after the words it is about. */
  const heavyLeft = (at: number) => numbersBefore[spots[at]!.last + 1]! > numbersBefore[at + 1]! || verdictAt[spots[at]!.statement]! > at;
  /** A project's name is used whole. */
  const wholeName = (at: number) => !names.has(spots[at]!.source) || at === lastOf[spots[at]!.source];
  /**
   * Whether a stretch may begin at `start` after the one that ended at `cur` (-1: none), `how` it follows: apart from it (another source, or a source's
   * first stretch), joined to it in its statement, or carried on with a whole statement of the same source. What the earlier one leaves out of its
   * statement is no negation and no number, unless the new one joins it there, where what lies between is judged by the join; a topic may be carried
   * to the statement after it (“周报别放最后，先写风险”), but not with a number or a ban said after the words it is about left behind. A project's name stands between
   * whole statements, as a label: it begins a statement of the text, the stretch before it ends where its statement does, the one after it begins where its statement does
   * (a pronoun that begins or ends that statement counts: I put, to me).
   */
  const mayFollow = (cur: number, start: number, how: "apart" | "joined" | "carried", opens: boolean) => {
    const label = names.has(spots[start]!.source);
    if (label && (!opens || start !== firstOf[spots[start]!.source])) return false;
    if (cur < 0) return true;
    const was = spots[cur]!, kept = how === "joined" || (how === "carried" ? !heavyLeft(cur) : tailKept(cur));
    return kept && wholeName(cur) && (!label || (was.tail && !was.after)) && (!names.has(was.source) || (spots[start]!.head && !spots[start]!.before));
  };

  /** Where each source's stretches ended, with the latest one's own source read from where it stands. */
  const endedOf = (layout: Layout) => layout.ended.map((ended, source) => source === spots[layout.cur]!.source ? layout.cur : ended);
  // layouts[n]: the ways the first n words can have been laid, by where the latest stretch stands and what the others came to
  const layouts = Array.from({ length: mine.length + 1 }, () => new Map<string, Layout>());
  const settle = (at: number, layout: Layout) => {
    if (layout.edits > EDITS) return;
    const key = `${layout.cur}/${layout.open}/${layout.said}/${layout.ended.join(",")}`, kept = layouts[at]!.get(key);
    if (!kept || kept.edits > layout.edits) layouts[at]!.set(key, layout);
  };
  let work = 0;
  for (let at = 0; at < mine.length; at++) {
    const here = mine[at]!, before = mine[at - 1];
    // Where a stretch may end and another begin: the latest one is whole if it began as a whole statement and now closes one.
    const ends = at === 0 ? [{ cur: -1, ended: sources.map(() => -1), edits: 0, said: false }]
      : [...layouts[at]!.values()].filter(layout => !layout.open || spots[layout.cur]!.tail).map(layout => ({ cur: layout.cur, ended: endedOf(layout), edits: layout.edits, said: layout.said }));
    for (const layout of layouts[at]!.values()) { // the latest stretch goes on
      if ((work += 1) > WORK) return false;
      const next = spots[layout.cur + 1];
      // Going on into the next statement of the source keeps what the text keeps apart: a number is not joined to the word after it unless the text has the statement's end there too.
      const joined = next !== undefined && next.statement !== spots[layout.cur]!.statement && !here.head && (before!.kind === "anchor" || here.kind === "anchor");
      if (next?.key === here.key && !joined) settle(at + 1, { ...layout, cur: layout.cur + 1, said: layout.said || next.said });
    }
    // Nothing begins next to a number or an address, and an edit within a statement is not among the words that go with one.
    if (at === 0 || (before!.kind !== "anchor" && here.kind !== "anchor")) {
      const editable = !mine.slice(at, at + TIED).some(word => word.kind === "anchor");
      if (at > 0 && editable && here.kind === "han" && !here.mark) {
        for (const layout of layouts[at]!.values()) { // one character of theirs put in, from the statement the stretch is in
          if ((work += 1) > WORK) return false;
          if (!layout.open && !names.has(spots[layout.cur]!.source) && keysIn[spots[layout.cur]!.statement]!.has(here.key)) settle(at + 1, { ...layout, edits: layout.edits + 1 });
        }
      }
      for (const start of where.get(here.key) ?? []) { // another stretch begins
        const first = spots[start]!;
        for (const end of ends) {
          if ((work += 1) > WORK) return false;
          const ended = end.ended[first.source]!, fresh = Object.assign([...end.ended], { [first.source]: -1 }), said = end.said || first.said;
          // A stretch that begins in the middle of a statement leaves out what comes before it, and what is left out is not a negation or a number.
          if (ended < 0) { if (leftOutNone(first.lead, start) && mayFollow(end.cur, start, "apart", !!here.head)) settle(at + 1, { cur: start, open: false, ended: fresh, edits: end.edits, said }); }
          else {
            // Joined to the stretch that has just ended, what lies between them is the gap the join judges; joined across another source's stretch, that one's rest is left out.
            const joins = spots[ended]!.statement === first.statement && editable && leftOutNone(start > ended ? ended + 1 : first.lead, start);
            if (joins && mayFollow(end.cur, start, end.cur === ended ? "joined" : "apart", !!here.head)) settle(at + 1, { cur: start, open: false, ended: fresh, edits: end.edits + 1, said });
            if (first.head && mayFollow(end.cur, start, end.cur === ended ? "carried" : "apart", !!here.head)) settle(at + 1, { cur: start, open: true, ended: fresh, edits: end.edits + 1, said });
          }
        }
      }
    }
    if (!layouts[at + 1]!.size) return false;
  }
  return [...layouts[mine.length]!.values()].some(layout => layout.said && (!layout.open || spots[layout.cur]!.tail) && tailKept(layout.cur) && wholeName(layout.cur));
}
