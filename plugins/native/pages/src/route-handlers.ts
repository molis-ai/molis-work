import { createHash } from "node:crypto";
import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import { runPagesAi } from "./ai.js";
import { parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import { preparePagesImport } from "./import-files.js";
import type { PagesPluginRouteHandler, PagesPluginRouteRequest, PagesPluginRouteResponse } from "./routes.js";
import { promotePagesDocument, requirePromoteArtifactPort } from "./promote.js";
import type { PagesPublishArtifactPort } from "./promote.js";
import type { PagesStore } from "./store.js";
import { pagesTemplateSummaries } from "./templates.js";

export interface PagesRoutePorts {
  completeText?: (prompt: string) => Promise<string>;
  publishArtifact?: PagesPublishArtifactPort;
  /** Host-resolved catalog project. When set, query/body project ids must match it. */
  boundProjectId?: string;
}

export function createPagesRouteHandlers(
  store: PagesStore,
  ports: PagesRoutePorts = {},
): Record<string, PagesPluginRouteHandler> {
  const projectIdOf = (request: PagesPluginRouteRequest) => readPagesProjectId(request, ports.boundProjectId);
  const importProjectId = (request: PagesPluginRouteRequest) => importProjectIdOf(request, ports.boundProjectId);
  return {
    "pages.list": ({ request }) => {
      const projectId = projectIdOf(request);
      return {
        status: 200,
        body: { documents: store.list(projectId), folders: store.listFolders(projectId) },
      };
    },
    "pages.templates": () => ({ status: 200, body: { templates: pagesTemplateSummaries() } }),
    "pages.import.preview": async ({ request }) => {
      importProjectId(request);
      return { status: 200, body: await preparePagesImport(importFilesOf(request.body.files)) };
    },
    "pages.import": async ({ request }) => {
      const project_id = importProjectId(request);
      const files = importFilesOf(request.body.files);
      const selected = selectedImportKeys(request.body.selected_keys);
      const request_id = importRequestId(request.body.request_id);
      const folder_id = (stringField(request.body.folder_id) ?? "").trim();
      const prepared = await preparePagesImport(files);
      const byKey = new Map(prepared.documents.map((document) => [document.key, document]));
      if (selected.some((key) => !byKey.has(key))) {
        throw new PagesError("pages.invalid", "选择的文档不在这批文件中，请重新预览");
      }
      const documents = prepared.documents.filter((document) => selected.includes(document.key));
      const request_hash = createHash("sha256").update(JSON.stringify({
        files,
        selected_keys: [...selected].sort(),
        folder_id,
      })).digest("hex");
      return {
        status: 200,
        body: {
          documents: store.importDocuments({ project_id, request_id, request_hash, folder_id, documents }),
          warnings: [...new Set([...prepared.warnings, ...documents.flatMap((document) => document.warnings)])],
        },
      };
    },
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
      try {
        const projectId = projectIdOf(request);
        const current = store.get(params.id ?? "", projectId);
        const goal_id = stringField(request.body.goal_id) ?? current.goal_id;
        const promoted = promotePagesDocument(
          store,
          current.id,
          projectId,
          requirePromoteArtifactPort(ports.publishArtifact),
          goal_id,
        );
        return {
          status: 200,
          body: {
            document: promoted.document,
            artifact: promoted.artifact,
          },
        };
      } catch (error) {
        return pagesRouteErrorResponse(error);
      }
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

export function readPagesProjectId(request: PagesPluginRouteRequest, boundProjectId?: string): string {
  const queryRaw = request.query.get("project_id");
  const bodyRaw = request.body.project_id;
  if (bodyRaw !== undefined && typeof bodyRaw !== "string") throw new PagesError("pages.invalid", "缺少项目");
  const queryProject = queryRaw === null ? "" : queryRaw.trim();
  const bodyProject = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
  if (queryRaw !== null && !queryProject) throw new PagesError("pages.invalid", "缺少项目");
  if (typeof bodyRaw === "string" && !bodyProject) throw new PagesError("pages.invalid", "缺少项目");
  if (queryProject && bodyProject && queryProject !== bodyProject) {
    throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
  }
  const declared = queryProject || bodyProject;
  if (boundProjectId !== undefined) {
    const bound = boundProjectId.trim();
    if (!bound) throw new PagesError("pages.invalid", "缺少项目");
    if (declared && declared !== bound) throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    return bound;
  }
  if (!declared) throw new PagesError("pages.invalid", "缺少项目");
  return declared;
}

function importProjectIdOf(request: PagesPluginRouteRequest, boundProjectId?: string): string {
  const queryProject = request.query.get("project_id");
  const bodyProject = request.body.project_id;
  if (bodyProject !== undefined && (typeof bodyProject !== "string" || !bodyProject.trim())) {
    throw new PagesError("pages.invalid", "缺少项目");
  }
  if (queryProject !== null && bodyProject !== undefined && queryProject.trim() !== (bodyProject as string).trim()) {
    throw new PagesError("pages.invalid", "导入的项目与当前项目不一致");
  }
  const project = readPagesProjectId(request, boundProjectId);
  if (project.length > 80) throw new PagesError("pages.invalid", "项目标识过长");
  return project;
}

function importFilesOf(value: unknown): Array<{ name: string; data: string }> {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new PagesError("pages.invalid", "请选择 1 到 100 个文件");
  }
  return value.map((file: unknown) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new PagesError("pages.invalid", "导入文件格式不正确");
    const entry = file as Record<string, unknown>;
    if (typeof entry.name !== "string" || typeof entry.data !== "string") {
      throw new PagesError("pages.invalid", "导入文件须包含名称和文件内容");
    }
    return { name: entry.name, data: entry.data };
  });
}

function selectedImportKeys(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100
    || value.some((key) => typeof key !== "string" || !key.trim())
    || new Set(value).size !== value.length) {
    throw new PagesError("pages.invalid", "请至少选择一篇文档，且不能重复选择");
  }
  return value as string[];
}

function importRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw new PagesError("pages.invalid", "缺少有效的导入请求标识，请重新预览");
  }
  return value.toLowerCase();
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
