import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const say = globalThis.say;
const t = globalThis.t;

/** The page can retain an unbounded original refusal or question alongside its own stable words. */
export type IssueNote = string | { text: OwnedTextRef; question?: string; models?: true };

export function issueNote(key: string, options?: { question?: string; models?: true }): IssueNote {
  return { text: { owner: "io.molis.work.issues", key }, ...options };
}

export function issueNoteText(note: IssueNote | undefined, missingShots?: boolean): string {
  const body = typeof note === "string" ? note : note ? say.text(note.text) + (note.question ? " " + note.question : "") : "";
  return missingShots ? body + " " + t.text("issues.capture.unfinished-shots") : body;
}

export const issueNoteModels = (note?: IssueNote): boolean => typeof note === "object" && note?.models === true;
