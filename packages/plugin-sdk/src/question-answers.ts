/**
 * What a question card sends back, as an Agent run takes it (specs/ai-interaction-experience A1, A2, T1).
 *
 * The Host draws one question card for every surface that shows an Agent's waiting questions (the Assistant, Coding), and
 * names its fields by what they answer: in a questionnaire, `q<n>` for choice question `n`, and `t<n>`, `n<n>`, `d<n>`,
 * `w<n>` for a text, number, date or date-and-time question; `pick` and `text` for a question asked in words with options
 * beside it. The card's shared client reads the fields back by those names; this turns them into the run's answer, the same
 * way in the page and on the Host. The name is only how a field is read: whether the answer fits its question is the
 * Runtime's to judge, against the question it holds, so a field sent under another name is refused there, not here.
 *
 * A questionnaire is answered question by question (every question once, one left untouched as an empty pick or `null`); a
 * number that reads as one goes as a number and anything else as written, for the rules to refuse; a date and time goes in
 * this computer's time zone. A question in words goes with the words written, or else the option picked. Nothing given is
 * `null`, so the surface asks for an answer instead of sending an empty one. A date and time is written with this
 * computer's offset on that day; one with an unreadable part goes as written.
 *
 * Self-contained on purpose (no imports at run time, no module state): a page factory embeds it as text.
 */
export function questionAnswer(values: unknown):
  { answers: Array<{ question: number; indexes: number[]; other?: string } | { question: number; value: string | number | null }> } | { text: string } | null {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const held = values as Record<string, unknown>;
  const picked = (value: unknown): string[] => {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { picked?: unknown }).picked : typeof value === "string" && value ? [value] : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  };
  const trim = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const two = (n: number) => String(n).padStart(2, "0");
  const moment = (value: unknown): string | null => {
    const { date: d, time: t } = (value && typeof value === "object" ? value : {}) as { date?: unknown; time?: unknown };
    const date = trim(d), time = trim(t), day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), at = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!day || !at) return date || time ? `${date}T${time}` : null;
    const off = -new Date(+day[1]!, +day[2]! - 1, +day[3]!, +at[1]!, +at[2]!).getTimezoneOffset(), size = Math.abs(off);
    return `${date}T${two(+at[1]!)}:${at[2]}${off < 0 ? "-" : "+"}${two(Math.floor(size / 60))}:${two(size % 60)}`;
  };
  const typed: Record<string, (value: unknown) => string | number | null> = {
    t: value => trim(value) || null, d: value => trim(value) || null, w: moment,
    n: value => { const text = trim(value); return !text ? null : /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : text; },
  };
  const numbered = Object.keys(held).filter(id => /^[qtndw]\d+$/.test(id));
  if (numbered.length) {
    return { answers: numbered.map(id => {
      const question = Number(id.slice(1)), read = typed[id[0]!];
      if (read) return { question, value: read(held[id]) };
      const own = trim(held[id] && typeof held[id] === "object" && !Array.isArray(held[id]) ? (held[id] as { other?: unknown }).other : undefined);
      return { question, indexes: picked(held[id]).map(Number).filter(Number.isSafeInteger), ...(own ? { other: own } : {}) };
    }) };
  }
  const text = trim(held.text);
  const pick = picked(held.pick)[0];
  return text ? { text } : pick ? { text: pick } : null;
}
