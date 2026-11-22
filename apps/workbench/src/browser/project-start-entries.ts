import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { homeLeadWord, homeWord, type HomeControl } from "./project-home-render.js";

/**
 * What each plugin of this project lets a person begin (its overview's `start`), on that plugin's row of the start page under ＋.
 * The first page does not start work (specs/screen-polish §八之二); the entries are the same ones it reads, launched through the
 * same protected click, so a start is checked against what the owner declares at the moment it is pressed.
 */
interface StartHost {
  /** The start page. */
  root: HTMLElement;
  read<Output>(suffix: string, body: unknown, signal: AbortSignal): Promise<Output>;
  /** Binds a reply to where the person was when they pressed. */
  navigationFrom(): (result: unknown) => boolean;
  receipt(message: string): void;
  /** Closes the start page. */
  close(): void;
}

type StartResult = { kind: "stage" | "settings" | "peek" | "enabled" } | { kind: "invoked"; stage?: unknown; retry_open?: HomeControl["target"] };

export function mountStartEntries(host: StartHost) {
  const root = host.root, controls = new Map<string, HomeControl>();
  let reading: AbortController | null = null, clicking: AbortController | null = null;
  const clear = () => {
    root.querySelectorAll("[data-rail-start]").forEach(node => node.remove());
    controls.clear();
  };
  const release = (result: SurfaceHomeDisplay) => {
    const text = result.surface_text?.map(item => item.ref);
    // Nothing here shows an owner's words: the grants this read opened end with it.
    if (text?.length) void host.read("", { release_text: text }, new AbortController().signal).catch(() => undefined);
  };
  const draw = (result: SurfaceHomeDisplay) => {
    clear();
    for (const group of result.groups) {
      const owner = group.owner_plugin_id, starts = group.kind === "plugin" && group.state === "ok" ? group.plugin_card?.start : undefined;
      const shell = owner && result.display.shell_keys?.[owner];
      if (!owner || !starts?.length || !shell) continue;
      const ops = root.querySelector<HTMLElement>('.plugin-rail-tile[data-plugin-tile="' + CSS.escape(shell) + '"]:not(.is-available) > .plugin-rail-ops');
      if (!ops) continue;
      const name = result.display.owners[owner]?.name ?? "";
      starts.forEach((target, index) => {
        const key = owner + ":start:" + index;
        controls.set(key, { owner_plugin_id: owner, target });
        const button = Object.assign(document.createElement("button"), { type: "button", tabIndex: -1, title: homeWord("start-new"),
          className: "mw-btn mw-btn--secondary mw-btn--sm mw-btn--icon mw-btn--icon-only rail-start", innerHTML: icon("edit") });
        button.dataset.railStart = key;
        button.setAttribute("aria-label", homeLeadWord("start-new-in", name));
        ops.prepend(button);
      });
    }
  };
  async function open() {
    reading?.abort();
    const request = reading = new AbortController();
    try {
      const result = await host.read<SurfaceHomeDisplay>("", {}, request.signal);
      release(result);
      if (request.signal.aborted || reading !== request || root.hidden) return;
      draw(result);
    } catch {
      // The start page is whole without them: the entries are an addition to each row.
    } finally {
      if (reading === request) reading = null;
    }
  }
  /** The start page closed: the entries leave with it. A start already pressed runs on, bound to where the person was. */
  function close() {
    reading?.abort();
    reading = null;
    clear();
  }
  async function start(button: HTMLElement) {
    const control = controls.get(button.dataset.railStart ?? "");
    if (!control || clicking) return;
    // The reply opens where the person was when they pressed: a pane focused since then does not take it.
    const navigate = host.navigationFrom(), request = clicking = new AbortController();
    // Like choosing a plugin, pressing closes the start page.
    host.close();
    try {
      const result = await host.read<StartResult>("/click", control, request.signal);
      if (result.kind === "stage" && !navigate(result)) host.receipt(homeWord("navigation-failed"));
      else if (result.kind === "invoked" && !(result.stage && navigate(result.stage))) host.receipt(homeWord(result.retry_open ? "open-failed" : "created"));
    } catch {
      host.receipt(homeWord("navigation-failed"));
    } finally {
      if (clicking === request) clicking = null;
    }
  }
  root.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-rail-start]") : null;
    if (!button) return;
    // The row under the button is not being chosen.
    event.stopPropagation();
    void start(button);
  });
  return { open, close };
}
