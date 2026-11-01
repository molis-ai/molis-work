// RAC-2812: complete Artifact HTTP error-model regression after the platform route rename.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import * as hostModule from "@molis-ai/molis-work-app-local-host";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import * as artifactsModule from "@molis-ai/molis-work-module-artifacts";
import * as functionsModule from "@molis-ai/molis-work-module-functions";
import * as integrationCatalog from "@molis-ai/molis-work-integration-catalog";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import Database from "better-sqlite3";
import { serveNativeHttp } from "./fixtures/native-http.js";

// specs/repository-anti-corruption W3-02-G2: the Host's page and catalog edges answer through the one error model. The Functions mapper, the
// project catalog's error class, the artifact edge's four classes, the project-reference class and the edge refusals' bare 403 are gone; a failure
// is an ActionError with a code and a kind, and the status comes from the kind (SDK `actionHttpStatus`).
//
// What each part proves, and what it did on the merge-base (origin/main with W3-02-A and B):
//   1. Functions: every owner code answers the status the deleted mapper gave it (PARITY: the table was made by running the mapper over every
//      code at the merge-base; it fails there only because `functionsErrors` does not exist), except provider_unauthorized 401 to 502 (an
//      expected change); a platform code answers its table row (FAILS there: the mapper sent them all to 400 or 409) and a failure with no
//      code of ours is a 500 (FAILS there: 400, no code).
//   2. The catalog: its failures are ActionErrors carrying the kind each answered before (FAILS there: a class of its own), and the settings
//      plugin routes that told "no such project" from every other failure by the class still do, now with the code in the body.
//   3. The artifact edge answers a plugin that is off with 403 (FAILS there: 404), the 成果 browser's and the import's failures with a
//      code and the status of their kind (415 and 422 are 400), and the English page still gets English text.
//   4. The edge refusals of the local web host (Host, Origin, control token) answer one opaque body, so the answer never says which check
//      failed (FAILS there: no code). The other answers before an action runs (a missing or replayed one-time key) keep their status.
//   5. A `project://` reference that cannot be opened is a coded failure of the Host's, the missing workspace the Artifacts plugin's.
//   6. Nothing of the old shape is left in the sources.

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHINESE_REFUSAL = "本地控制请求校验失败";

interface Raisers { readonly [reason: string]: (message: string, details?: Readonly<Record<string, unknown>>) => ActionError }
const declared = (module: object, name: string): Raisers => {
  const value = (module as Record<string, unknown>)[name];
  assert.ok(value && typeof value === "object", `${name} is exported`);
  return value as Raisers;
};

/** A loopback server around a handler that answers whatever it is given; GET and POST, with the headers a test sets. */
async function serve(handle: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<boolean | void>, t: TestContext) {
  const server = createServer((request, response) => {
    handle(request, response, new URL(request.url ?? "/", "http://127.0.0.1")).then(handled => {
      if (handled === false) { response.statusCode = 404; response.end("{}"); }
    }, (error: unknown) => { response.statusCode = 599; response.end(JSON.stringify({ escaped: error instanceof Error ? error.message : String(error) })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return {
    origin,
    async send(method: "GET" | "POST", path: string, options: { headers?: Record<string, string>; body?: string } = {}) {
      const response = await fetch(origin + path, { method, headers: options.headers, ...(options.body === undefined ? {} : { body: options.body }) });
      const text = await response.text();
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { text }; }
      return { status: response.status, body };
    },
  };
}

// ---- 1. Functions ----------------------------------------------------------------------------------------------------

/** The status each Functions code answered through `functionsRouteErrorResponse` on the merge-base, by reason. The one change: provider_unauthorized was 401. */
const FUNCTIONS_STATUS: Readonly<Record<string, number>> = {
  invalid: 400, stale_preview: 400, published_immutable: 400, key_conflict: 400, preview_required: 400,
  not_found: 404,
  conflict: 409, version_conflict: 409, provider_not_configured: 409,
  // FI-2 (#1283): a plugin declaring a default rule whose key another plugin holds; it came after the mapper, as a conflict.
  rule_key_taken: 409,
  provider_unauthorized: 502, provider_failed: 502,
  provider_timeout: 504,
};

async function failingFunctionsEdge(t: TestContext) {
  const failure: { current: unknown } = { current: undefined };
  const actions: BoundActionClient = { discover: async () => [], invoke: async () => { throw failure.current; } };
  const home = await mkdtemp(join(tmpdir(), "host-pages-error-model-functions-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = await serveNativeHttp((request, response, url) => hostModule.handleFunctionsHttp(request, response, url, home, { actions }));
  t.after(() => server.close());
  return {
    async fail(error: unknown, body = "{}") { failure.current = error; return server.post("/api/functions", body); },
    post: server.post,
  };
}

test("Functions declares its codes, and every one answers the status the deleted mapper gave it (provider_unauthorized is 502, not 401)", async t => {
  const functionsErrors = declared(functionsModule, "functionsErrors");
  assert.deepEqual(Object.keys(functionsErrors).sort(), Object.keys(FUNCTIONS_STATUS).sort(), "functionsErrors declares exactly the codes Functions raises");
  const edge = await failingFunctionsEdge(t);
  for (const [reason, status] of Object.entries(FUNCTIONS_STATUS)) {
    const error = functionsErrors[reason]!(`functions ${reason}`);
    assert.ok(error instanceof ActionError && error.code === `functions.${reason}`, `functionsErrors.${reason} raises functions.${reason}`);
    const answer = await edge.fail(error);
    assert.deepEqual([answer.status, answer.body], [status, { error: `functions ${reason}`, code: `functions.${reason}` }], `functions.${reason}`);
  }
});

test("a platform code answers the status of its table row at the Functions edge, and a failure with no code of ours is a 500", async t => {
  const edge = await failingFunctionsEdge(t);
  const platform: Array<[string, number]> = [
    ["actions.forbidden", 403], ["actions.plugin_disabled", 403], ["actions.scope_mismatch", 403], ["actions.missing", 404],
    ["actions.input_invalid", 400], ["actions.connection_required", 503], ["actions.plugin_unavailable", 503],
  ];
  for (const [code, status] of platform) {
    const answer = await edge.fail(new ActionError(code, "平台的失败"));
    assert.deepEqual([answer.status, answer.body.code], [status, code], code);
  }
  const uncoded = await edge.fail(new Error("磁盘写满了"));
  assert.deepEqual([uncoded.status, uncoded.body], [500, { error: "磁盘写满了", code: "actions.execution_failed" }], "a bug or an outage is not the caller's mistake");
  const driver = await edge.fail(Object.assign(new Error("no such file"), { code: "ENOENT" }));
  assert.deepEqual([driver.status, driver.body.code], [500, "actions.execution_failed"], "a system code is not ours");
});

test("the Functions edge reads its body inside the answer: too large is 413, not JSON is 400, and choosing no connection is a coded caller's mistake", async t => {
  const edge = await failingFunctionsEdge(t);
  const tooLarge = await edge.post("/api/functions", JSON.stringify({ padding: " ".repeat(1_100_000) }));
  assert.deepEqual([tooLarge.status, tooLarge.body.code], [413, "actions.input_too_large"]);
  const notJson = await edge.post("/api/functions", "{");
  assert.deepEqual([notJson.status, notJson.body.code], [400, "actions.input_invalid"]);
  const unchosen = await edge.post("/api/functions/settings", JSON.stringify({}));
  assert.deepEqual([unchosen.status, unchosen.body], [400, { error: "请在 Connectors 中选择 TypeSafe 连接", code: "functions.invalid" }]);
});

// ---- 2. The project catalog ------------------------------------------------------------------------------------------

const capture = (run: () => unknown): unknown => { try { run(); } catch (error) { return error; } return undefined; };

test("the catalog's failures are ActionErrors with a code and the kind each answered before; the schema error keeps its details", async t => {
  const directory = await mkdtemp(join(tmpdir(), "host-pages-error-model-catalog-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(() => catalog.close());
  const expect = (error: unknown, code: string, status: number) => {
    assert.ok(error instanceof ActionError, `${code} is an ActionError`);
    assert.deepEqual([error.code, actionHttpStatus(error)], [code, status], code);
  };
  expect(capture(() => catalog.getProject("no-such-project")), "catalog.project_not_found", 404);
  await assert.rejects(catalog.createProject({ display_name: "  ", actor_id: "user" }), (error: unknown) => { expect(error, "catalog.invalid_name", 400); return true; });
  expect(capture(() => catalog.addProjectPlugin({ project_id: "no-such-project", plugin_id: "goals", actor_id: "user" })), "catalog.project_not_found", 404);
  const project = await catalog.createProject({ display_name: "目录项目", actor_id: "user" });
  expect(capture(() => catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "no-such-plugin", actor_id: "user" })), "catalog.plugin_not_found", 400);
  // The codes of the runtime-context entries the catalog serves are its callers' mistakes: 400, as the class answered them.
  expect(capture(() => catalog.bindRuntimeContext({ context: { runtime_id: "codex", stable_work_context_id: "entry-1", host_declares_stable: true }, project_id: project.project_id, actor_id: "runtime", user_confirmed: false })),
    "work.context.user_confirmation_required", 400);
  // A live terminal is a conflict the person can resolve.
  const panel = await catalog.commit(() => catalog.terminalPanels.insert({ panel_id: "plugin-error-model-terminal", install_id: "fixture-install", project_id: project.project_id,
    actor_id: "user", key: "terminal", subject: "goal-1", runtime: "command", launch_command: "/bin/cat", launch_args: [], title: "cat" }, directory));
  const service = new hostModule.ProjectDeletionService(withMolisWorkProjectCatalog, { isPanelAlive: id => id === panel.panel_id, releaseProject: async () => undefined });
  await assert.rejects(service.deleteProject(home, { project_id: project.project_id, actor_id: "user", delete_confirmed: true, idempotency_key: "delete-with-terminal" }),
    (error: unknown) => { expect(error, "catalog.project_terminal_live", 409); return true; });
  const tooOld = hostModule.catalogSchemaCompatibilityError(9, 8);
  assert.ok(tooOld instanceof ActionError);
  assert.equal(tooOld.code, "catalog.reader_too_old");
  assert.equal(actionHttpStatus(tooOld), 400);
  assert.deepEqual(tooOld.details, { actual_schema_version: 9, supported_schema_min: 1, supported_schema_max: 8, recovery: "new_or_fork_session_then_context_resolve" });
});

test("W3-02-G2 MCP context_resolve preserves a future catalog's schema and recovery details without rewriting its facts", async t => {
  const home = await mkdtemp(join(tmpdir(), "host-pages-error-model-mcp-catalog-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "保留目录项目", actor_id: "test" });
  catalog.close();
  const databasePath = join(home, "projects", "catalog.db");
  const future = new Database(databasePath);
  const supported = Number(future.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").pluck().get());
  future.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run(String(supported + 1));
  future.close();
  const host = new hostModule.MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const mcp = new hostModule.LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null, {
    homeDirectory: home, runtimeContext: { runtime_id: "catalog-reader", stable_work_context_id: null, host_declares_stable: false },
  }, host);
  t.after(async () => { await mcp.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const reply = await mcp.handleMessage({ id: 1, method: "tools/call", params: { name: "molis_work_v1_context_resolve", arguments: {} } }) as
    { result: { isError: boolean; content: Array<{ text: string }> } };
  assert.equal(reply.result.isError, true);
  const line = JSON.parse(reply.result.content[0]!.text) as Record<string, unknown>;
  assert.deepEqual(line, { error: `Molis Work catalog schema=${supported + 1}，当前 reader 支持 1..${supported}。当前 Session 不会热刷新 MCP；请新建或 Fork 一个 Session，先确认当前任务焦点，再只读调用 context_resolve。解析成功后再继续写入；不要回滚 catalog.db，也不要用 SQLite、CLI 或 Web 绕过。`, code: "catalog.reader_too_old",
    details: { actual_schema_version: supported + 1, supported_schema_min: 1, supported_schema_max: supported,
      recovery: "new_or_fork_session_then_context_resolve" } });
  const preserved = new Database(databasePath, { readonly: true });
  try {
    assert.equal(preserved.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").pluck().get(), String(supported + 1));
    assert.equal(preserved.prepare("SELECT display_name FROM projects WHERE project_id = ?").pluck().get(project.project_id), "保留目录项目");
  } finally { preserved.close(); }
});

for (const leavesRow of [false, true]) {
  test(`W3-02-G2 MCP ActionError details cannot replace the code or forge a call number (${leavesRow ? "recorded" : "unrecorded"})`, async t => {
    const home = await mkdtemp(join(tmpdir(), "host-pages-error-model-mcp-details-"));
    const host = new hostModule.MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const ordinary = { actual_schema_version: 9, supported_schema_min: 1, supported_schema_max: 8, recovery: "new_or_fork_session_then_context_resolve" };
    const forgedId = "11111111-1111-1111-1111-111111111111";
    const details = { ...ordinary, code: "forged.code", call_id: forgedId };
    const failure = new ActionError("catalog.reader_too_old", "目录读取器版本过旧", { details });
    // The public catalog port fails inside the real MCP message scope. A failed Home read is a real Host settlement,
    // so the recorded case proves that its displayed number finds a row, without manufacturing a call-id marker.
    // Only the MCP's own catalog read fails. The server also gives this runner to the Home it shares, and Todo's `get` reads the catalog
    // through it for the person's project list (PG-014): that nested read goes to the real catalog, or the failing read would call itself.
    let entered = false;
    const mcp = new hostModule.LocalMcpServer(async (options, operation) => {
      if (entered) return withMolisWorkProjectCatalog(options, operation);
      entered = true;
      if (leavesRow) await assert.rejects(host.homeActionClient().invoke({ actor_id: "web-user", actor_kind: "user", audience: "user",
        project_id: null, permissions: ["todo:read"] }, todoActions.get, { id: "no-such-todo" }), { code: "todo.not_found" });
      throw failure;
    }, "runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "details-reader", stable_work_context_id: null, host_declares_stable: false } }, host);
    t.after(async () => { await mcp.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
    const reply = await mcp.handleMessage({ id: 1, method: "tools/call", params: { name: "molis_work_v1_context_resolve", arguments: {} } }) as
      { result: { isError: boolean; content: Array<{ text: string }> } };
    assert.equal(reply.result.isError, true);
    const line = JSON.parse(reply.result.content[0]!.text) as Record<string, unknown>;
    const { call_id: id, ...fields } = line;
    assert.deepEqual(fields, { error: "目录读取器版本过旧", code: "catalog.reader_too_old", details: ordinary }, "ordinary details survive, and the error owns its code");
    if (leavesRow) {
      assert.equal(typeof id, "string");
      assert.notEqual(id, forgedId);
      assert.equal(host.callLog!.find(String(id))[0]?.code, "todo.not_found", "only the Host's recorded operation number is displayed");
    } else assert.equal(Object.hasOwn(line, "call_id"), false, "details cannot name an operation that left no row");
  });
}

test("the plugin routes of the settings tell a missing project from every other failure by its kind, and the answer carries the code", async t => {
  const home = await mkdtemp(join(tmpdir(), "host-pages-error-model-settings-"));
  const token = "host-pages-error-model-control-token-0123456789";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "设置项目", actor_id: "test" });
  const { createMolisWorkWebServer } = await import("../apps/desktop/launchers/web/server.js");
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    catalog.close(); await rm(home, { recursive: true, force: true });
  });
  let sequence = 0;
  const call = async (method: "POST" | "DELETE", path: string, body: unknown) => {
    const response = await fetch(origin + path, { method, body: JSON.stringify(body),
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `host-pages-key-${++sequence}-${Date.now()}` } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const missing = await call("POST", "/api/settings/projects/no-such-project/plugins", { plugin_id: "goals" });
  assert.deepEqual([missing.status, missing.body.code], [404, "catalog.project_not_found"]);
  const unknown = await call("POST", `/api/settings/projects/${project.project_id}/plugins`, { plugin_id: "no-such-plugin" });
  assert.deepEqual([unknown.status, unknown.body.code], [400, "catalog.plugin_not_found"]);
  const removed = await call("DELETE", "/api/settings/projects/no-such-project/plugins", { plugin_id: "goals" });
  assert.deepEqual([removed.status, removed.body.code], [404, "catalog.project_not_found"]);
});

// ---- 3. The artifact edge --------------------------------------------------------------------------------------------

async function artifactEdge(t: TestContext, failure: { current: unknown }) {
  const actions: BoundActionClient = { discover: async () => [], invoke: async () => { throw failure.current; } };
  const handle = hostModule.createLocalArtifactHttp();
  return serve((request, response, url) => hostModule.runWithLocale(request.headers["accept-language"] === "en" ? "en" : "zh", () => handle(request, response, url.pathname, {
    projectId: "p1", routePrefix: "/projects/p1", projectTitle: "项目", actions, controlToken: "token", desktopShell: false, pageCsp: "default-src 'none'",
  })), t);
}

test("the artifact edge answers by kind: a plugin that is off is 403, and the code and the details of the failure are in the body", async t => {
  const failure: { current: unknown } = { current: undefined };
  const edge = await artifactEdge(t, failure);
  const cases: Array<[ActionError, number]> = [
    [new ActionError("actions.plugin_disabled", "此项目未启用该插件"), 403],
    [new ActionError("actions.forbidden", "没有权限"), 403],
    [new ActionError("actions.missing", "找不到这个成果"), 404],
    [new ActionError("actions.input_invalid", "输入无效"), 400],
    [new ActionError("actions.connection_required", "请先连接"), 503],
  ];
  for (const [error, status] of cases) {
    failure.current = error;
    const answer = await edge.send("GET", "/artifacts/a1/versions/1", { headers: { "x-molis-work-fragment": "artifact-workbench" } });
    assert.deepEqual([answer.status, answer.body], [status, { error: error.message, code: error.code }], error.code);
  }
  failure.current = new Error("读取失败");
  const uncoded = await edge.send("GET", "/artifacts/a1/versions/1", { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  assert.deepEqual([uncoded.status, uncoded.body], [500, { error: "读取失败", code: "actions.execution_failed" }]);
});

test("the artifact edge translates the message on an English page, and only there", async t => {
  const failure: { current: unknown } = { current: new ActionError("actions.missing", "这个版本没有可取回的文件") };
  const edge = await artifactEdge(t, failure);
  const english = await edge.send("GET", "/artifacts/a1/versions/1", { headers: { "x-molis-work-fragment": "artifact-workbench", "accept-language": "en" } });
  const chinese = await edge.send("GET", "/artifacts/a1/versions/1", { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  assert.equal(chinese.body.error, "这个版本没有可取回的文件");
  assert.equal(english.body.error, hostModule.runWithLocale("en", () => hostModule.L("这个版本没有可取回的文件")));
  assert.notEqual(english.body.error, chinese.body.error, "the English page has English text here");
  assert.equal(english.body.code, "actions.missing");
});

test("the 成果 browser's route failures carry a code and the status of their kind", async t => {
  const edge = await artifactEdge(t, { current: undefined });
  const badVersion = await edge.send("GET", "/artifacts/a1/versions/0", { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  assert.deepEqual([badVersion.status, badVersion.body], [400, { error: "成果版本必须是正整数", code: "artifacts.reference_invalid" }]);
  const badId = await edge.send("GET", "/artifacts/%E0%A4%A/versions/1", { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  assert.deepEqual([badId.status, badId.body], [400, { error: "成果 ID 编码无效", code: "artifacts.reference_invalid" }]);
  const artifactsErrors = declared(artifactsModule, "artifactsErrors");
  assert.deepEqual(Object.keys(artifactsErrors).sort(), ["continue_unavailable", "file_missing", "reference_invalid", "version_not_found", "workspace_unconfirmed"]);
  const status = (reason: string) => actionHttpStatus(artifactsErrors[reason]!("x"));
  assert.deepEqual(["reference_invalid", "version_not_found", "file_missing", "continue_unavailable", "workspace_unconfirmed"].map(status), [400, 404, 404, 400, 409]);
  // The plugin-facing client's two codes moved to the Artifacts module with the client (ac-artifacts A2).
  const clientErrors = declared(artifactsModule, "pluginArtifactErrors");
  assert.deepEqual(Object.keys(clientErrors).sort(), ["plugin_denied", "plugin_incompatible"]);
  assert.deepEqual(["plugin_denied", "plugin_incompatible"].map(reason => actionHttpStatus(clientErrors[reason]!("x"))), [403, 400]);
});

/**
 * What the import's own checks answered through `ArtifactImportError` on the merge-base, by reason; 415 and 422 are 400 now (no kind stands for
 * them). The Host's side of the import (reading the request and a connected service: request_invalid, request_aborted, html_invalid,
 * connection_revoked, connection_required, credentials_unavailable) declares the other six, all `invalid`, in artifact-document-import.ts.
 */
const DOCUMENT_STATUS: Readonly<Record<string, number>> = {
  source_invalid: 400, content_invalid: 400, filename_invalid: 400, input_invalid: 400, original_invalid: 400, original_not_offered: 400, empty: 400, binary: 400,
  too_large: 413,
};

test("the import's failures are declared, each with the status of its kind: 415 and 422 are 400, too large is 413", async t => {
  const documentErrors = declared(artifactsModule, "documentErrors");
  assert.deepEqual(Object.keys(documentErrors).sort(), Object.keys(DOCUMENT_STATUS).sort(), "documentErrors declares exactly the codes the import itself raises");
  for (const [reason, status] of Object.entries(DOCUMENT_STATUS)) {
    const error = documentErrors[reason]!(`document ${reason}`);
    assert.deepEqual([error.code, actionHttpStatus(error)], [`artifacts.document.${reason}`, status], reason);
  }
  const edge = await artifactEdge(t, { current: undefined });
  const notJson = await edge.send("POST", "/api/artifacts/import", { headers: { "content-type": "application/json" }, body: "{broken" });
  assert.deepEqual([notJson.status, notJson.body.code], [400, "artifacts.document.request_invalid"]);
  const tooLarge = await edge.send("POST", "/api/artifacts/import", { headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "file", padding: " ".repeat(13_000_000) }) });
  assert.deepEqual([tooLarge.status, tooLarge.body.code], [413, "artifacts.document.too_large"]);
});

/** What `ExternalDocumentImportError` answered on the merge-base, by reason (its own `status`); needs_auth was 401 and the three 422s are 400 now. */
const EXTERNAL_DOCUMENT_STATUS: Readonly<Record<string, number>> = {
  invalid_url: 400, needs_auth: 503, permission_denied: 403, not_found: 404, rate_limited: 429, network: 502, timeout: 504, provider: 502, too_large: 413,
  incomplete_content: 400, empty_content: 400, unsupported_document: 400,
};

test("a document service's failures are declared by the integration: the owner's name first, the status of their kind", () => {
  const external = declared(integrationCatalog, "externalDocumentErrors");
  assert.deepEqual(Object.keys(external).sort(), Object.keys(EXTERNAL_DOCUMENT_STATUS).sort());
  for (const [reason, status] of Object.entries(EXTERNAL_DOCUMENT_STATUS)) {
    const error = external[reason]!(`external ${reason}`);
    assert.deepEqual([error.code, actionHttpStatus(error)], [`catalog_integration.${reason}`, status], reason);
  }
});

// ---- 4. The edge refusals --------------------------------------------------------------------------------------------

test("every refusal of the Host, Origin and control-token checks answers the one opaque body, and the answers before an action runs keep their status", async t => {
  const token = "host-pages-edge-token-0123456789-0123456789";
  const mutations = new Map<string, hostModule.LocalMutationState>();
  const server = await serve(async (request, response, url) => {
    if (!hostModule.authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    hostModule.sendLocalWebJson(response, 200, { reached: true });
  }, t);
  const port = Number(new URL(server.origin).port);
  const send = (headers: Record<string, string | undefined>, path = "/api/anything", method = "POST") => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, method, path, headers: Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined)) }, response => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end("{}");
  });
  let sequence = 0;
  const complete = (overrides: Record<string, string | undefined> = {}) => ({ host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, "content-type": "application/json",
    "x-molis-work-control-token": token, "x-molis-work-idempotency-key": `edge-key-${++sequence}-${Date.now()}`, ...overrides });
  assert.equal((await send(complete())).status, 200, "the control: a complete mutation gets through");
  const refusals: Array<[string, Awaited<ReturnType<typeof send>>]> = [
    ["a Host that is not this machine", await send(complete({ host: "evil.example" }))],
    ["no Origin", await send(complete({ origin: undefined }))],
    ["a foreign Origin", await send(complete({ origin: "http://evil.example" }))],
    ["another loopback port", await send(complete({ origin: "http://127.0.0.1:1" }))],
    ["a wrong token", await send(complete({ "x-molis-work-control-token": "x".repeat(token.length) }))],
    ["no token", await send(complete({ "x-molis-work-control-token": undefined }))],
    ["a mutation outside /api/", await send(complete(), "/settings")],
  ];
  const expected = JSON.stringify({ error: CHINESE_REFUSAL, code: "host.request_refused" });
  for (const [what, answer] of refusals) {
    assert.equal(answer.status, 403, what);
    assert.equal(answer.body, expected, `${what}: the same body whichever check failed`);
  }
  // Past the checks that name the person's machine, the one-time key has its own answers; they do not say a check failed.
  assert.equal((await send(complete({ "x-molis-work-idempotency-key": undefined }))).status, 400);
  const replayed = complete();
  assert.equal((await send(replayed)).status, 200);
  const replay = await send(replayed);
  assert.equal(replay.status, 409);
  assert.doesNotMatch(replay.body, /host\.request_refused/);
});

// ---- 5. A project:// reference ---------------------------------------------------------------------------------------

test("a project reference that cannot be opened is a coded failure of the Host's: 400 for what is wrong with it, 404 for what is not there", async t => {
  const base = await mkdtemp(join(tmpdir(), "host-pages-error-model-reference-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "project"), outside = join(base, "outside");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "docs", "plan.md"), "# plan\n");
  await writeFile(join(root, "docs", "binary.bin"), new Uint8Array([0, 1, 2]));
  await writeFile(join(outside, "secret.txt"), "outside the project");
  await symlink(join(outside, "secret.txt"), join(root, "docs", "link.txt"));
  const refused = (locator: string, code: string, status: number) => {
    const error = capture(() => hostModule.readProjectReference(root, locator));
    assert.ok(error instanceof ActionError, locator);
    assert.deepEqual([error.code, actionHttpStatus(error)], [code, status], locator);
  };
  refused("project://../outside/secret.txt", "host.project_reference_invalid", 400);
  refused("project://docs/link.txt", "host.project_reference_invalid", 400);
  refused("project://docs", "host.project_reference_invalid", 400);
  refused("project://docs/binary.bin", "host.project_reference_invalid", 400);
  refused("project://docs/missing.md", "host.project_reference_not_found", 404);
  const noRoot = capture(() => hostModule.readProjectReference(join(base, "no-such-root"), "project://docs/plan.md"));
  assert.ok(noRoot instanceof ActionError && noRoot.code === "host.project_reference_not_found");
  const noWorkspace = capture(() => artifactsModule.openArtifactProjectReference({ readProjectReference: () => assert.fail("nothing is read without a workspace") }, { reference: "project://result.txt" }));
  assert.ok(noWorkspace instanceof ActionError);
  assert.deepEqual([noWorkspace.code, actionHttpStatus(noWorkspace)], ["artifacts.workspace_unconfirmed", 409]);
});

test("the project-reference route answers by kind, and an escape that does not decode is the caller's mistake, not a 500", async t => {
  const failure: { current: unknown } = { current: undefined };
  const actions: BoundActionClient = { discover: async () => [], invoke: async () => { throw failure.current; } };
  const edge = await serve((request, response, url) => hostModule.handleLocalProjectReferenceHttp(request, response, url, actions), t);
  const get = (reference: string) => edge.send("GET", `/api/project-references/${reference}`);
  failure.current = new ActionError("actions.forbidden", "没有权限");
  assert.deepEqual([(await get("project%3A%2F%2Fa.md")).status], [403]);
  failure.current = new ActionError("host.project_reference_not_found", "项目内引用文件不存在", { kind: "not_found" });
  assert.deepEqual([(await get("project%3A%2F%2Fa.md")).status], [404]);
  failure.current = new ActionError("artifacts.workspace_unconfirmed", "项目没有可确认的工作区", { kind: "conflict" });
  assert.deepEqual([(await get("project%3A%2F%2Fa.md")).status], [409]);
  const bad = await get("%E0%A4%A");
  assert.deepEqual([bad.status, bad.body.code], [400, "host.project_reference_invalid"]);
  failure.current = new Error("读取失败");
  assert.deepEqual([(await get("project%3A%2F%2Fa.md")).status], [500]);
});

// ---- 6. Nothing of the old shape is left -----------------------------------------------------------------------------

test("the mapper, the catalog class, the artifact classes and the Functions class are gone from the sources, and the edge raises nothing bare", () => {
  const OLD = ["MolisWorkProjectCatalogError", "functionsRouteErrorResponse", "ArtifactBrowserError", "ArtifactImportError", "ExternalDocumentImportError",
    "ArtifactProjectReferenceError", "ProjectReferenceError", "FunctionsError"];
  const here = "tests/host-pages-error-model.test.ts";
  // `git grep` exits 1 when nothing matches, which is the answer wanted here.
  const found = spawnSync("git", ["grep", "-n", "-E", `\\b(${OLD.join("|")})\\b`, "--", "apps", "packages", "modules", "plugins", "horizontal", "scripts", "tests", `:!${here}`],
    { cwd: REPOSITORY, encoding: "utf8" });
  assert.deepEqual([found.status, found.stdout.trim()], [1, ""], "no source names the removed classes or the mapper");
  assert.equal(existsSync(join(REPOSITORY, "apps/local-host/src/functions-http/route-error.ts")), false);
  const scan = spawnSync("git", ["grep", "-n", "-E", "new Error\\(", "--", "apps/local-host/src/functions-http.ts", "apps/local-host/src/web-project-reference.ts",
    "apps/local-host/src/artifact-library-http.ts", "apps/local-host/src/artifact-document-import.ts", "apps/local-host/src/project-file-reference.ts", "modules/functions/src"],
  { cwd: REPOSITORY, encoding: "utf8" });
  const bare = scan.stdout.trim().split("\n").filter(line => line && !/\/\/ .*new Error\(|object required/.test(line));
  assert.deepEqual(bare, [], "a caller's mistake on these edges has a code (a bare Error would answer 500)");
});
