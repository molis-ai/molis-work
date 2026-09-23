import { AlchemistError } from "./error.js";
import type { AlchemistPluginRouteHandler, AlchemistPluginRouteRequest, AlchemistPluginRouteResponse } from "./routes.js";
import type { AlchemistStore } from "./store.js";

export function createAlchemistRouteHandlers(
  store: AlchemistStore,
  boundProjectId?: string,
): Record<string, AlchemistPluginRouteHandler> {
  const projectIdOf = (request: AlchemistPluginRouteRequest) => readAlchemistProjectId(request, boundProjectId);
  return {
    "alchemist.list": ({ request }) => ({ status: 200, body: { directions: store.list(projectIdOf(request)) } }),
    "alchemist.create": ({ request }) => ({
      status: 200,
      body: store.create({
        title: stringField(request.body.title),
        description: stringField(request.body.description),
        project_id: projectIdOf(request),
      }),
    }),
    "alchemist.get": ({ params, request }) => ({ status: 200, body: store.get(params.id ?? "", projectIdOf(request)) }),
    "alchemist.delete": ({ params, request }) => {
      store.deleteDirection(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "alchemist.keep": ({ params, request }) => ({
      status: 200,
      body: { card: store.setCardStatus(params.id ?? "", "kept", projectIdOf(request)) },
    }),
    "alchemist.discard": ({ params, request }) => ({
      status: 200,
      body: { card: store.setCardStatus(params.id ?? "", "discarded", projectIdOf(request)) },
    }),
    "alchemist.restore": ({ params, request }) => ({
      status: 200,
      body: { card: store.setCardStatus(params.id ?? "", "candidate", projectIdOf(request)) },
    }),
    "alchemist.decide": ({ params, request }) => ({
      status: 200,
      body: {
        decision: store.decide(
          params.id ?? "",
          stringField(request.body.choice) ?? "",
          stringField(request.body.reason),
          projectIdOf(request),
        ),
      },
    }),
  };
}

export function alchemistRouteErrorResponse(error: unknown): AlchemistPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "炼金术士请求失败";
  if (code === "alchemist.not_found") return { status: 404, body: { error: message, code } };
  if (code.startsWith("alchemist.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function readAlchemistProjectId(request: AlchemistPluginRouteRequest, boundProjectId?: string): string {
  const queryRaw = request.query.get("project_id");
  const bodyRaw = request.body.project_id;
  if (bodyRaw !== undefined && typeof bodyRaw !== "string") throw new AlchemistError("alchemist.invalid", "缺少项目");
  const queryProject = queryRaw === null ? "" : queryRaw.trim();
  const bodyProject = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  if (queryRaw !== null && !queryProject) throw new AlchemistError("alchemist.invalid", "缺少项目");
  if (typeof bodyRaw === "string" && !bodyProject) throw new AlchemistError("alchemist.invalid", "缺少项目");
  if (queryProject && bodyProject && queryProject !== bodyProject) {
    throw new AlchemistError("alchemist.invalid", "方向项目与当前项目不一致");
  }
  const declared = queryProject || bodyProject;
  if (boundProjectId !== undefined) {
    const bound = boundProjectId.trim();
    if (!bound) throw new AlchemistError("alchemist.invalid", "缺少项目");
    if (declared && declared !== bound) throw new AlchemistError("alchemist.invalid", "方向项目与当前项目不一致");
    return bound;
  }
  if (!declared) throw new AlchemistError("alchemist.invalid", "缺少项目");
  return declared;
}

function stringField(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new AlchemistError("alchemist.invalid", "字段须为文字");
  return value;
}
