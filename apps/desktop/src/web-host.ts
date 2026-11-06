import { createLocalWebServerFactory, TERMINAL_RUNTIMES, terminalRuntimeRecipe } from "@molis-ai/molis-work-app-local-host";
import { isPtyCommandAvailable } from "@molis-ai/molis-work-service-runtime-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "./project-catalog.js";
import { desktopWorkbenchRendererPorts } from "./shell.js";
import { isDesktopShellRequest, NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } from "./shell.js";
import { renderDesktopCapsuleShell } from "./capsule-shell.js";

function desktopRuntimeAvailability(): Record<string, boolean> {
  return Object.fromEntries(TERMINAL_RUNTIMES.map(runtime => [runtime, isPtyCommandAvailable(terminalRuntimeRecipe(runtime).command)]));
}

export function createDesktopWebHost(assets: { ptyClientFilePath(): string }) {
  return createLocalWebServerFactory({
    withCatalog: withMolisWorkProjectCatalog,
    openCatalog: openMolisWorkProjectCatalog,
    desktopRenderer: desktopWorkbenchRendererPorts,
    cliAvailability: desktopRuntimeAvailability,
    isDesktopShellRequest, nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
    renderDesktopCapsuleShell, ptyClientFilePath: assets.ptyClientFilePath,
  });
}
