import type { PluginExecutionControl } from "./plugin.js";

/** Binary files owned by a trusted native plugin; names are single, non-hidden ASCII filenames, never paths. */
export interface PluginFilesClient {
  /** Regular files only. A missing directory is empty; listing never creates it. */
  list(): readonly string[];
  /** A copy of the file's bytes, or null when absent. Links, non-files and oversized files are refused. */
  read(name: string): Uint8Array | null;
  /** Await beforeEffect and synchronously recheck caller and installation authority, then create exclusively with owner-only permissions; never overwrite. */
  create(control: PluginExecutionControl, name: string, bytes: Uint8Array): Promise<void>;
  /** Await beforeEffect and synchronously recheck caller and installation authority; removing a missing file succeeds. */
  remove(control: PluginExecutionControl, name: string): Promise<void>;
}

/**
 * Selected by the Host's trusted start entry, never by a Manifest, action input or installed script. 2026-10-18 改: declared in
 * the Manifest and granted like any plugin's, merged into ownerFiles (PG-102, PG-104 in specs/repository-anti-corruption/privileges.md); until then, as above.
 */
export interface PluginFilesDeclaration {
  /** A single Home directory registered to this plugin. */
  readonly store_name: string;
  /** A single directory inside that store, such as assets; no nested paths. */
  readonly directory: string;
  readonly max_file_bytes: number;
  readonly read_permission: string;
  readonly write_permission: string;
}
