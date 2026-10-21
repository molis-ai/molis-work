import type { TextDiffRow } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

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
