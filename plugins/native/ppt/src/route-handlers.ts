import type { PptSlide } from "@molis-ai/molis-work-contracts/modules/ppt";
import { PptError } from "./error.js";
import type { PptPluginRouteHandler, PptPluginRouteRequest, PptPluginRouteResponse } from "./routes.js";
import { promotePpt, requirePptArtifactPort, type PptPublishArtifactPort } from "./promote.js";
import type { PptStore } from "./store.js";

export interface PptRoutePorts {
  publishArtifact?: PptPublishArtifactPort;
}

export function createPptRouteHandlers(
  store: PptStore,
  ports: PptRoutePorts = {},
): Record<string, PptPluginRouteHandler> {
  return {
    "ppt.list": ({ request }) => ({ status: 200, body: { presentations: store.list(projectIdOf(request)) } }),
    "ppt.create": ({ request }) => ({
      status: 200,
      body: { presentation: store.create({ title: stringField(request.body.title), project_id: projectIdOf(request) }) },
    }),
    "ppt.get": ({ params, request }) => ({
      status: 200,
      body: { presentation: store.get(params.id ?? "", projectIdOf(request)) },
    }),
    "ppt.update": ({ params, request }) => ({
      status: 200,
      body: { presentation: store.update(params.id ?? "", {
        title: stringField(request.body.title),
        description: stringField(request.body.description),
        color_primary: stringField(request.body.color_primary),
        color_background: stringField(request.body.color_background),
        color_text: stringField(request.body.color_text),
        slides: readSlides(request.body.slides),
      }, projectIdOf(request)) },
    }),
    "ppt.delete": ({ params, request }) => {
      store.delete(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "ppt.promote": ({ params, request }) => {
      const projectId = projectIdOf(request);
      const promoted = promotePpt(
        store,
        params.id ?? "",
        projectId,
        requirePptArtifactPort(ports.publishArtifact),
      );
      return { status: 200, body: { presentation: promoted.presentation, artifact: promoted.artifact } };
    },
  };
}

export function pptRouteErrorResponse(error: unknown): PptPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "演示稿请求失败";
  if (code === "ppt.not_found") return { status: 404, body: { error: message, code } };
  if (code.startsWith("ppt.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function projectIdOf(request: PptPluginRouteRequest): string {
  const raw = request.query.get("project_id") ?? request.body.project_id;
  if (typeof raw !== "string" || !raw.trim()) throw new PptError("ppt.invalid", "缺少项目");
  return raw.trim();
}

function stringField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PptError("ppt.invalid", "字段须为文字");
  return value;
}

function readSlides(value: unknown): PptSlide[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new PptError("ppt.invalid", "幻灯片须是列表");
  return value as PptSlide[];
}
