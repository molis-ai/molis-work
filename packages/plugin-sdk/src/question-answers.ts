/**
 * What a question card sends back, as an Agent run takes it (specs/ai-interaction-experience A1, A2).
 *
 * The Host draws one question card for every surface that shows an Agent's waiting questions (the Assistant, Coding), and
 * names its fields by what they answer: `q<n>` for question `n` of a questionnaire, `pick` and `text` for a question asked
 * in words with options beside it. The card's shared client reads the fields back by those names; this turns them into
 * the run's answer, the same way in the page and on the Host. A questionnaire is answered question by question (every
 * question once, one left untouched as an empty pick); a question in words with the words written, or else the option
 * picked. Nothing given is `null`, so the surface asks for an answer instead of sending an empty one.
 *
 * Self-contained on purpose (no imports at run time, no module state): a page factory embeds it as text.
 */
export function questionAnswer(values: unknown):
  { answers: Array<{ question: number; indexes: number[]; other?: string }> } | { text: string } | null {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const held = values as Record<string, unknown>;
  const picked = (value: unknown): string[] => {
    const list = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { picked?: unknown }).picked : typeof value === "string" && value ? [value] : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  };
  const numbered = Object.keys(held).filter(id => /^q\d+$/.test(id));
  if (numbered.length) {
    return { answers: numbered.map(id => {
      const other = held[id] && typeof held[id] === "object" && !Array.isArray(held[id]) ? (held[id] as { other?: unknown }).other : undefined;
      const written = typeof other === "string" ? other.trim() : "";
      return { question: Number(id.slice(1)), indexes: picked(held[id]).map(Number).filter(Number.isSafeInteger), ...(written ? { other: written } : {}) };
    }) };
  }
  const text = typeof held.text === "string" ? held.text.trim() : "";
  const pick = picked(held.pick)[0];
  return text ? { text } : pick ? { text: pick } : null;
}
