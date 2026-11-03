/** The isolated page reports its selected object; Host surfaces still expose their selected directory row. */
export function openedPluginRecord(surface: HTMLElement, selector: string, key: string): string | undefined {
  if (surface.querySelector("iframe[data-plugin-frame]")) {
    try {
      const context = JSON.parse(surface.getAttribute("data-assistant-context") || "{}");
      return !context.named_by && typeof context.object?.id === "string" ? context.object.id : undefined;
    } catch { return undefined; }
  }
  return Array.from(surface.querySelectorAll<HTMLElement>(selector))
    .find(node => node.matches('.is-selected, [aria-selected="true"], [aria-current="page"], [aria-current="true"]'))?.dataset[key];
}

export const OPENED_PLUGIN_RECORD_SCRIPT = openedPluginRecord.toString();
