import { startWorkTerminalClient } from "./terminal/client.js";
import { createPageTerminal } from "./terminal/page-terminal.js";
import { mountTerminalView } from "./terminal-view.js";

// What the platform gives every page that wants a terminal (PG-053): the renderer and, on a page the shell draws itself, the page
// terminal over the shell's /pty channel. A plugin frame has been handed its own `molisPageTerminal` and keeps it. A plugin's or the
// Host surface's terminal client rides in that surface's own bundle and asks for these; this entry names none of them. The shell and
// a surface that needs the terminal both load this script, so a second run does nothing.
if (!("molisTerminalRenderer" in globalThis)) {
  Object.assign(globalThis, { molisTerminalRenderer: mountTerminalView });
  if (!("molisPageTerminal" in globalThis)) Object.assign(globalThis, { molisPageTerminal: createPageTerminal(mountTerminalView) });
  startWorkTerminalClient();
}
