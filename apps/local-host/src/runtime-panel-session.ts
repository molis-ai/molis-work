import type { MolisWorkRuntimeContextHost, RuntimePanelCatalogProvider } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Record a panel's late native Runtime identity in the Desktop panel catalog, so the panel can be resumed with it. */
export function createRuntimePanelSessionLinker(ports: RuntimePanelCatalogProvider) {
  return async (host: MolisWorkRuntimeContextHost | null, nativeSessionId: string | null): Promise<void> => {
    const panelId = host?.panelId?.trim() || "";
    const runtimeSessionId = nativeSessionId?.trim() || "";
    if (!host || !panelId || !runtimeSessionId) return;
    await ports.withCatalog(host.homeDirectory, async (catalog) => {
      catalog.aliasPanelSession({
        panel_id: panelId,
        runtime_id: host.runtimeContext.runtime_id,
        host_session_id: runtimeSessionId,
        actor_id: `desktop-panel:${panelId}`,
      });
    }).catch((error: unknown) => {
      if (ports.isMissingPanel(error)) return;
      throw error;
    });
  };
}
