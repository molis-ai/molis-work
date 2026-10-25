import { shownProjectPlugins } from "./plugin-catalog.js";

/** The shell's existing page default applies only to an absent selection; personal visibility keeps its own rule. */
export function shownPagePlugins(view: { readonly enabled_plugins?: readonly string[]; readonly hidden_plugins?: readonly string[] }): string[] {
  return shownProjectPlugins(view.enabled_plugins ?? ["goals", "inbox", "feed", "artifacts"], view.hidden_plugins ?? []);
}
