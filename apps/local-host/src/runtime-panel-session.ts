import type { MolisWorkRuntimeContextHost, RuntimePanelCatalogProvider } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Record a terminal's late native Runtime identity in the platform's terminal records, so the terminal can be resumed with it. */
export function createRuntimePanelSessionLinker(ports: RuntimePanelCatalogProvider) {
  return async (host: MolisWorkRuntimeContextHost | null, nativeSessionId: string | null): Promise<void> => {
    const panelId = host?.panelId?.trim() || "";
    const runtimeSessionId = nativeSessionId?.trim() || "";
    if (!host || !panelId || !runtimeSessionId) return;
    await ports.withCatalog(host.homeDirectory, async (catalog) => {
      await catalog.aliasTerminalSession({ panel_id: panelId, runtime_id: host.runtimeContext.runtime_id, host_session_id: runtimeSessionId });
    }).catch((error: unknown) => {
      if (ports.isMissingPanel(error)) return;
      throw error;
    });
  };
}
