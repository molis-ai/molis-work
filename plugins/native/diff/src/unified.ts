import type { TextDiffRow } from "./text-diff.js";

/**
 * Reading a unified diff that somebody else already computed.
 *
 * Coding's change set carries a per-file unified diff rather than both ends of
 * the text, because that is what a Run produces. Recomputing a comparison from
 * it is impossible — the diff only contains the lines that changed plus a few
 * around them — so Diff reads the hunks it was given instead of pretending it
 * has the whole file.
 *
 * That difference is visible in the view: a comparison built this way is marked
 * `partial`, because the rows are the hunks and not the file.
 */

export interface UnifiedHunk {
  before_start: number;
  before_count: number;
  after_start: number;
  after_count: number;
  /** The `@@ ... @@` trailer, usually the enclosing function. Empty when absent. */
  section: string;
  rows: readonly TextDiffRow[];
}

export class UnifiedDiffError extends Error {
  constructor(readonly code: "unified.no_hunks" | "unified.bad_header" | "unified.count_mismatch", message: string) {
    super(message);
    this.name = "UnifiedDiffError";
  }
}

const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/u;

/**
 * Split a unified diff into hunks.
 *
 * Lines before the first `@@` are dropped: `---`/`+++`/`diff --git` headers name
 * the file, which the change set already says, and trusting a path from inside
 * the diff body would let a producer contradict the path it declared.
 */
export function parseUnifiedDiff(diff: string): UnifiedHunk[] {
  const lines = diff.split("\n");
  // A unified diff normally ends with a newline, which `split` turns into one
  // trailing empty element. That element is not a line of either side, and
  // counting it as a context line makes every hunk one line too long.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const hunks: UnifiedHunk[] = [];
  let current: { header: RegExpExecArray; rows: TextDiffRow[]; before: number; after: number } | undefined;

  const close = (): void => {
    if (current === undefined) return;
    const expectedBefore = current.header[2] === undefined ? 1 : Number(current.header[2]);
    const expectedAfter = current.header[4] === undefined ? 1 : Number(current.header[4]);
    const sawBefore = current.rows.filter((row) => row.kind !== "insert").length;
    const sawAfter = current.rows.filter((row) => row.kind !== "delete").length;
    if (sawBefore !== expectedBefore || sawAfter !== expectedAfter) {
      throw new UnifiedDiffError(
        "unified.count_mismatch",
        `hunk 行数与 @@ 头不一致：声明 ${expectedBefore}/${expectedAfter}，实际 ${sawBefore}/${sawAfter}`,
      );
    }
    hunks.push({
      before_start: Number(current.header[1]),
      before_count: expectedBefore,
      after_start: Number(current.header[3]),
      after_count: expectedAfter,
      section: current.header[5] ?? "",
      rows: current.rows,
    });
    current = undefined;
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      close();
      const header = HEADER.exec(line);
      if (header === null) {
        throw new UnifiedDiffError("unified.bad_header", `读不懂的 hunk 头：${line.slice(0, 80)}`);
      }
      current = {
        header,
        rows: [],
        before: Number(header[1]),
        after: Number(header[3]),
      };
      continue;
    }
    if (current === undefined) continue;
    // Git's marker for a missing trailing newline annotates the line above; it
    // is not a line of either side and must not advance a counter.
    if (line.startsWith("\\")) continue;
    const marker = line.length === 0 ? " " : line[0];
    const text = line.length === 0 ? "" : line.slice(1);
    if (marker === "+") {
      current.rows.push({ kind: "insert", before_number: undefined, after_number: current.after, text, ending: "\n" });
      current.after += 1;
    } else if (marker === "-") {
      current.rows.push({ kind: "delete", before_number: current.before, after_number: undefined, text, ending: "\n" });
      current.before += 1;
    } else if (marker === " ") {
      current.rows.push({ kind: "equal", before_number: current.before, after_number: current.after, text, ending: "\n" });
      current.before += 1;
      current.after += 1;
    } else {
      // Anything else between hunks is not part of this file's change.
      continue;
    }
  }
  close();
  if (hunks.length === 0) {
    throw new UnifiedDiffError("unified.no_hunks", "这段 diff 里没有可读的 hunk");
  }
  return hunks;
}

export function hunkRows(hunks: readonly UnifiedHunk[]): TextDiffRow[] {
  return hunks.flatMap((hunk) => [...hunk.rows]);
}

export function countChangedLines(hunks: readonly UnifiedHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const row of hunk.rows) {
      if (row.kind === "insert") added += 1;
      else if (row.kind === "delete") removed += 1;
    }
  }
  return { added, removed };
}
