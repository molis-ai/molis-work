import type { UiPageMessages } from "@molis-ai/molis-work-contracts/platform/ui";
/** Browser-only ports and view state; Pages owns the corresponding HTTP records. */
export interface CommentSideHost {
  messages: UiPageMessages;
  translate(value: string): string;
  projectId: string | (() => string);
  /** A platform path in the current project. */
  route(path: string): string;
  /** A path under this plugin's own routes in the current project. */
  pluginRoute(path: string): string;
}
export interface CommentDraft {
  body: string; ai: boolean; reply_to: string | null; request_id: string; message_id?: string;
  includeDraft?: boolean; anchor?: { kind: "document" | "text"; mark_id?: string }; excerpt?: string;
}
export interface CommentOpening { open_id: string; page_id: string; mark_id: string | null; excerpt?: string }
export interface CommentCommandResult {
  text?: string; version: number; notes: Array<{ index: number; text: string; note: string }>;
}
export interface PendingCommentCommand {
  resolve(value: CommentCommandResult): void; reject(reason: Error): void; timeout: number; page: string;
  /** What was asked and under which context epoch: a command the page refused as asked under an older context goes again. */
  value: object; epoch: number; stale?: boolean;
}
export interface CommentElements {
  draft: HTMLTextAreaElement; "include-draft": HTMLInputElement; form: HTMLFormElement;
  ai: HTMLButtonElement; send: HTMLButtonElement;
  reload: HTMLButtonElement; new: HTMLButtonElement; reply: HTMLButtonElement; locate: HTMLButtonElement;
  error: HTMLElement; title: HTMLElement; threads: HTMLElement; quote: HTMLElement; messages: HTMLElement;
  run: HTMLElement; notes: HTMLElement; discussion: HTMLElement; scope: HTMLElement; unsaved: HTMLElement;
}
export function commentErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
