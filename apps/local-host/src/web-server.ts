import { closeImages } from "./images-native-plugin-http.js";
import { closeExperiments } from "./experiments-native-plugin-http.js";
import { loadCasebookConfiguration } from "./casebook/config.js";
import { handleCasebookHttp } from "./casebook/http.js";
import { resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { prologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { composeAgentHost, workspaceRefFor } from "./agent-host-composition.js";
import { createMolisWorkLocalHost } from "./project-host.js";
import { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import { MolisWorkWebServiceManager } from "./installer/web-service.js";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import { resolveWebControlToken } from "./web-control-token.js";
import { sendLocalWebJson as sendJson, authorizeLocalWebRequest, type LocalMutationState } from "./web-http.js";
import type { MolisWorkWebViewCache } from "./web-view.js";
import { openSessionRuntimeResources } from "./web-session.js";
import { seedDemoBoard } from "./demo-seed.js";
import { attachMolisWorkPtySocket } from "./pty-socket.js";
import { isWebLocale, localeSetCookie, resolveWebLocale, runWithLocale, safeNextPath } from "./web-locale.js";
import { fixtureWebBoardOptions, resolveWebRequest } from "./web-routing.js";
import { createLocalWebComposition, type LocalWebPlatform } from "./web-composition.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import { handleMolisWorkWebRequest } from "./web-request.js";

function loopbackWebOrigin(server: http.Server): string {
  const address = server.address();
  if (address && typeof address === "object") return `http://127.0.0.1:${address.port}`;
  return "http://127.0.0.1:4173";
}

export function createLocalWebServerFactory(platform: LocalWebPlatform) {
  const composition = createLocalWebComposition(platform);
  const { serveWorkbenchAsset } = composition;
  return function createMolisWorkWebServer(options: WebServerOptions = {}): http.Server {
    const storageHome = path.resolve(options.homeDirectory ?? resolveMolisWorkHome());
    const serverOptions: WebServerOptions = { ...options, homeDirectory: storageHome };
    const fixture = fixtureWebBoardOptions(serverOptions);
    const runtimeIntegrations = serverOptions.runtimeIntegrationService ?? new RuntimeIntegrationService({
      homeDirectory: serverOptions.homeDirectory,
    });
    const webService = serverOptions.webServiceManager ?? new MolisWorkWebServiceManager({
      homeDirectory: serverOptions.homeDirectory,
    });
    const localHost = serverOptions.localHost ?? createMolisWorkLocalHost({
      planningMethods: () => readPersonalPlanningMethodPacks(serverOptions.homeDirectory),
      workspacesFor: (projectId) => platform.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: (projectId) => platform.withCatalog({ homeDirectory: storageHome }, (catalog) => workspaceRefFor(catalog, projectId)),
    });
    const ownsLocalHost = !serverOptions.localHost;
    // Runtime storage and credentials belong to this explicit Home.
    const agents = composeAgentHost({
      localHost,
      authorizeWriterDirectory: async (projectId, canonicalPath) => {
        await platform.withCatalog({ homeDirectory: storageHome }, catalog => catalog.addWorkspaceProject({ canonical_path: canonicalPath, project_id: projectId, actor_id: "web-user", user_confirmed: true }));
      },
      homeDirectory: storageHome,
      workspacesFor: (projectId) => platform.withCatalog({ homeDirectory: storageHome }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: (projectId) => platform.withCatalog(
        { homeDirectory: serverOptions.homeDirectory },
        (catalog) => workspaceRefFor(catalog, projectId),
      ),
      prologue: {
        storageRoot: path.join(storageHome, "agent-runtime"),
        modelConfiguration: (selection) => platform.withCatalog(
          { homeDirectory: storageHome },
          (catalog) => prologueModelConfiguration(catalog.models.resolveConfiguration(selection)),
        ),
        resolveCredential: (ref) => platform.withCatalog(
          { homeDirectory: storageHome },
          (catalog) => {
            const provider = catalog.models.list().find((entry) => entry.credential_ref === ref);
            return provider ? catalog.models.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null : null;
          },
        ),
      },
    });
    const controlToken = resolveWebControlToken(serverOptions);
    serverOptions.casebook ??= loadCasebookConfiguration(storageHome,serverOptions.casebookConfigPath,[controlToken]);
    if ([...(serverOptions.casebook?.grants ?? []), ...(serverOptions.casebook?.catalogConnections ?? [])].some(g => g.token === controlToken || g.token.length < 32)) {
      throw new Error('Casebook requires a separate server-only credential');
    }
    const mutationKeys = new Map<string, LocalMutationState>();
    const webViewCache: MolisWorkWebViewCache = new Map();
    const feedSchedulers = new Map<string, FeedSchedulerRuntime>();
    const sessionResources = openSessionRuntimeResources(serverOptions);
    void sessionResources.catch(() => undefined);
    if (fixture?.demo && !fs.existsSync(fixture.databasePath)) seedDemoBoard(fixture.databasePath);
    const pty = { host: null as MolisWorkPtyHost | null };
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
            (projectId) => platform.withCatalog(
              { homeDirectory: serverOptions.homeDirectory },
              (catalog) => workspaceRefFor(catalog, projectId),
            ),
          );
        });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    }));
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
    server.once("close", () => {
      void closeExperiments(storageHome);
      void closeImages(storageHome);
      clearInterval(schedulerTimer);
      feedSchedulers.clear();
      void agents.dispose().catch(() => undefined);
      if (ownsLocalHost) void localHost.close();
      void sessionResources
        .then((resources) => {
          resources.recorder.close();
          resources.ownedCodexTransport?.close();
          resources.registry.close();
        })
        .catch(() => undefined);
    });
    return server;
  }

}
