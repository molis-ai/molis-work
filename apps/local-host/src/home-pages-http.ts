import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { homeErrors, homePageActions, type HomePageFilesResult, type HomePageRef } from "@molis-ai/molis-work-contracts/services/home";
import { HOME_PAGES_BASELINE, HOME_PAGES_HOME_STORE, HomePagesStore, inspectHomePageDesign } from "@molis-ai/molis-work-service-home";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { heldHomeSqlite } from "@molis-ai/molis-work-storage";
import { homePageRequestBound } from "./home-page-authority.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { withProtectedHostAction } from "./plugin-consent-settings-entry.js";
import { pluginPageRequest, pluginPagesFor } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

const SMALL_BODY_BYTES = 256 * 1024;
const DRAFT_BODY_BYTES = 6 * 1024 * 1024;

const PERSON_ROUTES = new Map<string, { definition: ActionDefinition; maxBytes?: number }>([
  ["read", { definition: homePageActions.read as ActionDefinition }],
  ["drafts/save", { definition: homePageActions.saveDraft as ActionDefinition, maxBytes: DRAFT_BODY_BYTES }],
  ["preview", { definition: homePageActions.preview as ActionDefinition }],
  ["adopt", { definition: homePageActions.adopt as ActionDefinition }],
  ["restore", { definition: homePageActions.restore as ActionDefinition }],
  ["select", { definition: homePageActions.select as ActionDefinition }],
  ["diff", { definition: homePageActions.diff as ActionDefinition }],
  ["files/read", { definition: homePageActions.readFiles as ActionDefinition }],
]);

function refuseIfFramedPage(request: IncomingMessage, message: string): void {
  if (pluginPageRequest(request) || homePageRequestBound(request)) {
    throw homeErrors.approval_forbidden(message);
  }
}

/**
 * Project-scoped HTTP surface for generated home pages (`/api/home-pages/*`):
 * - Person-only routes (`read`, `drafts/save`, `preview`, `adopt`, `restore`, `select`, `diff`, `files/read`, `inspect`, `session`):
 *   refuse both plugin pages and framed generated home pages.
 * - Framed home-page action gateway (`POST /api/home-pages/actions`): accepts only Host-bound `x-molis-home-page` sessions.
 */
export async function handleHomePagesHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  host: MolisWorkLocalHost,
  project: LocalHostProjectReference,
  homeDirectory: string | undefined,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/home-pages/")) return false;
  const suffix = url.pathname.slice("/api/home-pages/".length);
  const method = request.method ?? "GET";

  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel);
  response.once("close", disconnected);

  try {
    if (!homeDirectory) throw new ActionError("actions.unavailable", "生成首页需要本地 Home");
    const pages = pluginPagesFor(homeDirectory).homePages;

    // 1. Framed generated-page action gateway (authenticated exclusively by x-molis-home-page transport binding).
    if (suffix === "actions" && method === "POST") {
      const body = await readLocalWebBody(request, SMALL_BODY_BYTES);
      const result = await pages.invokeBoundRequest(request, project.project_id, body, host.actionClient(project), LOCAL_OWNER_PERMISSIONS);
      sendLocalWebJson(response, 200, result);
      return true;
    }

    // 2. Close a live or preview home-page session (trusted outer shell only, project-scoped).
    const closeMatch = /^session\/([^/]+)$/u.exec(suffix);
    if (closeMatch && method === "DELETE") {
      refuseIfFramedPage(request, "生成页面不能直接管理首页会话");
      let sessionId: string;
      try {
        sessionId = decodeURIComponent(closeMatch[1]!);
      } catch {
        throw new ActionError("actions.input_invalid", "首页会话标识格式不正确");
      }
      pages.closeForProject(project.project_id, sessionId);
      sendLocalWebJson(response, 200, { closed: true });
      return true;
    }

    // 3. Open a live `home-page` session for the project's currently adopted version (trusted outer shell only).
    if (suffix === "session" && method === "POST") {
      refuseIfFramedPage(request, "生成页面不能直接开启新的首页会话");
      const store = new HomePagesStore(heldHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE), project.project_id);
      const state = store.selectionState();
      if (state.selection.kind !== "page") {
        throw homeErrors.page_not_found("当前项目使用的是基础首页，没有已采用的生成首页");
      }
      const ref = { page_id: state.selection.page_id, version: state.selection.version };
      const verified = store.readFilesVerified(ref);
      const detail = store.readVersion(ref);
      const approved = detail?.approval?.approved_actions ?? [];
      const { page_session_id } = pages.openLive(project.project_id, LOCAL_PERSON_ACTOR_ID, verified.version, approved);
      sendLocalWebJson(response, 200, { page: ref, page_session_id, approved_actions: approved });
      return true;
    }

    // 4. Inspect design/isolation checks & live action details for a draft version (trusted outer shell only, for Plan B Check Summary & Adopt dialog).
    if (suffix === "inspect" && method === "POST") {
      refuseIfFramedPage(request, "生成页面不能读取草稿检查详情");
      const body = await readLocalWebBody(request, SMALL_BODY_BYTES);
      if (!isRecord(body) || typeof body.page_id !== "string" || typeof body.version !== "number") {
        throw new ActionError("actions.input_invalid", "请提供 page_id 与 version");
      }
      const pageId = body.page_id, version = body.version;
      const action = Object.freeze({ source: "web" as const, conversation_ref: `web:${project.project_id}`, message_ref: `web:${randomUUID()}` });
      const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal, user_action: () => action });
      const loaded = await withProtectedHostAction(action, () =>
        client.invoke<HomePageRef, HomePageFilesResult>(homePageActions.readFiles, { page_id: pageId, version }),
      );
      const directory = await host.inspectActions({
        actor_id: LOCAL_PERSON_ACTOR_ID,
        project_id: project.project_id,
        audience: "plugin",
        permissions: LOCAL_OWNER_PERMISSIONS,
        signal: controller.signal,
      }, project);
      const actions = loaded.version.actions.map(ref => {
        const view = directory.find(
          item => item.capability_id === ref.capability_id && item.version === ref.version && item.provider.provider_id === ref.provider_id,
        );
        const pluginExplicit = Boolean(view?.action.audiences.includes("plugin"));
        const audienceDenied = Boolean(view && !pluginExplicit);
        return {
          ...ref,
          title: view?.action.title ?? ref.capability_id,
          description: view?.action.description ?? "",
          provider_title: view?.provider.title ?? ref.provider_id,
          operation: view?.operation ?? "unknown",
          effect: view?.action.effect ?? (view?.operation === "query" ? "read" : "write"),
          external: Boolean(view?.action.external),
          metered: view?.action.execution?.cost === "metered",
          available: Boolean(pluginExplicit && view?.availability.available),
          audience_denied: audienceDenied,
          unavailable_reason: !view
            ? "找不到这项动作，对应插件可能未安装"
            : audienceDenied
              ? "这项动作未对页面开放"
              : view.availability.available
                ? null
                : (view.availability.reason ?? "对应插件当前已停用或不可用"),
        };
      });
      const store = new HomePagesStore(heldHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE), project.project_id);
      const pruned = store.prunedVersions(body.page_id);
      const forbiddenAction = actions.find(item => item.audience_denied);
      const report = inspectHomePageDesign(loaded.files, {
        actionsValid: !forbiddenAction,
        actionIssueReason: forbiddenAction?.unavailable_reason ?? undefined,
      });
      sendLocalWebJson(response, 200, { version: loaded.version, actions, report, pruned });
      return true;
    }

    // 5. Person-only system.home actions.
    const route = PERSON_ROUTES.get(suffix);
    if (!route || method !== "POST") return false;
    refuseIfFramedPage(request, "插件页面或生成首页不能代本人执行首页管理操作");
    const body = await readLocalWebBody(request, route.maxBytes ?? SMALL_BODY_BYTES);
    const action = Object.freeze({ source: "web" as const, conversation_ref: `web:${project.project_id}`, message_ref: `web:${randomUUID()}` });
    const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal, user_action: () => action });
    const result = await withProtectedHostAction(action, () => client.invoke(route.definition, body));
    sendLocalWebJson(response, 200, result);
    return true;
  } catch (error) {
    const failed = actionErrorResponse(error);
    sendLocalWebJson(response, failed.status, failed.body);
    return true;
  } finally {
    request.off("aborted", cancel);
    response.off("close", disconnected);
  }
}
