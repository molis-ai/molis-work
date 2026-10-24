import { startShelfTerminalClient } from "@molis-ai/molis-work-plugin-shelf/terminal-client";
import { startCharacterTerminalClient } from "./character-terminal-client.js";
import { startGoalTerminalClient } from "./terminal/client.js";
import { mountTerminalView } from "./terminal-view.js";

Object.assign(globalThis, { molisTerminalRenderer: mountTerminalView });

startGoalTerminalClient();
startShelfTerminalClient();
startCharacterTerminalClient();
