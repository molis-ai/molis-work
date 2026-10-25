import { startCharacterTerminalClient } from "./character-terminal-client.js";
import { startGoalTerminalClient } from "./terminal/client.js";
import { mountTerminalView } from "./terminal-view.js";

Object.assign(globalThis, { molisTerminalRenderer: mountTerminalView });

startGoalTerminalClient();
startCharacterTerminalClient();
