import { projectDeletionLabels } from "./web-project-deletion.js";
import type { IncomingMessage } from "node:http";
import type { WorkbenchRenderer, WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { isTerminalRuntime } from "./plugin-terminal-runtimes.js";
import { createLocalProjectSettingsHttp, type LocalWebCatalogRunner } from "./web-project-settings.js";
import { createLocalWebAssets } from "./web-assets.js";
import { createLocalArtifactHttp } from "./artifact-library-http.js";
import { createLocalHostCapsule } from "./capsule.js";
import { createLocalOnboardingHttp } from "./web-onboarding.js";
import { createLocalPlanningHttp } from "./web-planning.js";
import { createLocalGoalsReadHttp } from "./web-goals-read.js";
import { registerConnectorDevicePolling } from "./connector-device-oauth.js";
import { registerOnboardingStagingCleanup } from "./context-onboarding-service.js";
import { createPeriodicTasks } from "./periodic-tasks.js";
import type { MolisWorkProjectCatalog, MolisWorkProjectCatalogOptions } from "./project-catalog.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import type { WebServerOptions } from "./web-types.js";

export interface LocalWebPlatform {
  withCatalog: LocalWebCatalogRunner;
  openCatalog?(options: MolisWorkProjectCatalogOptions): Promise<MolisWorkProjectCatalog>;
  desktopRenderer: WorkbenchRendererPorts["desktop"];
  cliAvailability(): Record<string, boolean>;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  nativeDesktopBootstrapScript: string;
  renderDesktopCapsuleShell: Parameters<typeof createLocalHostCapsule>[0];
  ptyClientFilePath(): string;
}

export function createLocalWebComposition(platform: LocalWebPlatform, home: string, accountRegistration=false,
  diagnostics: NonNullable<WebServerOptions["installationDiagnostics"]> = projectCount=>installationDiagnostics(home,projectCount),
  appearance?: WorkbenchRendererPorts["appearance"]) {
  // Shared controls draw select chevrons as inline data: SVG; images cannot run script.
  // frame-ancestors: only this origin may put a page of the host in a frame (the plugin side panels and the Studio are same-origin frames; the
  // desktop shell loads the page as the window's own document). Another site cannot overlay the page that already holds the control token
  // (clickjacking; security invariant S-21, docs/system/SECURITY-INVARIANTS.md).
  // The request entry adds this page's own http origin beside 'self' (opaquePluginFramePolicy). A sandboxed plugin
  // frame inherits the policy, and WebKit will not load the frame's scripts while the only source is 'self'.
  const PAGE_CSP = "default-src 'self'; img-src 'self' data: blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'";
  const { withCatalog, isDesktopShellRequest } = platform;
  const workbenchRenderer: WorkbenchRenderer = createLocalHostWorkbenchRenderer(platform.desktopRenderer, accountRegistration, appearance, () => projectDeletionLabels(home).map(owner => owner.label));
  const projectSettings = createLocalProjectSettingsHttp(withCatalog,diagnostics);
  const { servePtyClient, serveWorkbenchAsset } = createLocalWebAssets({ ptyClientFilePath: platform.ptyClientFilePath, renderer: workbenchRenderer });
  const handleArtifactNativePluginHttp = createLocalArtifactHttp();
  const { buildCapsuleSnapshot, buildCapsuleMenu, renderCapsuleShell } = createLocalHostCapsule(platform.renderDesktopCapsuleShell, appearance);
  const planningHttp = createLocalPlanningHttp({ withCatalog, renderer: workbenchRenderer, isDesktopShellRequest, pageCsp: PAGE_CSP });
  const goalsReadHttp = createLocalGoalsReadHttp({ withCatalog, renderer: workbenchRenderer, isDesktopShellRequest, pageCsp: PAGE_CSP });
  const handleOnboarding = createLocalOnboardingHttp({
    withCatalog, renderOnboarding: workbenchRenderer.renderMolisWorkOnboarding,
    isRuntimeKind: isTerminalRuntime, cliAvailability: platform.cliAvailability,
    isDesktopShellRequest, pageCsp: PAGE_CSP,
  });
  const periodicTasks = createPeriodicTasks();
  registerConnectorDevicePolling(home, periodicTasks);
  registerOnboardingStagingCleanup(home, periodicTasks);
  return {
    PAGE_CSP, accountRegistration, appearance, withCatalog, workbenchRenderer, isDesktopShellRequest, desktopRenderer: platform.desktopRenderer, installationDiagnostics:diagnostics,
    desktopRuntimeAvailability: platform.cliAvailability,
    projectSettings,
    servePtyClient, serveWorkbenchAsset, handleArtifactNativePluginHttp,
    buildCapsuleSnapshot, buildCapsuleMenu, renderCapsuleShell, planningHttp, goalsReadHttp, handleOnboarding,
    /** This server's periodic tasks (W4-09): registered by their owners, listed in Settings › 诊断, stopped when the server closes. */
    periodicTasks,
  };
}
export type LocalWebComposition = ReturnType<typeof createLocalWebComposition>;
