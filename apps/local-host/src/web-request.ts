import { feedRuleActions, createFeedCaptureTrigger } from "@molis-ai/molis-work-plugin-feed";
import { HOME_TALK_PERMISSIONS } from "./home-talk-actions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import { createHomeJudgmentTrigger, HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { bindPersonalPlanningWebActions } from "./personal-planning-actions.js";
import { ARTIFACT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-artifacts";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { handleImagesNativePluginHttp } from "./images-native-plugin-http.js";
import { IMAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-images";
import { handlePptNativePluginHttp } from "./ppt-native-plugin-http.js";
import { PPT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-ppt";
import { handleFormNativePluginHttp } from "./form-native-plugin-http.js";
import { FORM_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-form";
import { handleDatasetNativePluginHttp } from "./dataset-native-plugin-http.js";
import { DATASET_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-dataset";
import { COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { handleCogniaNativePluginHttp } from "./cognia-native-plugin-http.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { handleJellyNativePluginHttp } from "./jelly-native-plugin-http.js";
import { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { handleFunctionsHttp } from "./functions-http.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActions, INBOX_ACTION_PERMISSIONS, createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleBuilderHttp } from "./plugin-builder-surface.js";
import { handleAgentStudioHttp } from "./plugin-builder/agent-surface.js";
import { observedWebGoalsActions } from './casebook/web-observer.js';
import { bindGoalsWebActions } from "./goals-actions.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHeader } from "./web-http.js";
import { L } from "./web-locale.js";
import fs from "node:fs";
import { handleGoalsWebHttp, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import type { SessionRuntimeResources } from "./web-session.js";
import { cachedMolisWorkWebView, type MolisWorkWebViewCache } from "./web-view.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { createLocalFeedSourceScheduler } from "./feed-source-scheduler.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { bindScheduledTaskRunner, scheduleServiceFor } from "./schedule-runtime.js";
import { createHostScheduledTaskRunner } from "./schedule-task-runner.js";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleFeedNativePluginHttp } from "./feed-native-plugin-http.js";
import { handleInboxNativePluginHttp } from "./inbox-native-plugin-http.js";
import { handleWorkflowsNativePluginHttp } from "./workflows-native-plugin-http.js";
import { handleInformationAssistantHttp } from "./assistant-http.js";
import { handleHomeDockJudgmentHttp } from "./home-dock-http.js";
import { handleScheduleNativePluginHttp } from "./schedule-native-plugin-http.js";
import { handlePersonalNativePluginHttp } from "./personal-native-plugin-http.js";
import { shelfProjectMaterials } from "./shelf-native-plugin-http.js";
import { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { resolveWebRequest } from "./web-routing.js";
import { handleLocalCatalogWebRequest } from "./web-catalog.js";
import { handleAgentReviewHttp } from "./agent-review-http.js";
import { inspectGitIndex } from "./workspace-git-index.js";
import { handleCodingPluginHttp, type CodingSurfacePorts } from "./coding-surface.js";

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
  agentHost: AgentHost,
  agentReady: () => Promise<void>,
  workspaceFor: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>,
): Promise<void> {
  const { PAGE_CSP, handleSessions, handleDesktopPanelApi, goalsReadHttp, planningHttp, desktopRuntimeAvailability, servePtyClient, workbenchRenderer, buildCapsuleSnapshot, handleArtifactNativePluginHttp, isDesktopShellRequest } = composition;
  const resolved = await resolveWebRequest(serverOptions, url.pathname, composition.withCatalog);
  if (request.method === "GET" && resolved.kind !== "project_not_found"
    && (resolved.kind === "board" ? resolved.pathname === "/" : url.pathname === "/")
    && (url.searchParams.get("openPlugin") === "functions" || url.searchParams.get("panePlugin") === "functions")) {
    const next = new URL("/capabilities/rules", url.origin);
    if (resolved.kind === "board" && resolved.options.project) next.searchParams.set("project", resolved.options.project.project_id);
    const rule = url.searchParams.get("openItem") ?? url.searchParams.get("paneItem");
    if (rule) next.searchParams.set("rule", rule);
    if (url.searchParams.get("desktop") === "1") next.searchParams.set("desktop", "1");
    response.writeHead(302, { location: next.pathname + next.search, "cache-control": "no-store" });
    response.end();
    return;
  }
  if (resolved.kind === "catalog_index") {
    await handleLocalCatalogWebRequest(request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, resolved.projects, composition, {
      isPanelAlive: (panelId) => ptyHost.alive(panelId),
      releaseProject: async (databasePath) => {
        feedSchedulers.delete(databasePath);
        webViewCache.delete(databasePath);
        await localHost.closeProject(databasePath);
      },
    }, async () => { await agentReady(); return agentHost.descriptors(); });
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
      await localHost.withProject(hostReference, async (runtime) => {
        const { store, coordinator } = runtime;
        const feedOptions = {
          captureJudgment: createFeedCaptureTrigger({ scenes: localHost.sceneClient(hostReference), boardId: hostReference.board_id,
            context: () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user",
              permissions: ["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"] }) }),
          homeJudgment: createHomeJudgmentTrigger({ scenes: localHost.sceneClient(hostReference), boardId: hostReference.board_id,
            context: () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: HOME_ACTION_PERMISSIONS.filter(permission => permission !== "home:write") }) }),
          inboxJudgment: createInboxJudgmentTrigger({ scenes: localHost.sceneClient(hostReference), boardId: hostReference.board_id,
            context: () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user",
              permissions: ["inbox:read", "model:invoke", "functions:invoke"] }) }),
        };
        const homeActions = bindLocalWebActions(localHost, hostReference, [...HOME_ACTION_PERMISSIONS, ...HOME_TALK_PERMISSIONS, "inbox:write"]);
        const goalActions = observedWebGoalsActions(runtime, hostReference,
          bindGoalsWebActions(localHost.actionClient(hostReference), hostReference));
        if (url.pathname === "/api/project-settings/workspaces" && options.project && ["GET", "POST"].includes(request.method ?? "")) {
          const workspaces = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
            catalog => catalog.listWorkspaceDirectory(options.project!.project_id).map(projectWorkspaceRef));
          const settings = new ProjectBrowsingSettings(store.db);
          try {
            if (request.method === "POST") {
              const body = await readBody(request);
              settings.select(options.boardId, body.workspace_id, workspaces);
            }
            sendJson(response, 200, { workspaces, selected: settings.read(options.boardId, workspaces)?.workspace_id ?? null });
          } catch (error) { sendJson(response, 403, { error: error instanceof Error ? error.message : String(error) }); }
          return;
        }

        const codingServices: Pick<CodingSurfacePorts, "capabilities" | "actions" | "execution" | "homeDirectory" | "characterWorkspaces" | "characterSpawn"> = {
          actions: { registry: localHost.actionRegistry(hostReference), client: { ...localHost.actionClient(hostReference), ...localHost.syncActionClient(hostReference) }, project_id: hostReference.project_id },
          characterSpawn: request => ptyHost.spawn(request),
          characterWorkspaces: () => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => options.project ? catalog.listWorkspaceDirectory(options.project.project_id) : []),
          homeDirectory: serverOptions.homeDirectory,
          capabilities: localHost.client(hostReference),
          execution: {
            ready: agentReady,
            models: () => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
              const healthy = new Set(catalog.models.health().filter((entry) => entry.status === "ready").map((entry) => entry.provider_id));
              return catalog.models.list().filter((entry) => healthy.has(entry.provider_id)).flatMap((provider) =>
                provider.models.filter((model) => model.enabled).map((model) => ({ provider_id: provider.provider_id,
                  model_id: model.model_id, label: `${provider.display_name} · ${model.display_name ?? model.model_id}` })));
            }),
          },
        };
        // The agent-built plugin studio: Prologue designer and code agent, sandboxed plugin backends.
        if (await handleAgentStudioHttp(request, response, url, { store, boardId: options.boardId, homeDirectory: serverOptions.homeDirectory,
          routePrefix: options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "",
          models: async () => await codingServices.execution?.models() ?? [], actorId: "web-user", actions: codingServices.actions,
          ...(codingServices.capabilities ? { capabilities: codingServices.capabilities } : {}) }, controlToken)) return;
        if (await handleBuilderHttp(request, response, url, { ...codingServices, store, boardId: options.boardId,
          routePrefix: options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "",
          actorId: "web-user", goalTitle: (id) => coordinator.goalQueries.getGoal(options.boardId, id)?.title,
          escapeHtml: (value) => String(value), translate: (value) => value }, controlToken)) return;
        const runtimePluginRoute = /^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]*)\//u.exec(url.pathname);
        const runtimeUpdatesRoute = url.pathname === "/api/plugins/runtime/updates";
        const runtimeEntry = runtimePluginRoute
          ? BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === runtimePluginRoute[1]) : undefined;
        if (runtimeUpdatesRoute || (runtimePluginRoute && (!runtimeEntry || runtimeEntry.manifest.kind === "app" || runtimeEntry.manifest.routes?.length))) {
          // Bundled installations retain project policy. Other plugins are
          // admitted by this project's Runtime and its actual lifecycle grants.
          const enabled = runtimeUpdatesRoute
            ? Boolean(options.project)
            : runtimeEntry?.personal || (options.project && (!runtimeEntry || await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
                catalog => availableProjectPluginIds(catalog.listProjectPlugins(options.project!.project_id)).has(runtimeEntry.project_plugin_id))));
          if (!enabled) { sendJson(response, 404, { error: "这个项目未启用该插件" }); return; }
          if (await handleCodingPluginHttp(request, response, url, { ...codingServices, store, boardId: options.boardId,
            routePrefix: options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "",
            actorId: "web-user", goalTitle: (id) => coordinator.goalQueries.getGoal(options.boardId, id)?.title,
            escapeHtml: (value) => String(value), translate: (value) => value })) return;
        }
        if (!feedSchedulers.has(options.databasePath)) {
        const feed = createLocalFeedApplication(store.db, feedOptions);
        feed.recoverInterruptedSourceRuns(options.boardId);
        createLocalFeedConnectorService(store.db, options.boardId, undefined, serverOptions.homeDirectory, feedOptions).ensureSources();
        const scheduler = createLocalFeedSourceScheduler(store.db, options.boardId, undefined, undefined, serverOptions.homeDirectory, feedOptions);
        const schedule = scheduleServiceFor(store.db);
        bindScheduledTaskRunner(store.db, createHostScheduledTaskRunner({
          agentHost,
          ready: agentReady,
          boardId: options.boardId,
          projectId: options.project?.project_id ?? "",
          workspaceFor,
        }));
        feedSchedulers.set(options.databasePath, {
          scheduler,
          schedule,
        });
        void scheduler.tick().then((result) => {
          if (result.completed || result.failed) webViewCache.delete(options.databasePath);
        }).catch(() => undefined);
      }
      const readWebView = async (): Promise<MolisWorkWebView> => {
        coordinator.goalDecisionAttention.reconcile(options.boardId);
        let view = await cachedMolisWorkWebView(webViewCache, store, options, goalActions);
        const feedActions = bindLocalWebActions(localHost, hostReference, ["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]);
        try {
          const [{ rules }, { recommendations }] = await Promise.all([feedActions.invoke(feedRuleActions.list, {}), feedActions.invoke(feedRuleActions.recommendations, {})]);
          view = { ...view, feed: { ...view.feed, out_rules: rules, feed_items: view.feed.feed_items.map(item => ({ ...item,
            suggested_behavior_ids: recommendations.find(result => result.item_id === item.item_id)?.suggested_behavior_ids ?? [] })) } };
        } catch (error) {
          if (!(error instanceof Error && "code" in error && ["actions.forbidden", "actions.plugin_disabled", "actions.not_found"].includes(String(error.code)))) throw error;
        }
        const inboxActionsClient = bindLocalWebActions(localHost, hostReference, INBOX_ACTION_PERMISSIONS);
        try {
          const [state, { judgments }] = await Promise.all([inboxActionsClient.invoke(inboxActions.readJudgment, {}), inboxActionsClient.invoke(inboxActions.recommendations, {})]);
          const byEntry = new Map(judgments.map(judgment => [judgment.subject.id, judgment]));
          view = { ...view, inbox_judgment: state.summary, feed: { ...view.feed,
            inbox_entries: view.feed.inbox_entries.map(entry => { const judgment = byEntry.get(entry.entry_id) ?? null;
              return { ...entry, next_judgment: judgment, suggested_behavior_ids: judgment?.outcome === "ok" ? judgment.suggested_behavior_ids : [] }; }) } };
        } catch (error) {
          if (!(error instanceof Error && "code" in error && ["actions.forbidden", "actions.plugin_disabled", "actions.not_found"].includes(String(error.code)))) throw error;
        }
        return view;
      };
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
          async (goalId) => {
            const [history, currentState] = await Promise.all([goalActions.invoke(goalsActions.contract, { goal_id: goalId }),
              goalActions.invoke(goalsActions.state, { goal_id: goalId })]);
            const event_work = currentState.owner !== null;
            const state = event_work ? currentState : null;
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
          }, bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", actor_kind: "user",
            project_id: hostReference.project_id, audience: "user", permissions: WORK_ACTION_PERMISSIONS })))) return;
        if (await goalsReadHttp.settings(request, response, url, readWebView, controlToken, goalActions)) return;
        if (await planningHttp.project(request, response, url, controlToken, readWebView, goalActions, bindPersonalPlanningWebActions(localHost.homeActionClient()))) return;
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
        if (await goalsReadHttp.fragments(request, response, url, readWebView, goalActions,
          bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS })))) return;
        // The Host's review queue. Deciding sits under /api/, so the local
        // control guard already required same-origin, the token and a one-time
        // key before anything here runs.
        if (url.pathname === "/api/agent/reviews" || url.pathname.startsWith("/api/agent/reviews/")) await agentReady();
        if (await handleAgentReviewHttp(request, response, url, {
          boardId: options.boardId,
          agentHost,
          // 与本地 Web 其它写操作一致的操作者标识
          actorId: "web-user",
          observeGitIndex: review => {
            if (review.board_id !== options.boardId || review.operation?.kind !== "git-index" || review.document.kind !== "git-index" || !options.project) throw new Error("原操作没有可核对的项目工作区");
            return inspectGitIndex(review.operation.workspace_id, review.document, async () => composition.withCatalog(
              { homeDirectory: serverOptions.homeDirectory }, catalog => catalog.listWorkspaceDirectory(options.project!.project_id)));
          },
        })) return;
        if (request.method === "GET" && url.pathname === "/api/board") {
          sendJson(response, 200, await readWebView());
          return;
        }
        if (serverOptions.homeDirectory && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory, {
          actions: bindLocalWebActions(localHost, hostReference, [...HOME_ACTION_PERMISSIONS, "inbox:write", "functions:manage"]),
        })) return;
        if (serverOptions.homeDirectory && await handleLingguangNativePluginHttp(request, response, url, {
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS })),
        })) return;
        if (serverOptions.homeDirectory && await handlePagesNativePluginHttp(request, response, url, {
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: PAGES_ACTION_PERMISSIONS })),
        })) return;
        if (serverOptions.homeDirectory && await handleDatasetNativePluginHttp(request, response, url, (_input, transport) => ({
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: DATASET_ACTION_PERMISSIONS, ...transport })),
        }))) return;
        if (serverOptions.homeDirectory && await handleFormNativePluginHttp(request, response, url, (_input, transport) => ({
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: FORM_ACTION_PERMISSIONS, ...transport })),
        }))) return;
        if (serverOptions.homeDirectory && await handleImagesNativePluginHttp(request, response, url, (_input) => ({
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: IMAGES_ACTION_PERMISSIONS })),
        }))) return;
        if (serverOptions.homeDirectory && await handlePptNativePluginHttp(request, response, url, (_input, transport) => ({
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: PPT_ACTION_PERMISSIONS, ...transport })),
        }))) return;
        if (serverOptions.homeDirectory && await handleJellyNativePluginHttp(request, response, url, transport =>
    bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: JELLY_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handleCogniaNativePluginHttp(request, response, url, transport =>
    bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handlePersonalNativePluginHttp(
          request,
          response,
          url,
          serverOptions.homeDirectory,
          {
            projectId: options.project?.project_id ?? "",
            alchemist: { projectId: hostReference.project_id, routePrefix: options.routePrefix ?? "",
              actions: { invoke: async (definition, input, signal) => await localHost.actionClient(hostReference).invoke({ actor_id: "web-user", project_id: hostReference.project_id,
                audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS, signal }, definition, input) as never } },
            projectMaterials: shelfProjectMaterials(coordinator.artifacts, options.boardId, "web-user", options.project?.display_name ?? options.boardId),
          },
        )) return;
        if (url.pathname.startsWith("/api/assistant/") && await handleInformationAssistantHttp(request, response, url, {
          homeDirectory: serverOptions.homeDirectory,
          projectId: options.boardId, feed: createLocalFeedApplication(store.db),
        })) return;
        if (serverOptions.homeDirectory && await handleWorkflowsNativePluginHttp(request, response, url, {
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({
            actor_id: "web-user", project_id: hostReference.project_id, audience: "workflow", permissions: NATIVE_CONTENT_PERMISSIONS,
          })),
          projectId: options.project?.project_id ?? options.boardId,
          homeDirectory: serverOptions.homeDirectory,
          invalidateWebView: () => webViewCache.delete(options.databasePath),
        })) return;
        if (await handleInboxNativePluginHttp(request, response, url, {
          actions: bindLocalWebActions(localHost, hostReference, INBOX_ACTION_PERMISSIONS),
          invalidateWebView: () => webViewCache.delete(options.databasePath),
          renderer: workbenchRenderer,
          readWebView,
        })) return;
        if (await handleHomeDockJudgmentHttp(request, response, url, {
          actions: homeActions,
          invalidateWebView: () => webViewCache.delete(options.databasePath),
        })) return;
        if (await handleScheduleNativePluginHttp(request, response, url, {
          db: store.db,
          schedule: feedSchedulers.get(options.databasePath)?.schedule ?? scheduleServiceFor(store.db),
          invalidateWebView: () => webViewCache.delete(options.databasePath),
          renderer: workbenchRenderer,
          readWebView,
        })) return;
        if (await handleFeedNativePluginHttp(request, response, url, {
          actions: bindLocalWebActions(localHost, hostReference, ["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]),
          feedOptions,
          renderer: workbenchRenderer,
          boardId: options.boardId,
          routePrefix: options.routePrefix,
          databasePath: options.databasePath,
          store,
          coordinator,
          readWebView,
          invalidateWebView: () => webViewCache.delete(options.databasePath),
          homeDirectory: serverOptions.homeDirectory,
        })) return;
        if (request.method === "GET" && url.pathname === "/api/capsule") {
          if (!options.project) {
            sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
            return;
          }
          const directory = await goalActions.invoke(goalsActions.list, { limit: 100 });
          sendJson(response, 200, buildCapsuleSnapshot(await readWebView(), directory.goals));
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
            goalActions,
          );
          if (handled) return;
        }
        if (await handleLocalProjectReferenceHttp(request, response, url,
          bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS })))) return;
        if (await handleGoalsWebHttp({
          method: request.method, pathname: url.pathname, search: url.searchParams,
          readBody: () => readBody(request), respond: (status, body) => sendJson(response, status, body),
          options, idempotencyHeader: requestHeader(request, "x-molis-work-idempotency-key"),
          changed: () => { webViewCache.delete(options.databasePath); },
          actions: goalActions,
        })) return;
        if (await handleArtifactNativePluginHttp(request, response, url.pathname, {
          boardId: options.boardId, routePrefix: options.routePrefix ?? "",
          projectTitle: options.project?.display_name ?? "Molis Work",
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS })), controlToken,
          desktopShell: isDesktopShellRequest(request, url), pageCsp: PAGE_CSP,
        })) return;
        if (await goalsReadHttp.page(request, response, url, options, serverOptions.homeDirectory, readWebView, bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: WORK_ACTION_PERMISSIONS })), controlToken, goalActions,
          bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS })), coordinator, store, codingServices)) return;
        sendJson(response, 404, { error: L("页面或接口不存在") });
      }
      });
}
