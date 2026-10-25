/**
 * How the note of a step a person inserted into a round's plan starts, and what precedes its acceptance: the Coding routes word it
 * (routes-timeline.ts), the report (report-steps.ts) and the page (src/browser/) read the acceptance back out of it.
 */
export const INSERTED_NOTE_HEAD = "用户插入";
export const ACCEPTANCE_HEAD = "完成条件：";

/** The acceptance a person's inserted step carries, read back out of the first report that is its insert note; undefined when it has none. */
export function insertedAcceptance(reports: readonly { readonly note: string }[]): string | undefined {
  return reports.find(report => report.note.startsWith(INSERTED_NOTE_HEAD))?.note.split(ACCEPTANCE_HEAD)[1];
}
