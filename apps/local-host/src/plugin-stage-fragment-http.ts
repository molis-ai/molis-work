import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import { stageObjectAction, stageDataAction } from "@molis-ai/molis-work-app-workbench";
import { readRuntimeStageOwner, type RuntimeStageOwner } from "./project-plugin-stages.js";
import { sendLocalWebJson } from "./web-http.js";

export const PLUGIN_STAGE_PREFIX = "/api/stage/";

export interface PluginStageFragmentPorts {
  readonly shown: () => Promise<readonly string[]>;
  readonly renderer: Pick<WorkbenchRenderer, "stageFragmentModel">;
  readonly invalidateWebView: () => void;
  readonly context: Pick<MolisWorkWebView, "route_prefix" | "project" | "demo">;
  readonly owner: (projectPluginId: string) => Promise<RuntimeStageOwner | undefined>;
  readonly bind: (action: ActionDefinition, owner: RuntimeStageOwner, signal: AbortSignal) => BoundActionClient;
}

function stageRequest(url: URL): { plugin: string; object?: { id: string; surface: string } } | undefined {
  const path = url.pathname.slice(PLUGIN_STAGE_PREFIX.length);
  const plain = /^([a-z0-9][a-z0-9.-]*)$/u.exec(path);
  if (plain) return { plugin: plain[1]! };
  const object = /^([a-z0-9][a-z0-9.-]*)\/objects\/([^/]+)$/u.exec(path);
  if (!object) return undefined;
  let id: string;
  try { id = decodeURIComponent(object[2]!); }
  catch { throw new ActionError("actions.input_invalid", "对象标识编码无效"); }
  if (!id || id.includes("/") || id.length > 256) throw new ActionError("actions.input_invalid", "对象标识必须是一个非空路径段");
  const surfaces = url.searchParams.getAll("surface");
  if (surfaces.length !== 1 || !surfaces[0]?.trim()) throw new ActionError("actions.input_invalid", "对象读取需要一个明确的 surface");
  return { plugin: object[1]!, object: { id, surface: surfaces[0]! } };
}

/** A stage or object is read and drawn by one actual running owner; a late reply never reaches another instance. */
export async function handlePluginStageFragmentHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: PluginStageFragmentPorts): Promise<boolean> {
  if (request.method !== "GET" || !url.pathname.startsWith(PLUGIN_STAGE_PREFIX)) return false;
  const abort = new AbortController();
  const disconnected = () => { if (!response.writableEnded) abort.abort(new ActionError("actions.cancelled", "页面读取已取消")); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  try {
    const target = stageRequest(url);
    if (!target) return false;
    const showing = await ports.shown();
    if (!showing.includes(target.plugin)) throw new ActionError("actions.plugin_disabled", "此项目未显示该插件");
    const owner = await ports.owner(target.plugin);
    if (!owner) throw new ActionError("actions.plugin_disabled", "插件舞台没有运行中的提供方");
    owner.assertCurrent();
    const surface = target.object?.surface ?? "workbench";
    if (!target.object && !stageDataAction(owner.entry.manifest)) throw new ActionError("actions.missing", "插件没有声明舞台读取");
    if (target.object && !stageObjectAction(owner.entry.manifest)) throw new ActionError("actions.missing", "插件没有声明对象读取");
    const declared = (owner.view.descriptor.surfaces ?? []).filter(item => item.surface_id === surface);
    if (declared.length !== 1 || declared[0]!.target_slot_id !== "workbench.main" || declared[0]!.format !== "declarative-html") {
      throw new ActionError("actions.input_invalid", "表面必须由同一舞台贡献声明，且属于主区");
    }
    abort.signal.throwIfAborted();
    ports.invalidateWebView();
    const data = await readRuntimeStageOwner(owner, (action, bound) => ports.bind(action, bound, abort.signal), target.object ? { object_id: target.object.id } : {}, Boolean(target.object));
    if (!(await ports.shown()).includes(target.plugin)) throw new ActionError("actions.plugin_disabled", "此项目不再显示该插件");
    abort.signal.throwIfAborted(); owner.assertCurrent();
    const model = ports.renderer.stageFragmentModel(target.plugin, { ...ports.context, shown_plugins: showing }, data, target.object);
    owner.assertCurrent();
    const html = owner.view.render({ contribution_id: owner.view.descriptor.contribution_id, surface, model });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(html);
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
  } finally {
    request.off("aborted", disconnected); response.off("close", disconnected);
  }
  return true;
}
