/** The permission that lets a plugin ask whether projects it already holds the ids of still exist (`services.projects`, BL-680; 用户 2026-10-26 弹窗决定). */
export const PLUGIN_PROJECTS_EXIST_PERMISSION = "projects:exist";

/** The most ids one `exist` call may carry, and the longest one id may be: a plugin asks about what it kept, it does not scan. */
export const PLUGIN_PROJECTS_EXIST_LIMITS = Object.freeze({ ids: 200, id_length: 200 });

export interface PluginProjectsClient {
  /**
   * Whether each project id the plugin passes in is still a project of this Home. The answer holds one `true` or `false` per id passed
   * (duplicates once) and nothing else: no list of projects, no name, no state, and no id the plugin did not ask about. A project being
   * deleted counts as existing until the Host has dropped it. Needs `PLUGIN_PROJECTS_EXIST_PERMISSION` in the Manifest and the person's grant.
   */
  exist(ids: readonly string[], options?: { readonly signal?: AbortSignal }): Promise<Readonly<Record<string, boolean>>>;
}
