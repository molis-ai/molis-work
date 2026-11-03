/** The permission that lets a plugin ask which of its declared command-line tools this machine has (`local_tools`, PG-112). */
export const PLUGIN_LOCAL_TOOLS_PERMISSION = "local-tools:read";

/** The most tools, binary names and extra directories a Manifest may declare: a plugin names what it looks for, it does not scan. */
export const PLUGIN_LOCAL_TOOLS_LIMITS = Object.freeze({ tools: 32, binaries: 4, directories: 24 });

/**
 * What a plugin's Manifest declares to find command-line tools on this machine (`local_tools`, PG-112): the tools by id, the
 * file names each may have, the directories to look in besides `PATH`, and whether the plugin may ask about one path the person
 * chose. The platform only asks the file system whether such a file exists and can be run; it never starts one. Needs
 * `PLUGIN_LOCAL_TOOLS_PERMISSION` in the Manifest's `permissions`.
 */
export interface PluginLocalToolsDeclaration {
  readonly tools: readonly {
    /** Lowercase letters, digits and hyphens; unique in the declaration. */
    readonly tool_id: string;
    /** Bare file names (no `/`), tried in order in every directory. */
    readonly binaries: readonly string[];
  }[];
  /** Searched after `PATH`: `~/…` (the person's home directory) or an absolute path. */
  readonly directories?: readonly string[];
  /** The plugin may ask whether one absolute path the person gave is a runnable file (a custom tool chosen in its settings). */
  readonly custom_executables?: true;
}

export interface PluginLocalToolsClient {
  /** Each declared tool's runnable file on this machine, null when there is none. A recent answer is reused; the file system is not asked on every call. */
  find(options?: { readonly signal?: AbortSignal }): Promise<readonly { readonly tool_id: string; readonly executable: string | null }[]>;
  /** Only with `custom_executables`: whether this absolute path is a runnable regular file. The answer is a yes or no, never why not. */
  isExecutable(path: string, options?: { readonly signal?: AbortSignal }): Promise<boolean>;
  /** Forget the recent answer, so the next `find` looks again (a settings page's “check again”). */
  refresh(): void;
}
