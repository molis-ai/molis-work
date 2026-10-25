import { errorMessage } from "./dom.js";
import { keyLabel } from "./matching.js";
import { commandPalette, type PaletteControl, type PalettePorts } from "./palette.js";
import { slashMenu, type MenuPorts } from "./slash-menu.js";
import type { PagePorts } from "./types.js";

export type { Command, SymbolLine } from "./slash-menu.js";
export type { SessionLine } from "./palette.js";

export interface CommandPorts extends MenuPorts, PalettePorts, Pick<PagePorts, "status"> {}

export interface CommandsClient {
  readonly openPalette: () => void;
  readonly closeMenu: () => void;
  readonly keyLabel: (keys: string) => string;
  /** The shortcuts the help lists: keys and what they do. */
  readonly shortcuts: () => (readonly [string, string])[];
}

const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Shortcuts, chosen to stay clear of the browser's and the workbench's own (⌘K search, ⌘F find, tab switching): the palette,
 * stepping through sessions, a command's own keys, and "/" to start a command from anywhere on the page.
 */
function shortcuts(ports: CommandPorts, palette: PaletteControl, run: (command: { readonly run: () => unknown }) => Promise<void>) {
  const { lifetime, q, input, commands, sessions, current, openSession } = ports;
  const step = (delta: number) => {
    const list = sessions(), at = list.findIndex(session => session.session_id === current()), next = list[at < 0 ? 0 : (at + delta + list.length) % list.length];
    if (next) void openSession(next.session_id, next.title);
  };
  lifetime.listen(document, "keydown", event => {
    if (!(event instanceof KeyboardEvent)) return;
    const task = q("[data-coding-task]");
    if (!task.isConnected || task.closest("[hidden]")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      if (palette.isOpen()) palette.close();
      else palette.open();
      return;
    }
    if (palette.isOpen() || event.isComposing) return;
    if (mod && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      step(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const byKeys = commands().find(command => command.enabled !== false && command.keys && command.keys.startsWith("Mod+Alt+") && mod && event.altKey && event.code === "Key" + command.keys.slice(-1));
    if (byKeys) {
      event.preventDefault();
      void run(byKeys);
      return;
    }
    if (event.key === "/" && !mod && !event.altKey && !editable(event.target) && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      input.focus();
      input.value = "/";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

/** The composer's slash menu, the command palette and the page's shortcuts, over one list of commands. */
export function commandsClient(ports: CommandPorts): CommandsClient {
  const { lifetime, translate: L } = ports;
  const run = async (command: { readonly run: () => unknown }) => {
    try {
      await command.run();
    } catch (error) {
      if (!lifetime.alive) return;
      ports.status(errorMessage(error), true);
    }
  };
  const menu = slashMenu(ports, run), palette = commandPalette(ports, run);
  shortcuts(ports, palette, run);
  return {
    openPalette: palette.open,
    closeMenu: menu.close,
    keyLabel,
    shortcuts: () => [["Mod+Shift+P", L("coding.palette.label")], ["Mod+Alt+↑ / ↓", L("coding.palette.key.sessions")], ["/", L("coding.palette.key.slash")], ["Mod+Enter", L("coding.palette.key.send")], ["Esc", L("coding.palette.key.stop")]],
  };
}
