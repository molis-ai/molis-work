import type { UiClientScope, UiClientTranslate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { Issue, IssueCursor, IssueImage, IssueSummary } from "../store.js";

export type { Issue, IssueCursor, IssueImage, IssueSummary };
export type Translate = UiClientTranslate;

/** The common request lifetime plus the mounted page's event and timer ownership. */
export interface Scope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: (event: Event) => void, capture?: boolean): () => void;
  timeout(callback: () => void, delay: number): number;
  clearTimeout(id: number | undefined): void;
}

/** The page the person was on, as the shell reports it: a report, never proof of what was on screen. */
export interface PageReport { readonly url: string; readonly title: string }

/** What the workbench hands the Issue page's client. */
export type IssuesHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "root" | "translate" | "route" | "pluginRoute" | "pluginId" | "drafts" | "confirmBox" | "readRefusal"> & {
  mountPluginClient(root: HTMLElement): Scope | null;
  status?(state: string): void;
  page?(): PageReport | null | undefined;
};

export type CaptureState = "organizing" | "attention";
/** A capture that has not become a record yet: the words and pictures, and where it stands. */
export interface Pending {
  id: string;
  text: string;
  images: IssueImage[];
  page: PageReport | null;
  at: number;
  state?: CaptureState;
  note?: string;
  kind?: "failed" | "question";
  restored?: boolean;
  manual?: boolean;
  shots?: number;
  card?: { title: string; type: string };
}

/** What the editor is open on: a saved record, or a capture that still needs the person. */
export type Current = Issue | IssueSummary | Pending;

export interface EditorData { title: string; type: string; description: string; images: IssueImage[] }
/** What fills the editor: a saved record, a capture, or a suggestion over the person's own words. */
export interface FillData { title?: string; type?: string; text?: string; description?: string; images?: IssueImage[] }

export interface ReviewJob { readonly target: Current | null; readonly data: EditorData; readonly at: number }
export interface NamedResult { status: "named"; title: string; type: string }
export interface QuestionResult { status: "needs_input"; question: string }
export interface SavedResult { status: "saved"; issue: Issue }

export interface MediaZoom {
  state(): string;
  fitsAtActual(): boolean;
  actual(): void;
  fit(keep?: boolean): void;
  dispose(): void;
}

declare global {
  var molisFit: ((area: HTMLElement) => void) | undefined;
  var molisDropZone: ((form: HTMLElement, on: (active: boolean) => void) => void) | undefined;
  var molisMediaZoom: ((view: HTMLElement, image: HTMLImageElement, options: { onChange(state: string): void }) => MediaZoom | undefined) | undefined;
}

export interface IssuesElements {
  readonly root: HTMLElement;
  readonly home: HTMLElement;
  readonly detail: HTMLElement;
  readonly composer: HTMLFormElement;
  readonly editor: HTMLFormElement;
  readonly list: HTMLElement;
  readonly toastBox: HTMLElement;
  readonly gone: HTMLElement;
  readonly desc: HTMLTextAreaElement;
  readonly titleInput: HTMLInputElement;
  readonly detailInput: HTMLTextAreaElement;
}

export interface IssuesState {
  rows: IssueSummary[];
  next: IssueCursor | null;
  pending: Pending[];
  current: Current | null;
  editing: boolean;
  saving: boolean;
  images: IssueImage[];
  edits: IssueImage[];
  fresh: string | null;
  listEpoch: number;
  readEpoch: number;
  toastTimer: number | undefined;
  toastRun: (() => Promise<void>) | null;
  reported: string;
  importing: number;
  restoring: boolean;
  pictureWrites: number;
  pictureFault: boolean;
  pictureQueue: Promise<void>;
  review: ReviewJob | null;
  held: Set<string>;
}

/**
 * The page: its elements, state and the operations the parts call on each other. A part installs its own operations when the
 * client starts (list.ts, detail.ts, images.ts, capture.ts, review.ts); every part is installed before the page is used.
 */
export interface IssuesPage {
  readonly host: IssuesHost;
  readonly scope: Scope;
  readonly L: Translate;
  readonly el: IssuesElements;
  readonly state: IssuesState;
  readonly mac: boolean;
  readonly storageKey: string;
  $<T extends HTMLElement = HTMLElement>(key: string): T;
  api<T>(path: string, body?: unknown): Promise<T>;
  read(id: string): Promise<Issue>;
  run(work: () => Promise<unknown>): void;
  toast(text: string, action?: string, then?: (() => Promise<void>) | null, failed?: boolean): void;
  primary(key: string, yes?: boolean): void;
  confirm(title: string, text: string, label: string, run?: () => Promise<unknown>): Promise<boolean>;
  flag(text?: string): void;
  pick(type?: string): void;
  fit(area: HTMLElement): void;
  values(): EditorData;
  changed(): Partial<EditorData>;
  draft(): boolean;
  ready(): void;
  fill(data: FillData): void;
  mode(): void;
  show(issue: Issue): void;
  open(id: string): Promise<void>;
  back(): Promise<void>;
  render(): void;
  load(more?: boolean): Promise<void>;
  refresh(): Promise<void>;
  remember(): void;
  shots(items: IssueImage[], editable: boolean): string;
  paint(): void;
  pictures(change?: (items: IssueImage[]) => IssueImage[]): Promise<void>;
  stopReview(): Promise<void>;
  reviewIssue(): Promise<void>;
  submit(): Promise<void>;
  keep(item: Pending, data: EditorData): Promise<void>;
  redo(item: Pending): Promise<void>;
  abandon(item: Pending): Promise<void>;
  save(): Promise<void>;
}
