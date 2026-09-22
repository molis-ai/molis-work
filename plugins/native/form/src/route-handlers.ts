import type { FormQuestion } from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";
import type { FormPluginRouteHandler, FormPluginRouteRequest, FormPluginRouteResponse } from "./routes.js";
import { promoteForm, requireFormArtifactPort, type FormPublishArtifactPort } from "./promote.js";
import type { FormStore } from "./store.js";

export interface FormRoutePorts {
  completeText?: (prompt: string) => Promise<string>;
  publishArtifact?: FormPublishArtifactPort;
}

export function createFormRouteHandlers(
  store: FormStore,
  ports: FormRoutePorts = {},
): Record<string, FormPluginRouteHandler> {
  return {
    "form.list": ({ request }) => ({ status: 200, body: { forms: store.list(projectIdOf(request)) } }),
    "form.create": ({ request }) => ({
      status: 200,
      body: { form: store.create({ title: stringField(request.body.title), project_id: projectIdOf(request) }) },
    }),
    "form.get": ({ params, request }) => ({
      status: 200,
      body: { form: store.get(params.id ?? "", projectIdOf(request)) },
    }),
    "form.update": ({ params, request }) => ({
      status: 200,
      body: { form: store.update(params.id ?? "", {
        title: stringField(request.body.title),
        description: stringField(request.body.description),
        questions: readQuestions(request.body.questions),
      }, projectIdOf(request)) },
    }),
    "form.publish": ({ params, request }) => ({
      status: 200,
      body: { form: store.publish(params.id ?? "", projectIdOf(request)) },
    }),
    "form.promote": ({ params, request }) => {
      const projectId = projectIdOf(request);
      const promoted = promoteForm(
        store,
        params.id ?? "",
        projectId,
        requireFormArtifactPort(ports.publishArtifact),
      );
      return { status: 200, body: { form: promoted.form, artifact: promoted.artifact } };
    },
    "form.delete": ({ params, request }) => {
      store.delete(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "form.generate": async ({ params, request }) => {
      const prompt = stringField(request.body.prompt) ?? "";
      const title = ports.completeText
        ? ((await ports.completeText(prompt)).trim() || prompt)
        : prompt;
      return {
        status: 200,
        body: { form: store.generateQuestions(params.id ?? "", title, projectIdOf(request)) },
      };
    },
    "form.submit": ({ params, request }) => ({
      status: 200,
      body: { submission: store.submit(params.id ?? "", readAnswers(request.body.answers), projectIdOf(request)) },
    }),
    "form.results": ({ params, request }) => {
      const id = params.id ?? "";
      const projectId = projectIdOf(request);
      return {
        status: 200,
        body: {
          analysis: store.analyze(id, projectId),
          submissions: store.listSubmissions(id, projectId),
        },
      };
    },
  };
}

export function formRouteErrorResponse(error: unknown): FormPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "问卷请求失败";
  if (code === "form.not_found") return { status: 404, body: { error: message, code } };
  if (code.startsWith("form.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function projectIdOf(request: FormPluginRouteRequest): string {
  const raw = request.query.get("project_id") ?? request.body.project_id;
  if (typeof raw !== "string" || !raw.trim()) throw new FormError("form.invalid", "缺少项目");
  return raw.trim();
}

function stringField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new FormError("form.invalid", "字段须为文字");
  return value;
}

function readQuestions(value: unknown): FormQuestion[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new FormError("form.invalid", "题目须是列表");
  return value as FormQuestion[];
}

function readAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FormError("form.invalid", "回答须是对象");
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "")]),
  );
}
