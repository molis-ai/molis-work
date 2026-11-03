import type { GeneratedImage, ImageApiFormat, ImageConnection, ImageJob } from "../contract.js";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";

export type { GeneratedImage, ImageApiFormat, ImageConnection, ImageJob };
/** The service connection that holds a key (managed in Connectors); the page lists the ones it may point a service at. */
export type AuthConnection = ConnectorConnectionView;
export type { UiClientTranslate as Translate } from "@molis-ai/molis-work-contracts/platform/ui";
import type { UiClientScope, UiClientTranslate as Translate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

/** The view's lifetime, from the browser Host's mount scope: what is started with it ends with it. */
export interface Scope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: (event: Event) => void, capture?: boolean): () => void;
  timeout(callback: () => void, delay: number): number;
  clearTimeout(id: number | undefined): void;
}

/** What the workbench hands the Images page's client. */
export interface ImagesHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement, Element>,
  "translate" | "route" | "pluginRoute" | "pluginId" | "projectId" | "loadMedia" | "confirm"> {
  mountPluginClient(root: HTMLElement): Scope | null;
}

/** A failed request: the Host's plain Error with its `code` and HTTP `status` (0 when there was no answer). */
export type Failure = Error & { status?: number; code?: string };

/** One request to the Images routes; `path` follows `/api/plugins/io.molis.work.images`. */
export type ImagesRequest = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>, signal?: AbortSignal) => Promise<T>;

/** A submission that may have reached the Host: its key, so a repeat of the same words reuses the same job. */
export interface Pending { request_id: string; fingerprint: string }

/** What the browser keeps of an unfinished composition (sessionStorage, per project). */
export interface Draft {
  prompt?: unknown;
  size?: unknown;
  aspect_ratio?: unknown;
  connection_id?: unknown;
  selected_id?: unknown;
  pending?: { request_id?: unknown; fingerprint?: unknown } | null;
}

/** The parts of the page the server drew that every module works with. */
export interface Elements {
  readonly compose: HTMLFormElement;
  readonly prompt: HTMLTextAreaElement;
  readonly size: HTMLInputElement;
  readonly ratio: HTMLInputElement;
  readonly generate: HTMLButtonElement;
  readonly result: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly connectionForm: HTMLFormElement;
  readonly connectionName: HTMLInputElement;
  readonly connectionUrl: HTMLInputElement;
  readonly connectionModel: HTMLInputElement;
  readonly connectionAuth: HTMLSelectElement;
  readonly serviceMenu: HTMLDetailsElement;
}

export interface ImagesState {
  context: string;
  conns: ImageConnection[];
  authConnections: AuthConnection[];
  jobs: ImageJob[];
  cid: string;
  jobId: string;
  editingId: string;
  editingFormat: ImageApiFormat;
  editingAuth: string;
  pending: Pending | null;
  resumeConnection: string | null;
  submitting: boolean;
  saving: boolean;
  cancelling: boolean;
  listSeq: number;
  loadSeq: number;
  timer: number;
  listSignature: string;
  resultSignature: string;
  viewSignal: AbortSignal | undefined;
}

export interface ImagesPage {
  readonly host: ImagesHost;
  readonly L: Translate;
  readonly life: Scope;
  readonly root: HTMLElement;
  readonly el: Elements;
  readonly s: ImagesState;
  readonly request: ImagesRequest;
  readonly statuses: Readonly<Record<string, string>>;
  field<T extends HTMLElement = HTMLElement>(name: string): T;
  projectId(): string;
  say(message: string, isError?: boolean, selector?: string): void;
  pickedConn(): ImageConnection | undefined;
  saveDraft(): void;
  restoreDraft(): void;
  expand(): void;
  publishContext(job: ImageJob | null): void;
  syncGenerate(): void;
}
