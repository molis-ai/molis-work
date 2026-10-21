/** One directory the person authorized for a Plugin for a bounded time (PRR-03, S-41's sibling for non-project folders). */
export interface PluginDirectoryGrant {
  readonly grant_id: string;
  /** The canonical absolute directory the person chose. */
  readonly root: string;
  readonly expires_at: string;
}

export interface PluginDirectoryReadRequest {
  readonly grant_id: string;
  /** Path segments below the grant root; empty means the root itself. */
  readonly path?: readonly string[];
  readonly kind?: "directory" | "text" | "bytes";
  readonly max_bytes?: number;
}

export interface PluginDirectoryEntry {
  readonly name: string;
  readonly path: readonly string[];
  readonly kind: "file" | "directory" | "other";
  readonly size?: number;
}

export type PluginDirectoryReadResult =
  | { readonly outcome: "directory"; readonly entries: readonly PluginDirectoryEntry[]; readonly truncated: boolean }
  | { readonly outcome: "text"; readonly text: string; readonly bytes: number }
  | { readonly outcome: "bytes"; readonly data: string; readonly bytes: number }
  | { readonly outcome: "too-large"; readonly bytes: number; readonly limit: number }
  | { readonly outcome: "missing" | "denied" | "unsupported" | "changed" };

/** The Host's read-only view of a person-authorized directory; a Plugin never names an absolute path itself. */
export interface PluginDirectoryService {
  read(request: PluginDirectoryReadRequest, signal?: AbortSignal): Promise<PluginDirectoryReadResult>;
}
