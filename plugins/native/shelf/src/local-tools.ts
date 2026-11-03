import type { PluginLocalToolsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SHELF_ENGINES } from "@molis-ai/molis-work-module-shelf";

/**
 * The terminal Agents Shelf can open a terminal in, found by the platform (`services.localTools`, PG-112): one tool per engine, named by
 * its key, in `PATH` and in the places each of them installs itself to. Shelf starts none of them to find out; the person's own
 * choice of another executable (`custom_executables`) is checked the same way.
 */
export const SHELF_LOCAL_TOOLS: PluginLocalToolsDeclaration = {
  tools: SHELF_ENGINES.map(engine => ({ tool_id: engine.key, binaries: engine.binaries })),
  directories: [
    "~/.grok/bin", "~/.local/bin", "~/.opencode/bin", "~/.cursor/bin", "~/.kimi-code/bin", "~/.codebuddy/bin", "~/.qwen/bin", "~/bin",
    "/opt/homebrew/bin", "/usr/local/bin",
    "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin",
    "~/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin",
  ],
  custom_executables: true,
};
