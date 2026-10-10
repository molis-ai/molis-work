import type { IncomingMessage } from "node:http";
import type { WorkbenchRenderer, WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { createSessionProjectOperations } from "./web-session.js";
import { createLocalPanelHttp } from "./web-panel.js";
import { createLocalWorkSessionHttp } from "./web-work-session.js";
import { createLocalProjectSettingsHttp, type LocalWebCatalogRunner } from "./web-project-settings.js";
import { createLocalWebAssets } from "./web-assets.js";
import { createLocalArtifactHttp } from "./artifact-native-plugin-http.js";
import { createLocalHostCapsule } from "./capsule.js";
import { createLocalOnboardingHttp } from "./web-onboarding.js";
import { createLocalPlanningHttp } from "./web-planning.js";
import { createLocalGoalsReadHttp } from "./web-goals-read.js";
import type { MolisWorkProjectCatalog, MolisWorkProjectCatalogOptions } from "./project-catalog.js";

export interface LocalWebPlatform {
  withCatalog: LocalWebCatalogRunner;
  openCatalog?(options: MolisWorkProjectCatalogOptions): Promise<MolisWorkProjectCatalog>;
  desktopRenderer: WorkbenchRendererPorts["desktop"];
  panel: Omit<Parameters<typeof createLocalPanelHttp>[0], "withCatalog">;
  runtimeTitle(runtimeKind: string): string;
  cliAvailability(): Record<string, boolean>;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  nativeDesktopBootstrapScript: string;
  renderDesktopCapsuleShell: Parameters<typeof createLocalHostCapsule>[0];
  ptyClientFilePath(): string;
}

export function createLocalWebComposition(platform: LocalWebPlatform) {
  // Shared controls draw select chevrons as inline data: SVG; images cannot run script.
  // frame-ancestors: only this origin may put a page of the host in a frame (the plugin side panels and the Studio are same-origin frames; the
  // desktop shell loads the page as the window's own document). Another site cannot overlay the page that already holds the control token
  // (clickjacking; security invariant S-21, docs/system/SECURITY-INVARIANTS.md).
  const PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'";
  const { withCatalog, isDesktopShellRequest } = platform;
  const workbenchRenderer: WorkbenchRenderer = createLocalHostWorkbenchRenderer(platform.desktopRenderer);
  const sessionProjectOperationsData = createSessionProjectOperations(platform.runtimeTitle);
  const handleSessions = createLocalWorkSessionHttp(withCatalog, sessionProjectOperationsData);
  const handleDesktopPanelApi = createLocalPanelHttp({ withCatalog, ...platform.panel });
  const projectSettings = createLocalProjectSettingsHttp(withCatalog);
  const { servePtyClient, serveWorkbenchAsset } = createLocalWebAssets({ ptyClientFilePath: platform.ptyClientFilePath, renderer: workbenchRenderer });
  const handleArtifactNativePluginHttp = createLocalArtifactHttp();
  const { buildCapsuleSnapshot, renderCapsuleShell } = createLocalHostCapsule(platform.renderDesktopCapsuleShell);
  const planningHttp = createLocalPlanningHttp({ withCatalog, renderer: workbenchRenderer, isDesktopShellRequest, pageCsp: PAGE_CSP });
  const goalsReadHttp = createLocalGoalsReadHttp({ withCatalog, renderer: workbenchRenderer, isDesktopShellRequest, pageCsp: PAGE_CSP, sessionProjectOperationsData });
  const handleOnboarding = createLocalOnboardingHttp({
    withCatalog, renderOnboarding: workbenchRenderer.renderMolisWorkOnboarding,
    isRuntimeKind: platform.panel.isRuntimeKind, cliAvailability: platform.cliAvailability,
    isDesktopShellRequest, pageCsp: PAGE_CSP,
  });
  return {
    PAGE_CSP, withCatalog, workbenchRenderer, isDesktopShellRequest,
    desktopRuntimeAvailability: platform.cliAvailability,
    handleSessions, handleDesktopPanelApi, projectSettings,
    servePtyClient, serveWorkbenchAsset, handleArtifactNativePluginHttp,
    buildCapsuleSnapshot, renderCapsuleShell, planningHttp, goalsReadHttp, handleOnboarding,
  };
}
export type LocalWebComposition = ReturnType<typeof createLocalWebComposition>;
