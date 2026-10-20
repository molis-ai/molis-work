/**
 * Path patterns for `knowledge.glob` and `knowledge.grep` (specs/project-knowledge §7): `*` and `?` within one folder name,
 * `**` across folders, `{a,b}` alternatives. Matching works segment by segment and never builds a regular expression from the
 * caller's text, so no pattern can stall the Host.
 */

const MAX_ALTERNATIVES = 32;
const WILD = /[*?{]/u;

/** `{a,b}` written out, innermost last; at most `MAX_ALTERNATIVES` patterns, and an unclosed brace is literal. */
function expand(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open < 0) return [pattern];
  let depth = 0, close = -1;
  const cuts: number[] = [];
  for (let index = open; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) { close = index; break; }
    else if (char === "," && depth === 1) cuts.push(index);
  }
  if (close < 0) return [pattern];
  const bounds = [open, ...cuts, close];
  const head = pattern.slice(0, open), tail = pattern.slice(close + 1);
  const out: string[] = [];
  for (let index = 0; index < bounds.length - 1 && out.length < MAX_ALTERNATIVES; index += 1) {
    for (const each of expand(head + pattern.slice(bounds[index]! + 1, bounds[index + 1]) + tail)) {
      if (out.length >= MAX_ALTERNATIVES) break;
      out.push(each);
    }
  }
  return out;
}

/** One folder or file name against one pattern segment: `*` any run, `?` one character (linear backtracking, no regex). */
export function nameMatches(segment: string, name: string): boolean {
  let s = 0, n = 0, star = -1, mark = 0;
  while (n < name.length) {
    if (s < segment.length && (segment[s] === "?" || segment[s] === name[n])) { s += 1; n += 1; }
    else if (s < segment.length && segment[s] === "*") { star = s; mark = n; s += 1; }
    else if (star >= 0) { s = star + 1; mark += 1; n = mark; }
    else return false;
  }
  while (s < segment.length && segment[s] === "*") s += 1;
  return s === segment.length;
}

/** A name starting with "." is hidden: only a segment that itself starts with "." reaches it. */
const segmentMatches = (segment: string, name: string) => (!name.startsWith(".") || segment.startsWith(".")) && nameMatches(segment, name);

export interface PathPattern {
  /** The pattern's alternatives, each split into folder segments. */
  readonly alternatives: readonly (readonly string[])[];
  /** The folders a walk starts from: each alternative's leading names that have no wildcard. */
  readonly starts: readonly (readonly string[])[];
  /** Whether a file at this path (relative to the folder) matches. */
  matches(path: readonly string[]): boolean;
  /** Whether a file under this folder could match: the walk enters only such folders. */
  mayContain(path: readonly string[]): boolean;
  /** Whether the pattern names this folder itself (so a skipped or hidden folder is entered). */
  names(name: string): boolean;
}

function walkMatch(segments: readonly string[], path: readonly string[], prefix: boolean): boolean {
  const seen = new Map<number, boolean>();
  const at = (i: number, j: number): boolean => {
    const key = i * 1024 + j;
    const known = seen.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (j === path.length) result = prefix ? i < segments.length : i === segments.length || (segments[i] === "**" && at(i + 1, j));
    else if (i === segments.length) result = false;
    else if (segments[i] === "**") result = at(i + 1, j) || (!path[j]!.startsWith(".") && at(i, j + 1));
    else result = segmentMatches(segments[i]!, path[j]!) && at(i + 1, j + 1);
    seen.set(key, result);
    return result;
  };
  return at(0, 0);
}

/** Null when the pattern names nothing a relative path could be (empty, absolute, or climbing out with `..`). */
export function pathPattern(pattern: string): PathPattern | null {
  const alternatives = expand(pattern.trim()).map(each => each.split("/").filter(segment => segment && segment !== "."))
    .map(segments => segments.filter((segment, index) => segment !== "**" || segments[index - 1] !== "**"));
  if (!alternatives.length || alternatives.some(segments => !segments.length || segments.includes("..")) || pattern.trim().startsWith("/")) return null;
  const starts = alternatives.map(segments => {
    const literal: string[] = [];
    for (const segment of segments.slice(0, -1)) { if (WILD.test(segment)) break; literal.push(segment); }
    return literal;
  });
  // A start inside another start is walked by it.
  const outer = starts.filter((start, index) => !starts.some((other, at) => at !== index && other.length <= start.length
    && other.every((name, k) => start[k] === name) && (other.length < start.length || at < index)));
  return {
    alternatives,
    starts: outer,
    matches: path => alternatives.some(segments => walkMatch(segments, path, false)),
    mayContain: path => alternatives.some(segments => walkMatch(segments, path, true)),
    names: name => alternatives.some(segments => segments.some(segment => segment === name || (name.startsWith(".") && segment.startsWith(".") && nameMatches(segment, name)))),
  };
}
