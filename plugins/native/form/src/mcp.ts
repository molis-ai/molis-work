import type { FormQuestion } from "@molis-ai/molis-work-contracts/modules/form";
import type { PluginMcpExportDeclaration, PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FormError } from "./error.js";
import { promoteForm, requireFormArtifactPort } from "./promote.js";
import type { FormRoutePorts } from "./route-handlers.js";
import type { FormStore } from "./store.js";

/** Declare `tool_id`s here and handle by `tool_id` only. Host stamps the public name and injects project_id. */
export const FORM_MCP_EXPORTS: readonly PluginMcpExportDeclaration[] = [
  {
    tool_id: "list",
    description: "列出当前绑定项目里的问卷。先 list 再 get / update；不要编造问卷 id。",
    input_schema: { type: "object", properties: {}, required: [] },
    effect: "read",
  },
  {
    tool_id: "get",
    description: "读取一份问卷的题目和状态。id 必须来自 list 或 create 的结果。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
  {
    tool_id: "create",
    description: "在当前绑定项目新建一份草稿问卷。",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: [],
    },
    effect: "write",
  },
  {
    tool_id: "update",
    description: "改问卷标题、说明或题目。questions 整表替换；选择题至少两个选项。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        questions: { type: "array" },
      },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "publish",
    description: "把草稿问卷标为已发布，并生成 share_id。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "promote",
    description: "把当前问卷存成 Artifact。私人库里的稿子还在，可以继续改。答卷不包含在这一版里。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "delete",
    description: "删除问卷及其答卷。不可恢复。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "write",
  },
  {
    tool_id: "generate",
    description: "按提示在问卷末尾加一题填空。这是本地 stub，不调用外部模型。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["id", "prompt"],
    },
    effect: "write",
  },
  {
    tool_id: "submit",
    description: "按题号提交一份答卷。answers 的键是题目 id，值是文字。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        answers: { type: "object" },
      },
      required: ["id", "answers"],
    },
    effect: "write",
  },
  {
    tool_id: "results",
    description: "读取一份问卷的答卷列表和计数。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    effect: "read",
  },
];

export function runFormMcpTool(
  store: FormStore,
  request: PluginMcpHandleRequest,
  projectId: string,
  ports: FormRoutePorts = {},
): string {
  if (request.tool_id === "list") {
    return dump({ forms: store.list(projectId) });
  }
  if (request.tool_id === "get") {
    return dump({ form: store.get(idOf(request), projectId) });
  }
  if (request.tool_id === "create") {
    return dump({ form: store.create({ title: optionalString(request.arguments.title), project_id: projectId }) });
  }
  if (request.tool_id === "update") {
    return dump({
      form: store.update(idOf(request), {
        title: optionalString(request.arguments.title),
        description: optionalString(request.arguments.description),
        questions: optionalQuestions(request.arguments.questions),
      }, projectId),
    });
  }
  if (request.tool_id === "publish") {
    return dump({ form: store.publish(idOf(request), projectId) });
  }
  if (request.tool_id === "promote") {
    const promoted = promoteForm(store, idOf(request), projectId, requireFormArtifactPort(ports.publishArtifact));
    return dump({ form: promoted.form, artifact: promoted.artifact });
  }
  if (request.tool_id === "delete") {
    store.delete(idOf(request), projectId);
    return dump({ ok: true });
  }
  if (request.tool_id === "generate") {
    return dump({
      form: store.generateQuestions(idOf(request), requiredString(request.arguments.prompt, "出题提示"), projectId),
    });
  }
  if (request.tool_id === "submit") {
    return dump({
      submission: store.submit(idOf(request), readAnswers(request.arguments.answers), projectId),
    });
  }
  if (request.tool_id === "results") {
    const id = idOf(request);
    return dump({
      analysis: store.analyze(id, projectId),
      submissions: store.listSubmissions(id, projectId),
    });
  }
  throw new Error(`未登记的 Forms MCP：${request.tool_id}`);
}

function dump(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function idOf(request: PluginMcpHandleRequest): string {
  return requiredString(request.arguments.id, "问卷 id");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new FormError("form.invalid", `缺少${label}`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new FormError("form.invalid", "字段须为文字");
  return value;
}

function optionalQuestions(value: unknown): FormQuestion[] | undefined {
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
