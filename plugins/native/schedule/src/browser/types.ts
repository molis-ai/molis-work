import type { UiClientTranslate, UiPageView, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type Translate = UiClientTranslate;

/** What the workbench hands Schedule's client: the shared host fields it uses, the shell's document read and its toast. */
export interface ScheduleHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "pluginRoute" | "pluginId" | "confirm"> {
  readonly view: Pick<UiPageView<HTMLElement>, "readDocument">;
  showToast(message: string, isError?: boolean): void;
}

/** Which kind of row is open: a conversation task, or an alarm another plugin registered (and the operations on it). */
export type RowKind = "task" | "job";

/** What the new-task dialog hints at: a `false` says that is not set up yet. */
export type Readiness = Partial<Record<"model" | "workspace", boolean>>;

export interface TaskAnswer { readonly task: { readonly task_id: string } }

/** The task being edited in the dialog ("" while it makes a new one), and the one-at-a-time flags of the three dialogs. */
export interface Review<Input> { input: Input | null }
export interface ReminderReview extends Review<{ expected_installation_id: string; expected_generation: string }> { readonly jobId: string }
export interface OperationReview extends Review<Record<string, string>> { readonly id: string; readonly decision: string }
