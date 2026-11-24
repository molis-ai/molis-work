import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionSubject, type BoundActionClient, type OpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  mainlineActions,
  mainlineItemActions,
  type MainlineContentsResult,
  type MainlineItemSource,
  type WorkItem,
} from "@molis-ai/molis-work-contracts/services/mainline";
import { placementActions, type PlacementDescription } from "@molis-ai/molis-work-contracts/services/placement";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { homePageRequestBound } from "./home-page-authority.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/** Live display projection of one work item; titles of source-backed items are read fresh from their owners (MLN-11, MLN-12). */
export interface MainlineItemDisplay {
  readonly item_id: string;
  readonly state: "ok" | "missing" | "denied";
  readonly title: string;
  readonly light: boolean;
  readonly source: ActionSubject | null;
  readonly plugin_title: string | null;
  readonly open: OpenTarget | null;
}

export interface MainlineSourceDisplay extends MainlineItemSource {
  readonly label: string;
}

export interface MainlineContentEntry {
  readonly subject: ActionSubject;
  readonly origin: "held" | "related" | "association";
  readonly removable: boolean;
  readonly state: "ok" | "missing" | "denied";
  readonly title: string;
  readonly kind_label: string;
  readonly plugin_title: string | null;
  readonly open: { surface: string; id: string; title: string } | null;
}

const subjectKey = (subject: ActionSubject): string => `${subject.kind}:${subject.id}`;

function errorState(error: unknown): "missing" | "denied" {
  const code = error instanceof ActionError ? error.code : "";
  if (code === "actions.forbidden" || code === "placement.forbidden") {
    return "denied";
  }
  return "missing";
}

function descriptionState(description: PlacementDescription): "ok" | "missing" | "denied" {
  if (description.state === "ok") return "ok";
  if (description.state === "unavailable") return "denied";
  return "missing";
}

async function resolveSourceItem(
  client: BoundActionClient,
  projectId: string,
  item: WorkItem,
): Promise<MainlineItemDisplay> {
  if (!item.source) {
    return {
      item_id: item.item_id,
      state: "ok",
      title: item.name ?? item.item_id,
      light: true,
      source: null,
      plugin_title: null,
      open: null,
    };
  }
  try {
    const opened = await client.invoke(mainlineActions.open, { subject: item.source });
    let pluginTitle: string | null = null;
    try {
      const desc = await client.invoke(placementActions.describe, {
        object: { kind: item.source.kind, id: item.source.id, project_id: projectId },
      });
      if (desc.state !== "ok") {
        return {
          item_id: item.item_id,
          state: descriptionState(desc),
          title: "",
          light: false,
          source: item.source,
          plugin_title: null,
          open: null,
        };
      }
      pluginTitle = desc.plugin?.title ?? null;
    } catch {
      /* Placement metadata is optional; objects.open already proved caller readability. */
    }
    return {
      item_id: item.item_id,
      state: "ok",
      title: opened.title,
      light: false,
      source: item.source,
      plugin_title: pluginTitle,
      open: opened.target,
    };
  } catch (error) {
    return {
      item_id: item.item_id,
      state: errorState(error),
      title: "",
      light: false,
      source: item.source,
      plugin_title: null,
      open: null,
    };
  }
}

async function sourceDisplayLabels(
  client: BoundActionClient,
  sources: readonly MainlineItemSource[],
): Promise<MainlineSourceDisplay[]> {
  if (!sources.length) return [];
  const discovered = await client.discover().catch(() => []);
  const titlesByOwner = new Map<string, string>();
  for (const view of discovered) {
    if (view.provider.title && !titlesByOwner.has(view.provider.provider_id)) {
      titlesByOwner.set(view.provider.provider_id, view.provider.title);
    }
  }
  return sources.map((source) => ({
    ...source,
    label: titlesByOwner.get(source.owner) ?? source.kind,
  }));
}

async function describeEntry(
  client: BoundActionClient,
  projectId: string,
  subject: ActionSubject,
  origin: MainlineContentEntry["origin"],
): Promise<MainlineContentEntry> {
  try {
    const desc = await client.invoke(placementActions.describe, {
      object: { kind: subject.kind, id: subject.id, project_id: projectId },
    });
    const state = descriptionState(desc);
    if (state !== "ok") {
      return {
        subject,
        origin,
        removable: origin === "held",
        state,
        title: "",
        kind_label: subject.kind,
        plugin_title: null,
        open: null,
      };
    }
    const open = desc.open ? { surface: desc.open.surface, id: desc.open.id, title: desc.title } : null;
    return {
      subject,
      origin,
      removable: origin === "held",
      state: "ok",
      title: desc.title,
      kind_label: subject.kind,
      plugin_title: desc.plugin?.title ?? null,
      open,
    };
  } catch (error) {
    try {
      const opened = await client.invoke(mainlineActions.open, { subject });
      return {
        subject,
        origin,
        removable: origin === "held",
        state: "ok",
        title: opened.title,
        kind_label: subject.kind,
        plugin_title: null,
        open: opened.target && opened.target.id
          ? { surface: opened.target.surface, id: opened.target.id, title: opened.title }
          : null,
      };
    } catch (openError) {
      return {
        subject,
        origin,
        removable: origin === "held",
        state: errorState(openError ?? error),
        title: "",
        kind_label: subject.kind,
        plugin_title: null,
        open: null,
      };
    }
  }
}

type ItemForm = { markup: string; done: boolean };
type ReadForms = (subjects: ActionSubject[]) => Promise<Map<string, ItemForm>>;

async function handleItemsView(
  response: ServerResponse,
  client: BoundActionClient,
  projectId: string,
  forms: ReadForms,
): Promise<void> {
  const result = await client.invoke(mainlineItemActions.read, { counts: true });
  const [resolved, sources] = await Promise.all([
    Promise.all(result.mainline.items.map((item) => resolveSourceItem(client, projectId, item))),
    sourceDisplayLabels(client, result.sources),
  ]);
  const presentations = await forms(resolved.flatMap(item => item.source && item.state === "ok" ? [item.source] : []));
  const byId = new Map(resolved.map(item => [item.item_id, item]));
  const taskItems = Object.fromEntries((result.counts?.task_items ?? []).flatMap(({ subject, item_id }) => {
    const item = byId.get(item_id);
    return item?.state === "ok" ? [[subjectKey(subject), { item_id, name: item.title }]] : [];
  }));
  sendLocalWebJson(response, 200, {
    mainline: result.mainline,
    sources,
    counts: result.counts ?? { items: {}, groups: {} },
    resolved: Object.fromEntries(resolved.map(entry => [entry.item_id, entry.source && entry.state === "ok" ? { ...entry, presentation: presentations.get(subjectKey(entry.source)) } : entry])),
    task_items: taskItems,
  });
}

async function handleContentsView(
  request: IncomingMessage,
  response: ServerResponse,
  client: BoundActionClient,
  projectId: string,
  forms: ReadForms,
): Promise<void> {
  const body = await readLocalWebBody(request, 16_000);
  const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
  if (!itemId) {
    sendLocalWebJson(response, 400, { error: "actions.input_invalid", message: "缺少事项编号" });
    return;
  }
  const [mainlineResult, contents]: [Awaited<ReturnType<typeof client.invoke>>, MainlineContentsResult] = await Promise.all([
    client.invoke(mainlineItemActions.read, {}),
    client.invoke(mainlineItemActions.contents, { item_id: itemId }),
  ]);
  const item = (mainlineResult as { mainline: { items: WorkItem[] } }).mainline.items.find((entry) => entry.item_id === itemId);
  const seen = new Set<string>();
  const queued: Array<{ subject: ActionSubject; origin: MainlineContentEntry["origin"] }> = [];
  const pushUnique = (subject: ActionSubject, origin: MainlineContentEntry["origin"]) => {
    const key = subjectKey(subject);
    if (seen.has(key)) return;
    seen.add(key);
    queued.push({ subject, origin });
  };
  for (const subject of contents.held) pushUnique(subject, "held");
  for (const group of contents.related) {
    for (const subject of group.subjects) pushUnique(subject, "related");
  }
  if (item?.source) {
    try {
      const desc = await client.invoke(placementActions.describe, {
        object: { kind: item.source.kind, id: item.source.id, project_id: projectId },
      });
      if (desc.state === "ok") {
        for (const link of desc.associations) {
          if (link.target.kind === "object") {
            pushUnique({ kind: link.target.object.kind, id: link.target.object.id }, "association");
          } else if (link.target.kind === "attached") {
            pushUnique({ kind: link.target.object.kind, id: link.target.object.id }, "association");
          }
        }
      }
    } catch {
      /* Source placement associations are optional when unavailable. */
    }
  }
  const entries = await Promise.all(queued.map(({ subject, origin }) => describeEntry(client, projectId, subject, origin)));
  const rows = await forms(entries.filter(entry => entry.state === "ok").map(entry => entry.subject));
  sendLocalWebJson(response, 200, { item_id: itemId, entries: entries.map(entry =>
    ({ ...entry, presentation: rows.get(subjectKey(entry.subject)) })), issues: contents.issues });
}

/**
 * Person-only workbench display projections over `system.mainline` and `system.placement` (Batch 37-2):
 * resolves live titles, source labels, item contents and task attribution in one request without storing plugin facts.
 */
export async function handleMainlineViewHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  host: MolisWorkLocalHost,
  project: LocalHostProjectReference,
): Promise<boolean> {
  const isItems = url.pathname === "/api/mainline/items/view";
  const isContents = url.pathname === "/api/mainline/items/contents/view";
  if (!isItems && !isContents) return false;
  if (request.method !== "POST") {
    sendLocalWebJson(response, 405, { error: "请求方法不受支持" });
    return true;
  }
  if (pluginPageRequest(request) || homePageRequestBound(request)) {
    sendLocalWebJson(response, 403, { error: "forbidden", message: "插件页面不能代本人读取主线事项" });
    return true;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.once("aborted", cancel);
  response.once("close", cancel);
  try {
    const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal });
    const forms: ReadForms = subjects => host.mainlinePresentations(project.project_id, client, subjects, controller.signal);
    if (isItems) await handleItemsView(response, client, project.project_id, forms);
    else await handleContentsView(request, response, client, project.project_id, forms);
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendLocalWebJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel);
    response.off("close", cancel); }
  return true;
}
