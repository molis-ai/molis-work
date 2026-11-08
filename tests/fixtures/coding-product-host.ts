import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createSingleHomeTestWebServer } from "./local-web-core.js";
import { MolisWorkLocalHost, ModelProviderStore, withConnectorConnections, ensureSystemAgentService, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { LocalSqliteStorage, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { cogniaModelResponse } from "./cognia-model-response.js";
import { isKnowledgeOrganize, organizedCard } from "./knowledge-organize.js";

export type CodingProviderRequest = { messages: Array<{ content: string | Array<{ type: string; text?: string }> }> };

/** Real HTTP, catalog, workspace authorization, Agent Host and the installed SDK; only the provider response is controlled. */
export async function codingProductHost(t: TestContext, respond: (request: CodingProviderRequest, turn: number) => Response | Promise<Response>) {
  const home = await mkdtemp(join(tmpdir(), "coding-product-")), directory = join(home, "work");
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let release = async () => {};
  t.after(async () => { try { await release(); } finally {
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true });
  } });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  await mkdir(directory);
  const project = await catalog.createProject({ display_name: "Coding product path", actor_id: "web-user" });
  const other = await catalog.createProject({ display_name: "Other material owner", actor_id: "web-user" });
  for (const row of [project, other]) catalog.addProjectPlugin({ project_id: row.project_id, plugin_id: "coding", actor_id: "web-user" });
  catalog.close();
  const endpoint = "https://1.1.1.1/v1/messages", credential = randomUUID();
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Controlled SSE", token: credential }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
  const database = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try { new ModelProviderStore({ db: database.db, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) }).upsert({
    provider_id: "fixture", display_name: "Controlled SSE", base_url: endpoint, api_format: "anthropic-messages", credential_ref: connection.credential_ref!,
    models: [{ model_id: "fixture-model", enabled: true }],
  }); } finally { database.close(); }
  const requests: CodingProviderRequest[] = [], originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    assert.equal(url, endpoint, "no external provider is contacted");
    const body = input instanceof Request ? await input.clone().text() : await new Request(input, init).text();
    assert.ok(body, "the SDK sends the actual model request body");
    if (isKnowledgeOrganize(body)) return cogniaModelResponse(organizedCard);
    const request = JSON.parse(body) as CodingProviderRequest; requests.push(request);
    return respond(request, requests.length);
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home,
    workspacesFor: projectId => withCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withCatalog({ homeDirectory: home }, catalog => workspaceRefFor(catalog, projectId)),
    directoriesFor: projectId => withCatalog({ homeDirectory: home }, catalog => catalog.projectDirectories(projectId)),
  }), controlToken = randomUUID();
  const withCatalog = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  const server = createSingleHomeTestWebServer({ homeDirectory: home, localHost: host, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
  release = async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await host.close(); };
  const call = async <Output>(projectId: string, path: string, body?: unknown): Promise<{ status: number; body: Output }> => {
    const response = await fetch(origin + `/projects/${projectId}` + path, { method: body === undefined ? "GET" : "POST", headers: {
      origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Output };
  };
  // The folder is the project's output, set in the project's settings as the person does: Coding writes and runs only there (SSC-15, SSC-17).
  type Directories = { directories: Array<{ workspace_id: string; canonical_path: string; roles: string[] }>; revision: string };
  const read = await call<Directories>(project.project_id, "/api/project-settings/directories");
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const set = await call<Directories>(project.project_id, "/api/project-settings/directories",
    { change: "set_output", input: { workspace_path: directory, expected_revision: read.body.revision } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  const output = set.body.directories.filter(item => item.roles.includes("output"));
  assert.equal(output.length, 1, JSON.stringify(set.body));
  const workspaceId = output[0]!.workspace_id;
  const ended = (ref: AgentRunRef) => new Promise<AgentRunView>((resolve, reject) => {
    const adapter = ensureSystemAgentService(host, home).agentHost.adapter("prologue");
    let off = () => {}; const timer = setTimeout(() => { off(); reject(new Error("controlled Coding Run did not finish")); }, 15_000);
    off = adapter.observe(ref, view => { if (!["completed", "failed", "cancelled"].includes(view.phase)) return;
      clearTimeout(timer); queueMicrotask(() => off()); resolve(view); });
  });
  return { home, host, directory, project, other, workspaceId, call, ended, requests };
}
