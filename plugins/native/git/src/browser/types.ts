import type { UiClientTranslate, UiPageReviews } from "@molis-ai/molis-work-contracts/platform/ui";

export type Translate = UiClientTranslate;

/** The mounted root's lifetime (packages/ui-host client-lifecycle): what Git uses of it. */
export interface GitLifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
  assertCurrent(signal?: AbortSignal): void;
  readonly signal: AbortSignal;
  watchRevision(read: (signal: AbortSignal) => Promise<unknown>, refresh: (signal: AbortSignal) => Promise<boolean | void>): () => void;
}

/** How a Host review ended, as the review list tells the page. */
export interface DecisionOutcome { readonly workspaceId?: string | null; readonly sessionId?: string | null; readonly state: string }

/** What the Git bundle's factory gets: the page's host, or Coding's with the ports of the panel Coding mounts Git in. */
export interface GitFactoryHost {
  readonly root?: ParentNode;
  readonly translate: Translate;
  mountPluginClient(root: Element): GitLifetime | null;
  /** A platform path in the current project. */
  route(path: string): string;
  /** A path under Git's own routes (Coding's host answers for Git here when it mounts it). */
  pluginRoute(path: string): string;
  /** The Host's review lists: a rendering hook that calls back with the outcome, never a decision. */
  readonly reviews: UiPageReviews<Element>;
  /** Opens another plugin's page (a link on Git's own page). */
  openPlugin?(plugin: string): void;
  /** Given only by the page that mounts Git in its own panel (Coding): where the result opens and closes. */
  openResult?(): void;
  closeResult?(): void;
  /** Reads the browsing workspace again for every client on the page; Git alone refreshes when it is absent. */
  refreshWorkspace?(): void;
}

/** What Git's client uses: the factory's host with the requests Git makes and the ports of the page it is mounted in. */
export interface GitHost {
  readonly root?: ParentNode;
  readonly translate: Translate;
  mountPluginClient(root: Element): GitLifetime | null;
  /** One request to Git's routes (a failure is an Error). */
  request(path: string, method?: "GET" | "POST", body?: unknown, signal?: AbortSignal): Promise<unknown>;
  /** The comparison Diff drew for a diff that was read and kept, by Diff's page action. */
  diffState(reference: { readonly artifact_id: string; readonly version: number }, signal?: AbortSignal): Promise<unknown>;
  openResult(): void;
  closeResult(): void;
  /** Shows the Host's reviews of this workspace in `element`; resolves when they are drawn. */
  showReviews?(element: Element, refs: readonly { run_id: string }[], sessionId: string | null, workspaceId: string, query: undefined, control: { lifetime: GitLifetime; signal: AbortSignal | undefined }): Promise<unknown> | undefined;
  refreshWorkspace?(): void;
}

declare global {
  /** The desktop shell's way to open an address in the system browser; absent in a plain browser. */
  var molisWorkOpenExternalUrl: ((url: string) => Promise<unknown> | void) | undefined;
}

export interface Upstream { readonly name: string; readonly ahead: number; readonly behind: number }
export interface ListItem { readonly path: string[]; readonly label: string }
export interface View {
  readonly phase: string;
  readonly head: string;
  readonly upstream: Upstream | null;
  readonly staged: readonly ListItem[];
  readonly changes: readonly ListItem[];
  readonly conflicts: readonly ListItem[];
  readonly message: string;
}

/** A diff that was read and kept (a fixed version in the diff plugin). */
export interface Selected {
  readonly workspace_id: string;
  readonly path: string[];
  readonly previous_path?: string[];
  readonly side: "index" | "worktree";
  readonly revision: string;
  readonly reference: { readonly artifact_id: string; readonly version: number };
}
export interface StateAnswer { readonly workspace: { readonly workspace_id: string }; readonly selected?: Selected | null; readonly view: View }
export interface DiffAnswer { readonly result: { readonly outcome: string; readonly message?: string }; readonly selected: Selected }
export interface HtmlAnswer { readonly html?: string }

export interface Reconciliation { readonly actor_id: string; readonly at: string; readonly reason: string }
export interface ReviewRecord {
  readonly review_id: string;
  readonly action: string;
  readonly paths: readonly string[];
  readonly requested_at: string;
  readonly decided_by?: string | null;
  readonly decided_at?: string | null;
  readonly reconciliation?: Reconciliation | null;
  readonly reconciliation_reason?: string | null;
  readonly failure_reason?: string | null;
}
export interface ReviewResult { readonly review: ReviewRecord; readonly outcome: string; readonly summary?: string }
/** One result of a decided review, whether it is kept in the project yet, and why it cannot be. */
export interface ResultRow { readonly result: ReviewResult; saved?: { readonly result: ReviewResult; readonly reference: { readonly version: number } }; readonly unavailable?: string }
export interface ResultsAnswer { readonly results: ResultRow[] }

export interface OperationRecord { readonly review_id: string; readonly tool: string; readonly outcome: string; readonly detail?: string; readonly failure_reason?: string; readonly summary?: string }
export interface Remote { readonly name: string }
export interface SourceSummary {
  readonly branch: string | null;
  readonly head_commit?: string | null;
  readonly upstream?: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly remotes: readonly Remote[];
  readonly staged: readonly unknown[];
  readonly conflicted: readonly string[];
  readonly merging: boolean;
  readonly branches: readonly string[];
  readonly revision: string;
}
export interface SummaryAnswer { readonly summary: SourceSummary | null; readonly workspace: { readonly workspace_id: string }; readonly draft?: string; readonly message?: string }
export interface ConflictAnswer { readonly outcome: string; readonly message?: string; readonly ours: string; readonly theirs: string; readonly conflicts: number; readonly text: string }
export interface PrSupportAnswer { readonly message: string; readonly tool: string }

/** What Git hands back to the bundle that mounts it. */
export interface GitBrowser {
  refresh(): Promise<void>;
  afterDecision(outcome: DecisionOutcome): Promise<void>;
  show(face: string): void;
}
