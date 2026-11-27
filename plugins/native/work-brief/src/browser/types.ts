import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiClientScope, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BriefView } from "../actions.js";
import type { AttentionItem, BriefChange, BriefProposal, BriefVersion, BriefVersionHead, Cite, Claim, NextMark, NextOption, ProposalConflict, SourceRow } from "../model.js";

export type { ActionSubject, AttentionItem, BriefChange, BriefProposal, BriefVersion, BriefVersionHead, BriefView, Cite, Claim, NextMark, NextOption, ProposalConflict, SourceRow };

/** The common request lifetime plus the mounted page's event and timer ownership. */
export interface Scope extends UiClientScope {
  listen(target: EventTarget, name: string, callback: (event: Event) => void, capture?: boolean): () => void;
}

/** What the workbench hands the brief page's client. */
export type WorkBriefHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "root" | "mount" | "invokeAction" | "view" | "readRefusal" | "projectTitle" | "projectId"> & {
  mountPluginClient(root: HTMLElement): Scope | null;
};

export interface BriefPageState {
  loading: boolean;
  /** The brief could not be read: says so, never shows an empty brief. */
  error: string;
  /** The current version with everything around it; `changes` compares it with the version before. */
  head: BriefView | null;
  /** An older version the person opened; null while the current one is on show. */
  old: BriefView | null;
  thenNow: "then" | "now";
  /** The open popover: "ver", or "cite:<claim>:<index>". */
  pop: string;
  /** The sentence being edited (its claim id), or "+" for a new one of the person's own. */
  editing: string;
  /** The person's picks for a waiting proposal, by claim id. */
  picks: Record<string, "mine" | "theirs">;
  /** What the last refresh reported, until the page is left or refreshed again. */
  delta: { changed: boolean; version: number; changes: BriefChange[] } | null;
  busy: "" | "refresh" | "write";
}

export interface BriefPage {
  host: WorkBriefHost;
  scope: Scope;
  root: HTMLElement;
  body: HTMLElement;
  state: BriefPageState;
  render(): void;
  /** One of Work Brief's own actions, refused or failed in the person's words. */
  call<O>(capability: string, input: unknown): Promise<O>;
  toast(message: string, failed?: boolean): void;
  /** Runs work; a failure becomes a toast. */
  run(work: () => Promise<unknown>): void;
}
