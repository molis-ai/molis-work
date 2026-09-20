import type { ChoiceCriterion, FunctionDraftPatch } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsPluginRouteHandler } from "./routes.js";
import type { FunctionsService } from "./service.js";
import { FunctionsError } from "./keys.js";

export function createFunctionsRouteHandlers(service: FunctionsService): Record<string, FunctionsPluginRouteHandler> {
  return {
    "functions.list": () => ({ status: 200, body: { functions: service.list() } }),
    "functions.create": ({ request }) => ({
      status: 200,
      body: { function: service.createChoice({
        name: stringField(request.body.name),
        function_key: stringField(request.body.function_key),
      }) },
    }),
    "functions.settings.read": () => ({ status: 200, body: service.settingsStatus() }),
    "functions.settings.write": ({ request }) => {
      if (request.body.clear === true) return { status: 200, body: service.clearCredential() };
      const apiKey = stringField(request.body.api_key);
      if (!apiKey) throw new FunctionsError("functions.invalid", "请填写 TypeSafe API Key");
      return { status: 200, body: service.saveCredential(apiKey) };
    },
    "functions.get": ({ params }) => ({ status: 200, body: { function: service.get(params.id ?? "") } }),
    "functions.update": ({ params, request }) => ({
      status: 200,
      body: { function: service.updateDraft(params.id ?? "", readDraftPatch(request.body)) },
    }),
    "functions.preview": async ({ params, request }) => ({
      status: 200,
      body: { function: await service.preview(params.id ?? "", stringField(request.body.input) ?? "") },
    }),
    "functions.publish": ({ params }) => ({ status: 200, body: { function: service.publish(params.id ?? "") } }),
  };
}

function readDraftPatch(body: Readonly<Record<string, unknown>>): FunctionDraftPatch {
  const patch: FunctionDraftPatch = {};
  if ("name" in body) Object.assign(patch, { name: stringField(body.name) ?? "" });
  if ("function_key" in body) Object.assign(patch, { function_key: stringField(body.function_key) ?? "" });
  if ("instructions" in body) Object.assign(patch, { instructions: stringField(body.instructions) ?? "" });
  if ("criteria" in body) Object.assign(patch, { criteria: readCriteria(body.criteria) });
  return patch;
}

function readCriteria(value: unknown): ChoiceCriterion[] {
  if (!Array.isArray(value)) throw new FunctionsError("functions.invalid", "选项须是列表");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new FunctionsError("functions.invalid", "选项格式不对");
    const row = item as Record<string, unknown>;
    return {
      key: stringField(row.key) ?? "",
      description: stringField(row.description) ?? "",
    };
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
