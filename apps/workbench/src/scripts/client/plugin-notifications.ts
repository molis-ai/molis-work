/**
 * Plugin notifications that wait on the person, reported to the one place that holds what needs them: the
 * Assistant's "需要你看看" bell in the dock. A delivery whose outcome the Runtime could not confirm stops that
 * subscriber's stream until someone skips or retries it in the plugin market, so this reader keeps the count of such
 * notifications for this project and opens the market on them when asked. The market's list keeps the count current
 * after each read, so a resolved notification leaves the bell without waiting for the next poll.
 */
export const PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT = `(host) => {
  const { route, projectId } = host;
  if (!projectId || document.body.dataset.paneEmbedded === "true") return;
  // A read started before the market reported a newer count must not paint over it.
  let epoch = 0, reading = false;
  const announce = (pending) => {
    // Kept on the page as well, so a reader that starts later (the dock) begins from the current count.
    document.body.dataset.pluginEventsPending = String(pending);
    document.dispatchEvent(new CustomEvent("molis-work:plugin-events-waiting", { detail: { pending } }));
  };
  const refresh = async () => {
    if (reading || document.hidden) return; reading = true;
    const started = ++epoch;
    try {
      const response = await fetch(route("/api/plugins/runtime/events"), { cache: "no-store" });
      if (!response.ok) return;
      const pending = ((await response.json()).pending || []).length;
      if (started === epoch) announce(pending);
    } catch { /* A reminder, not a gate: a failed read leaves the last count in place. */ }
    finally { reading = false; }
  };
  document.addEventListener("molis-work:plugin-events", (event) => { epoch++; announce(Number(event.detail?.pending) || 0); });
  document.addEventListener("molis-work:plugin-events-open", () => {
    // The market opens through its one entry in the Dock menu, as ⌘K does; the list then scrolls to the notifications.
    // Already in the market, that entry would take the person back out of it, so only the list is brought into view.
    if (document.body.dataset.desktopSurface !== "market") document.querySelector('[data-global-menu] [data-plugin-id="market"], [data-plugin-strip] [data-plugin-id="market"]')?.click();
    document.dispatchEvent(new CustomEvent("molis-work:plugin-events-reveal"));
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  void refresh();
  setInterval(() => void refresh(), 30000);
}`;
