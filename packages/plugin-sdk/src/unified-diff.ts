import type { TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The unified diff format, both ways (PG-062, the SDK's `/diff-view`): reading the hunks a producer already computed, and writing
 * the rows a reader shows as a patch git takes.
 *
 * A producer such as a Coding round carries a per-file unified diff rather than both ends of the text. Recomputing a comparison
 * from it is impossible — the diff only contains the lines that changed plus a few around them — so a reader reads the hunks it
 * was given instead of pretending it has the whole file. That difference is visible in the view: a comparison built this way is
 * marked `partial`, because the rows are the hunks and not the file.
 *
 * Its refusals are Diff's (`diff.unified.*`), which wrote this reading first; tooling/gates/error-owners.json names this file Diff's.
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

export const unifiedErrors = defineErrorCodes("diff.unified", {
  no_hunks: "invalid",
  bad_header: "invalid",
  count_mismatch: "invalid",
});

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
      throw unifiedErrors.count_mismatch(`hunk 行数与 @@ 头不一致：声明 ${expectedBefore}/${expectedAfter}，实际 ${sawBefore}/${sawAfter}`,
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
        throw unifiedErrors.bad_header(`读不懂的 hunk 头：${line.slice(0, 80)}`);
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
    throw unifiedErrors.no_hunks("这段 diff 里没有可读的 hunk");
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

/**
 * The rows of a comparison as one unified patch (specs/visual-ui-experience §code-diff「复制代码/补丁内容明确且等真实结果」,
 * VUX-33): what 复制补丁 copies. It is written from the rows the reader shows, so it is the change on screen whether it came
 * from both ends of the text or from a producer's hunks, and `git apply` takes it: three lines of context, hunks split where
 * the line numbers jump (a producer's hunks keep their own gaps), each line with its own ending (a CRLF stays a CRLF), and
 * `\ No newline at end of file` after a last line without one. A new file is from `/dev/null`, a removed one to it. No
 * changed row, no patch: the empty string.
 */
export interface UnifiedPatchFile {
  path: string;
  created?: boolean;
  removed?: boolean;
}

const CONTEXT = 3;

type Side = "before_number" | "after_number";

export function unifiedPatch(rows: readonly TextDiffRow[], file: UnifiedPatchFile): string {
  if (!rows.some((row) => row.kind !== "equal")) return "";
  // The last number on each side before each row (0 at the top), so a row only on one side knows where it sits.
  const last = { before_number: [0], after_number: [0] };
  rows.forEach((row, index) => { for (const key of ["before_number", "after_number"] as const) last[key].push(row[key] ?? last[key][index]!); });
  // A row follows the one before it when its numbers are the next ones: a gap between a producer's hunks is never bridged.
  const follows = (index: number) => (["before_number", "after_number"] as const).every((key) => rows[index]![key] === undefined || rows[index]![key] === last[key][index]! + 1);
  const near = rows.map(() => false);
  rows.forEach((row, index) => {
    if (row.kind === "equal") return;
    for (let k = index; k >= 0 && index - k <= CONTEXT; k--) { near[k] = true; if (!follows(k)) break; }
    for (let k = index; k < rows.length && k - index <= CONTEXT; k++) { near[k] = true; if (k + 1 < rows.length && !follows(k + 1)) break; }
  });
  const hunks: Array<[number, number]> = [];
  rows.forEach((_row, index) => {
    if (!near[index]) return;
    const open = hunks.at(-1);
    if (open && open[1] === index - 1 && follows(index)) open[1] = index; else hunks.push([index, index]);
  });
  const out = [`--- ${file.created ? "/dev/null" : `a/${file.path}`}\n`, `+++ ${file.removed ? "/dev/null" : `b/${file.path}`}\n`];
  for (const [from, to] of hunks) {
    const part = rows.slice(from, to + 1);
    // An empty side starts at the line before the hunk (0 at the top of the file), as diff writes it.
    const range = (key: Side) => {
      const count = part.filter((row) => row[key] !== undefined).length;
      return `${count ? part.find((row) => row[key] !== undefined)![key] : last[key][from]}${count === 1 ? "" : `,${count}`}`;
    };
    out.push(`@@ -${range("before_number")} +${range("after_number")} @@\n`);
    for (const row of part) {
      out.push(`${row.kind === "insert" ? "+" : row.kind === "delete" ? "-" : " "}${row.text}${row.ending === "" ? "\n\\ No newline at end of file\n" : row.ending}`);
    }
  }
  return out.join("");
}
