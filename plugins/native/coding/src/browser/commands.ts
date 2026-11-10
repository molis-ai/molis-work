import { errorMessage } from "./dom.js";
import { commandPalette, type Command, type PaletteControl, type PalettePorts } from "./palette.js";
import type { PagePorts } from "./types.js";

export type { Command, SessionLine } from "./palette.js";

export interface CommandPorts extends PalettePorts, Pick<PagePorts, "status"> {
  /** The composer's text area, where "/" typed anywhere on the page starts a command. */
  readonly input: () => HTMLTextAreaElement;
}

export interface CommandsClient {
  readonly openPalette: () => void;
  /** Runs a command, saying in the status line when it failed. */
  readonly run: (command: { readonly run: () => unknown }) => Promise<void>;
}

const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Shortcuts, chosen to stay clear of the browser's and the workbench's own (⌘K search, ⌘F find, tab switching): the palette,
 * stepping through sessions, a command's own keys, and "/" to start a command from anywhere on the page (it opens the composer's
 * own `/` menu, as typing it there does).
 */
function shortcuts(ports: CommandPorts, palette: PaletteControl, run: (command: Command) => Promise<void>) {
  const { lifetime, input, commands, sessions, current, openSession } = ports;
  const step = (delta: number) => {
    const list = sessions(), at = list.findIndex(session => session.session_id === current()), next = list[at < 0 ? 0 : (at + delta + list.length) % list.length];
    if (next) void openSession(next.session_id, next.title);
  };
  lifetime.listen(document, "keydown", event => {
    if (!(event instanceof KeyboardEvent)) return;
    const task = input();
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
    if (event.key === "/" && !mod && !event.altKey && !editable(event.target) && !document.querySelector("dialog[open]") && !task.disabled) {
      event.preventDefault();
      task.focus();
      if (task.value) return;
      task.value = "/";
      task.dispatchEvent(new InputEvent("input", { bubbles: true, data: "/", inputType: "insertText" }));
    }
  });
}

/** The command palette and the page's shortcuts, over the one list of commands the composer's `/` offers too. */
export function commandsClient(ports: CommandPorts): CommandsClient {
  const { lifetime } = ports;
  const run = async (command: { readonly run: () => unknown }) => {
    try {
      await command.run();
    } catch (error) {
      if (!lifetime.alive) return;
      ports.status(errorMessage(error), true);
    }
  };
  const palette = commandPalette(ports, run);
  shortcuts(ports, palette, run);
  return {
    openPalette: palette.open,
    run,
  };
}
