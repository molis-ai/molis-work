import { createLocalImServer } from "./im-server.js";
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
import { workspaceRefFor } from "./agent-host-composition.js";
import { ensureSystemAgentService } from "./system-agent-service.js";
import { createMolisWorkLocalHost } from "./project-host.js";
import { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import { resolveWebControlToken } from "./web-control-token.js";
import { sendLocalWebJson as sendJson, authorizeLocalWebRequest, refuseForeignRequest, type LocalMutationState } from "./web-http.js";
import type { MolisWorkWebViewCache } from "./web-view.js";
import { seedDemoBoard } from "./demo-seed.js";
import { attachMolisWorkPtySocket } from "./pty-socket.js";
import { isWebLocale, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "./web-locale.js";
import { fixtureWebBoardOptions } from "./web-routing.js";
import { createLocalWebComposition, type LocalWebPlatform } from "./web-composition.js";
import type { WebServerOptions } from "./web-types.js";
import { handleMolisWorkWebRequest } from "./web-request.js";
import { assistantServiceFor } from "./assistant/assistant-http.js";
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
    const mutationKeys = new Map<string, LocalMutationState>();
    const webViewCache: MolisWorkWebViewCache = new Map();
    localHost.configureSessionRuntime(storageHome, serverOptions.runtimeSessionTransport);
    const sessionResources = localHost.sessionResources();
    void sessionResources.catch(() => undefined);
    if (fixture?.demo && !fs.existsSync(fixture.databasePath)) seedDemoBoard(fixture.databasePath);
    const warnBackground = (message: string, error: unknown) => console.warn(message, error);
    const projectSchedulers = startWebProjectSchedulers({ localHost, homeDirectory: storageHome, withCatalog, fixture, agents,
      changed: databasePath => webViewCache.delete(databasePath), onError: error => warnBackground("[schedule] 项目后台调度没有启动", error) });
    const feedSchedulers = projectSchedulers.runtimes;
    const pty = { host: null as MolisWorkPtyHost | null };
    const im = createLocalImServer(storageHome, async id => {
      if (fixture && id === fixture.projectId) return { id, title: fixture.project?.display_name ?? 'Molis Work' };
      return withCatalog({homeDirectory:storageHome}, catalog => {
        try { const project=catalog.getProject(id); return {id:project.project_id,title:project.display_name}; }
        catch { return null; }
      });
    });
    // The side panel's browser (specs/archive/side-panel): started on first use, one page per project. Its pages may never load
    // this server itself, which hands its control token to whoever loads it.
    const browserHost = lazyBrowserHost(storageHome, () => server);
    // The Assistant may look at and act on a project's page through Prologue (specs/archive/side-panel P5): one driver per page,
    // found by the project its round works on; sites the person allowed or blocked are kept beside the browser profile.
    const sites = new BrowserSiteDecisions(storageHome);
    const drivers = new Map<string, HostSurfaceDriver>();
    const computer = installComputerDesk(localHost, storageHome); // the Assistant's desktop: desk, helper, providers, sweep, HTTP, socket (specs/computer-use)
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
    const server = http.createServer((request, response) => runWithMolisWorkHome(storageHome, () => withCallId(newCallId(), async () => {
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
            sessionResources,
            localHost,
            composition,
            agents.agentHost,
            () => agents.ready,
          );
        });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })));
    // SSE is an active HTTP response, so stop its streams before close waits. The side panel's browser is asked to quit
    // at once, not when the last connection ends: a shutdown that is cut short still leaves its sign-ins written.
    awaitWebServerShutdown(server, () => { void projectSchedulers.stop().catch(() => undefined); im.stop(); void browserHost.current()?.close(); }, async () => {
      await projectSchedulers.stop();
      if (ownsLocalHost) { try { await localHost.close(); } finally { await catalogAccess?.close(); } }
    });
    attachMolisWorkBrowserSocket(server, controlToken, browserHost, { projectExists });
    computer.attach(server, controlToken);
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
    const assistantTimer = setInterval(() => runWithMolisWorkHome(storageHome, () => withCallId(newCallId(), async () => { await assistant().scanNewMaterial(); }))
      .catch(error => warnBackground("[assistant] 新资料没有读到", error)), 300_000);
    assistantTimer.unref();
    // Reminders the person set in Plugins: asked about once a minute, each told once when it comes due.
    const reminderTimer = setInterval(() => runWithMolisWorkHome(storageHome, () => withCallId(newCallId(), async () => { await assistant().sweepReminders(); }))
      .catch(error => warnBackground("[assistant] 到期提醒没有读到", error)), 60_000);
    reminderTimer.unref();
    server.once("close", () => {
      clearInterval(assistantTimer);
      clearInterval(reminderTimer);
      im.close();
      void browserHost.current()?.close();
      unregisterSurfaces();
      void projectSchedulers.stop().catch(() => undefined);
    });
    if (!fixture && catalogAccess) finishLeftOverDeletions(server, storageHome, catalogAccess, serverOptions.deletionSweepMs);
    return server;
  }

}
