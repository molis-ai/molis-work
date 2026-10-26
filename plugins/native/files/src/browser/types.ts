import type { UiClientTranslate } from "@molis-ai/molis-work-contracts/platform/ui";

export type Translate = UiClientTranslate;

/** The mounted root's lifetime (packages/ui-host client-lifecycle): what Files uses of it. */
export interface FilesLifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
  assertCurrent(signal?: AbortSignal): void;
  readonly signal: AbortSignal;
  watchRevision(read: (signal: AbortSignal) => Promise<unknown>, refresh: (signal: AbortSignal) => Promise<boolean | void>): () => void;
}

/** What the Files bundle's factory gets: the page's host, or Coding's with the ports of the panel Coding mounts Files in. */
export interface FilesFactoryHost {
  readonly root?: ParentNode;
  readonly translate: Translate;
  mountPluginClient(root: Element): FilesLifetime | null;
  /** A platform path in the current project. */
  route(path: string): string;
  /** A path under Files' own routes (Coding's host answers for Files here when it mounts it). */
  pluginRoute(path: string): string;
  /** Opens another plugin's page (a link on Files' own page). */
  openPlugin?(plugin: string): void;
  /** Told which workspace is browsed, so Git follows it. Given only by the page that mounts Files in its own panel. */
  onWorkspaceSelected?(workspaceId: string): void;
  /** Given only by the page that mounts Files in its own panel (Coding): where the result opens and closes. */
  openResult?(): void;
  closeResult?(): void;
}

/** What Files' client uses: the factory's host with the requests Files makes and the ports of the page it is mounted in. */
export interface FilesHost {
  readonly root?: ParentNode;
  readonly translate: Translate;
  mountPluginClient(root: Element): FilesLifetime | null;
  /** One request to Files' routes (a failure is an Error). */
  request(path: string, method?: "GET" | "POST", body?: unknown, signal?: AbortSignal): Promise<unknown>;
  /** A companion plugin's drawn state, by its page action. */
  companionState(plugin: "text-stats" | "diff", signal?: AbortSignal): Promise<unknown>;
  /** The folder and file icons, drawn by the design system on the Host. */
  readonly icons?: { readonly folder: string; readonly file: string };
  onWorkspaceSelected?(workspaceId: string): void;
  openResult(): void;
  closeResult(): void;
}

export type EntryKind = "file" | "directory" | "other";
export interface DirectoryEntry { readonly name: string; readonly kind: EntryKind; readonly path: readonly string[] }
/** Why a read was not text or a directory, in the Host's words for it. */
export type ReadOutcome = "missing" | "denied" | "unsupported" | "binary" | "changed";
export interface StateAnswer { readonly workspace?: { readonly workspace_id: string }; readonly position?: { readonly workspace_id: string; readonly path: string[] } }
export interface DirectoryAnswer {
  readonly result: { readonly outcome: "directory"; readonly entries: readonly DirectoryEntry[]; readonly truncated: boolean } | { readonly outcome: ReadOutcome };
}
export interface OpenAnswer {
  readonly result: { readonly outcome: "text"; readonly text: string; readonly fingerprint: string }
    | { readonly outcome: "too-large"; readonly limit: number }
    | { readonly outcome: ReadOutcome };
}
export interface CaptureAnswer { readonly saved: { readonly artifact: { readonly version: number } } }
/** A companion's `/state`: its drawn HTML. */
export interface HtmlAnswer { readonly html?: string }

/** The file being read and the version of it a capture must still match. */
export interface Current { readonly workspace_id: string; readonly path: string[]; readonly fingerprint: string }

/** What Files hands back to the bundle that mounts it. */
export interface FilesBrowser {
  refresh(): Promise<void>;
  /** Whether Files answered to the face on show: it is shown for `files`, hidden for the others it knows. */
  show(face: string): boolean;
}
