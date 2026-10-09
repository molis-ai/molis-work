import { createLocalImServer } from "./im-server.js";
import { projectActionAvailability } from "./project-action-availability.js";
import { handleActionGatewayHttp } from "./action-gateway-http.js";
import { handleProjectDeletionGatewayHttp } from "./project-deletion-gateway.js";
import { ProjectDeletionService, webProjectDeletionPorts } from "./project-deletion-service.js";
import { closeExperiments } from "./experiments-native-plugin-http.js";
import { loadCasebookConfiguration } from "./casebook/config.js";
import { handleCasebookHttp } from "./casebook/http.js";
import { resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { workspaceRefFor } from "./agent-host-composition.js";
import { ensureSystemAgentService } from "./system-agent-service.js";
import { createMolisWorkLocalHost } from "./project-host.js";
import { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import { resolveWebControlToken } from "./web-control-token.js";
import { sendLocalWebJson as sendJson, authorizeLocalWebRequest, type LocalMutationState } from "./web-http.js";
import type { MolisWorkWebViewCache } from "./web-view.js";
import { seedDemoBoard } from "./demo-seed.js";
import { attachMolisWorkPtySocket } from "./pty-socket.js";
import { isWebLocale, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "./web-locale.js";
import { fixtureWebBoardOptions, resolveWebRequest } from "./web-routing.js";
import { createLocalWebComposition, type LocalWebPlatform } from "./web-composition.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import { handleMolisWorkWebRequest } from "./web-request.js";
import { assistantServiceFor } from "./assistant/assistant-http.js";
import { BrowserHost } from "./browser/browser-host.js";
import { attachMolisWorkBrowserSocket } from "./browser/browser-socket.js";
import { handleBrowserHttp } from "./browser/browser-http.js";
import { BrowserSiteDecisions, registerBrowserSurfaces } from "./browser/browser-surfaces.js";
import { createBrowserSurfaceDriver } from "./browser/surface-driver.js";
import { locateBrowser } from "./browser/locate.js";
import { createWebCatalogAccess } from "./web-catalog-access.js";
import { finishLeftOverDeletions } from "./web-deletion-sweep.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

function loopbackWebOrigin(server: http.Server): string {
  const address = server.address();
  if (address && typeof address === "object") return `http://127.0.0.1:${address.port}`;
  return "http://127.0.0.1:4173";
}

export function createLocalWebServerFactory(platform: LocalWebPlatform) {
  return function createMolisWorkWebServer(options: WebServerOptions = {}): http.Server {
    const storageHome = path.resolve(options.homeDirectory ?? resolveMolisWorkHome());
    const catalogAccess = platform.openCatalog ? options.localHost
      ? options.localHost.ensureWebCatalog(storageHome, platform.openCatalog)
      : createWebCatalogAccess(storageHome, platform.openCatalog) : undefined;
    const withCatalog = catalogAccess?.withCatalog ?? platform.withCatalog;
    const composition = createLocalWebComposition({ ...platform, withCatalog });
    const { serveWorkbenchAsset } = composition;
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
    const localHost = serverOptions.localHost ?? createMolisWorkLocalHost({
      homeDirectory: storageHome,
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
    const controlToken = resolveWebControlToken(serverOptions);
    serverOptions.casebook ??= loadCasebookConfiguration(storageHome,serverOptions.casebookConfigPath,[controlToken]);
    if ([...(serverOptions.casebook?.grants ?? []), ...(serverOptions.casebook?.catalogConnections ?? [])].some(g => g.token === controlToken || g.token.length < 32)) {
      throw new Error('Casebook requires a separate server-only credential');
    }
    const mutationKeys = new Map<string, LocalMutationState>();
    const webViewCache: MolisWorkWebViewCache = new Map();
    const feedSchedulers = new Map<string, FeedSchedulerRuntime>();
    localHost.configureSessionRuntime(storageHome, serverOptions.runtimeSessionTransport);
    const sessionResources = localHost.sessionResources();
    void sessionResources.catch(() => undefined);
    if (fixture?.demo && !fs.existsSync(fixture.databasePath)) seedDemoBoard(fixture.databasePath);
    const pty = { host: null as MolisWorkPtyHost | null };
    // The deletion a forwarding process (the stdio MCP) asks of this Host: the terminals and runtimes it must check and let go of are this server's.
    const projectDeletion = new ProjectDeletionService(withCatalog, webProjectDeletionPorts({ isPanelAlive: panelId => pty.host?.alive(panelId) ?? false, feedSchedulers, webViewCache, localHost }));
    const im = createLocalImServer(storageHome, async id => {
      if (fixture && id === fixture.projectId) return { id, title: fixture.project?.display_name ?? 'Molis Work' };
      return withCatalog({homeDirectory:storageHome}, catalog => {
        try { const project=catalog.getProject(id); return {id:project.project_id,title:project.display_name}; }
        catch { return null; }
      });
    });
    // The side panel's browser (specs/archive/side-panel): started on first use, one page per project. Its pages may never load
    // this server itself, which hands its control token to whoever loads it.
    let browsers: BrowserHost | null = null;
    const browserHost = () => browsers ??= new BrowserHost({ homeDirectory: storageHome, forbiddenOrigins: () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      return port ? [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`] : [];
    } });
    // The Assistant may look at and act on a project's page through Prologue (specs/archive/side-panel P5): one driver per page,
    // found by the project its round works on; sites the person allowed or blocked are kept beside the browser profile.
    const sites = new BrowserSiteDecisions(storageHome);
    const drivers = new Map<string, HostSurfaceDriver>();
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
      || await withCatalog({ homeDirectory: storageHome }, catalog => { try { catalog.getProject(projectId); return true; } catch { return false; } });
    const server = http.createServer((request, response) => runWithMolisWorkHome(storageHome, async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      try {
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
          if (url.pathname.startsWith('/casebook/v1/')) {
            const requestHost = new URL(`http://${request.headers.host ?? ''}`);
            if (!['127.0.0.1','localhost','[::1]'].includes(requestHost.hostname)) { sendJson(response,403,{code:'not_authorized'}); return; }
            if (await handleCasebookHttp(request,response,url,serverOptions.casebook,localHost,
              pathname => resolveWebRequest(serverOptions,pathname,composition.withCatalog))) return;
          }
          if (!authorizeLocalWebRequest(request, response, url, controlToken, mutationKeys)) return;
          if (request.method === "GET" && url.pathname === "/health" && catalogAccess) {
            const ready = server.listening && Boolean(pty.host) && (Boolean(fixture) || catalogAccess.ready);
            sendJson(response, ready ? 200 : 503, {
              status: ready ? "ok" : "starting", process_id: process.pid,
              service_process_id: serviceProcessId(), desktop_tui: Boolean(pty.host),
              ...(fixture ? { project_id: fixture.projectId } : { project_count: catalogAccess.projectCount }),
            });
            return;
          }
          if (await handleBrowserHttp(request, response, url, { browsers: browserHost, projectExists, sites, decideSite: decision => agents.decideSurfaceSite(decision) })) return;
          if (await im.handle(request, response, url, loopbackWebOrigin(server))) return;
          if (await handleActionGatewayHttp(request, response, url, storageHome, localHost, withCatalog)) return;
          if (await handleProjectDeletionGatewayHttp(request, response, url, storageHome, projectDeletion)) return;
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
            sessionResources,
            localHost,
            composition,
            agents.agentHost,
            () => agents.ready,
            (projectId) => withCatalog(
              { homeDirectory: serverOptions.homeDirectory },
              (catalog) => workspaceRefFor(catalog, projectId),
            ),
          );
        });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    }));
    // SSE is an active HTTP response, so stop its streams before close waits. The side panel's browser is asked to quit
    // at once, not when the last connection ends: a shutdown that is cut short still leaves its sign-ins written.
    const closeServer = server.close.bind(server);
    server.close = (callback) => { im.stop(); void browsers?.close(); return closeServer(callback); };
    attachMolisWorkBrowserSocket(server, controlToken, browserHost, { projectExists });
    pty.host = attachMolisWorkPtySocket(server, controlToken, {
      onData(panelId, sessionId, data) {
        void sessionResources
          .then((resources) => resources.recorder.recordOutput(panelId, sessionId, data))
          .catch(() => undefined);
      },
      onExit(panelId, sessionId, exit) {
        void sessionResources
          .then((resources) => resources.recorder.recordExit(panelId, sessionId, exit))
          .catch(() => undefined);
      },
    });
    const schedulerTimer = setInterval(() => runWithMolisWorkHome(storageHome, () => {
      for (const [databasePath, runtime] of feedSchedulers) {
        void runtime.scheduler.tick()
          .then((result) => {
            if (result.completed || result.failed) webViewCache.delete(databasePath);
          })
          .catch(() => undefined);
        void runtime.schedule.tick()
          .then((result) => {
            if (result.invoked) webViewCache.delete(databasePath);
          })
          .catch(() => undefined);
      }
    }), 30_000);
    schedulerTimer.unref();
    // The Assistant's timed follow-ups run while this server runs: a due one starts a round; one missed while it was not
    // running is reported, never replayed late.
    const assistant = () => assistantServiceFor({ localHost, homeDirectory: storageHome, agentHost: agents.agentHost, agentReady: () => agents.ready,
      projectTitle: async projectId => withCatalog({ homeDirectory: storageHome }, catalog => { try { return catalog.getProject(projectId).display_name; } catch { return null; } }) }).service;
    // Timed rounds live in Prologue's durable queue: the Assistant becomes their runner as soon as the runtime is up.
    // With timed work waiting the runtime is started for it; otherwise the runner joins whenever something starts the
    // runtime (a server start then costs no runtime until it is needed). It may be busy for a moment at start (another
    // process releasing it): keep trying for a while.
    void runWithMolisWorkHome(storageHome, async () => {
      if (!assistant().hasTimedWork()) await agents.started;
      for (let attempt = 0; attempt < 40; attempt++) {
        try { await agents.ready; if (await assistant().attachSchedule()) return; } catch (error) { if (attempt === 0) console.warn("[assistant] 定时队列暂时没有接上，稍后重试", error); }
        await new Promise(resolve => setTimeout(resolve, 15_000).unref());
      }
    });
    // New material that shares a Goal with a live work: looked for every five minutes.
    const assistantTimer = setInterval(() => runWithMolisWorkHome(storageHome, async () => { await assistant().scanNewMaterial(); })
      .catch(error => console.warn("[assistant] 新资料没有读到", error)), 300_000);
    assistantTimer.unref();
    // Reminders the person set in Plugins: asked about once a minute, each told once when it comes due.
    const reminderTimer = setInterval(() => runWithMolisWorkHome(storageHome, async () => { await assistant().sweepReminders(); })
      .catch(error => console.warn("[assistant] 到期提醒没有读到", error)), 60_000);
    reminderTimer.unref();
    server.once("close", () => {
      clearInterval(assistantTimer);
      clearInterval(reminderTimer);
      im.close();
      void browsers?.close();
      unregisterSurfaces();
      void closeExperiments(storageHome);
      clearInterval(schedulerTimer);
      feedSchedulers.clear();
      if (ownsLocalHost) void localHost.close();
      if (ownsLocalHost) void catalogAccess?.close();
    });
    if (!fixture && catalogAccess) finishLeftOverDeletions(server, storageHome, catalogAccess, serverOptions.deletionSweepMs);
    return server;
  }

}
