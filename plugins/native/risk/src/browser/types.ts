import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiClientScope, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { RiskEvent, RiskLevel, RiskLink, RiskRecord, RiskRow, RiskStatus } from "../model.js";
import type { RiskReview } from "../review.js";

export type { ActionSubject, RiskEvent, RiskLevel, RiskLink, RiskRecord, RiskReview, RiskRow, RiskStatus };

/** The common request lifetime plus the mounted page's event and timer ownership. */
export interface Scope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: (event: Event) => void, capture?: boolean): () => void;
}

/** What the workbench hands the risk page's client. */
export type RiskHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "root" | "mount" | "invokeAction" | "openItem" | "openPlugin" | "surfaceFor" | "view" | "confirm" | "readRefusal" | "projectTitle"> & {
  mountPluginClient(root: HTMLElement): Scope | null;
};

export interface OverviewFilter { status: "open" | "all" | "closed"; impact: RiskLevel | ""; owner_name: string; linked: "" | "some" | "none" }

export interface RiskPageState {
  /** `idle` is the side view before anything was opened in it. */
  view: "overview" | "record" | "new" | "idle";
  filter: OverviewFilter;
  rows: RiskRow[];
  /** Under the default view with nothing open: whether closed risks exist, so the page does not say there are none. */
  anyClosed: boolean;
  owners: string[];
  next: string | null;
  /** The overview could not be read: says so, never shows zero risks. */
  overviewError: string;
  loading: boolean;
  record: { risk: RiskRecord; links: RiskLink[]; events: RiskEvent[] } | null;
  recordError: string;
  review: { state: "ok" | "unavailable"; review: RiskReview | null } | null;
  reviewError: string;
  /** The person cannot write (a write was refused for permission): the record is shown read-only. */
  readOnly: boolean;
  /** The record last asked for, so a failed read can be tried again. */
  recordId: string;
  editing: boolean;
  /** A save refused because someone else changed the risk: theirs and the person's draft, side by side. */
  conflict: { current: RiskRecord; draft: RiskDraft } | null;
  pop: "" | "status" | "review" | "link";
  busy: boolean;
}

/** What the edit form holds. */
export interface RiskDraft { title: string; statement: string; impact: RiskLevel; likelihood: RiskLevel; treatment: string; owner_name: string }

export interface RiskPage {
  host: RiskHost;
  scope: Scope;
  root: HTMLElement;
  /** Where the page draws (inside the root, beside its style sheet and toasts). */
  body: HTMLElement;
  /** The one-risk view in the side panel (design C) rather than the stage. */
  side: boolean;
  state: RiskPageState;
  render(): void;
  /** A risk action, refused or failed in the person's words. */
  call<O>(capability: string, input: unknown): Promise<O>;
  toast(message: string, failed?: boolean): void;
  /** Runs work; a failure becomes a toast. */
  run(work: () => Promise<unknown>): void;
}
