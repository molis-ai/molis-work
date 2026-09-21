import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { stubPagesAi } from "./ai.js";
import { parsePagesBody } from "./document.js";
import { PagesError } from "./error.js";
import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import type { PagesRoutePorts } from "./route-handlers.js";
import { promotePagesDocument, requirePromoteArtifactPort } from "./promote.js";
import type { PagesStore } from "./store.js";
import { pagesTemplateSummaries } from "./templates.js";

/** Declare `tool_id`s here and handle by `tool_id` only. Host stamps the public name and injects project_id. */
export const PAGES_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  {
    tool_id: "list",
    description: "列出当前绑定项目里的文档和文件夹。先 list 再 get / update；不要编造文档 id。",
    input_schema: { type: "object", properties: {}, required: [] },
    effect: "read",
  },
  {
    tool_id: "get",
    description: "读取一篇文档的标题和正文。id 必须来自 list 或 create 的结果。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "create",
    description: "在当前绑定项目新建一篇文档。可传 template_id 从内置模板起笔，可传 folder_id 放进已有文件夹。",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        folder_id: { type: "string" },
        starred: { type: "boolean" },
        template_id: { type: "string" },
        goal_id: { type: "string" },
      },
      required: [],
    },
    effect: "write",
  },
  {
    tool_id: "update",
    description: "改文档标题、正文、文件夹或收藏。body 是 ProseMirror 文档 JSON，type 必须是 doc。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        body: { type: "object" },
        folder_id: { type: "string" },
        starred: { type: "boolean" },
        goal_id: { type: "string" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "delete",
    description: "删除一篇文档。不可恢复。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "promote",
    description: "把一篇文档挂到 Goal，并按工作台 Promote 发出 Artifact。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        goal_id: { type: "string" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "extract",
    description: "从一篇文档抽出任务卡，并把二级标题下的知识建成新文档。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "ai",
    description: "对一段文字运行写作命令。command 为 translate/rewrite/expand/continue/outline/summarize/explain/bullets/actions/reader/coach/translate_new/proofread。没有模型时返回标明未接模型的草稿。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        command: { type: "string" },
        text: { type: "string" },
        style: { type: "string" },
      },
      required: ["id", "command", "text"],
    },
    effect: "write",
  },
];

export function runPagesMcpTool(
  store: PagesStore,
  request: PluginMcpHandleRequest,
  projectId: string,
  ports: PagesRoutePorts = {},
): string {
  if (request.tool_id === "list") {
    return dump({
      documents: store.list(projectId),
      folders: store.listFolders(projectId),
      templates: pagesTemplateSummaries(),
    });
  }
  if (request.tool_id === "get") {
    return dump({ document: store.get(idOf(request), projectId) });
  }
  if (request.tool_id === "create") {
    return dump({
      document: store.create({
        title: optionalString(request.arguments.title),
        project_id: projectId,
        folder_id: optionalString(request.arguments.folder_id),
        starred: optionalBoolean(request.arguments.starred),
        template_id: optionalString(request.arguments.template_id),
        goal_id: optionalString(request.arguments.goal_id),
      }),
    });
  }
  if (request.tool_id === "update") {
    return dump({
      document: store.update(idOf(request), {
        title: optionalString(request.arguments.title),
        body: optionalBody(request.arguments.body),
        folder_id: optionalString(request.arguments.folder_id),
        starred: optionalBoolean(request.arguments.starred),
        goal_id: optionalString(request.arguments.goal_id),
      }, projectId),
    });
  }
  if (request.tool_id === "delete") {
    store.delete(idOf(request), projectId);
    return dump({ ok: true });
  }
  if (request.tool_id === "promote") {
    const promoted = promotePagesDocument(
      store,
      idOf(request),
      projectId,
      requirePromoteArtifactPort(ports.publishArtifact),
      optionalString(request.arguments.goal_id),
    );
    return dump({ document: promoted.document, artifact: promoted.artifact });
  }
  if (request.tool_id === "extract") {
    const current = store.get(idOf(request), projectId);
    const extracted = extractFromPagesBody(current.title, current.body);
    const document = store.update(current.id, { body: extracted.body }, projectId);
    const created = unpublishedKnowledgePages(store.list(projectId).map((item) => item.title), extracted.knowledge).map((item) => store.create({
      project_id: projectId,
      folder_id: current.folder_id,
      title: item.title,
      body: item.body,
    }));
    return dump({ document, cards: extracted.cards, created });
  }
  if (request.tool_id === "ai") {
    const current = store.get(idOf(request), projectId);
    const command = requiredString(request.arguments.command, "命令");
    const text = requiredString(request.arguments.text, "文字");
    const style = optionalString(request.arguments.style);
    const result = {
      text: stubPagesAi(command, text, style),
      stub: true,
      command,
      style,
    };
    if (command === "translate_new") {
      const document = store.create({
        project_id: projectId,
        folder_id: current.folder_id,
        title: `${current.title} · 翻译`.slice(0, 80),
        body: {
          type: "doc",
          content: result.text.split(/\n{2,}/).map((part) => (
            part.trim() ? { type: "paragraph", content: [{ type: "text", text: part.trim() }] } : { type: "paragraph" }
          )),
        },
      });
      return dump({ ...result, document });
    }
    return dump(result);
  }
  throw new Error(`未登记的 Pages MCP：${request.tool_id}`);
}

function dump(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function idOf(request: PluginMcpHandleRequest): string {
  return requiredString(request.arguments.id, "文档 id");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PagesError("pages.invalid", `缺少${label}`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new PagesError("pages.invalid", "字段须为文字");
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new PagesError("pages.invalid", "字段须为开关");
  return value;
}

function optionalBody(value: unknown): PagesBody | undefined {
  if (value === undefined) return undefined;
  return parsePagesBody(value);
}
