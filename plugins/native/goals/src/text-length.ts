/**
 * Whether `value` holds at most `limit` characters (code points): one character may take two UTF-16 units, so a string of more than
 * `limit * 2` units is over the limit whatever it holds and only a shorter one is spread. Shared by the Goals entry points that
 * bound text they did not write (a create form's fields, a progress report's source, a project guidance entry).
 */
export function withinCharacters(value: string, limit: number): boolean {
  return value.length <= limit * 2 && [...value].length <= limit;
}
