import {
  assembleFunctionAuthoringCatalog,
  isFunctionDestinationId,
  type ChoiceCriterion,
  type FunctionAuthoringCatalog,
  type FunctionCriteria,
  type FunctionDraftPatch,
  type FunctionSceneMap,
  type FunctionsPrimitive,
  type NoulCriteria,
} from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsPluginRouteHandler } from "./routes.js";
import type { FunctionsService } from "./service.js";
import { FunctionsError } from "./keys.js";

export function createFunctionsRouteHandlers(
  service: FunctionsService,
  options: { catalog?: () => FunctionAuthoringCatalog } = {},
): Record<string, FunctionsPluginRouteHandler> {
  const catalog = options.catalog ?? (() => assembleFunctionAuthoringCatalog());
  return {
    "functions.list": () => ({ status: 200, body: { functions: service.list() } }),
    "functions.create": ({ request }) => ({
      status: 200,
      body: { function: service.create({
        primitive: readPrimitive(request.body.primitive),
        name: stringField(request.body.name),
        function_key: stringField(request.body.function_key),
      }) },
    }),
    "functions.catalog": () => ({ status: 200, body: { catalog: catalog() } }),
    "functions.settings.read": () => ({ status: 200, body: service.settingsStatus() }),
    "functions.settings.write": ({ request }) => {
      if (request.body.clear === true) return { status: 200, body: service.clearCredential() };
      const apiKey = stringField(request.body.api_key);
      if (!apiKey) throw new FunctionsError("functions.invalid", "请填写 TypeSafe API Key");
      return { status: 200, body: service.saveCredential(apiKey) };
    },
    "functions.published": () => ({ status: 200, body: { functions: service.listPublished() } }),
    "functions.describe": ({ params }) => ({
      status: 200,
      body: { function: service.describePublished(params.function_key ?? "") },
    }),
    "functions.invoke": async ({ params, request }) => ({
      status: 200,
      body: await service.invokePublished(params.function_key ?? "", stringField(request.body.input) ?? ""),
    }),
    "functions.get": ({ params }) => ({ status: 200, body: { function: service.get(params.id ?? "") } }),
    "functions.update": ({ params, request }) => ({
      status: 200,
      body: { function: service.updateDraft(params.id ?? "", readDraftPatch(request.body), readUpdatedAt(request.body)) },
    }),
    "functions.preview": async ({ params, request }) => ({
      status: 200,
      body: { function: await service.preview(params.id ?? "", stringField(request.body.input) ?? "", readUpdatedAt(request.body)) },
    }),
    "functions.publish": ({ params, request }) => ({
      status: 200,
      body: { function: service.publish(params.id ?? "", readUpdatedAt(request.body)) },
    }),
    "functions.delete": ({ params, request }) => {
      service.deleteDraft(params.id ?? "", readUpdatedAt(request.body));
      return { status: 200, body: { ok: true } };
    },
    "functions.sample.add": ({ params, request }) => ({
      status: 200,
      body: { function: service.addSample(params.id ?? "", {
        label: stringField(request.body.label),
        input: stringField(request.body.input) ?? "",
      }, readUpdatedAt(request.body)) },
    }),
    "functions.sample.delete": ({ params, request }) => ({
      status: 200,
      body: { function: service.removeSample(params.id ?? "", stringField(request.body.sample_id) ?? "", readUpdatedAt(request.body)) },
    }),
    "functions.usages": ({ params }) => {
      const record = service.get(params.id ?? "");
      return { status: 200, body: { usages: service.listSceneBindings(record.function_key) } };
    },
  };
}

function readPrimitive(value: unknown): FunctionsPrimitive | undefined {
  if (value === undefined) return undefined;
  if (value === "noul" || value === "choice" || value === "score") return value;
  throw new FunctionsError("functions.invalid", "判断类型须为 Noul、Choice 或 Score");
}

function readDraftPatch(body: Readonly<Record<string, unknown>>): FunctionDraftPatch {
  const patch: FunctionDraftPatch = {};
  if ("name" in body) Object.assign(patch, { name: stringField(body.name) ?? "" });
  if ("function_key" in body) Object.assign(patch, { function_key: stringField(body.function_key) ?? "" });
  if ("instructions" in body) Object.assign(patch, { instructions: stringField(body.instructions) ?? "" });
  if ("criteria" in body) Object.assign(patch, { criteria: readCriteria(body.criteria) });
  if ("scene_id" in body) Object.assign(patch, { scene_id: readSceneId(body.scene_id) });
  if ("subject_kinds" in body) Object.assign(patch, { subject_kinds: readSubjectKinds(body.subject_kinds) });
  if ("scene_map" in body) Object.assign(patch, { scene_map: readSceneMap(body.scene_map) });
  return patch;
}

function readSceneId(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isFunctionDestinationId(value)) {
    throw new FunctionsError("functions.invalid", "这个用法不在可选范围里");
  }
  return value;
}

function readSubjectKinds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new FunctionsError("functions.invalid", "来源格式不对");
  return value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
}

function readSceneMap(value: unknown): FunctionSceneMap {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FunctionsError("functions.invalid", "映射格式不对");
  }
  const mapped: Record<string, string> = {};
  for (const [key, target] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (typeof target !== "string" || !target.trim()) continue;
    mapped[key.trim()] = target.trim();
  }
  return mapped;
}

function readCriteria(value: unknown): FunctionCriteria {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value as string[];
    return value.map((item) => {
      if (!item || typeof item !== "object") throw new FunctionsError("functions.invalid", "选项格式不对");
      const row = item as Record<string, unknown>;
      return {
        key: stringField(row.key) ?? "",
        description: stringField(row.description) ?? "",
      } satisfies ChoiceCriterion;
    });
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return {
      true_description: stringField(row.true_description) ?? "",
      false_description: stringField(row.false_description) ?? "",
    } satisfies NoulCriteria;
  }
  throw new FunctionsError("functions.invalid", "判断标准格式不对");
}

function readUpdatedAt(body: Readonly<Record<string, unknown>>): string | undefined {
  if (!("updated_at" in body) || body.updated_at === undefined || body.updated_at === null) return undefined;
  if (typeof body.updated_at !== "string" || !body.updated_at.trim()) {
    throw new FunctionsError("functions.invalid", "updated_at 须为时间");
  }
  return body.updated_at;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
