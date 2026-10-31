/** `text` without half a character at either end: a low half left at the start or a high half left at the end, the other half having been cut off. */
export const wholeEnds = (text: string): string => text.replace(/^[\udc00-\udfff]|[\ud800-\udbff]$/gu, "");
