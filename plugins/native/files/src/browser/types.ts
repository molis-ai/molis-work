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

/** One request to a plugin's routes in this project (the Coding bundle's `request`); a failure is an Error. */
export type CompanionRequest = (plugin: string, path: string, method?: "GET" | "POST", body?: unknown, signal?: AbortSignal) => Promise<unknown>;

/** What Coding's bundle hands Files' client when it mounts it (plugins/native/coding/src/browser/workbench.ts). */
export interface FilesHost {
  readonly root?: ParentNode;
  readonly translate: Translate;
  mountPluginClient(root: Element): FilesLifetime | null;
  readonly request: CompanionRequest;
  /** The folder and file icons, drawn by the design system on the Host. */
  readonly icons?: { readonly folder: string; readonly file: string };
  /** Told which workspace is browsed, so Git follows it. */
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
