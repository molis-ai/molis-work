import type { MolisWorkRuntimeContextHost, RuntimePanelCatalogProvider } from "@molis-ai/molis-work-contracts/platform/app-host";
import { openWorkSessionRegistry } from "./session-registry.js";

/** Link the late native identity using the same Desktop and Session owners. */
export function createRuntimePanelSessionLinker(ports: RuntimePanelCatalogProvider) {
  return async (host: MolisWorkRuntimeContextHost | null, nativeSessionId: string | null): Promise<void> => {
    const panelId = host?.panelId?.trim() || "";
    const runtimeSessionId = nativeSessionId?.trim() || "";
    if (!host || !panelId || !runtimeSessionId) return;
    await ports.withCatalog(host.homeDirectory, async (catalog) => {
      const panel = catalog.aliasPanelSession({
        panel_id: panelId,
        runtime_id: host.runtimeContext.runtime_id,
        host_session_id: runtimeSessionId,
        actor_id: `desktop-panel:${panelId}`,
      });
      const registry = await openWorkSessionRegistry({ homeDirectory: host.homeDirectory });
      try {
        catalog.reconcileSessions(registry);
        const unified = registry.findBySurface(panel.panel_id);
        if (unified && unified.native_runtime_session_id !== runtimeSessionId) {
          registry.linkNativeRuntimeSession({
            session_id: unified.session_id,
            runtime_id: panel.runtime_kind,
            native_runtime_session_id: runtimeSessionId,
            actor_id: `desktop-panel:${panelId}`,
            surface_id: panel.panel_id,
          });
        }
      } finally { registry.close(); }
    }).catch((error: unknown) => {
      if (ports.isMissingPanel(error)) return;
      throw error;
    });
  };
}
