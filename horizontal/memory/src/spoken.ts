/**
 * What the person really said, for the check behind recording a memory as “the person said so”: a quote is theirs only
 * if it is in a message they wrote, and the text is judged against the message as the Host saved it, not against the
 * quote a model gives — a model can cut a “don't” off the front of a quote, or put a comma in it, and the cut quote
 * reads the other way round.
 */
import { limitsBeside } from "./follows.js";
import { normalized } from "./text.js";

/** Why a text that does not follow from the person's words is only suggested. */
export const UNSAID = "你的原话和要记的内容对不上（要记的内容得出自原话），所以不记作你说的，先作为建议请你看一下";

/**
 * The messages of theirs a quote is found in: within a message once spacing, punctuation and case are set aside, and a
 * stretch that means something — a whole message, or at least six characters in three or more units (Chinese
 * characters, words, numbers). A word or two out of a message is not “what they said”: it can be found in almost
 * anything. The gate and the Assistant's tools use this one rule for “the person's own words”.
 */
function messagesWith(quote: string, spoken: readonly string[]): string[] {
  const needle = normalized(quote), length = [...needle].length;
  if (length < 2) return [];
  const substantial = length >= 6 && (quote.normalize("NFKC").toLowerCase().match(/[一-鿿]|[a-z0-9]+/g) ?? []).length >= 3;
  return spoken.filter(text => { const body = normalized(text); return body === needle || (substantial && body.includes(needle)); });
}

export function quotedFrom(quote: string, spoken: readonly string[]): boolean {
  return messagesWith(quote, spoken).length > 0;
}

/**
 * The words of theirs the quote lies in, as they wrote them: from each message it is found in, the sentences it
 * covers (a sentence ends at 。！？, a line break, or a full stop followed by a space or the end, but not after an abbreviation), with the sentence of
 * exception or of verdict that follows them (“……。除非超过一万元。”, “……。这是不允许的。”) or that begins the message. Empty when the quote is not a real stretch of
 * what they said. A text is judged against these, never against the quote: the quote is only the evidence for it.
 */
export function spokenAround(quote: string, spoken: readonly string[]): string[] {
  const needle = normalized(quote);
  return [...new Set(messagesWith(quote, spoken).flatMap(message => sentencesAround(message, needle)))];
}

/** Where a message's sentences end (just after the mark that ends each, and its end). A full stop after an abbreviation or a single letter (e.g. · Mr. · plan B.) does not end one: a sentence taken too long keeps more of what they said, never less. */
function sentenceEnds(message: string): number[] {
  const ends = [...message.matchAll(/[。！？!?\n]+|(?<!\b(?:e\.g|i\.e|mr|mrs|ms|dr|vs|etc|no|st|jr|sr|inc|ltd|co|[a-z]))\.+(?=\s|$)/giu)].map(found => found.index! + found[0].length);
  return ends.at(-1) === message.length ? ends : [...ends, message.length];
}

/** The message as `normalized` reads it, with where each of its characters stands in the message; null if the two readings do not agree (then the whole message is the place). */
function located(message: string): { body: string; from: number[]; to: number[] } | null {
  let body = "";
  const from: number[] = [], to: number[] = [];
  for (let index = 0; index < message.length;) {
    const size = (message.codePointAt(index) ?? 0) > 0xffff ? 2 : 1, piece = normalized(message.slice(index, index + size));
    for (let unit = 0; unit < piece.length; unit++) { from.push(index); to.push(index + size); }
    body += piece;
    index += size;
  }
  return body === normalized(message) ? { body, from, to } : null;
}

function sentencesAround(message: string, needle: string): string[] {
  const place = located(message);
  if (!place || place.body === needle) return [message];
  const ends = sentenceEnds(message), startOf = (index: number) => (index ? ends[index - 1]! : 0);
  const out: string[] = [];
  for (let at = place.body.indexOf(needle); at >= 0 && out.length < 3; at = place.body.indexOf(needle, at + 1)) {
    const from = place.from[at]!, to = place.to[at + needle.length - 1]!;
    let first = ends.findIndex(end => end > from), last = ends.findIndex(end => end >= to);
    // An exception or a verdict said after them limits them; an exception said first, with nothing before it, limits what follows.
    while (last + 1 < ends.length && limitsBeside(message.slice(ends[last]!, ends[last + 1]!))) last += 1;
    if (first === 1 && limitsBeside(message.slice(0, ends[0]!)) === "except") first = 0;
    out.push(message.slice(startOf(first), ends[last]!).trim());
  }
  return out;
}
