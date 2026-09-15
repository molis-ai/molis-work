import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHeader } from "./web-http.js";
import { L } from "./web-locale.js";
import fs from "node:fs";
import { handleGoalsWebHttp } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsAdapter, isProjectSettingsWorkbenchPath, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import type { SessionRuntimeResources } from "./web-session.js";
import { cachedMolisWorkWebView, type MolisWorkWebViewCache } from "./web-view.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { createLocalFeedSourceScheduler } from "./feed-source-scheduler.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { handleFeedNativePluginHttp } from "./feed-native-plugin-http.js";
import { handleInboxNativePluginHttp } from "./inbox-native-plugin-http.js";
import { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { resolveWebRequest } from "./web-routing.js";
import { handleLocalCatalogWebRequest } from "./web-catalog.js";

export async function handleMolisWorkWebRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService,
  webService: MolisWorkWebServiceManager,
  controlToken: string,
  webViewCache: MolisWorkWebViewCache,
  feedSchedulers: Map<string, FeedSchedulerRuntime>,
  ptyHost: MolisWorkPtyHost,
  webUrl: string,
  sessionResources: Promise<SessionRuntimeResources>,
  localHost: MolisWorkLocalHost,
  composition: LocalWebComposition,
): Promise<void> {
  const { PAGE_CSP, handleSessions, handleDesktopPanelApi, goalsReadHttp, planningHttp, desktopRuntimeAvailability, servePtyClient, workbenchRenderer, buildCapsuleSnapshot, handleArtifactNativePluginHttp, isDesktopShellRequest } = composition;
  const resolved = await resolveWebRequest(serverOptions, url.pathname, composition.withCatalog);
  if (resolved.kind === "catalog_index") {
    await handleLocalCatalogWebRequest(request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, feedSchedulers, localHost, resolved.projects, composition, {
      isPanelAlive: (panelId) => ptyHost.alive(panelId),
      releaseProject: async (databasePath) => {
        feedSchedulers.delete(databasePath);
        webViewCache.delete(databasePath);
        await localHost.closeProject(databasePath);
      },
    });
    return;
  }
      if (resolved.kind === "project_not_found") {
        sendJson(response, 404, { error: L("找不到这个 Molis Work 项目") });
        return;
      }
      const options = resolved.options;
      url.pathname = resolved.pathname;
      if (!fs.existsSync(options.databasePath)) {
        if (url.pathname.startsWith("/api/")) {
          sendJson(response, 404, { error: "Molis Work 数据库不存在，请先初始化" });
        } else {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("Molis Work 数据库不存在，请先运行 molis-work v1 init。\n");
        }
        return;
      }
      const hostReference = molisWorkHostProjectReference({
        databasePath: options.databasePath,
        boardId: options.boardId,
        projectId: options.project?.project_id,
      });
      await localHost.withProject(hostReference, async ({ store, coordinator }) => {
        if (!feedSchedulers.has(options.databasePath)) {
        const feed = createLocalFeedApplication(store.db);
        feed.recoverInterruptedSourceRuns(options.boardId);
        createLocalFeedConnectorService(store.db, options.boardId).ensureSources();
        const scheduler = createLocalFeedSourceScheduler(store.db, options.boardId);
        feedSchedulers.set(options.databasePath, { scheduler });
        void scheduler.tick().then((result) => {
          if (result.completed || result.failed) webViewCache.delete(options.databasePath);
        }).catch(() => undefined);
      }
      const goalsAdapter = createWorkbenchGoalsAdapter(coordinator.goals);
      const readWebView = (): MolisWorkWebView =>
        cachedMolisWorkWebView(webViewCache, store, coordinator, options);
      {
        const projectSessionWorkspaceMatch = url.pathname.match(/^\/(sessions|workspaces)$/);
        if (request.method === "GET" && projectSessionWorkspaceMatch) {
          const desktopQuery = isDesktopShellRequest(request, url) ? "?desktop=1" : "";
          response.writeHead(302, {
            location: `${options.routePrefix}/${desktopQuery}#sessions`,
            "cache-control": "no-store",
          });
          response.end();
          return;
        }
        if (await handleSessions(request, response, url, serverOptions.homeDirectory, options, sessionResources, readWebView,
          (goalId) => {
            const history = coordinator.goalQueries.readGoalContract(options.boardId, goalId);
            const event_work = coordinator.goalEvents.isEventStateOwner(options.boardId, goalId);
            const state = event_work ? coordinator.goalEvents.readState(options.boardId, goalId) : null;
            return {
              board: history.board,
              goal: history.goal,
              runs: history.runs,
              evidence: history.evidence,
              risks: history.risks,
              event_work,
              event_facts: state
                ? {
                    work_status: state.work_status,
                    outcome: state.agreement.outcome,
                    next_step: state.progress_summary?.next_step ?? null,
                    pending_decisions: state.pending_decisions.map((item) => item.question),
                    current_decisions: state.current_decisions.map((item) => item.conclusion),
                    gaps: state.gaps.map((item) => item.statement),
                    requirements: state.requirements.map((item) => item.statement),
                    stale_summary: state.progress_summary?.stale === true,
                    resume_required: state.work_status === "completed" || state.work_status === "cancelled",
                    closure_reason: state.closure?.reason ?? null,
                  }
                : null,
            };
          })) return;
        if (request.method === "GET" && isProjectSettingsWorkbenchPath(url.pathname) && url.searchParams.get("embed") !== "1") {
          url.pathname = "/";
        }
        if (goalsReadHttp.settings(request, response, url, options.boardId, readWebView, coordinator, controlToken)) return;
        if (await planningHttp.project(request, response, url, serverOptions.homeDirectory, options.boardId, controlToken, readWebView, goalsAdapter.planning)) return;
        if (request.method === "GET" && url.pathname === "/health") {
          sendJson(response, 200, {
            status: "ok",
            process_id: process.pid,
            service_process_id: serviceProcessId(),
            board_id: options.boardId,
            desktop_tui: true,
          });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/runtime-availability") {
          sendJson(response, 200, desktopRuntimeAvailability());
          return;
        }
        if (request.method === "GET" && url.pathname === "/desktop/pty-client.js") {
          servePtyClient(request, response);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/board/cursor") {
          sendJson(response, 200, { observed_event_cursor: store.eventCursor(options.boardId) });
          return;
        }
        if (goalsReadHttp.fragments(request, response, url, options.boardId, store, coordinator, readWebView)) return;
        if (request.method === "GET" && url.pathname === "/api/board") {
          sendJson(response, 200, readWebView());
          return;
        }
        if (await handleInboxNativePluginHttp(request, response, url, {
          boardId: options.boardId,
          store,
          invalidateWebView: () => webViewCache.delete(options.databasePath),
          reconcileGoalDecisions: () => coordinator.goalDecisionAttention.reconcile(options.boardId),
        })) return;
        if (await handleFeedNativePluginHttp(request, response, url, {
          renderer: workbenchRenderer,
          boardId: options.boardId,
          routePrefix: options.routePrefix,
          databasePath: options.databasePath,
          store,
          coordinator,
          readWebView,
          invalidateWebView: () => webViewCache.delete(options.databasePath),
        })) return;
        if (request.method === "GET" && url.pathname === "/api/capsule") {
          if (!options.project) {
            sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
            return;
          }
          const directory = coordinator.goalEvents.listGoals({
            board_id: options.boardId,
            limit: 100,
          });
          sendJson(response, 200, buildCapsuleSnapshot(readWebView(), directory.goals));
          return;
        }
        if (options.project?.project_id) {
          const handled = await handleDesktopPanelApi(
            request,
            response,
            url,
            serverOptions,
            options.project.project_id,
            coordinator,
            options.boardId,
            ptyHost,
            webUrl,
          );
          if (handled) return;
        }
        if (handleLocalProjectReferenceHttp(request, response, url, options, coordinator.evidenceVerification.query)) return;
        if (await handleGoalsWebHttp({
          method: request.method, pathname: url.pathname, search: url.searchParams,
          readBody: () => readBody(request), respond: (status, body) => sendJson(response, status, body),
          options, idempotencyHeader: requestHeader(request, "x-molis-work-idempotency-key", "x-goalboard-idempotency-key"),
          snapshot: () => store.snapshot(options.boardId), changed: () => { webViewCache.delete(options.databasePath); },
          commands: goalsAdapter.commands, lifecycle: goalsAdapter.lifecycle,
          query: coordinator.goalQueries,
          setActiveGoal: (...args) => coordinator.setActiveGoal(...args),
          goalTreeWebInput: coordinator.goalTreeWebInput, goalTreeDecision: coordinator.goalTreeDecision,
          goalEvents: coordinator.goalEvents,
          journalEvents: () => store.readEventsDescending(options.boardId),
        })) return;
        if (handleArtifactNativePluginHttp(request, response, url.pathname, {
          boardId: options.boardId, routePrefix: options.routePrefix ?? "",
          projectTitle: options.project?.display_name ?? "Molis Work",
          query: coordinator.artifacts.query, desktopShell: isDesktopShellRequest(request, url), pageCsp: PAGE_CSP,
        })) return;
        if (await goalsReadHttp.page(request, response, url, options, serverOptions.homeDirectory, readWebView, sessionResources, controlToken, coordinator, store)) return;
        sendJson(response, 404, { error: L("页面或接口不存在") });
      }
      });
}
