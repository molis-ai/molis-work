import type { DatasetColumn, DatasetRow } from "@molis-ai/molis-work-contracts/modules/dataset";
import { DatasetError } from "./error.js";
import type { DatasetPluginRouteHandler, DatasetPluginRouteRequest, DatasetPluginRouteResponse } from "./routes.js";
import { toCsv, type DatasetStore } from "./store.js";

export function createDatasetRouteHandlers(store: DatasetStore): Record<string, DatasetPluginRouteHandler> {
  return {
    "dataset.list": ({ request }) => ({ status: 200, body: { datasets: store.list(projectIdOf(request)) } }),
    "dataset.create": ({ request }) => ({
      status: 200,
      body: { dataset: store.create({ title: stringField(request.body.title), project_id: projectIdOf(request) }) },
    }),
    "dataset.get": ({ params, request }) => ({
      status: 200,
      body: { dataset: store.get(params.id ?? "", projectIdOf(request)) },
    }),
    "dataset.update": ({ params, request }) => ({
      status: 200,
      body: { dataset: store.update(params.id ?? "", {
        title: stringField(request.body.title),
        description: stringField(request.body.description),
        columns: readColumns(request.body.columns),
        rows: readRows(request.body.rows),
      }, projectIdOf(request)) },
    }),
    "dataset.delete": ({ params, request }) => {
      store.delete(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { ok: true } };
    },
    "dataset.generate": ({ params, request }) => ({
      status: 200,
      body: { dataset: store.generateColumn(params.id ?? "", stringField(request.body.prompt) ?? "", projectIdOf(request)) },
    }),
    "dataset.import": ({ params, request }) => ({
      status: 200,
      body: { dataset: store.importCsv(params.id ?? "", stringField(request.body.csv) ?? "", projectIdOf(request)) },
    }),
    "dataset.export": ({ params, request }) => {
      const dataset = store.get(params.id ?? "", projectIdOf(request));
      return { status: 200, body: { csv: toCsv(dataset), dataset } };
    },
    "dataset.versions": ({ params, request }) => ({
      status: 200,
      body: { versions: store.listVersions(params.id ?? "", projectIdOf(request)) },
    }),
    "dataset.snapshot": ({ params, request }) => ({
      status: 200,
      body: { version: store.saveVersion(params.id ?? "", stringField(request.body.note), projectIdOf(request)) },
    }),
    "dataset.rollback": ({ params, request }) => ({
      status: 200,
      body: { dataset: store.rollback(params.id ?? "", stringField(request.body.version_id) ?? "", projectIdOf(request)) },
    }),
  };
}

export function datasetRouteErrorResponse(error: unknown): DatasetPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "数据表请求失败";
  if (code === "dataset.not_found") return { status: 404, body: { error: message, code } };
  if (code.startsWith("dataset.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function projectIdOf(request: DatasetPluginRouteRequest): string {
  const raw = request.query.get("project_id") ?? request.body.project_id;
  if (typeof raw !== "string" || !raw.trim()) throw new DatasetError("dataset.invalid", "缺少项目");
  return raw.trim();
}

function stringField(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new DatasetError("dataset.invalid", "字段须为文字");
  return value;
}

function readColumns(value: unknown): DatasetColumn[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DatasetError("dataset.invalid", "列须是列表");
  return value as DatasetColumn[];
}

function readRows(value: unknown): DatasetRow[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DatasetError("dataset.invalid", "行须是列表");
  return value as DatasetRow[];
}
