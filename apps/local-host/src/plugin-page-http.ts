import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { pluginPageRequest, pluginPagesFor } from "./plugin-page-authority.js";
import { registeredPageRoutes } from "./plugin-page-routes.js";
import { changePageWorkspace } from "./plugin-page-workspaces.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";
import { runningProjectPlatform } from "./project-plugins.js";
import { embeddedStageTextOwners, runtimeStageOwner } from "./project-plugin-stages.js";
import { homeStageHalves } from "./home-plugin-http.js";
import { pageConnectionSlot } from "./plugin-connection-slots-http.js";
import { pageConnectionNeed } from "./plugin-connection-need-http.js";
import { pageTaskGrants } from "./plugin-page-task-grants-http.js";
import { stageObjectAction } from "@molis-ai/molis-work-app-workbench";
import { registeredBuiltinText } from "./ui-text-provider.js";
import { handlePageLocales } from "./web-ui-locales.js";

/** Resolve the same running stage half as rendering; the request names a surface, never an installation. */
async function stagePageSelection(context: WebRequestContext, project: LocalHostProjectReference | undefined, body: Record<string, unknown>) {
  const mount = body.mount;
  if (mount === undefined) return undefined;
  if (!mount || typeof mount !== "object" || Array.isArray(mount)
    || Object.keys(mount).some(key => !["contribution_id", "surface", "target_slot_id"].includes(key)))
    throw new ActionError("actions.input_invalid", "舞台挂载无效");
  const { contribution_id, surface, target_slot_id } = mount as Record<string, unknown>;
  const { localHost } = context;
  const home = await homeStageHalves(localHost.homePlugins);
  const platform = project ? await localHost.withProject(project, runtime => runningProjectPlatform(runtime.store, project.project_id)) : null;
  const entry = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === body.plugin_id)
    ?? home?.entries.find(item => item.manifest.plugin_id === body.plugin_id);
  const manifest = typeof body.plugin_id === "string" ? platform?.supervisor.manifest(body.plugin_id) : undefined;
  const stage = entry ?? (manifest ? { project_plugin_id: manifest.plugin_id, manifest } : undefined);
  const owner = stage && runtimeStageOwner({ platform }, stage, home).owner;
  if (!owner || owner.view.descriptor.contribution_id !== contribution_id
    || !owner.view.descriptor.surfaces?.some(item => item.surface_id === surface && item.target_slot_id === target_slot_id))
    throw new ActionError("actions.forbidden", "原舞台实例不可用");
  owner.assertCurrent();
  if (body.producer !== undefined && body.producer !== owner.producer)
    throw new ActionError("actions.provider_changed", "原舞台实例已变化，请重新读取");
  const reader = stageObjectAction(owner.entry.manifest);
  return { project_key: owner.entry.project_plugin_id, install_id: owner.install_id, installation_generation: owner.installation_generation,
    project_id: owner.scope === "home" ? null : project?.project_id ?? null, assertCurrent: owner.assertCurrent, embedded: embeddedStageTextOwners(platform, owner),
    ...(typeof surface === "string" && typeof target_slot_id === "string" && owner.view.descriptor.slots.some(slot => slot.accepts_forms?.length)
      ? { surfaceSlotSource: { contribution_id: owner.view.descriptor.contribution_id, surface, target_slot_id, producer: owner.producer,
        slots: owner.view.descriptor.slots, installation: owner.installation } } : {}),
    ...(reader ? { objectPresentation: { permissions: [...reader.action.permissions], surfaces: (owner.view.descriptor.surfaces ?? []).filter(item => item.target_slot_id === "workbench.main" && item.format === "declarative-html").map(item => item.surface_id) } } : {}) };
}

/** Only the trusted shell calls this, after the owner transport checks. It never hands the returned id to plugin JavaScript. */
export async function handlePluginPageHttp(context: WebRequestContext, project?: LocalHostProjectReference,
  shown?: () => Promise<readonly string[]>): Promise<boolean> {
  const { request, response, url, localHost, serverOptions } = context;
  if (url.pathname === "/api/ui/locales") { await handlePageLocales(context, project?.project_id ?? null, shown); return true; }
  const close = /^\/api\/host\/plugin-pages\/([^/]+)$/u.exec(url.pathname);
  const action = url.pathname === "/api/host/plugin-page-actions" && request.method === "POST";
  const files = url.pathname === "/api/host/plugin-page-files" && request.method === "POST";
  const check = url.pathname === "/api/host/plugin-page-check" && request.method === "POST";
  const workspace = url.pathname === "/api/host/plugin-page-workspaces" && request.method === "POST";
  const slot = url.pathname === "/api/host/plugin-page-slot" && request.method === "POST";
  const need = url.pathname === "/api/host/plugin-page-connection" && request.method === "POST";
  const taskGrants = url.pathname === "/api/host/plugin-page-task-grants" && request.method === "POST";
  if (!slot && !need && !taskGrants && !workspace && !files && !action && !check && !(url.pathname === "/api/host/plugin-pages" && request.method === "POST") && !(close && request.method === "DELETE")) return false;
  try {
    if (!serverOptions.homeDirectory) throw new ActionError("actions.unavailable", "插件页面需要 Home");
    const pages = pluginPagesFor(serverOptions.homeDirectory);
    const body = await readLocalWebBody(request);
    if (need) { sendLocalWebJson(response, 200, await pageConnectionNeed(context, project, body)); return true; }
    if (slot) {
      sendLocalWebJson(response, 200, await pageConnectionSlot(context, project, body)); return true;
    }
    if (taskGrants) { sendLocalWebJson(response, 200, await pageTaskGrants(context, project, body)); return true; }
    if (close) {
      if (!body || Object.keys(body).some(key => key !== "closing")) throw new ActionError("actions.input_invalid", "关闭请求无效");
      await pages.finish(close[1]!, body.closing as { reference: ActionReference; input: unknown } | undefined);
      sendLocalWebJson(response, 200, { closed: true }); return true;
    }
    if (workspace) { sendLocalWebJson(response, 200, await changePageWorkspace(context, project, body, shown)); return true; }
    if (check) {
      const page = pluginPageRequest(request);
      if (!page || !body || Object.keys(body).some(key => key !== "object_surface")) throw new ActionError("actions.forbidden", "需要当前插件页面");
      if (body.object_surface !== undefined) {
        if (typeof body.object_surface !== "string") throw new ActionError("actions.input_invalid", "表面无效");
        page.objectPresentation(body.object_surface);
      }
      await page.beforeEffect(); sendLocalWebJson(response, 200, { current: true }); return true;
    }
    if (files) {
      const page = pluginPageRequest(request);
      if (!page) throw new ActionError("actions.forbidden", "文件操作需要当前插件页面");
      if (!body || Object.keys(body).some(key => key !== "paths") || !Array.isArray(body.paths)) throw new ActionError("actions.input_invalid", "文件请求无效");
      const paths = await page.resolveFiles(body.paths); page.assertCurrent();
      sendLocalWebJson(response, 200, { paths }); return true;
    }
    if (action) {
      const page = pluginPageRequest(request);
      if (!page) throw new ActionError("actions.forbidden", "动作入口需要当前插件页面");
      const availability = body?.mode === "availability", submit = body?.mode === "component_submit";
      const keys = submit ? ["mode", "component_id", "payload"] : availability ? ["mode", "reference"] : ["reference", "input"];
      if (!isRecord(body) || Object.keys(body).some(key => !keys.includes(key)) || availability && !body.reference)
        throw new ActionError("actions.input_invalid", "动作请求无效");
      const component_id = body.component_id;
      if (submit && (typeof component_id !== "string" || !component_id || !Object.hasOwn(body, "payload")))
        throw new ActionError("actions.input_invalid", "组件提交请求无效");
      const beforeBackgroundEffect = async () => {
        const key = page.project_key ?? PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === page.plugin_id)?.project_plugin_id;
        if (shown && key && !(await shown()).includes(key)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
      };
      const beforeEffect = async () => { page.assertCurrent(); await beforeBackgroundEffect(); await page.beforeEffect(); };
      const control = { project_id: page.project_id, signal: page.signal, assertCurrent: page.assertCurrent, beforeEffect, beforeBackgroundEffect };
      const result = submit && typeof component_id === "string"
        ? await page.invoke({ ...control, mode: "component_submit", component_id, payload: body.payload })
        : await page.invoke({ ...control, reference: body.reference as ActionReference, input: body.input, ...(availability ? { mode: "availability" } : {}) });
      sendLocalWebJson(response, 200, result); return true;
    }
    if (!body || Object.keys(body).some(key => !["plugin_id", "mount", "producer"].includes(key)) || typeof body.plugin_id !== "string"
      || body.producer !== undefined && (typeof body.producer !== "string" || body.mount === undefined))
      throw new ActionError("actions.input_invalid", "请选择插件");
    const entry = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === body.plugin_id);
    const selected = await stagePageSelection(context, project, body);
    const key = selected?.project_key ?? entry?.project_plugin_id;
    const assertScope = async (readShown = shown) => {
      if (readShown && key && !(await readShown()).includes(key)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    };
    await assertScope();
    await localHost.homePlugins?.ready();
    if (project) await localHost.inspectActions({actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, permissions: [], audience: "user"}, project);
    const registered = entry?.workbench.pageRequests && project ? {
      manifest: entry.manifest, install_id: null, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
      requestAllowed: registeredPageRoutes(entry.workbench.pageRequests), registeredText: registeredBuiltinText(entry.manifest) ?? undefined,
      assertCurrent() { if (localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主已关闭"); },
    } : undefined;
    await assertScope();
    sendLocalWebJson(response, 200, pages.open(body.plugin_id, project?.project_id ?? null, LOCAL_PERSON_ACTOR_ID, assertScope, registered, selected));
  } catch (error) {
    const failed = actionErrorResponse(error); sendLocalWebJson(response, failed.status, failed.body);
  }
  return true;
}
