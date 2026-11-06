/**
 * What this plugin's task grant subjects are, so the platform can name them where the person reviews grants
 * (specs/proactive-assistant/task-grants-platform-area.md §5). A subject's key is the id of one of this plugin's own
 * objects of `kind`; the platform finds its title through this Manifest's own search source for that kind.
 *
 * Checked when the Manifest is read: an object with `kind` alone, and `kind` listed by one of this Manifest's own search sources
 * (`search_source.kinds[].kind`) that is open to `user`, since the title is read as the person. A plugin that declares nothing
 * still has task subjects; where grants are reviewed they are shown without a title. The title is the provider's word, for
 * display only, and is never a ground for any grant.
 */
export interface PluginTaskSubjectsDeclaration {
  /** An object kind this Manifest's own search source lists (`search_source.kinds[].kind`). */
  readonly kind: string;
}
