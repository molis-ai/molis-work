import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { serveHomeRuntime, person } from "./home-runtime.js";

/** Actual project Runtime and HTTP, with an isolated Home and no real model unless the test gives one. */
export async function servePages(t: TestContext, options: Parameters<typeof serveHomeRuntime>[1] = {}) {
  const f = await serveHomeRuntime(t, options), project = await f.project("Pages Runtime");
  return pagesIn(f, project);
}

/** The same Runtime's Pages in one more project of the same Home. */
export function pagesIn(f: Awaited<ReturnType<typeof serveHomeRuntime>>, project: Awaited<ReturnType<Awaited<ReturnType<typeof serveHomeRuntime>>["project"]>>) {
  const path = `/projects/${project.project_id}/api/plugins/io.molis.work.pages/pages`;
  const caller = person(PAGES_ACTION_PERMISSIONS, project.project_id), client = f.host.actionClient(project.reference);
  const request = (suffix: string, body?: unknown) => f.request(path + suffix, { method: body === undefined ? "GET" : "POST", body });
  const http = async <T>(suffix: string, body?: unknown): Promise<T> => {
    const response = await request(suffix, body);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<T>;
  };
  return { ...f, rawRequest: f.request, project, caller, client, path, request, http, bound: bindActionClient(client, () => caller) };
}
