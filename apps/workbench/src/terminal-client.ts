import { startShelfTerminalClient } from "@molis-ai/molis-work-plugin-shelf/terminal-client";
import { startWorkTerminalClient } from "@molis-ai/molis-work-plugin-work/terminal-client";
import { startCharacterTerminalClient } from "./character-terminal-client.js";

startWorkTerminalClient();
startShelfTerminalClient();
startCharacterTerminalClient();
