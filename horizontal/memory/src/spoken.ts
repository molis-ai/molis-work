/**
 * What the person really said, for recording a memory as “the person said so” (source `said`, shown as 「你说过」). One rule; the same
 * two texts always give the same answer and no model is asked.
 *
 * A memory is the person's own words only when its text is the whole of one message they wrote, as the Host saved it: every sentence
 * of it, nothing left out, nothing added, nothing moved, nothing joined from two messages, no name of a project put in. The only
 * differences that do not count are the ones `fold` (text.ts) removes: case, width, quotation marks, white space and one sentence mark at the end.
 * A paraphrase, a shortened or tidied sentence, one sentence of several, a quote with its “don't” cut off: none of them is theirs. They are the
 * Assistant's suggestion, which the person confirms. And what is then kept is the message itself, as they wrote it, never the text a model asked for.
 *
 * Why the message and not a sentence of it: what a sentence says can lie in the one beside it, and a mechanical check cannot read
 * that. In “转账不用确认。除非超过一万元。”, “下面这些以后别做了。把客户名单发给外部顾问。” and “把客户名单发给外部顾问？没门！” every sentence
 * is theirs word for word, yet the first of the first, the second of the second and the first of the third say, taken alone, the opposite of
 * what they meant. A list is the same: its header and every item are the message. Six rounds of review found a way round every rule that
 * tried to read meaning (negations, exceptions, numbers, verdicts, names); this one reads none. For the same reason a text that is also found
 * inside another message of theirs, one that goes on past it or says no to it, is not theirs either.
 */
import { fold, normalized } from "./text.js";

/** Why a text that is not the whole of a message the person wrote is only suggested. */
export const UNSAID = "要记的内容不是你发的某一条消息的原话（要把整条消息原样照抄才记作你说的，改写、删减、拼接都不算），所以不记作你说的，先作为建议请你看一下";

/** Why what an Agent writes through the `memory.write` action is only suggested: the Host holds none of the person's messages to Agent work, so its own quote is no message. */
export const UNCHECKED = "宿主没有保存你对这个 Agent 说过的话，没法核对这是不是你的原话，所以不记作你说的，先作为建议请你看一下";

/** A message with the white space at its two ends taken off (Unicode White_Space only: an invisible character is part of what they wrote). */
const trimmed = (message: string) => message.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");

/**
 * The message of the person's, as they wrote it, that the text is the whole of; null when it is none of them (then it is not theirs), or when the
 * text is also found inside another message of theirs that goes on past it (the text said whole once and a ban or a question about it another time).
 * `messages` are only what the person typed, each one message: a round the Host, the Assistant or a page wrote is not among them.
 */
export function theirWords(text: string, messages: readonly string[]): string | null {
  const wanted = fold(text);
  if ([...wanted].length < 2) return null;
  const folded = messages.map(message => ({ message: trimmed(message), body: fold(message) }));
  // Found inside another message that goes on past it (or says no to it), it is no longer clear what they meant: not theirs.
  if (folded.some(({ body }) => body !== wanted && body.includes(wanted))) return null;
  return folded.find(({ body }) => body === wanted)?.message ?? null;
}

/**
 * Whether a quote is a real stretch of what the person said: within a message once spacing, punctuation and case are set aside, and a stretch
 * that means something — a whole message, or at least six characters in three or more units (Chinese characters, words, numbers). A word or two
 * out of a message is not “what they said”: it can be found in almost anything. Used to tell an inference from a request the person made
 * (the evidence on a suggestion drawn out of their work); it does not make a memory theirs, `theirWords` does.
 */
export function quotedFrom(quote: string, spoken: readonly string[]): boolean {
  const needle = normalized(quote), length = [...needle].length;
  if (length < 2) return false;
  const substantial = length >= 6 && (quote.normalize("NFKC").toLowerCase().match(/[一-鿿]|[a-z0-9]+/g) ?? []).length >= 3;
  return spoken.some(text => { const body = normalized(text); return body === needle || (substantial && body.includes(needle)); });
}
