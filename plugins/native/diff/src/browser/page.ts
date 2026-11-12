import type {} from "@molis-ai/molis-work-plugin-sdk";
import { required } from "./dom.js";
import type { Host, StateAnswer } from "./types.js";

const uiText = globalThis.t;
const { molisWorkRetitleRegion: retitle } = globalThis as typeof globalThis & { molisWorkRetitleRegion?: (root: ParentNode, before: string, after: string) => void };
type DrawnComparison = { index: number; view: unknown; html: string };

/**
 * Diff's page: the comparison of the change being looked at, drawn by the Host. It is read when the page is shown, when
 * Refresh is chosen and when another file of the change is chosen; a link to another plugin opens that plugin.
 */
export function diffPage(host: Host): void {
  const root = host.root;
  if (!(root instanceof HTMLElement) || !root.matches("[data-companion]")) return;
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return;
  const reload = required<HTMLButtonElement>(root, "[data-companion-refresh]"), body = required(root, "[data-companion-content]"), note = required(root, "[data-companion-status]");
  const spin = required(reload, ".mw-spinner");
  let read = 0, view: AbortSignal | undefined, index = 0;
  let drawn: DrawnComparison | undefined;
  const busy = (value: boolean) => { reload.disabled = value; spin.hidden = !value; body.setAttribute("aria-busy", String(value)); };
  const load = async (previous?: DrawnComparison) => {
    if (!lifetime.visible) return;
    const signal = view, id = ++read, selected = index;
    if (!previous) { busy(true); note.textContent = uiText.text("diff.stage.reading"); }
    try {
      const state = await molisWorkRequest<StateAnswer>(host.pluginRoute(`/state?change_index=${selected}`), { signal, fallback: uiText.text("diff.error.unreadable") });
      lifetime.assertCurrent(signal);
      if (id !== read) return;
      const html = state.html ?? "";
      if (previous) {
        if (!retitle || drawn !== previous || JSON.stringify(previous.view) !== JSON.stringify(state.view)) {
          note.textContent = uiText.text("diff.stage.refresh-for-language");
          return;
        }
        retitle(body, previous.html, html);
      } else {
        body.innerHTML = html;
        body.querySelectorAll<HTMLElement>("[data-change-index]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.changeIndex) === selected)));
      }
      drawn = { index: selected, view: state.view, html }; note.textContent = "";
    } catch (error) {
      if (!signal?.aborted && lifetime.visible && id === read) {
        if (!previous) { body.replaceChildren(); drawn = undefined; }
        molisWorkRequest.show(note, error); note.append(document.createTextNode(uiText.text("diff.stage.retry")));
      }
    } finally {
      if (lifetime.alive && id === read) busy(false);
    }
  };
  lifetime.listen(root, "click", event => {
    const target = event.target as Element, file = target.closest<HTMLElement>('[data-action="diff.show-file"]'), open = target.closest<HTMLElement>("[data-companion-open]");
    if (open) host.openPlugin?.(open.dataset.companionOpen ?? "");
    else if (file) { index = Number(file.dataset.changeIndex); void load(); }
    else if (target.closest("[data-companion-refresh]")) void load();
  });
  lifetime.listen(document, "molis-work:language-changed", () => {
    void load(drawn?.index === index && !reload.disabled ? drawn : undefined);
  });
  lifetime.whenVisible(signal => { view = signal; void load(); return () => { read++; busy(false); }; });
}
