import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { mainlineActions, mainlineItemActions, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-module-shelf/contract";
import { homePageRequestBound } from "./home-page-authority.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { handlePersonActionRoutes } from "./person-action-http.js";
import { handleMainlineViewHttp } from "./mainline-view-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const ROUTES = new Map<string, ActionDefinition>([
  ["line", mainlineActions.line as ActionDefinition],
  ["waiting", mainlineActions.waiting as ActionDefinition],
  ["place", mainlineActions.place as ActionDefinition],
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
  ["tasks/decide", mainlineActions.decide as ActionDefinition],
  ["open", mainlineActions.open as ActionDefinition],
  // 「放到 Shelf」 on a card of something done (WLN-11): Shelf's own action, as the person; what is put there is what the page shows.
  ["shelve", SHELF_ADMIT_ACTION as ActionDefinition],
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
 * scoped to one work item (`?item=`), so the table is read once for both (N42). A plugin's or generated home's page gets neither.
 */
export function mainlineAttention(
  request: IncomingMessage,
  host: MolisWorkLocalHost,
  project: LocalHostProjectReference,
): {
  line(item?: string | null): Promise<WorkLineReadResult>;
  summary(): Promise<{ has_items: boolean; current: string | null }>;
} | null {
  if (pluginPageRequest(request) || homePageRequestBound(request)) return null;
  const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS);
  return {
    line: (item?: string | null) => {
      const now = Date.now();
      return client.invoke(mainlineActions.line, {
        from: new Date(now - 30 * DAY).toISOString(),
        to: new Date(now + 2 * DAY).toISOString(),
        now: new Date(now).toISOString(),
        ...(item ? { item } : {}),
      });
    },
    summary: async () => {
      const state = await client.invoke(mainlineItemActions.read, {});
      return { has_items: state.mainline.items.length > 0, current: state.mainline.current };
    },
  };
}

/** The workbench's own doors to the mainline service in one project (`person-action-http.ts`): a plugin reads its own tasks, and stops them, through its own actions. */
export async function handleMainlineHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  if (await handleMainlineViewHttp(request, response, url, host, project)) return true;
  return handlePersonActionRoutes(request, response, url, host, project, { prefix: "/api/mainline", routes: ROUTES, refusal: "插件页面不能代本人读取或操作后台任务" });
}
