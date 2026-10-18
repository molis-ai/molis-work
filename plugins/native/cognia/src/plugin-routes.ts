import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { cogniaActions as actions } from "./actions.js";
import { requireCognia } from "./types.js";

/** HTTP maps to the same actions as MCP and onboarding; no separate business path. */
export function cogniaRoutes(context: PluginStartContext): PluginRouteBinding[] {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body ?? {};
    requireCognia(value && typeof value === "object" && !Array.isArray(value), "请求必须是 JSON 对象");
    return value as Record<string, unknown>;
  };
  const route = (action: ActionDefinition, routeId: string, input: (request: PluginRouteRequest) => unknown) =>
    bindPluginActionRoute(context, action, input as never, routeId);
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  const identified = (request: PluginRouteRequest) => ({ ...body(request), ...id(request) });
  const read = (request: PluginRouteRequest) => ({ ...id(request), ...(request.query.revision !== undefined ? { revision: Number(request.query.revision) } : {}) });
  const upload = route(actions.preview, "cognia.preview", body), directory = route(actions.previewDirectory, "cognia.preview", body);
  const synthesis = route(actions.synthesize, "cognia.ai", request => {
    const input = body(request);
    return { ...(input.material_refs !== undefined ? { material_refs: input.material_refs } : {}), ...(input.material_ids !== undefined ? { material_ids: input.material_ids } : {}), ...(input.question ? { question: input.question } : {}) };
  });
  const question = route(actions.query, "cognia.ai", request => {
    const input = body(request); return { question: input.question, ...(input.domain_id !== undefined ? { domain_id: input.domain_id } : {}) };
  });
  const download = bindPluginActionRoute(context, actions.download, read, "cognia.download");
  return [
    route(actions.workspace, "cognia.workspace", ({ query }) => ({ query: query.q ?? "", domain_id: query.domain_id ?? "", source_id: query.source_id ?? "" })),
    route(actions.createDomain, "cognia.domain.create", body), route(actions.updateDomain, "cognia.domain.update", identified), route(actions.deleteDomain, "cognia.domain.delete", identified),
    route(actions.updateSource, "cognia.source.update", identified), route(actions.deleteSource, "cognia.source.delete", identified),
    route(actions.createMaterial, "cognia.material.create", body), route(actions.updateMaterial, "cognia.material.update", identified), route(actions.deleteMaterial, "cognia.material.delete", identified),
    route(actions.read, "cognia.material.read", read),
    { ...download, async handle(request) {
      const result = await download.handle(request);
      if (result.status !== 200) return result;
      const file = result.body as { data: string; filename: string; mime: string };
      return { status: 200, bytes: Buffer.from(file.data, "base64"), filename: file.filename, mime: file.mime };
    } },
    { route_id: "cognia.preview", handle: request => (body(request).path !== undefined ? directory : upload).handle(request) },
    route(actions.commit, "cognia.commit", body), route(actions.cancel, "cognia.cancel", body),
    { route_id: "cognia.ai", handle(request) {
      const input = body(request); requireCognia(input.mode === "synthesize" || input.mode === "query", "整理方式无效");
      return (input.mode === "synthesize" ? synthesis : question).handle(request);
    } },
    route(actions.draft, "cognia.draft.read", id), route(actions.saveDraft, "cognia.draft.save", id), route(actions.archiveDraft, "cognia.draft.archive", id),
  ];
}
