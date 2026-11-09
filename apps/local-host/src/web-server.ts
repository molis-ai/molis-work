import { WebSessions, webPageToken, withWebSessionRequest } from "./web-sessions.js";
import { renderPersonalAccountEntry } from "@molis-ai/molis-work-app-workbench";
import { createLocalWebAssets } from "./web-assets.js";
import { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { createSpaceWebServer, type SpaceWebSurface } from "./space-web-server.js";
import { runtimeSyncSurface } from "./runtime-sync-discovery.js";
import { ProjectDeletionService } from "./project-deletion-service.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { bindAccountHost, handleAccountHttp } from "./account-host.js";
import { projectOrNull } from "./catalog-lookup.js";
import { projectActionAvailability } from "./project-action-availability.js";
import { handleManagementActionHttp } from "./management-action-gateway.js";
import { handlePluginInstallHttp } from "./plugin-install-gateway.js";
import { handleActionGatewayHttp } from "./action-gateway-http.js";
import { webProjectDeletionPorts } from "./project-deletion-service.js";
import { handleMcpContextHttp } from "./mcp-context-gateway.js";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import type { PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { workspaceRefFor } from "./agent-host-composition.js";
import { ensureSystemAgentService } from "./system-agent-service.js";
import { createMolisWorkLocalHost, molisWorkHostProjectReference } from "./project-host.js";
import { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import { resolveWebControlToken, sendWebHealth } from "./web-control-token.js";
import { sendUnhandledWebError, authorizeLocalWebRequest, refuseForeignRequest, type LocalMutationState } from "./web-http.js";
import type { MolisWorkWebViewCache } from "./web-view.js";
import { startDemoSeed } from "./demo-seed.js";
import { attachMolisWorkPtySocket } from "./pty-socket.js";
import { bindPluginTerminalHost } from "./plugin-terminal-service.js";
import { L, htmlLang, clientI18nScript, isWebLocale, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "./web-locale.js";
import { appearanceForHome } from "./ui-locale-memory.js";
import { installHostUiText } from "./ui-text-provider.js";
import { fixtureWebBoardOptions } from "./web-routing.js";
import { createLocalWebComposition, type LocalWebPlatform } from "./web-composition.js";
import type { WebServerOptions } from "./web-types.js";
import { handleMolisWorkWebRequest } from "./web-request.js";
import { assistantServiceFor } from "./assistant/assistant-http.js";
import { installedPagesPort } from "./assistant/assistant-pages.js";
import { attachWebAssistant } from "./web-assistant.js";
import { trackHostListener } from "./host-endpoints.js";
import { attachMolisWorkBrowserSocket } from "./browser/browser-socket.js";
import { handleBrowserHttp } from "./browser/browser-http.js";
import { createWebStorageResources } from "./web-storage-resources.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { createWebCatalogAccess } from "./web-catalog-access.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { closeHostResourceSteps, retainHomeStorageResources, retainInitializationCleanup } from "./home-storage-lifetime.js";
import { finishLeftOverDeletions } from "./web-deletion-sweep.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { awaitWebServerShutdown } from "./web-server-close.js";

function loopbackWebOrigin(server: http.Server): string {
  const address = server.address();
  if (address && typeof address === "object") return `http://127.0.0.1:${address.port}`;
  return "http://127.0.0.1:4173";
}

/** The native terminal, attached once the server exists; a Character launch made before that is refused. */
function nativeTerminal() {
  const terminal = { host: null as MolisWorkPtyHost | null, spawn: (request: PtySpawnRequest): PtySpawnResult => {
    if (!terminal.host) throw new Error("原生终端尚未接通");
    return terminal.host.spawn(request);
  } };
  return terminal;
}

/** The language switch. This is a GET a foreign page's <img> reaches too: the browser's Cookie goes as ever, but only the page itself moves the Home's remembered language (S-ui-locale-memory). */
function switchLocale(request: http.IncomingMessage, response: http.ServerResponse, url: URL, remember: (locale: unknown) => void): void {
  const requested = url.searchParams.get("lang");
  if (request.headers["sec-fetch-site"] === "same-origin") remember(requested);
  const nextLocale = isWebLocale(requested)
    ? requested
    : resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
  response.writeHead(302, {
    location: safeNextPath(url.searchParams.get("next")),
    "set-cookie": localeSetCookie(nextLocale),
    "cache-control": "no-store",
  });
  response.end();
}

function webWorkspaceFor(projectId: string, options: WebServerOptions, fixture: ReturnType<typeof fixtureWebBoardOptions>, home: string, withCatalog: LocalWebCatalogRunner) {
  const configuredRoot = () => {
    if (!options.projectRoot) return null;
    const canonical_path = fs.realpathSync(options.projectRoot);
    return {workspace_id: `configured:${projectId}`, canonical_path, realpath_verified: true, display_name: path.basename(canonical_path)};
  };
  if (fixture && projectId === fixture.projectId) return configuredRoot();
  return withCatalog({homeDirectory: home}, catalog => workspaceRefFor(catalog, projectId) ?? configuredRoot());
}

export function createLocalWebCoreFactory(platform: LocalWebPlatform) {
  function createMolisWorkWebServer(options: WebServerOptions = {}): SpaceWebSurface {
    // The text tools' context, once a process: a page's `t` finds the request's language and the owners' words through it (§8.3).
    installHostUiText();
    const storageHome = resolveConfiguredHome(options.homeDirectory);
    let catalogAccess: ReturnType<typeof createWebCatalogAccess> | undefined;
    const baseCatalog: LocalWebCatalogRunner = (settings, operation) => (catalogAccess?.withCatalog ?? platform.withCatalog)(settings, operation);
    let boundCatalog: LocalWebCatalogRunner | undefined;
    const withCatalog: LocalWebCatalogRunner = (settings, operation) => (boundCatalog ?? baseCatalog)(settings, operation);
    const serverOptions: WebServerOptions = { ...options, homeDirectory: storageHome };
    const fixture = fixtureWebBoardOptions(serverOptions);
    const catalogAvailability = projectActionAvailability(withCatalog, storageHome);
    // Explicit single-database mode predates project installation records. Its
    // configured board is the authority; other project callers still use catalog policy.
    const actionAvailability = Object.assign((...args: Parameters<typeof catalogAvailability>) => {
      const [caller, action] = args;
      return fixture && caller.project_id === fixture.projectId
        ? { available: true as const } : catalogAvailability(caller, action);
    }, {
      snapshotForDiscovery: async (caller: Parameters<typeof catalogAvailability>[0]) =>
      fixture && caller.project_id === fixture.projectId
        ? () => ({ available: true as const }) : catalogAvailability.snapshotForDiscovery(caller),
    });
    const pty = nativeTerminal();
    const localHost = serverOptions.localHost ?? createMolisWorkLocalHost({
      homeDirectory: storageHome, characterSpawn: pty.spawn,
      actionAvailability,
      sceneAvailability: actionAvailability,
      projectRoutePrefix: projectId => fixture && projectId === fixture.projectId ? "" : `/projects/${encodeURIComponent(projectId)}`,
      workspacesFor: (projectId) => withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: projectId => webWorkspaceFor(projectId, serverOptions, fixture, storageHome, withCatalog),
      directoriesFor: projectId => withCatalog({ homeDirectory: storageHome }, catalog => catalog.projectDirectories(projectId)),
      prepareDirectory: (projectId, workspaceId, mode) => withCatalog({ homeDirectory: storageHome }, catalog => catalog.prepareWorkspaceDirectory(projectId, workspaceId, mode)),
    });
    const ownsLocalHost = !serverOptions.localHost;
    const completed = new Set<string>(), resources: Array<readonly [string, () => unknown]> = [];
    const cleanup = () => closeHostResourceSteps(completed, resources);
    let shutdown: (() => Promise<void>) | undefined;
    let releaseTransport: (() => void) | undefined;
    try {
    // The Host, including a borrowed one, cannot relinquish its lease while this transport still owns storage.
    boundCatalog = localHost.configurePersonalPlanning(storageHome, baseCatalog);
    const appearance = appearanceForHome(storageHome);
    const account = bindAccountHost(localHost, storageHome, serverOptions.account, serverOptions.assertAccountCurrent);
    releaseTransport = retainHomeStorageResources(localHost, () => shutdown ? shutdown() : cleanup());
    if (platform.openCatalog) catalogAccess = localHost.ensureWebCatalog(storageHome, platform.openCatalog);
    const runtimeIntegrations = serverOptions.runtimeIntegrationService ?? new RuntimeIntegrationService({ homeDirectory: storageHome });
    const webService = serverOptions.webServiceManager ?? new MolisWorkWebServiceManager({ homeDirectory: storageHome });
    const agents = ensureSystemAgentService(localHost, storageHome, withCatalog);
    const composition = createLocalWebComposition({ ...platform, withCatalog }, storageHome,serverOptions.accountRegistration??false,serverOptions.installationDiagnostics);
    const { serveWorkbenchAsset } = composition;
    const controlToken = resolveWebControlToken(serverOptions);
    const sessions = serverOptions.webSessions ?? new WebSessions(storageHome);
    const mutationKeys = new Map<string, LocalMutationState>();
    const webViewCache: MolisWorkWebViewCache = new Map();
    const demoSeeding = startDemoSeed(fixture);
    const { periodicTasks: periodic } = composition;
    resources.push(["periodic", () => periodic.stop()]);
    const { im, browserHost, sites, computer, projectExists, projectSchedules } = createWebStorageResources({
      home: storageHome, localHost, withCatalog, fixture, periodic, webViewCache, resources, server: () => server,
    });
    const server = trackHostListener(http.createServer((request, response) => withWebSessionRequest(request, () => runWithMolisWorkHome(storageHome, () => withCallId(newCallId(), async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      try { await demoSeeding;
        // Every route (locale switch included) answers only a request addressed to this machine by a loopback name, and none can be framed by another origin (S-02, S-21).
        if (refuseForeignRequest(request, response)) return;
        sessions.bind(request, controlToken, response);
        if (request.method === "GET" && url.pathname === "/locale") { switchLocale(request, response, url, appearance.locale.remember); return; }
        const capsuleLocale = request.method === "GET" && (
          url.pathname === "/desktop/capsule" ||
          /^\/projects\/[^/]+\/api\/capsule$/.test(url.pathname)
        )
          ? url.searchParams.get("locale")
          : null;
        const locale = isWebLocale(capsuleLocale)
          ? capsuleLocale
          : resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
        await runWithLocale(locale, async () => {
          if (!authorizeLocalWebRequest(request, response, url, controlToken, mutationKeys)) return;
          if (localHost.lifecycle() !== "running") throw new Error("Local Host is closing");
          await pluginPagesFor(storageHome).bind(request, url, response);
          if (await handleAccountHttp(request, response, url, account, serverOptions.isNativeAccountRequest)) return;
          if (request.method === "GET" && url.pathname === "/health" && catalogAccess) {
            const ready = server.address() !== null && Boolean(pty.host) && (Boolean(fixture) || catalogAccess.ready);
            sendWebHealth(response, ready ? 200 : 503, {
              status: ready ? "ok" : "starting", process_id: process.pid,
              service_process_id: serviceProcessId(), desktop_tui: Boolean(pty.host),
              ...(fixture ? { project_id: fixture.projectId } : { project_count: catalogAccess.projectCount }),
            }, controlToken, url.searchParams.get("challenge"));
            return;
          }
          if (await handleBrowserHttp(request, response, url, { browsers: browserHost, projectExists, sites, decideSite: decision => agents.decideSurfaceSite(decision) })) return;
          if (await computer.handleHttp(request, response, url)) return;
          if (await im.handle(request, response, url, loopbackWebOrigin(server))) return;
          if (await handleMcpContextHttp(request, response, url, { home: storageHome, host: localHost, withCatalog,
            deletion: webProjectDeletionPorts({ isPanelAlive: panelId => pty.host?.alive(panelId) ?? false, projectSchedules, webViewCache, localHost }) })) return;
          if (await handleManagementActionHttp(request, response, url, storageHome, localHost) || await handlePluginInstallHttp(request, response, url, storageHome, localHost) || await handleActionGatewayHttp(request, response, url, storageHome, localHost, withCatalog, serverOptions.mcpCredentialHomeDirectory ?? storageHome)) return;
          if (serveWorkbenchAsset(request, response, url.pathname)) return;
          if (!pty.host) throw new Error("终端宿主尚未就绪");
          await handleMolisWorkWebRequest(
            request,
            response,
            url,
            serverOptions,
            runtimeIntegrations,
            webService,
            webPageToken(request),
            webViewCache,
            projectSchedules,
            pty.host,
            loopbackWebOrigin(server),
            localHost,
            composition,
            agents.agentHost,
            () => agents.ready,
          );
        });
      } catch (error) {
        runWithLocale(resolveWebLocale(request.headers.cookie, request.headers["accept-language"]), () => sendUnhandledWebError(response, error, request));
      }
    })))));
    // SSE is an active HTTP response, so stop its streams before close waits. The side panel's browser is asked to quit
    // at once, not when the last connection ends: a shutdown that is cut short still leaves its sign-ins written.
    shutdown = awaitWebServerShutdown(server, () => { im.stop(); sessions.revokeScope(controlToken); }, cleanup, async () => {
      releaseTransport?.();
      if (ownsLocalHost) await localHost.close();
    });
    server.prependListener("upgrade", request => sessions.bind(request, controlToken));
    attachMolisWorkBrowserSocket(server, controlToken, browserHost, { projectExists });
    computer.attach(server, controlToken);
    pty.host = attachMolisWorkPtySocket(server, controlToken, storageHome);
    server.once("close", bindPluginTerminalHost(storageHome, pty.host, { webUrl: () => loopbackWebOrigin(server) }));
    // The Assistant's timed follow-ups run while this server runs: a due one starts a round; one missed while it was not
    // running is reported, never replayed late.
    const assistant = () => assistantServiceFor({ localHost, homeDirectory: storageHome, agentHost: agents.agentHost, agentReady: () => agents.ready, projectReference: async projectId => withCatalog({ homeDirectory: storageHome }, catalog => { const project = catalog.getProject(projectId);return molisWorkHostProjectReference({ databasePath: project.database_path, projectId }); }),
      projectTitle: async projectId => withCatalog({ homeDirectory: storageHome }, catalog => projectOrNull(catalog, projectId)?.display_name ?? null), pages: installedPagesPort(withCatalog, storageHome) }).service;
    attachWebAssistant(server, storageHome, assistant, agents, periodic, appearance.locale.lastUsed);
    if (!fixture && catalogAccess) finishLeftOverDeletions(server, storageHome, catalogAccess, periodic, serverOptions.deletionSweepMs);
    return Object.assign(runtimeSyncSurface(server, storageHome, localHost, withCatalog, operation=>{if(!catalogAccess)throw new Error('同步项目目录尚未就绪');return catalogAccess.read(operation);}), { matchesNativeAccountCallback: account.matchesNativeCallback, projectSyncLifecycle: new ProjectDeletionService(withCatalog, webProjectDeletionPorts({ isPanelAlive: panelId => pty.host?.alive(panelId) ?? false, projectSchedules, webViewCache, localHost })) });
    } catch (error) {
      if (!ownsLocalHost && !releaseTransport) throw error;
      throw retainInitializationCleanup(error, () => ownsLocalHost ? localHost.close() : (async () => { await (shutdown ? shutdown() : cleanup()); releaseTransport?.(); })(), "web_initialization_cleanup_failed");
    }
  }

  return createMolisWorkWebServer;
}

/** Installation entry: the account owner chooses the only active business Home. */
export function createLocalWebServerFactory(platform: LocalWebPlatform) {
  const createMolisWorkWebServer=createLocalWebCoreFactory(platform);
  const entryAssets=createLocalWebAssets({ptyClientFilePath:platform.ptyClientFilePath,renderer:createLocalHostWorkbenchRenderer(platform.desktopRenderer)});
  return (options: WebServerOptions = {}) => {
    const homeDirectory=resolveConfiguredHome(options.homeDirectory);
    const installation:WebServerOptions={...options,
      runtimeIntegrationService:options.runtimeIntegrationService??new RuntimeIntegrationService({homeDirectory}),
      webServiceManager:options.webServiceManager??new MolisWorkWebServiceManager({homeDirectory}),
      installationDiagnostics:options.installationDiagnostics??(projectCount=>installationDiagnostics(homeDirectory,projectCount)),
    };
    return createSpaceWebServer(installation, createMolisWorkWebServer, platform.withCatalog,{
    render:(token,request,url,message)=>runWithLocale(resolveWebLocale(request.headers.cookie,request.headers['accept-language']),()=>renderPersonalAccountEntry(token,platform.isDesktopShellRequest(request,url),message,{L,htmlLang,clientI18nScript},platform.nativeDesktopBootstrapScript)),
    asset:(request,response,url)=>runWithLocale(resolveWebLocale(request.headers.cookie,request.headers['accept-language']),()=>entryAssets.serveWorkbenchAsset(request,response,url.pathname)),
    });
  };

}
