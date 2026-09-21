import { LingguangError } from "./error.js";
import type { LingguangPluginRouteHandler, LingguangPluginRouteRequest, LingguangPluginRouteResponse } from "./routes.js";
import type { LingguangStore } from "./store.js";

export function createLingguangRouteHandlers(store: LingguangStore): Record<string, LingguangPluginRouteHandler> {
  return {
    "lingguang.list": ({ request }) => ({ status: 200, body: { sparks: store.list(projectIdOf(request)) } }),
    "lingguang.create": ({ request }) => ({
      status: 200,
      body: {
        spark: store.create({
          title: stringField(request.body.title),
          body: stringField(request.body.body),
          project_id: projectIdOf(request),
        }),
      },
    }),
    "lingguang.get": ({ params, request }) => ({
      status: 200,
      body: { spark: store.get(params.id ?? "", projectIdOf(request)) },
    }),
    "lingguang.update": ({ params, request }) => ({
      status: 200,
      body: {
        spark: store.update(params.id ?? "", {
          title: stringField(request.body.title),
          body: stringField(request.body.body),
        }, projectIdOf(request)),
      },
    }),
    "lingguang.discard": ({ params, request }) => {
      store.discard([params.id ?? ""], projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "lingguang.discard_many": ({ request }) => {
      store.discard(readIds(request.body.ids), projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "lingguang.conversation_open": ({ request }) => ({
      status: 200,
      body: store.openConversation(readIds(request.body.spark_ids), projectIdOf(request)),
    }),
    "lingguang.conversation_message": ({ params, request }) => ({
      status: 200,
      body: store.addMessage(params.id ?? "", stringField(request.body.body) ?? "", projectIdOf(request)),
    }),
  };
}

export function lingguangRouteErrorResponse(error: unknown): LingguangPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "灵光请求失败";
  if (code === "lingguang.not_found") return { status: 404, body: { error: message, code } };
  if (code.startsWith("lingguang.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function projectIdOf(request: LingguangPluginRouteRequest): string {
  const raw = request.query.get("project_id") ?? request.body.project_id;
  if (typeof raw !== "string" || !raw.trim()) throw new LingguangError("lingguang.invalid", "缺少项目");
  return raw.trim();
}

function stringField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new LingguangError("lingguang.invalid", "字段须为文字");
  return value;
}

function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new LingguangError("lingguang.invalid", "先选至少一条");
  return value.map((item) => {
    if (typeof item !== "string") throw new LingguangError("lingguang.invalid", "条目须为文字");
    return item;
  });
}
