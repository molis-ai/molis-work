/**
 * Title bar bell for this project's plugin notifications that wait on the person. A delivery whose outcome the Runtime
 * could not confirm stops that subscriber's stream until someone skips or retries it in the plugin market, so the bell
 * shows only while such notifications wait and opens the market on them. The market's list keeps the count current
 * after each read, so a resolved notification clears the bell without waiting for the next poll.
 */
export const PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route, projectId } = host;
  const button = document.querySelector("[data-plugin-notifications]");
  if (!button || !projectId || document.body.dataset.paneEmbedded === "true") return;
  const count = button.querySelector("[data-plugin-notifications-count]");
  // A read started before the market reported a newer count must not paint over it.
  let epoch = 0, reading = false;
  const paint = (pending) => {
    button.hidden = !pending;
    count.textContent = String(pending);
    const label = pending ? L("插件通知：{count} 条待核对", { count: pending }) : L("插件通知");
    button.title = label; button.setAttribute("aria-label", label);
  };
  const refresh = async () => {
    if (reading || document.hidden) return; reading = true;
    const started = ++epoch;
    try {
      const response = await fetch(route("/api/plugins/runtime/events"), { cache: "no-store" });
      if (!response.ok) return;
      const pending = ((await response.json()).pending || []).length;
      if (started === epoch) paint(pending);
    } catch { /* The bell is a convenience; a failed read leaves the last count shown. */ }
    finally { reading = false; }
  };
  document.addEventListener("molis-work:plugin-events", (event) => { epoch++; paint(Number(event.detail?.pending) || 0); });
  button.addEventListener("click", () => {
    // The market opens through its one entry in the Dock menu, as ⌘K does; the list then scrolls to the notifications.
    // Already in the market, that entry would take the person back out of it, so only the list is brought into view.
    if (document.body.dataset.desktopSurface !== "market") document.querySelector('[data-global-menu] [data-plugin-id="market"], [data-plugin-strip] [data-plugin-id="market"]')?.click();
    document.dispatchEvent(new CustomEvent("molis-work:plugin-events-reveal"));
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  void refresh();
  setInterval(() => void refresh(), 30000);
}`;
