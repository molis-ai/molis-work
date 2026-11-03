import type { FormQuestion, FormRecord } from "../contract.js";
import type { formDraft } from "./draft.js";
import type { FormClientHost, FormFailure, FormRequest, Translate } from "./types.js";

/**
 * One Forms page: its host, the nodes it paints and what it remembers between events. Every part of the client
 * (src/browser/*) takes this one object; nothing else holds page state.
 */
export interface FormPage {
  readonly host: FormClientHost;
  readonly L: Translate;
  readonly request: FormRequest;
  readonly bench: HTMLElement;
  readonly one: <T extends Element = HTMLElement>(selector: string) => T | null;
  readonly list: HTMLElement | null;
  readonly rowsEl: HTMLElement;
  readonly empty: HTMLElement | null;
  readonly workspace: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly titleInput: HTMLInputElement;
  readonly descriptionInput: HTMLTextAreaElement;
  readonly questionsEl: HTMLElement;
  readonly typeSelect: HTMLSelectElement | null;
  readonly aiPrompt: HTMLTextAreaElement;
  readonly note: HTMLElement | null;
  readonly previewEl: HTMLElement;
  readonly previewForm: HTMLFormElement;
  readonly summaryEl: HTMLElement;
  readonly resultListEl: HTMLElement;
  readonly statsEl: HTMLElement;
  readonly importInput: HTMLInputElement | null;
  readonly confirmDialog: HTMLDialogElement | null;
  records: FormRecord[];
  sel: FormRecord | null;
  tab: string;
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  editRev: number;
  savedRevision: number;
  savePromise: Promise<FormRecord | null> | null;
  saveError: FormFailure | null;
  busy: boolean;
  aiAvailable: boolean;
  aiUnavailableReason: string;
  previewVersion: number | null;
  previewQuestions: readonly FormQuestion[];
  dirty: boolean;
  submitCall: { fingerprint: string; request_id: string } | null;
  noteScope: string;
  resultsSeq: number;
  listSeq: number;
  /** 「AI 生成题目」, bound once the page exists (it reports back through the page). */
  draft: ReturnType<typeof formDraft> | null;
}

export type FormList = { forms?: FormRecord[]; ai_available?: boolean; ai_unavailable_reason?: string | null };
export type FormAnswer = { form: FormRecord };

/** Finds the page's nodes under `bench`; the state starts empty. */
export function formPage(host: FormClientHost, request: FormRequest, bench: HTMLElement): FormPage {
  const one = <T extends Element = HTMLElement>(selector: string) => bench.querySelector<T>(selector);
  return {
    host, L: host.translate, request, bench, one,
    list: one("[data-form=directory]"),
    rowsEl: one("[data-form-rows]")!,
    empty: one("[data-form-empty]"),
    workspace: one("[data-form-stage-workspace]")!,
    titleEl: one("[data-form-editor-title]")!,
    statusEl: one("[data-form-editor-status]")!,
    titleInput: one<HTMLInputElement>("[data-form-title]")!,
    descriptionInput: one<HTMLTextAreaElement>("[data-form-description]")!,
    questionsEl: one("[data-form-questions]")!,
    typeSelect: one<HTMLSelectElement>("[data-form-question-type]"),
    aiPrompt: one<HTMLTextAreaElement>("[data-form-ai-prompt]")!,
    note: one("[data-form-note]"),
    previewEl: one("[data-form-preview]")!,
    previewForm: one<HTMLFormElement>("[data-form-pane=preview]")!,
    summaryEl: one("[data-form-result-summary]")!,
    resultListEl: one("[data-form-result-list]")!,
    statsEl: one("[data-form-result-stats]")!,
    importInput: one<HTMLInputElement>("[data-form-import-files]"),
    confirmDialog: one<HTMLDialogElement>("[data-form-confirm]"),
    records: [], sel: null, tab: "editor", saveTimer: undefined, editRev: 0, savedRevision: 0, savePromise: null, saveError: null,
    busy: false, aiAvailable: false, aiUnavailableReason: "", previewVersion: null, previewQuestions: [], dirty: false,
    submitCall: null, noteScope: "", resultsSeq: 0, listSeq: 0, draft: null,
  };
}

/** Unsaved edits, a failed save or a half-filled preview: leaving now would lose something. */
export const hasUnsaved = (page: FormPage) => Boolean(page.saveError || page.editRev > page.savedRevision || page.dirty);
