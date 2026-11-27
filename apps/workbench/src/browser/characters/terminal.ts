import type { UiTerminalEvent, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";

const uiText = globalThis.t;
let pendingObserver: MutationObserver | null = null;
let activeBinding: { host: HTMLElement; dispose(): void } | null = null;

/** Runs `start` once `selector` is in the page: the Characters surface is filled in when it first opens (#150). */
function whenPresent(selector: string, start: () => void): void {
  pendingObserver?.disconnect();
  const host = document.querySelector("[data-characters]") || document.querySelector("[data-tab-workspace]") || document.querySelector("main") || document.body;
  const observer = pendingObserver = new MutationObserver(() => {
    if (!document.querySelector(selector)) return;
    observer.disconnect();
    if (pendingObserver === observer) pendingObserver = null;
    start();
  });
  observer.observe(host, { childList: true, subtree: true });
}

function waitForPageTerminal(): Promise<typeof globalThis.molisPageTerminal | undefined> {
  if ("molisPageTerminal" in globalThis && globalThis.molisPageTerminal) return Promise.resolve(globalThis.molisPageTerminal);
  const existing = document.querySelector<HTMLScriptElement>('script[src$="/desktop/pty-client.js"]');
  if (!existing) return Promise.resolve(undefined);
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      existing.removeEventListener("load", done);
      existing.removeEventListener("error", done);
      resolve(globalThis.molisPageTerminal);
    };
    const timer = setTimeout(done, 5000);
    existing.addEventListener("load", done, { once: true });
    existing.addEventListener("error", done, { once: true });
  });
}

/**
 * The terminal under a Character's native runs. It shows a process the Host already runs: the Characters page asks its backend for the
 * panel and says so in `molis-work:character-terminal`; this attaches to that panel and nothing else. The terminal is the platform's
 * (`molisPageTerminal` mounted by `molisTerminalRenderer`, PG-053), so it can attach, write, resize and stop, never start a process.
 * What a run prints is shown, not recorded.
 */
export function startCharacterTerminal(): void {
  const selector = "[data-characters] [data-character-terminal]";
  const root = document.querySelector<HTMLElement>("[data-characters]");
  const host = root?.querySelector<HTMLElement>("[data-character-terminal]");
  const status = root?.querySelector<HTMLElement>("[data-character-terminal-status]");
  if (!host || !status || !root) {
    if (activeBinding && !activeBinding.host.isConnected) {
      activeBinding.dispose();
      activeBinding = null;
    }
    whenPresent(selector, startCharacterTerminal);
    return;
  }
  pendingObserver?.disconnect();
  pendingObserver = null;
  if (activeBinding?.host === host) return;
  activeBinding?.dispose();
  activeBinding = null;

  const controller = new AbortController();
  let active: string | null = null, view: UiTerminalView | undefined, opening = 0;
  const note = (message: string) => { status.textContent = message; };
  const release = () => { opening++; view?.dispose(); view = undefined; };
  const dispose = () => {
    controller.abort();
    release();
    active = null;
    if (activeBinding?.host === host) activeBinding = null;
  };
  const onEvent = (event: UiTerminalEvent) => {
    if (event.type === "spawned") note(event.started || event.attached ? uiText.text("workbench.characters.terminal-native") : uiText.text("workbench.characters.terminal-inactive"));
    else if (event.type === "exit") note(uiText.text("workbench.characters.terminal-exit", { code: event.exitCode }));
    else if (event.type === "disconnected") note(uiText.text("workbench.characters.terminal-reconnect"));
    else if (event.type === "error") note(event.message || uiText.text("workbench.characters.terminal-failed"));
  };
  const attach = async (panelId: string) => {
    if (!host.isConnected) {
      dispose();
      return;
    }
    release();
    const ticket = opening;
    active = panelId;
    note(uiText.text("workbench.characters.terminal-connecting"));
    try {
      const terminal = await waitForPageTerminal();
      if (ticket !== opening || !host.isConnected) return;
      if (!terminal) {
        note(uiText.text("workbench.characters.terminal-failed"));
        return;
      }
      const next = await terminal.mount(host, { panelId, onEvent });
      if (ticket !== opening || !host.isConnected) {
        next.dispose();
        return;
      }
      view = next;
      next.focus();
    } catch (error) { if (host.isConnected) note(error instanceof Error ? error.message : String(error)); }
  };
  window.addEventListener("molis-work:character-terminal-reset", () => {
    if (!host.isConnected) {
      dispose();
      return;
    }
    release();
    active = null;
    note(uiText.text("workbench.characters.terminal-select-run"));
  }, { signal: controller.signal });
  window.addEventListener("molis-work:character-terminal", event => {
    if (!host.isConnected) {
      dispose();
      return;
    }
    const panelId = (event as CustomEvent<{ panelId?: string }>).detail?.panelId;
    if (panelId?.startsWith("character-")) void attach(panelId);
  }, { signal: controller.signal });
  root.querySelector("[data-character-terminal-stop]")?.addEventListener("click", () => {
    if (active && "molisPageTerminal" in globalThis && globalThis.molisPageTerminal) {
      void globalThis.molisPageTerminal.send({ type: "kill", panelId: active }).then(() => note(uiText.text("workbench.characters.terminal-stop-requested"))).catch(error => note(error.message));
    }
  }, { signal: controller.signal });
  activeBinding = { host, dispose };
}
