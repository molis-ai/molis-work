/**
 * Types of the bounded line comparison: what it returns and the rows a view draws.
 * The code that produces them (compareTexts, splitLines, textDiffRow, alignSplitRows and their budget) is in the plugin SDK.
 */

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

/** One rendered row. Carries no project, Artifact or source fields. */
export interface TextDiffRow {
  readonly kind: DiffOp["kind"];
  readonly before_number: number | undefined;
  readonly after_number: number | undefined;
  readonly text: string;
  readonly ending: string;
}

export interface SplitPair {
  readonly left: TextDiffRow | undefined;
  readonly right: TextDiffRow | undefined;
}
