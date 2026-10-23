import { pluginPagesFor } from "./plugin-page-authority.js";
import { createLocalImServer } from "./im-server.js";
import { projectOrNull } from "./catalog-lookup.js";
import { projectActionAvailability } from "./project-action-availability.js";
import { handleManagementActionHttp } from "./management-action-gateway.js";
import { handleActionGatewayHttp } from "./action-gateway-http.js";
import { handleProjectDeletionGatewayHttp } from "./project-deletion-gateway.js";
import { webProjectDeletion } from "./project-deletion-service.js";
import { resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
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
import { seedDemoBoard } from "./demo-seed.js";
import { attachMolisWorkPtySocket } from "./pty-socket.js";
import { bindPluginTerminalHost } from "./plugin-terminal-service.js";
import { isWebLocale, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "./web-locale.js";
import { fixtureWebBoardOptions } from "./web-routing.js";
import { createLocalWebComposition, type LocalWebPlatform } from "./web-composition.js";
import type { WebServerOptions } from "./web-types.js";
import { handleMolisWorkWebRequest } from "./web-request.js";
import { assistantServiceFor } from "./assistant/assistant-http.js";
import { installedPagesPort } from "./assistant/assistant-pages.js";
import { attachWebAssistant } from "./web-assistant.js";
import { trackHostListener } from "./host-endpoints.js";
import { lazyBrowserHost } from "./browser/browser-host.js";
import { attachMolisWorkBrowserSocket } from "./browser/browser-socket.js";
import { handleBrowserHttp } from "./browser/browser-http.js";
import { BrowserSiteDecisions, registerBrowserSurfaces } from "./browser/browser-surfaces.js";
import { createBrowserSurfaceDriver } from "./browser/surface-driver.js";
import { installComputerDesk } from "./computer/computer-surfaces.js";
import { locateBrowser } from "./browser/locate.js";
import { createWebCatalogAccess } from "./web-catalog-access.js";
import { finishLeftOverDeletions } from "./web-deletion-sweep.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { awaitWebServerShutdown } from "./web-server-close.js";
import { startWebProjectSchedulers } from "./web-project-schedulers.js";
import { hostLog } from "./host-log.js";

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

export function createLocalWebServerFactory(platform: LocalWebPlatform) {
  return function createMolisWorkWebServer(options: WebServerOptions = {}): http.Server {
    const storageHome = path.resolve(options.homeDirectory ?? resolveMolisWorkHome());
    const catalogAccess = platform.openCatalog ? options.localHost
      ? options.localHost.ensureWebCatalog(storageHome, platform.openCatalog)
      : createWebCatalogAccess(storageHome, platform.openCatalog) : undefined;
    const withCatalog = catalogAccess?.withCatalog ?? platform.withCatalog;
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
    const runtimeIntegrations = serverOptions.runtimeIntegrationService ?? new RuntimeIntegrationService({
      homeDirectory: serverOptions.homeDirectory,
    });
    const webService = serverOptions.webServiceManager ?? new MolisWorkWebServiceManager({
      homeDirectory: serverOptions.homeDirectory,
    });
    const pty = nativeTerminal();
    const localHost = serverOptions.localHost ?? createMolisWorkLocalHost({
      homeDirectory: storageHome, characterSpawn: pty.spawn,
      actionAvailability,
      sceneAvailability: actionAvailability,
      projectRoutePrefix: projectId => fixture && projectId === fixture.projectId ? "" : `/projects/${encodeURIComponent(projectId)}`,
      workspacesFor: (projectId) => withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: (projectId) => {
        const configuredRoot = () => {
          if (!serverOptions.projectRoot) return null;
          const canonical_path = fs.realpathSync(serverOptions.projectRoot);
          return { workspace_id: `configured:${projectId}`, canonical_path, realpath_verified: true, display_name: path.basename(canonical_path) };
        };
        if (fixture && projectId === fixture.projectId) return configuredRoot();
        return withCatalog({ homeDirectory: storageHome }, catalog => workspaceRefFor(catalog, projectId) ?? configuredRoot());
      },
    });
    localHost.configurePersonalPlanning(storageHome, withCatalog);
    const ownsLocalHost = !serverOptions.localHost;
    const agents = ensureSystemAgentService(localHost, storageHome, withCatalog);
    const composition = createLocalWebComposition({ ...platform, withCatalog }, storageHome);
    const { serveWorkbenchAsset } = composition;
    const controlToken = resolveWebControlToken(serverOptions);
    const mutationKeys = new Map<string, LocalMutationState>();
    const webViewCache: MolisWorkWebViewCache = new Map();
    if (fixture?.demo && !fs.existsSync(fixture.databasePath)) seedDemoBoard(fixture.databasePath);
    const { periodicTasks: periodic } = composition;
    const projectSchedulers = startWebProjectSchedulers({ localHost, homeDirectory: storageHome, withCatalog, fixture, periodic,
      changed: databasePath => webViewCache.delete(databasePath), onError: error => hostLog.warn("schedule", "project_schedulers_not_started", error) });
    const feedSchedulers = projectSchedulers.runtimes;
    const im = createLocalImServer(storageHome, async id => {
      if (fixture && id === fixture.projectId) return { id, title: fixture.project?.display_name ?? 'Molis Work' };
      return withCatalog({homeDirectory:storageHome}, catalog => {
        const project = projectOrNull(catalog, id);
        return project ? { id: project.project_id, title: project.display_name } : null;
      });
    });
    // The browser service refuses this owner server, which carries the control token.
    const browserHost = lazyBrowserHost(storageHome, () => server);
    // One Assistant driver per project; site decisions stay beside the browser profile.
    const sites = new BrowserSiteDecisions(storageHome);
    const drivers = new Map<string, HostSurfaceDriver>();
    const computer = installComputerDesk(localHost, storageHome, periodic); // the Assistant's desktop: desk, helper, providers, sweep, HTTP, socket (specs/computer-use)
    const unregisterSurfaces = registerBrowserSurfaces(localHost, {
      siteDecisions: () => sites.list(),
      driverFor: async projectId => {
        // The person can turn the Assistant's use of the browser off altogether; rounds then get no browser tools.
        if (!sites.assistantEnabled || !locateBrowser()) return null;
        const known = fixture && projectId === fixture.projectId
          || await withCatalog({ homeDirectory: storageHome }, catalog => catalog.listProjects().some(project => project.project_id === projectId));
        if (!known) return null;
        let driver = drivers.get(projectId);
        if (!driver) drivers.set(projectId, driver = createBrowserSurfaceDriver(browserHost().page(projectId), origin => sites.blocked(origin), () => sites.assistantEnabled));
        return driver;
      },
    });
    const projectExists = async (projectId: string) => (fixture && projectId === fixture.projectId)
      || await withCatalog({ homeDirectory: storageHome }, catalog => projectOrNull(catalog, projectId) !== null);
    const server = trackHostListener(http.createServer((request, response) => runWithMolisWorkHome(storageHome, () => withCallId(newCallId(), async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      try {
        // Every route (locale switch included) answers only a request addressed to this machine by a loopback name, and none can be framed by another origin (S-02, S-21).
        if (refuseForeignRequest(request, response)) return;
        if (request.method === "GET" && url.pathname === "/locale") {
          const requested = url.searchParams.get("lang");
          const nextLocale = isWebLocale(requested)
            ? requested
            : resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
          response.writeHead(302, {
            location: safeNextPath(url.searchParams.get("next")),
            "set-cookie": localeSetCookie(nextLocale),
            "cache-control": "no-store",
          });
          response.end();
          return;
        }
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
          await pluginPagesFor(storageHome).bind(request, url, response);
          if (request.method === "GET" && url.pathname === "/health" && catalogAccess) {
            const ready = server.listening && Boolean(pty.host) && (Boolean(fixture) || catalogAccess.ready);
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
          if (await handleManagementActionHttp(request, response, url, storageHome, localHost) || await handleActionGatewayHttp(request, response, url, storageHome, localHost, withCatalog) || await handleProjectDeletionGatewayHttp(request, response, url, storageHome, webProjectDeletion(withCatalog, { isPanelAlive: panelId => pty.host?.alive(panelId) ?? false, feedSchedulers, webViewCache, localHost }))) return;
          if (serveWorkbenchAsset(request, response, url.pathname)) return;
          if (!pty.host) throw new Error("终端宿主尚未就绪");
          await handleMolisWorkWebRequest(
            request,
            response,
            url,
            serverOptions,
            runtimeIntegrations,
            webService,
            controlToken,
            webViewCache,
            feedSchedulers,
            pty.host,
            loopbackWebOrigin(server),
            localHost,
            composition,
            agents.agentHost,
            () => agents.ready,
          );
        });
      } catch (error) {
        runWithLocale(resolveWebLocale(request.headers.cookie, request.headers["accept-language"]), () => sendUnhandledWebError(response, error));
      }
    }))));
    // SSE is an active HTTP response, so stop its streams before close waits. The side panel's browser is asked to quit
    // at once, not when the last connection ends: a shutdown that is cut short still leaves its sign-ins written.
    awaitWebServerShutdown(server, () => { void projectSchedulers.stop().catch(() => undefined); im.stop(); void browserHost.current()?.close(); }, async () => {
      await projectSchedulers.stop();
      if (ownsLocalHost) { try { await localHost.close(); } finally { await catalogAccess?.close(); } }
    });
    attachMolisWorkBrowserSocket(server, controlToken, browserHost, { projectExists });
    computer.attach(server, controlToken);
    pty.host = attachMolisWorkPtySocket(server, controlToken, storageHome);
    server.once("close", bindPluginTerminalHost(storageHome, pty.host));
    // The Assistant's timed follow-ups run while this server runs: a due one starts a round; one missed while it was not
    // running is reported, never replayed late.
    const assistant = () => assistantServiceFor({ localHost, homeDirectory: storageHome, agentHost: agents.agentHost, agentReady: () => agents.ready, projectReference: async projectId => withCatalog({ homeDirectory: storageHome }, catalog => { const project = catalog.getProject(projectId);return molisWorkHostProjectReference({ databasePath: project.database_path, projectId }); }),
      projectTitle: async projectId => withCatalog({ homeDirectory: storageHome }, catalog => projectOrNull(catalog, projectId)?.display_name ?? null), pages: installedPagesPort(withCatalog, storageHome) }).service;
    attachWebAssistant(server, storageHome, assistant, agents, periodic);
    server.once("close", () => {
      void periodic.stop();
      im.close();
      void browserHost.current()?.close();
      unregisterSurfaces();
      void projectSchedulers.stop().catch(() => undefined);
    });
    if (!fixture && catalogAccess) finishLeftOverDeletions(server, storageHome, catalogAccess, periodic, serverOptions.deletionSweepMs);
    return server;
  }

}
