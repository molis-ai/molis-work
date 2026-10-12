/**
 * A page program as the browser receives it. A program is written as a template string in the source, with its indentation, blank
 * lines and comment-only lines; none of that is worth sending to every page. Lines are only trimmed or dropped, never joined, so
 * every statement keeps its ending. A program with a multi-line string or template literal of its own must not go through this.
 */
export const compactScript = (source: string): string =>
  source.split("\n").map(line => line.trimStart()).filter(line => line && !line.startsWith("//")).join("\n");
