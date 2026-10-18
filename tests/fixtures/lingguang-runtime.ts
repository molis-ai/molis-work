import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { serveHomeRuntime, person } from "./home-runtime.js";

/** Actual project Runtime and HTTP, with an isolated Home and no real model. */
export async function serveLingguang(t: TestContext, options: Parameters<typeof serveHomeRuntime>[1] = {}) {
  const f = await serveHomeRuntime(t, options), project = await f.project("灵光 Runtime");
  const path = `/projects/${project.project_id}/api/plugins/io.molis.work.lingguang/sparks`;
  const caller = person(LINGGUANG_ACTION_PERMISSIONS, project.project_id), client = f.host.actionClient(project.reference);
  const request = (suffix: string, body?: unknown) => f.request(path + suffix, { method: body === undefined ? "GET" : "POST", body });
  const http = async <T>(suffix: string, body?: unknown): Promise<T> => {
    const response = await request(suffix, body);
    assert.equal(response.status, 200);
    if (!response.headers.get("content-type")?.includes("ndjson")) return response.json() as Promise<T>;
    const lines = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { type: string; result?: T });
    assert.equal(lines.at(-1)?.type, "result", JSON.stringify(lines));
    return lines.at(-1)!.result!;
  };
  return { ...f, rawRequest: f.request, project, caller, client, path, request, http, bound: bindActionClient(client, () => caller) };
}
