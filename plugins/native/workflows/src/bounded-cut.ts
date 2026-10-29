/**
 * Cutting a text to its first characters without spreading all of it: the pieces of text Workflows keeps (titles, templates, names,
 * the text a judgment reads) come from other plugins, a model or a request, and the text may be a whole document.
 * A character is one or two UTF-16 units (an emoji is two), so `limit` characters never take more than `2 * limit` units.
 * Only those units are spread into characters, and the result is the same as spreading everything: the work and the memory
 * are in proportion to the limit, not to the text.
 */

/** The first `limit` characters of `text`, whole: a character of two units is never cut in half. */
export function firstCharacters(text: string, limit: number): string {
  return [...text.slice(0, 2 * limit)].slice(0, limit).join("");
}

/** Whether `text` is longer than `limit` characters. More than `2 * limit` units is already more than `limit` characters (a character is at most two), so such a text is not spread to be counted. */
export function exceedsCharacters(text: string, limit: number): boolean {
  return text.length > 2 * limit || [...text].length > limit;
}
