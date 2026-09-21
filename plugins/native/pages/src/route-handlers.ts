import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { runPagesAi } from "./ai.js";
import { parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import type { PagesPluginRouteHandler, PagesPluginRouteRequest, PagesPluginRouteResponse } from "./routes.js";
import type { PagesStore } from "./store.js";
import { pagesTemplateSummaries } from "./templates.js";

export interface PagesRoutePorts {
  completeText?: (prompt: string) => Promise<string>;
  publishArtifact?: (input: {
    project_id: string;
    page_id: string;
    title: string;
    body: PagesBody;
    goal_id: string;
    version: number;
  }) => { artifact_id: string; version: number };
}

export function createPagesRouteHandlers(
  store: PagesStore,
  ports: PagesRoutePorts = {},
): Record<string, PagesPluginRouteHandler> {
  return {
    "pages.list": ({ request }) => {
      const projectId = projectIdOf(request);
      return {
        status: 200,
        body: { documents: store.list(projectId), folders: store.listFolders(projectId) },
      };
    },
    "pages.templates": () => ({ status: 200, body: { templates: pagesTemplateSummaries() } }),
    "pages.create": ({ request }) => ({
      status: 200,
      body: {
        document: store.create({
          title: stringField(request.body.title),
          project_id: projectIdOf(request),
          folder_id: stringField(request.body.folder_id),
          starred: booleanField(request.body.starred),
          goal_id: stringField(request.body.goal_id),
          template_id: stringField(request.body.template_id),
          body: readBody(request.body.body),
        }),
      },
    }),
    "pages.get": ({ params, request }) => ({
      status: 200,
      body: { document: store.get(params.id ?? "", projectIdOf(request)) },
    }),
    "pages.update": ({ params, request }) => ({
      status: 200,
      body: {
        document: store.update(params.id ?? "", {
          title: stringField(request.body.title),
          body: readBody(request.body.body),
          folder_id: stringField(request.body.folder_id),
          starred: booleanField(request.body.starred),
          goal_id: stringField(request.body.goal_id),
        }, projectIdOf(request)),
      },
    }),
    "pages.delete": ({ params, request }) => {
      store.delete(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "pages.folders.create": ({ request }) => ({
      status: 200,
      body: { folder: store.createFolder({ title: stringField(request.body.title), project_id: projectIdOf(request) }) },
    }),
    "pages.folders.update": ({ params, request }) => ({
      status: 200,
      body: { folder: store.updateFolder(params.id ?? "", { title: stringField(request.body.title) }, projectIdOf(request)) },
    }),
    "pages.folders.delete": ({ params, request }) => {
      store.deleteFolder(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "pages.ai": async ({ params, request }) => {
      const projectId = projectIdOf(request);
      store.get(params.id ?? "", projectId);
      const command = stringField(request.body.command) ?? "";
      const text = stringField(request.body.text) ?? "";
      const style = stringField(request.body.style);
      return { status: 200, body: await runPagesAi({ command, text, style }, ports.completeText) };
    },
    "pages.promote": ({ params, request }) => {
      const projectId = projectIdOf(request);
      const current = store.get(params.id ?? "", projectId);
      const goal_id = stringField(request.body.goal_id) ?? current.goal_id;
      if (!ports.publishArtifact) {
        return {
          status: 409,
          body: {
            error: "当前环境不能发出 Artifact",
            code: "pages.unavailable",
            document: store.update(current.id, { goal_id }, projectId),
          },
        };
      }
      const published = ports.publishArtifact({
        project_id: projectId,
        page_id: current.id,
        title: current.title,
        body: current.body,
        goal_id,
        version: (current.artifact_version || 0) + 1,
      });
      return {
        status: 200,
        body: {
          document: store.update(current.id, {
            goal_id,
            artifact_id: published.artifact_id,
            artifact_version: published.version,
          }, projectId),
          artifact: published,
        },
      };
    },
    "pages.extract": ({ params, request }) => {
      const projectId = projectIdOf(request);
      const current = store.get(params.id ?? "", projectId);
      const extracted = extractFromPagesBody(current.title, current.body);
      const document = store.update(current.id, { body: extracted.body }, projectId);
      const created = unpublishedKnowledgePages(store.list(projectId).map((item) => item.title), extracted.knowledge).map((item) => store.create({
        project_id: projectId,
        folder_id: current.folder_id,
        title: item.title,
        body: item.body,
      }));
      return { status: 200, body: { document, cards: extracted.cards, created } };
    },
  };
}

export function pagesRouteErrorResponse(error: unknown): PagesPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "文档请求失败";
  if (code === "pages.not_found") return { status: 404, body: { error: message, code } };
  if (code === "pages.unavailable") return { status: 409, body: { error: message, code } };
  if (code.startsWith("pages.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function projectIdOf(request: PagesPluginRouteRequest): string {
  const raw = request.query.get("project_id") ?? request.body.project_id;
  if (typeof raw !== "string" || !raw.trim()) throw new PagesError("pages.invalid", "缺少项目");
  return raw.trim();
}

function stringField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PagesError("pages.invalid", "字段须为文字");
  return value;
}

function booleanField(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new PagesError("pages.invalid", "字段须为开关");
  return value;
}

function readBody(value: unknown): PagesBody | undefined {
  if (value === undefined) return undefined;
  return parsePagesBody(value);
}
