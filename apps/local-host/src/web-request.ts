import { observeGitOperations } from "./git-operation-notifications.js";
import { feedRuleActions, feedSourceActions, createFeedCaptureTrigger } from "@molis-ai/molis-work-plugin-feed";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import { handleAgentDefinitionsHttp } from "./agent-definitions/agent-definitions-http.js";
import { bindLocalWebActions, localWebActionContext } from "./local-web-actions.js";
import { arriveAtProjectPage } from "./web-settings-arrival.js";
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
import { TODO_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-todo";
import { handleTodoNativePluginHttp } from "./todo-native-plugin-http.js";
import { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { handleFunctionsHttp } from "./functions-http.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
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
import { htmlLang, L } from "./web-locale.js";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import fs from "node:fs";
import { handleGoalsWebHttp, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG, shownProjectPlugins, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import type { SessionRuntimeResources } from "./web-session.js";
import { cachedMolisWorkWebView, type MolisWorkWebViewCache } from "./web-view.js";
import { handleSideFilesHttp } from "./side-files-http.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { bindScheduledTaskRunner, scheduleServiceFor } from "./schedule-runtime.js";
import { createHostScheduledTaskRunner } from "./schedule-task-runner.js";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleFeedNativePluginHttp } from "./feed-native-plugin-http.js";
import { handleInboxNativePluginHttp } from "./inbox-native-plugin-http.js";
import { handleWorkflowsNativePluginHttp } from "./workflows-native-plugin-http.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { handleAssistantHttp } from "./assistant/assistant-http.js";
import { handleMemoryHttp, memoryForAgentRun } from "./memory/memory-host.js";
import { handleHomeDockJudgmentHttp } from "./home-dock-http.js";
import { handleSearchHttp } from "./search-http.js";
import { handlePlacementHttp } from "./placement-http.js";
import { handleContextualHttp } from "./contextual/contextual-http.js";
import { handleScheduleNativePluginHttp } from "./schedule-native-plugin-http.js";
import { SCHEDULE_ACTION_PERMISSIONS, SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { handlePersonalNativePluginHttp } from "./personal-native-plugin-http.js";
import { SHELF_ACTION_PERMISSIONS, SHELF_PROJECT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";
import { EXPERIMENTS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-experiments";
import { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { resolveWebRequest } from "./web-routing.js";
import { handleLocalCatalogWebRequest } from "./web-catalog.js";
import { handleAgentReviewHttp } from "./agent-review-http.js";
import { inspectGitIndex } from "./workspace-git-index.js";
import { isPluginEventManagementPath } from "./plugin-event-http.js";
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
  // The personal space always exists for the person; it is made the first time anyone opens it.
  if (/^\/projects\/personal(?:\/|$)/u.test(url.pathname) && !serverOptions.databasePath) {
    await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.ensurePersonalSpace());
  }
  let resolved: Awaited<ReturnType<typeof resolveWebRequest>>;
  try {
    resolved = await resolveWebRequest(serverOptions, url.pathname, composition.withCatalog);
  } catch (error) {
    // The chooser is the way in: when the project list cannot be read it says so, and the personal space still opens.
    if (request.method !== "GET" || url.pathname !== "/" || !serverOptions.homeDirectory) throw error;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
    response.end(workbenchRenderer.renderMolisWorkProjectIndex([], controlToken, isDesktopShellRequest(request, url), { now: new Date().toISOString(), last_project_id: null, opened: {}, load_error: true }));
    return;
  }
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
  // Every registered prompt and role, and the person's edits of them: one register per Home, whichever page asks.
  if (serverOptions.homeDirectory && url.pathname.startsWith("/api/agent-definitions/")
    && await handleAgentDefinitionsHttp(request, response, url, agentDefinitionsFor(serverOptions.homeDirectory, builtinRegistrations))) return;
  if (resolved.kind === "catalog_index") {
    // Personal memories are managed from the global settings, outside any project.
    if (serverOptions.homeDirectory && url.pathname.startsWith("/api/memory/") && await handleMemoryHttp(request, response, url, { localHost })) return;
    // Personal work needs no project: the Assistant answers on the project list too, in the person's own scope.
    if (serverOptions.homeDirectory && url.pathname.startsWith("/api/assistant/") && await handleAssistantHttp(request, response, url, {
      localHost, homeDirectory: serverOptions.homeDirectory, agentHost, agentReady,
      projectTitle: async projectId => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => { try { return catalog.getProject(projectId).display_name; } catch { return null; } }),
    })) return;
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
      if (arriveAtProjectPage(request, response, url, options.project ? { project_id: options.project.project_id, routePrefix: options.routePrefix ?? "" } : null,
        serverOptions.homeDirectory, isDesktopShellRequest(request, url))) return;
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
      const shownPlugins = (projectId: string) => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
        catalog => shownProjectPlugins(catalog.listProjectPlugins(projectId), catalog.listHiddenPlugins(projectId)));
      // A plugin's side panel tab (specs/archive/side-panel D13): the declared `side` view, served for a plugin enabled here.
      const sideView = /^\/side\/([^/]+)\/([^/]+)$/u.exec(url.pathname);
      if (sideView && request.method === "GET" && options.project) {
        const projectId = options.project.project_id;
        // The same plugins the page shows: personal ones included unless the person hid them from this project.
        const enabled = await shownPlugins(projectId);
        const html = workbenchRenderer.renderSideViewDocument({ projectPluginId: decodeURIComponent(sideView[1]!), viewId: decodeURIComponent(sideView[2]!),
          projectId, routePrefix: `/projects/${encodeURIComponent(projectId)}`, enabled, controlToken });
        if (!html) {
          // Shown inside the panel's frame: a sentence in the panel's colours, not a JSON body.
          response.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
          response.end(`<!doctype html><html lang="${htmlLang()}"><meta charset="utf-8"><meta name="color-scheme" content="light dark"><body style="margin:16px;font:13px/1.6 system-ui,sans-serif;color:GrayText;background:Canvas">${escapeHtml(L("这个侧栏内容已经不在了（插件可能已停用）"))}</body></html>`);
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
        response.end(html);
        return;
      }
      // The side panel's file tab: sources, entries and one preview, read through the action directory as the person.
      if (url.pathname.startsWith("/api/side/files/") && await handleSideFilesHttp(request, response, url, { localHost, reference: hostReference,
        shownPlugins: async () => new Set(await shownPlugins(options.project!.project_id)) })) return;
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
        // Home shows and runs what any plugin offers the person here: native plugins by their manifests, Runtime plugins by their installed grants.
        const homeActions = bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS);
        const goalActions = observedWebGoalsActions(runtime, hostReference,
          bindGoalsWebActions(localHost.actionClient(hostReference), hostReference));
        if (url.pathname === "/api/project-settings/workspaces" && options.project && ["GET", "POST"].includes(request.method ?? "")) {
          const workspaces = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
            catalog => catalog.listWorkspaceDirectory(options.project!.project_id).map(projectWorkspaceRef));
          const settings = new ProjectBrowsingSettings(store.db);
          try {
            if (request.method === "POST") {
              const body = await readBody(request);
              // The choice is the same registered project setting every caller uses; this route only adapts the form.
              if (typeof body.workspace_id !== "string" || !body.workspace_id) throw new Error("请选择当前项目已关联且可用的工作目录");
              await bindLocalWebActions(localHost, hostReference, ["projects:settings"]).invoke(projectSettingsCapabilities.selectBrowsingWorkspace, [body.workspace_id]);
            }
            sendJson(response, 200, { workspaces, selected: settings.read(options.boardId, workspaces)?.workspace_id ?? null });
          } catch (error) { sendJson(response, 403, { error: error instanceof Error ? error.message : String(error) }); }
          return;
        }

        const codingServices: Pick<CodingSurfacePorts, "capabilities" | "actions" | "execution" | "homeDirectory" | "characterWorkspaces" | "characterSpawn" | "observeGitOperations"> = {
          actions: { registry: localHost.actionRegistry(hostReference), client: { ...localHost.actionClient(hostReference), ...localHost.syncActionClient(hostReference) }, project_id: hostReference.project_id, inspect: caller => localHost.inspectActions(caller, hostReference) },
          observeGitOperations: listener => observeGitOperations(agentHost.reviews, options.boardId, listener),
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
          models: async () => await codingServices.execution?.models() ?? [], actorId: "web-user",
          actions: codingServices.actions,
          // A generated plugin's design may need a built-in plugin this project has not enabled; the person enables it here.
          ...(options.project ? { enablePlugin: async (pluginId: string) => {
            const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === pluginId && !item.personal);
            if (!entry) throw new Error('这个插件不能在项目里启用：' + pluginId);
            await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.commit(() => catalog.addProjectPlugin({ project_id: options.project!.project_id, plugin_id: entry.project_plugin_id, actor_id: "web-user" })));
          } } : {}),
          ...(codingServices.capabilities ? { capabilities: codingServices.capabilities } : {}) }, controlToken)) return;
        if (await handleBuilderHttp(request, response, url, { ...codingServices, store, boardId: options.boardId,
          routePrefix: options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "",
          actorId: "web-user", goalTitle: (id) => coordinator.goalQueries.getGoal(options.boardId, id)?.title,
          escapeHtml: (value) => String(value), translate: (value) => value }, controlToken)) return;
        const runtimePluginRoute = /^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]*)\//u.exec(url.pathname);
        const runtimeUpdatesRoute = url.pathname === "/api/plugins/runtime/updates" || isPluginEventManagementPath(url.pathname);
        const runtimeEntry = runtimePluginRoute
          ? BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === runtimePluginRoute[1]) : undefined;
        if (runtimeUpdatesRoute || (runtimePluginRoute && (!runtimeEntry || runtimeEntry.manifest.kind === "app" || runtimeEntry.manifest.routes?.length))) {
          // Bundled installations retain project policy. Other plugins are
          // admitted by this project's Runtime and its actual lifecycle grants.
          const enabled = runtimeUpdatesRoute
            ? Boolean(options.project)
            : runtimeEntry?.personal || (options.project && (!runtimeEntry || await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
                catalog => availableProjectPluginIds(catalog.listProjectPlugins(options.project!.project_id)).has(runtimeEntry.project_plugin_id))));
          if (!enabled) { sendJson(response, 404, { error: "这个项目未启用该插件", code: "plugin_not_enabled" }); return; }
          if (await handleCodingPluginHttp(request, response, url, { ...codingServices, store, boardId: options.boardId,
            routePrefix: options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "",
            actorId: "web-user", goalTitle: (id) => coordinator.goalQueries.getGoal(options.boardId, id)?.title,
            escapeHtml: (value) => String(value), translate: (value) => value })) return;
        }
        if (!feedSchedulers.has(options.databasePath)) {
        const feed = createLocalFeedApplication(store.db, feedOptions);
        feed.recoverInterruptedSourceRuns(options.boardId);
        createLocalFeedConnectorService(store.db, options.boardId, undefined, serverOptions.homeDirectory, feedOptions).ensureSources();
        const scheduler = { tick: () => homeActions.invoke(feedSourceActions.tick, {}) };
        const schedule = scheduleServiceFor(store.db);
        bindScheduledTaskRunner(store.db, createHostScheduledTaskRunner({
          agentHost,
          ready: agentReady,
          boardId: options.boardId,
          projectId: options.project?.project_id ?? "",
          workspaceFor,
          memory: (task, title) => memoryForAgentRun(localHost, { project_id: options.project?.project_id ?? null, task, plugin_id: SCHEDULE_PLUGIN_ID,
            used_for: `定时任务 · ${title.replace(/\s+/g, " ").trim().slice(0, 40)}` }),
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
        let view = await cachedMolisWorkWebView(webViewCache, store, options, homeActions);
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
          bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", actor_kind: "user",
            // Goal read lets a session association check the Goal through its owner; project settings cover the folder membership this page manages.
            project_id: hostReference.project_id, audience: "user", permissions: [...WORK_ACTION_PERMISSIONS, "goals:read", "projects:settings"] })))) return;
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
        // Search reaches every plugin through the same directory and the person's own authority in this project.
        if (await handleSearchHttp(request, response, url, () => bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS))) return;
        if (await handlePlacementHttp(request, response, url, () => bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS))) return;
        // What the person has in hand, ranked from the same directory under their own authority (specs/archive/contextual-interaction).
        if (url.pathname.startsWith("/api/contextual/") && await handleContextualHttp(request, response, url, {
          ...(serverOptions.homeDirectory ? { homeDirectory: serverOptions.homeDirectory } : {}), scope: hostReference.project_id,
          actions: () => {
            const client = localHost.actionClient(hostReference);
            const context = () => localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS);
            return { discover: async () => client.discover(await context()), invoke: async (reference, input) => client.invoke(await context(), reference, input) };
          },
        })) return;
        if (serverOptions.homeDirectory && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory, {
          actions: bindLocalWebActions(localHost, hostReference, [...HOME_ACTION_PERMISSIONS, "inbox:write", "functions:manage"]),
        })) return;
        if (serverOptions.homeDirectory && await handleLingguangNativePluginHttp(request, response, url, (_input, transport) => ({
          projectId: hostReference.project_id,
          actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id,
            audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS, ...transport })),
        }))) return;
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
        // Todo is personal but project-aware: inside a project the person sees that project's todos too.
        if (serverOptions.homeDirectory && await handleTodoNativePluginHttp(request, response, url, transport =>
          bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: TODO_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handleCogniaNativePluginHttp(request, response, url, transport =>
    bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handlePersonalNativePluginHttp(
          request,
          response,
          url,
          {
            projectId: options.project?.project_id ?? "",
            alchemist: { projectId: hostReference.project_id, routePrefix: options.routePrefix ?? "",
              actions: { invoke: async (definition, input, signal) => await localHost.actionClient(hostReference).invoke({ actor_id: "web-user", project_id: hostReference.project_id,
                audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS, signal }, definition, input) as never } },
            experiments: bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: [...EXPERIMENTS_ACTION_PERMISSIONS] })),
            shelf: {
              actions: bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS })),
              project: { title: options.project?.display_name ?? options.boardId,
                actions: bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: "web-user", project_id: hostReference.project_id, audience: "user", permissions: SHELF_PROJECT_ACTION_PERMISSIONS })) },
            },
          },
        )) return;
        // This project's memories (and the person's own) from the project's settings and work panel.
        if (serverOptions.homeDirectory && url.pathname.startsWith("/api/memory/") && await handleMemoryHttp(request, response, url, { localHost, projectRef: hostReference })) return;
        if (serverOptions.homeDirectory && url.pathname.startsWith("/api/assistant/") && await handleAssistantHttp(request, response, url, {
          localHost, homeDirectory: serverOptions.homeDirectory, agentHost, agentReady, projectRef: hostReference,
          projectTitle: async projectId => projectId === options.project?.project_id ? options.project.display_name
            : composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => { try { return catalog.getProject(projectId).display_name; } catch { return null; } }),
        })) return;
        if (serverOptions.homeDirectory && await handleWorkflowsNativePluginHttp(request, response, url, {
          // A workflow may use every action the person may run here, and nothing more: native plugins from their manifests, Runtime plugins by their installed grants.
          actions: bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS),
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
          actions: bindLocalWebActions(localHost, hostReference, SCHEDULE_ACTION_PERMISSIONS),
          invalidateWebView: () => webViewCache.delete(options.databasePath),
          renderer: workbenchRenderer,
          readWebView,
        })) return;
        if (await handleFeedNativePluginHttp(request, response, url, {
          actions: bindLocalWebActions(localHost, hostReference, [...NATIVE_CONTENT_PERMISSIONS, "functions:invoke"]),
          feedOptions,
          renderer: workbenchRenderer,
          boardId: options.boardId,
          routePrefix: options.routePrefix,
          store,
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
            ptyHost,
            webUrl,
            homeActions,
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
        sendNotFound(request, response, url, options.routePrefix ?? "");
      }
      });
}

/** An address this project does not have: a person (a page request, not an API call) lands in the workbench and is told
 * so there, never on a bare error body. */
function sendNotFound(request: IncomingMessage, response: ServerResponse, url: URL, routePrefix: string): void {
  if (request.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/assets/")
    && (requestHeader(request, "accept") ?? "").includes("text/html")) {
    response.writeHead(302, { location: `${routePrefix}/?missing=${encodeURIComponent(url.pathname)}`, "cache-control": "no-store" });
    response.end();
    return;
  }
  sendJson(response, 404, { error: L("页面或接口不存在") });
}
