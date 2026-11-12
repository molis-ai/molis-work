import { ActionError, bindActionClient, isSearchEntriesSource, SEARCH_ENTRIES_PAGE_LIMIT, type ActionView, type SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTaskGrantActions, type TaskGrantSetCategory } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { directoryWordResolver, registeredInstallationText } from "./ui-text-provider.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

/** What each mode takes, and nothing more: the project is the route's, the person is the caller, both from the request context. */
const KEYS: Record<string, readonly string[]> = {
  list: ["mode"], titles: ["mode", "plugin_install_id", "cursor"],
  set: ["mode", "plugin_install_id", "key", "categories", "expected_revision"], clear: ["mode", "plugin_install_id", "key"],
};
const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512;

/** The installation a subject is in, in this project or the Home, with the Manifest it runs: its name and what its tasks are. */
async function installationOf(context: WebRequestContext, project: LocalHostProjectReference, installId: string): Promise<{ record: PluginInstanceRecord; manifest: PluginManifest | undefined } | null> {
  const own = await context.localHost.withProject(project, runtime => installedPluginEntries(runtime.store.db).find(({ record }) => record.install_id === installId));
  if (own) return own;
  const home = context.localHost.homePlugins, record = home?.installation(installId);
  return record && record.install_id === installId ? { record, manifest: home?.manifest(record.plugin_id) } : null;
}

function installationName(installation: NonNullable<Awaited<ReturnType<typeof installationOf>>>): string {
  const { record, manifest } = installation;
  return manifest ? projectDirectoryWords({ ...manifest, ui: {} }, directoryWordResolver(registeredInstallationText(record))).name : record.plugin_id;
}

/** The installation's own search source for the kind its Manifest says its tasks are (task-grants-platform-area.md §5.1), open to the person. */
function subjectSource(views: readonly ActionView[], installId: string, kind: string) {
  return views.find(view => view.provider.plugin_install_id === installId && isSearchEntriesSource(view.action) && view.action.audiences.includes("user")
    && view.action.search_source?.kinds.some(entry => entry.kind === kind));
}

/**
 * 授权与放行 in a project's settings (specs/proactive-assistant/task-grants-platform-area.md §5): the person's own page lists every
 * task's grants once (`agent.task_grants.list`, no installation named), names each task by its provider's own search source (§5.2,
 * one page of up to 500 entries per call, the next only when the page asks), and takes a category or a task's grants back through
 * `set` and `clear`. The route sits behind the local control guard and answers no plugin page: a frame's bridge header or the shell's
 * page header is refused before anything is read. Every call is the person's, in this route's project; the installation is named
 * because a key is unique only within one, and the actions check it again. A title is shown, never relied on.
 */
export async function handleTaskGrantsSettingsHttp(context: WebRequestContext, project: LocalHostProjectReference): Promise<boolean> {
  const { request, response, url, localHost } = context;
  if (url.pathname !== "/api/settings/task-grants") return false;
  if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "这次设置操作已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try {
    if (pluginPageRequest(request) || request.headers["x-molis-plugin-page"] !== undefined || request.headers["x-molis-context-page"] !== undefined)
      throw new ActionError("actions.forbidden", "插件页面不能代本人管理任务的读取授权");
    const body = await readLocalWebBody(request), keys = typeof body.mode === "string" ? KEYS[body.mode] : undefined;
    if (!keys || Object.keys(body).some(key => !keys.includes(key)) || body.mode !== "list" && !text(body.plugin_install_id)
      || body.mode === "titles" && body.cursor !== null && !text(body.cursor)
      || (body.mode === "set" || body.mode === "clear") && typeof body.key !== "string"
      || body.mode === "set" && (!Array.isArray(body.categories) || typeof body.expected_revision !== "string"))
      throw new ActionError("actions.input_invalid", "任务授权请求无效");
    const caller = await localWebActionContext(localHost, project, LOCAL_OWNER_PERMISSIONS, controller.signal);
    const client = bindActionClient(localHost.actionClient(project), () => caller), install = body.plugin_install_id as string;
    if (body.mode === "set") {
      const subject = await client.invoke(agentTaskGrantActions.set, { plugin_install_id: install, key: body.key as string,
        categories: body.categories as TaskGrantSetCategory[], expected_revision: body.expected_revision as string });
      sendLocalWebJson(response, 200, { subject }); return true;
    }
    if (body.mode === "clear") { sendLocalWebJson(response, 200, await client.invoke(agentTaskGrantActions.clear, { plugin_install_id: install, key: body.key as string })); return true; }
    if (body.mode === "list") {
      const listed = await client.invoke(agentTaskGrantActions.list, {});
      // Each installation the subjects are in, by its own name, and whether it says what its tasks are (so the page asks it for their titles).
      const installations = await Promise.all([...new Set(listed.subjects.map(subject => subject.plugin_install_id))].map(async plugin_install_id => {
        const found = await installationOf(context, project, plugin_install_id);
        return { plugin_install_id, plugin_id: found?.record.plugin_id ?? null, name: found ? installationName(found) : null, titled: Boolean(found?.manifest?.task_subjects) };
      }));
      sendLocalWebJson(response, 200, { ...listed, installations }); return true;
    }
    const kind = (await installationOf(context, project, install))?.manifest?.task_subjects?.kind;
    const source = kind ? subjectSource(await localHost.inspectActions(caller, project), install, kind) : undefined;
    if (!kind || !source) { sendLocalWebJson(response, 200, { entries: [], next_cursor: null }); return true; }
    const surface = source.action.search_source!.kinds.find(entry => entry.kind === kind)!.surface;
    const page = await localHost.actionClient(project).invoke(caller, { capability_id: source.capability_id, version: source.version, provider_id: source.provider.provider_id },
      { cursor: body.cursor, limit: SEARCH_ENTRIES_PAGE_LIMIT }) as SearchEntriesPage;
    sendLocalWebJson(response, 200, { next_cursor: page.next_cursor, entries: page.entries.filter(entry => entry.subject.kind === kind)
      .map(entry => ({ key: entry.subject.id, title: entry.title, open: entry.open ?? { surface, id: entry.subject.id } })) });
  } catch (error) {
    const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
  return true;
}
