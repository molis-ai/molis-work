/**
 * Bounded line comparison.
 *
 * Line endings are preserved exactly: no trimming, no CRLF normalisation. A
 * comparison that silently agreed CRLF and LF were the same line would hide
 * precisely the change some diffs exist to show.
 *
 * The middle region runs an LCS within a step budget. Past the budget it
 * degrades to a whole delete plus a whole insert — coarse, but still complete.
 * Losing lines would be worse than showing a blunt answer, and the view says
 * which one it gave.
 */

export const DIFF_STEP_BUDGET = 200_000;

export interface DiffLine {
  readonly text: string;
  readonly ending: string;
}

export type DiffOp =
  | { readonly kind: "equal"; readonly line: DiffLine; readonly before: number; readonly after: number }
  | { readonly kind: "delete"; readonly line: DiffLine; readonly before: number }
  | { readonly kind: "insert"; readonly line: DiffLine; readonly after: number };

export interface TextDiff {
  readonly identical: boolean;
  readonly empty: boolean;
  /** True when the budget was exceeded and the middle degraded to delete+insert. */
  readonly coarse: boolean;
  readonly ops: readonly DiffOp[];
}

export function splitLines(text: string): DiffLine[] {
  if (text.length === 0) return [];
  const lines: DiffLine[] = [];
  let index = 0;
  while (index < text.length) {
    const start = index;
    while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
    const content = text.slice(start, index);
    let ending = "";
    if (index < text.length) {
      if (text[index] === "\r" && text[index + 1] === "\n") {
        ending = "\r\n";
        index += 2;
      } else {
        ending = text[index]!;
        index += 1;
      }
    }
    lines.push({ text: content, ending });
  }
  return lines;
}

export function joinLines(lines: readonly DiffLine[]): string {
  let text = "";
  for (const line of lines) text += line.text + line.ending;
  return text;
}

/** Rebuild both sides from the ops, so a round trip can be asserted. */
export function reconstructSides(ops: readonly DiffOp[]): { before: string; after: string } {
  const before: DiffLine[] = [];
  const after: DiffLine[] = [];
  for (const op of ops) {
    if (op.kind !== "insert") before.push(op.line);
    if (op.kind !== "delete") after.push(op.line);
  }
  return { before: joinLines(before), after: joinLines(after) };
}

/**
 * Identity of a line, ending included — which is what keeps CRLF visible.
 *
 * Putting the ending first needs no separator: it is made only of CR and LF,
 * and `splitLines` guarantees the text contains neither, so the boundary is
 * exactly where the leading run of CR/LF stops. Two different lines therefore
 * cannot collide on one key.
 */
function lineKey(line: DiffLine): string {
  return line.ending + line.text;
}

export function compareTexts(before: string, after: string): TextDiff {
  if (before === after) {
    const lines = splitLines(before);
    return {
      identical: true,
      empty: before.length === 0,
      coarse: false,
      ops: lines.map((line, index) => ({
        kind: "equal" as const,
        line,
        before: index + 1,
        after: index + 1,
      })),
    };
  }

  const a = splitLines(before);
  const b = splitLines(after);
  const keysA = a.map(lineKey);
  const keysB = b.map(lineKey);
  let a0 = 0;
  let a1 = a.length;
  let b0 = 0;
  let b1 = b.length;
  const head: DiffOp[] = [];
  while (a0 < a1 && b0 < b1 && keysA[a0] === keysB[b0]) {
    head.push({ kind: "equal", line: a[a0]!, before: a0 + 1, after: b0 + 1 });
    a0 += 1;
    b0 += 1;
  }
  const tail: DiffOp[] = [];
  while (a0 < a1 && b0 < b1 && keysA[a1 - 1] === keysB[b1 - 1]) {
    a1 -= 1;
    b1 -= 1;
    tail.push({ kind: "equal", line: a[a1]!, before: a1 + 1, after: b1 + 1 });
  }
  tail.reverse();
  const middle = diffMiddle(a, b, keysA, keysB, a0, a1, b0, b1);
  return {
    identical: false,
    empty: false,
    coarse: middle.coarse,
    ops: [...head, ...middle.ops, ...tail],
  };
}

function diffMiddle(
  a: readonly DiffLine[],
  b: readonly DiffLine[],
  keysA: readonly string[],
  keysB: readonly string[],
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { coarse: boolean; ops: DiffOp[] } {
  const n = a1 - a0;
  const m = b1 - b0;
  if (n === 0) return { coarse: false, ops: insertRange(b, b0, b1) };
  if (m === 0) return { coarse: false, ops: deleteRange(a, a0, a1) };
  if (n * m > DIFF_STEP_BUDGET) {
    return { coarse: true, ops: [...deleteRange(a, a0, a1), ...insertRange(b, b0, b1)] };
  }

  const stride = m + 1;
  const dp = new Int32Array((n + 1) * stride);
  for (let i = 1; i <= n; i += 1) {
    const row = i * stride;
    const prev = (i - 1) * stride;
    const ak = keysA[a0 + i - 1];
    for (let j = 1; j <= m; j += 1) {
      if (ak === keysB[b0 + j - 1]) dp[row + j] = dp[prev + j - 1]! + 1;
      else {
        const up = dp[prev + j]!;
        const left = dp[row + j - 1]!;
        dp[row + j] = up >= left ? up : left;
      }
    }
  }

  const reversed: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (keysA[a0 + i - 1] === keysB[b0 + j - 1]) {
      reversed.push({ kind: "equal", line: a[a0 + i - 1]!, before: a0 + i, after: b0 + j });
      i -= 1;
      j -= 1;
      continue;
    }
    if (dp[(i - 1) * stride + j]! > dp[i * stride + (j - 1)]!) {
      reversed.push({ kind: "delete", line: a[a0 + i - 1]!, before: a0 + i });
      i -= 1;
    } else {
      reversed.push({ kind: "insert", line: b[b0 + j - 1]!, after: b0 + j });
      j -= 1;
    }
  }
  while (i > 0) {
    reversed.push({ kind: "delete", line: a[a0 + i - 1]!, before: a0 + i });
    i -= 1;
  }
  while (j > 0) {
    reversed.push({ kind: "insert", line: b[b0 + j - 1]!, after: b0 + j });
    j -= 1;
  }
  reversed.reverse();
  return { coarse: false, ops: reversed };
}

function deleteRange(lines: readonly DiffLine[], start: number, end: number): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let index = start; index < end; index += 1) {
    ops.push({ kind: "delete", line: lines[index]!, before: index + 1 });
  }
  return ops;
}

function insertRange(lines: readonly DiffLine[], start: number, end: number): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let index = start; index < end; index += 1) {
    ops.push({ kind: "insert", line: lines[index]!, after: index + 1 });
  }
  return ops;
}

/** One rendered row. Carries no project, Artifact or source fields. */
export interface TextDiffRow {
  readonly kind: DiffOp["kind"];
  readonly before_number: number | undefined;
  readonly after_number: number | undefined;
  readonly text: string;
  readonly ending: string;
}

export function textDiffRow(op: DiffOp): TextDiffRow {
  return {
    kind: op.kind,
    before_number: op.kind === "insert" ? undefined : op.before,
    after_number: op.kind === "delete" ? undefined : op.after,
    text: op.line.text,
    ending: op.line.ending,
  };
}

export interface SplitPair {
  readonly left: TextDiffRow | undefined;
  readonly right: TextDiffRow | undefined;
}

/**
 * Collect a run of changes into two columns and zip them.
 *
 * Pairing adjacent delete/insert one at a time would align `A,B` deleted and
 * `C,D` inserted as (A,C), then B alone, then D alone. Collecting the whole run
 * first aligns (A,C) and (B,D), which is what the change actually looks like.
 */
export function alignSplitRows(rows: readonly TextDiffRow[]): SplitPair[] {
  const pairs: SplitPair[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index]!;
    if (row.kind === "equal") {
      pairs.push({ left: row, right: row });
      index += 1;
      continue;
    }
    const deletions: TextDiffRow[] = [];
    const insertions: TextDiffRow[] = [];
    while (index < rows.length && rows[index]!.kind !== "equal") {
      const current = rows[index]!;
      if (current.kind === "delete") deletions.push(current);
      else insertions.push(current);
      index += 1;
    }
    const count = Math.max(deletions.length, insertions.length);
    for (let offset = 0; offset < count; offset += 1) {
      pairs.push({ left: deletions[offset], right: insertions[offset] });
    }
  }
  return pairs;
}
