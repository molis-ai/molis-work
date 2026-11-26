const MAX_OAUTH_PATTERN_LENGTH = 256;
export const MAX_OAUTH_SETTING_VALUE_LENGTH = 1024;

interface GroupState {
  hasQuantifier: boolean;
  hasAlternation: boolean;
}

function readQuantifier(pattern: string, start: number): { readonly end: number; readonly repeating: boolean } | null {
  const ch = pattern[start];
  if (ch === "+" || ch === "*") {
    return { end: start + (pattern[start + 1] === "?" ? 2 : 1), repeating: true };
  }
  if (ch === "?") {
    return { end: start + (pattern[start + 1] === "?" ? 2 : 1), repeating: false };
  }
  if (ch === "{") {
    const match = /^\{(\d+)(?:,(\d*))?\}\??/u.exec(pattern.slice(start));
    if (!match) return null;
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[2] === "" ? Number.POSITIVE_INFINITY : Number(match[2]);
    return { end: start + match[0].length, repeating: max > 1 };
  }
  return null;
}

/**
 * Rejects oversized, invalid, lookaround, backreference, or nested-quantifier OAuth setting patterns
 * so untrusted integration manifests cannot trigger catastrophic regex backtracking (Q-cf2-04).
 */
export function isSafeOAuthPattern(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_OAUTH_PATTERN_LENGTH) return false;
  const groups: GroupState[] = [];
  let inClass = false;
  let lastAtom: "none" | "atom" | "quantifier" | "group" = "none";
  let lastGroup: GroupState | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index]!;
    if (ch === "\\") {
      const escaped = value[index + 1];
      if (!escaped) return false;
      if (!inClass && (/[1-9]/u.test(escaped) || escaped === "k")) return false;
      index += 1;
      if (!inClass) {
        lastAtom = "atom";
        lastGroup = null;
      }
      continue;
    }
    if (inClass) {
      if (ch === "]") {
        inClass = false;
        lastAtom = "atom";
        lastGroup = null;
      }
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      if (value[index + 1] === "?") {
        const marker = value[index + 2];
        if (marker === ":") {
          index += 2;
        } else if (marker === "<" && value[index + 3] !== "=" && value[index + 3] !== "!") {
          index += 2;
        } else {
          return false;
        }
      }
      groups.push({ hasQuantifier: false, hasAlternation: false });
      lastAtom = "none";
      lastGroup = null;
      continue;
    }
    if (ch === ")") {
      const closed = groups.pop();
      if (!closed) return false;
      const parent = groups[groups.length - 1];
      if (parent && closed.hasQuantifier) parent.hasQuantifier = true;
      lastAtom = "group";
      lastGroup = closed;
      continue;
    }
    if (ch === "|") {
      const current = groups[groups.length - 1];
      if (current) current.hasAlternation = true;
      lastAtom = "none";
      lastGroup = null;
      continue;
    }
    const quantifier = readQuantifier(value, index);
    if (quantifier) {
      if (lastAtom === "quantifier" || lastAtom === "none") return false;
      if (quantifier.repeating && lastAtom === "group" && lastGroup && (lastGroup.hasQuantifier || lastGroup.hasAlternation)) {
        return false;
      }
      const current = groups[groups.length - 1];
      if (current) current.hasQuantifier = true;
      index = quantifier.end - 1;
      lastAtom = "quantifier";
      lastGroup = null;
      continue;
    }
    lastAtom = "atom";
    lastGroup = null;
  }
  if (inClass || groups.length > 0) return false;
  try {
    return new RegExp(`^(?:${value})$`, "u") instanceof RegExp;
  } catch {
    return false;
  }
}
