/**
 * Plugin notifications that wait on the person are counted in the one place that holds what needs them: the Assistant's
 * "需要你看看" bell in the dock (assistant-island.ts reads the count from the page's attention read and from the market's
 * list). A delivery whose outcome the Runtime could not confirm stops that subscriber's stream until someone skips or
 * retries it in the plugin market; this opens the market on them when the bell asks.
 */
export const PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT = `(host) => {
  const { projectId } = host;
  if (!projectId || document.body.dataset.paneEmbedded === "true") return;
  document.addEventListener("molis-work:plugin-events-open", () => {
    // The market opens through its one entry in the Dock menu, as ⌘K does; the list then scrolls to the notifications.
    // Already in the market, that entry would take the person back out of it, so only the list is brought into view.
    if (document.body.dataset.desktopSurface !== "market") document.querySelector('[data-global-menu] [data-plugin-id="market"]')?.click();
    document.dispatchEvent(new CustomEvent("molis-work:plugin-events-reveal"));
  });
}`;
