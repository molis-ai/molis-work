/**
 * A bound on text: counted in UTF-16 units (the unit most limits here use) or in characters (the unit a schema's `maxLength`
 * counts). A cut between the two halves of a character drops the lone half instead of keeping it; text within the limit comes
 * back as it was. One copy for plugins and the platform: the contextual request's bounds, the drafting material and the
 * services' text fields use this rather than each keeping its own slice-and-trim.
 *
 * Every bound (`max`, `limit`) is a non-negative integer. A cut keeps whole code points, not whole grapheme clusters: an emoji
 * built from several code points (a ZWJ family, a flag, a keycap) can be cut between them, and that is the documented rule here.
 * A zero or negative bound has no useful meaning; its current behaviour is recorded as a MISC line and is not part of this API.
 */

/** The first `max` UTF-16 units of `text`, whole characters (code points, not grapheme clusters); text within the limit comes back as it was. `max` is a non-negative integer. */
export const cutHead = (text: string, max: number): string => text.length <= max ? text : text.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "");

/** The last `max` UTF-16 units of `text`, whole characters (code points, not grapheme clusters); text within the limit comes back as it was. `max` is a non-negative integer. */
export const cutTail = (text: string, max: number): string => text.length <= max ? text : text.slice(-max).replace(/^[\uDC00-\uDFFF]/u, "");

/** The first `limit` characters of `text`, whole code points: at most `2 * limit` units are spread into characters, never the whole text. `limit` is a non-negative integer. */
export const cutCharacters = (text: string, limit: number): string => [...text.slice(0, 2 * limit)].slice(0, limit).join("");

/** Whether `text` has more than `limit` characters (a schema's `maxLength`): a text of more than `2 * limit` units already has, so it is decided without spreading. `limit` is a non-negative integer. */
export const exceedsCharacters = (text: string, limit: number): boolean => text.length > 2 * limit || [...text].length > limit;
