/**
 * A bound on text, counted in UTF-16 units as the Host's limits are. A cut between the two halves of a character drops the lone half
 * instead of keeping it; text within the limit comes back as it was. One copy for the Host: the contextual request's bounds and the
 * drafting material use the same rule.
 */
export const cutHead = (text: string, max: number): string => text.length <= max ? text : text.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "");
export const cutTail = (text: string, max: number): string => text.length <= max ? text : text.slice(-max).replace(/^[\uDC00-\uDFFF]/u, "");
