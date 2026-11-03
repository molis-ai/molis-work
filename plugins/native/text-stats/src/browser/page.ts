import type {} from "@molis-ai/molis-work-plugin-sdk";
import { required } from "./dom.js";
import type { Host, StateAnswer } from "./types.js";

/**
 * Text Stats' page: the counts of the pinned text, drawn by the Host. They are read when the page is shown and when Refresh
 * is chosen; a link to another plugin opens that plugin.
 */
export function textStatsPage(host: Host): void {
  const root = host.root;
  if (!(root instanceof HTMLElement) || !root.matches("[data-companion]")) return;
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return;
  const L = host.translate;
  const reload = required<HTMLButtonElement>(root, "[data-companion-refresh]"), body = required(root, "[data-companion-content]"), note = required(root, "[data-companion-status]");
  const spin = required(reload, ".mw-spinner");
  let read = 0, view: AbortSignal | undefined;
  const busy = (value: boolean) => { reload.disabled = value; spin.hidden = !value; body.setAttribute("aria-busy", String(value)); };
  const load = async () => {
    if (!lifetime.visible) return;
    const signal = view, id = ++read;
    busy(true); note.textContent = L("text-stats.stage.reading");
    try {
      const state = await molisWorkRequest<StateAnswer>(host.pluginRoute("/state"), { signal, fallback: L("text-stats.error.unreadable") });
      lifetime.assertCurrent(signal);
      if (id !== read) return;
      body.innerHTML = state.html || ""; note.textContent = "";
    } catch (error) {
      if (!signal?.aborted && lifetime.visible && id === read) { body.replaceChildren(); molisWorkRequest.show(note, error); note.append(document.createTextNode(L("text-stats.stage.retry"))); }
    } finally {
      if (lifetime.alive && id === read) busy(false);
    }
  };
  lifetime.listen(root, "click", event => {
    const target = event.target as Element, open = target.closest<HTMLElement>("[data-companion-open]");
    if (open) host.openPlugin?.(open.dataset.companionOpen ?? "");
    else if (target.closest("[data-companion-refresh]")) void load();
  });
  lifetime.whenVisible(signal => { view = signal; void load(); return () => { read++; busy(false); }; });
}
