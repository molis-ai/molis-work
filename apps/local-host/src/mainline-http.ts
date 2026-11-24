import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { mainlineActions, mainlineItemActions, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { placementActions } from "@molis-ai/molis-work-contracts/services/placement";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-module-shelf/contract";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { homePageRequestBound } from "./home-page-authority.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { handlePersonActionRoutes, invokePersonPageAction } from "./person-action-http.js";
import { handleMainlineViewHttp } from "./mainline-view-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { webManagementAuthenticated } from "./web-sessions.js";

const ROUTES = new Map<string, ActionDefinition>([
  ["line", mainlineActions.line as ActionDefinition],
  ["waiting", mainlineActions.waiting as ActionDefinition],
  ["place", mainlineActions.place as ActionDefinition],
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
  ["tasks/decide", mainlineActions.decide as ActionDefinition],
  ["open", mainlineActions.open as ActionDefinition],
  // Work items & 「放进事项」 (Batch 37-2, specs/work-mainline): person-only doors refusing plugin & generated home pages.
  ["items/read", mainlineItemActions.read as ActionDefinition],
  ["items/subject", mainlineItemActions.subject as ActionDefinition],
  ["items/create", mainlineItemActions.create as ActionDefinition],
  ["items/convert", mainlineItemActions.convert as ActionDefinition],
  ["items/rename", mainlineItemActions.rename as ActionDefinition],
  ["items/move", mainlineItemActions.move as ActionDefinition],
  ["items/complete", mainlineItemActions.complete as ActionDefinition],
  ["items/remove", mainlineItemActions.remove as ActionDefinition],
  ["groups/edit", mainlineItemActions.groups as ActionDefinition],
  ["switch", mainlineItemActions.switch as ActionDefinition],
  ["items/contents", mainlineItemActions.contents as ActionDefinition],
  ["holds/list", mainlineItemActions.holdsList as ActionDefinition],
  ["holds/bind", mainlineItemActions.holdsBind as ActionDefinition],
  ["holds/release", mainlineItemActions.holdsRelease as ActionDefinition],
  ["holds/candidates", mainlineItemActions.holdsCandidates as ActionDefinition],
  ["holds/create", mainlineItemActions.holdsCreate as ActionDefinition],
]);

const DAY = 86_400_000;

/**
 * The line, with the task table it was placed with, for the page's one attention read (`attention-http.ts`) and the event card's
 * check: one `mainline.line.read@1` as the person, in the window the bottom line shows (thirty days back, two ahead), optionally
 * scoped to one work item (`?item=`), so the table is read once for both (N42). The attention response may present original
 * reviews. A plugin's or generated home's page gets neither, as on the routes below.
 */
export function mainlineAttention(
  request: IncomingMessage,
  host: MolisWorkLocalHost,
  project: LocalHostProjectReference,
  presentReviews = false,
): {
  line(item?: string | null): Promise<WorkLineReadResult>;
  summary(): Promise<{ has_items: boolean; current: string | null }>;
} | null {
  if (pluginPageRequest(request) || homePageRequestBound(request)) return null;
  return {
    line: (item?: string | null) => {
      const now = Date.now();
      const window = {
        from: new Date(now - 30 * DAY).toISOString(),
        to: new Date(now + 2 * DAY).toISOString(),
        now: new Date(now).toISOString(),
        ...(item ? { item } : {}),
      };
      return presentReviews && webManagementAuthenticated(request)
        ? invokePersonPageAction(host, project, mainlineActions.line, window)
        : bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS).invoke(mainlineActions.line, window);
    },
    summary: async () => {
      const state = await bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS).invoke(mainlineItemActions.read, {});
      return { has_items: state.mainline.items.length > 0, current: state.mainline.current };
    },
  };
}

/** The platform's own receiver of 「放到…」 (M4): the Shelf, first in every list; a plugin receives through a station it declares. */
const PLATFORM_RECEIVER = "shelf";
const SUBJECT_PART = /^[A-Za-z0-9._:-]{1,200}$/u;

/**
 * 「放到…」 on a card of something done (WLN-11, M4): where it can go (the platform's Shelf, then each receive station a plugin of the
 * project declares, as the person's directory shows them) and putting it there as the person. A plugin's station receives through the
 * placement service's convert, so the new object records the card's object it came from; the Shelf receives through its own action.
 */
async function handleReceiveRoutes(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  if (url.pathname !== "/api/mainline/receive" && url.pathname !== "/api/mainline/receive/targets") return false;
  // As the person's other doors (`person-action-http.ts`): a page that goes away cancels the placement it asked for.
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel);
  response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/mainline", maxBodyBytes: 256 * 1024,
    async handle({ method, pathname, body }) {
      if (method !== "POST") return null;
      if (pluginPageRequest(request) || homePageRequestBound(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人放东西");
      if (pathname.endsWith("/targets")) {
        const views = await bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS).discover().catch(() => []);
        const stations = new Map<string, { station: string; title: string; icon: string }>();
        for (const view of views) {
          const station = view.action.workflow_content;
          if (station?.role === "receive" && view.availability.available && !stations.has(station.id)) stations.set(station.id, { station: station.id, title: station.title, icon: station.icon });
        }
        return { status: 200, body: { targets: [{ station: PLATFORM_RECEIVER, title: "Shelf", icon: "bookmark" }, ...stations.values()] } };
      }
      const input = body as Record<string, unknown>;
      const title = typeof input.title === "string" ? input.title.slice(0, 200) : "", text = typeof input.text === "string" ? input.text : "";
      if (!title || !text || text.length > 200_000) throw new ActionError("actions.input_invalid", "请写好标题与正文");
      const station = typeof input.station === "string" && input.station ? input.station : PLATFORM_RECEIVER;
      if (station === PLATFORM_RECEIVER) return { status: 200, body: await invokePersonPageAction(host, project, SHELF_ADMIT_ACTION as ActionDefinition, { title, text }, controller.signal) as object };
      const source = input.source as { kind?: unknown; id?: unknown } | undefined;
      if (typeof source?.kind !== "string" || typeof source.id !== "string" || !SUBJECT_PART.test(source.kind) || !SUBJECT_PART.test(source.id)) throw new ActionError("actions.input_invalid", "要说明放的是哪一件");
      const converted = await invokePersonPageAction(host, project, placementActions.convert, { source: { kind: source.kind, id: source.id, project_id: project.project_id },
        to: { station }, to_project_id: project.project_id, request_id: `receive:${randomUUID()}`, payload: { title, body: text } }, controller.signal);
      return { status: 200, body: converted as object };
    } });
  } finally {
    request.off("aborted", cancel);
    response.off("close", disconnected);
  }
}

/** The workbench's own doors to the mainline service in one project (`person-action-http.ts`): a plugin reads its own tasks, and stops them, through its own actions. */
export async function handleMainlineHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  if (await handleMainlineViewHttp(request, response, url, host, project)) return true;
  if (await handleReceiveRoutes(request, response, url, host, project)) return true;
  return handlePersonActionRoutes(request, response, url, host, project, { prefix: "/api/mainline", routes: ROUTES, refusal: "插件页面不能代本人读取或操作后台任务" });
}
