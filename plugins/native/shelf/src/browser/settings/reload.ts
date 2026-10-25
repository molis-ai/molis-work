import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { SettingsPage } from "./types.js";

/** Redraws the settings block from the page the server draws now, keeping the scroll place. `bind` binds what came in. */
export async function reloadPage(page: SettingsPage, bind: (root: ParentNode) => void): Promise<void> {
  const scope = document.querySelector<HTMLElement>("[data-shelf-settings]");
  if (!scope) return;
  const scroller = scope.closest<HTMLElement>("[data-settings-content]") || scope.parentElement;
  const top = scroller?.scrollTop || 0;
  const hint = page.L("shelf.settings.reload-hint");
  const html = await molisWorkRequest<string>(location.pathname + location.search, { as: "text", fallback: hint });
  const next = new DOMParser().parseFromString(html, "text/html").querySelector("[data-shelf-settings]");
  if (!next) throw new Error(hint);
  scope.replaceChildren(...next.childNodes);
  bind(scope.parentElement || document);
  if (scroller) scroller.scrollTop = top;
  window.dispatchEvent(new CustomEvent("molis-shelf-refresh"));
}
