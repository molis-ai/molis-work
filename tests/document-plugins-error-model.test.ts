import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

import {
  handleDatasetNativePluginHttp,
  handleFormNativePluginHttp,
  handleLingguangNativePluginHttp,
  handlePagesNativePluginHttp,
  handlePptNativePluginHttp,
  handleWorkflowsNativePluginHttp,
  MolisWorkLocalHost,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { actionMcpToolName, createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { DATASET_ACTION_PERMISSIONS, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { FORM_ACTION_PERMISSIONS, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { PAGES_ACTION_PERMISSIONS, createPagesActionHandlers, createPagesContentHandlers, openPagesStore, pagesActions, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { PPT_ACTION_PERMISSIONS, openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { WORKFLOWS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-workflows";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import { serveNativeHttp, type NativeHttpAnswer } from "./fixtures/native-http.js";
import { pagesTestPorts } from "./fixtures/pages-actions.js";
import { pptTestPorts } from "./fixtures/ppt-actions.js";

// specs/repository-anti-corruption W3-02-D: the document plugins (Pages, PPT, Dataset, Form, Lingguang, Workflows) lose their route-error mappers and
// their error classes. Their failures are ActionErrors whose codes the plugins declare (`defineErrorCodes`); the Host's edge answers every one through the
// SDK, so the status comes from the failure's kind and the same platform code gets the same status at all six plugins.
//
// What each part proves, and what it did on the merge-base (origin/main with W3-02-A):
//   1. the declarations exist and every owner code answers the status its deleted mapper gave it (PARITY: the table below was made by running the six
//      mappers over every owner code at the merge-base; it fails there only because the declarations do not exist yet);
//   2. a platform code answers the same status at all six edges (FAILS on the merge-base: the mappers disagreed, most gave 400);
//   3. a request body that is too large answers 413 (FAILS there: 400), a broken body 400, a failure with no code of ours 500 (FAILS there: 400);
//   4. Lingguang's streamed error event is written by the same function (code and details stay, status is the kind's);
//   5. real routes through real stores keep the status and the code of not found, conflict (PARITY: passes before and after);
//   6. nothing of the old shape is left: no error class, no mapper, no `mapError`, no owner code raised without its declaration, and no bare
//      `new Error(` in the plugins' server sources or their Host files (a caller's mistake there would answer 500; only two wiring-mistake sentences stay).

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");

type Owner = "pages" | "ppt" | "dataset" | "form" | "lingguang" | "workflows";
const OWNERS: readonly Owner[] = ["pages", "ppt", "dataset", "form", "lingguang", "workflows"];

interface OwnerSpec {
  readonly pkg: string;
  readonly declarations: string;
  /** The status each owner code answered through its own mapper on the merge-base (`<owner>.<reason>`), by reason. */
  readonly status: Readonly<Record<string, number>>;
  readonly removed: readonly string[];
}

const SPECS: Readonly<Record<Owner, OwnerSpec>> = {
  pages: { pkg: "@molis-ai/molis-work-plugin-pages", declarations: "pagesErrors", removed: ["PagesError", "pagesRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, unavailable: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403, unsupported: 400 } },
  ppt: { pkg: "@molis-ai/molis-work-plugin-ppt", declarations: "pptErrors", removed: ["PptError", "pptRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403 } },
  dataset: { pkg: "@molis-ai/molis-work-plugin-dataset", declarations: "datasetErrors", removed: ["DatasetError", "datasetRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403 } },
  form: { pkg: "@molis-ai/molis-work-plugin-form", declarations: "formErrors", removed: ["FormError", "formRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, closed: 409, request_conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403 } },
  lingguang: { pkg: "@molis-ai/molis-work-plugin-lingguang", declarations: "lingguangErrors", removed: ["LingguangError", "lingguangRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, request_conflict: 409, context_too_large: 400, empty_reply: 400 } },
  workflows: { pkg: "@molis-ai/molis-work-plugin-workflows", declarations: "workflowsErrors", removed: ["WorkflowError", "workflowsRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, unavailable: 400, not_ready: 400, missing: 400, uncertain: 400, ambiguous: 400, invalid_result: 400 } },
};

/** A loopback server whose route handler fails with whatever the test sets; the Host's real edge for `owner` answers. */
async function failingEdge(owner: Owner) {
  const failure: { current: unknown } = { current: undefined };
  const raise = async (): Promise<never> => { throw failure.current; };
  const failingActions: BoundActionClient = { discover: async () => [], invoke: raise };
  const server = await serveNativeHttp((request, response, url) => {
    switch (owner) {
      case "pages": return handlePagesNativePluginHttp(request, response, url, raise);
      case "ppt": return handlePptNativePluginHttp(request, response, url, raise);
      case "dataset": return handleDatasetNativePluginHttp(request, response, url, raise);
      case "form": return handleFormNativePluginHttp(request, response, url, raise);
      case "lingguang": return handleLingguangNativePluginHttp(request, response, url, raise);
      case "workflows": return handleWorkflowsNativePluginHttp(request, response, url, { actions: failingActions });
    }
  });
  return {
    /** What the next request's route fails with. */
    failWith(error: unknown): void { failure.current = error; },
    /** Create (POST /api/<owner>) with a small valid body: the edge reads it, the route runs, and the route fails with `error`. */
    async fail(error: unknown): Promise<NativeHttpAnswer> { failure.current = error; return await server.post(`/api/${owner}`, "{}"); },
    post: server.post,
    postText: server.postText,
    close: server.close,
  };
}

test("each document plugin declares its codes, and every code answers the status its deleted mapper gave it", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const module = await import(spec.pkg) as Record<string, unknown>;
    const declared = module[spec.declarations] as Record<string, (message: string, details?: Record<string, unknown>) => ActionError> | undefined;
    assert.ok(declared, `${spec.pkg} exports ${spec.declarations}`);
    assert.deepEqual(Object.keys(declared).sort(), Object.keys(spec.status).sort(), `${spec.declarations} declares exactly the codes ${owner} raises`);
    const edge = await failingEdge(owner);
    try {
      for (const [reason, status] of Object.entries(spec.status)) {
        const error = declared[reason]!(`${owner} ${reason}`);
        assert.ok(error instanceof ActionError && error.code === `${owner}.${reason}`, `${spec.declarations}.${reason} raises ${owner}.${reason}`);
        const answer = await edge.fail(error);
        assert.deepEqual([answer.status, answer.body], [status, { error: `${owner} ${reason}`, code: `${owner}.${reason}` }], `${owner}.${reason}`);
      }
    } finally { await edge.close(); }
  }
});

// The platform's own codes: one status for one kind of failure, whichever plugin the person was in.
const PLATFORM_STATUS: Readonly<Record<string, number>> = {
  "actions.input_invalid": 400, "actions.forbidden": 403, "actions.scope_mismatch": 403, "actions.owner_mismatch": 403, "actions.plugin_disabled": 403,
  "actions.missing": 404, "actions.subject_changed": 409, "actions.input_too_large": 413, "actions.cancelled": 499, "actions.execution_failed": 500,
  "actions.connection_required": 503, "actions.unredeemed": 503,
};

test("a platform code answers one status at all six document plugins, with the one body { error, code }", async () => {
  for (const owner of OWNERS) {
    const edge = await failingEdge(owner);
    try {
      for (const [code, status] of Object.entries(PLATFORM_STATUS)) {
        const answer = await edge.fail(new ActionError(code, "测试消息"));
        assert.deepEqual([owner, code, answer.status, answer.body], [owner, code, status, { error: "测试消息", code }]);
      }
    } finally { await edge.close(); }
  }
});

test("a failure with no code of ours is a bug or an outage: 500 actions.execution_failed, with its message and nothing of its own code", async () => {
  for (const owner of OWNERS) {
    const edge = await failingEdge(owner);
    try {
      assert.deepEqual(await edge.fail(new Error("boom")), { status: 500, body: { error: "boom", code: "actions.execution_failed" } }, `${owner}: a plain Error`);
      assert.deepEqual(await edge.fail(Object.assign(new Error("磁盘上没有这个文件"), { code: "ENOENT" })), { status: 500, body: { error: "磁盘上没有这个文件", code: "actions.execution_failed" } }, `${owner}: a system error code`);
      assert.deepEqual(await edge.fail("a thrown string"), { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } }, `${owner}: not an Error`);
    } finally { await edge.close(); }
  }
});

// The body limit of each edge (native-plugin-http.ts reads 1,000,000 bytes unless the edge says more): Lingguang reads files, up to 36 MB.
const BODY_LIMIT: Readonly<Record<Owner, number>> = { pages: 1_000_000, ppt: 1_000_000, dataset: 1_000_000, form: 1_000_000, lingguang: 36_000_000, workflows: 400_000 };

test("a request body that is too large answers 413 and one that is not JSON answers 400, each with its platform code", async () => {
  for (const owner of OWNERS) {
    const edge = await failingEdge(owner);
    try {
      const large = await edge.post(`/api/${owner}`, JSON.stringify({ padding: " ".repeat(BODY_LIMIT[owner] + 100_000) }));
      assert.deepEqual([owner, large.status, large.body], [owner, 413, { error: "请求内容过大", code: "actions.input_too_large" }]);
      const broken = await edge.post(`/api/${owner}`, "{not json");
      assert.deepEqual([owner, broken.status, broken.body], [owner, 400, { error: "请求不是有效 JSON", code: "actions.input_invalid" }]);
    } finally { await edge.close(); }
  }
});

test("owner details travel in details and nowhere else", async () => {
  const edge = await failingEdge("pages");
  try {
    const answer = await edge.fail(new ActionError("actions.forbidden", "不可以", { details: { reason: "stale", version: 3 } }));
    assert.deepEqual(answer, { status: 403, body: { error: "不可以", code: "actions.forbidden", details: { reason: "stale", version: 3 } } });
  } finally { await edge.close(); }
});

test("Lingguang's streamed reading answers a failure with the same function: its code and details stay, its status is its kind's", async () => {
  const edge = await failingEdge("lingguang");
  try {
    for (const path of ["/api/lingguang/material?stream=1", "/api/lingguang/source?stream=1"]) {
      // A file reader's failure the client branches on: a transcription needs the speech model, and says how large it is.
      const needsModel = Object.assign(new Error("转写需要下载语音模型"), { code: "jelly.material.model_required", details: { approximate_bytes: 626_000_000, variant: "base" } });
      const refused = await streamed(edge, path, needsModel);
      assert.deepEqual(refused.at(-1), { type: "error", status: 400, error: "转写需要下载语音模型", code: "jelly.material.model_required", details: { approximate_bytes: 626_000_000, variant: "base" } }, path);
      const plain = await streamed(edge, path, new ActionError("actions.connection_required", "请先配置文字模型"));
      assert.deepEqual(plain.at(-1), { type: "error", status: 503, error: "请先配置文字模型", code: "actions.connection_required" }, path);
      const oversize = await edge.postText(path, JSON.stringify({ padding: " ".repeat(36_100_000) }));
      assert.equal(oversize.status, 200, "a stream starts with 200; the error is its last event");
      assert.deepEqual(lines(oversize.text).at(-1), { type: "error", status: 413, error: "请求内容过大", code: "actions.input_too_large" }, path);
    }
  } finally { await edge.close(); }
});

async function streamed(edge: Awaited<ReturnType<typeof failingEdge>>, path: string, error: unknown) {
  edge.failWith(error);
  const answer = await edge.postText(path, JSON.stringify({ file_name: "a.txt", data_base64: "AA==", url: "https://example.com/a" }));
  return lines(answer.text);
}

function lines(text: string): Array<Record<string, unknown>> {
  return text.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
}

// Real routes, real stores, the Host's real edges: the status and the code of "not there" and "changed under you" are the same as before the slice.
async function documentRoutes(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "document-error-model-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const client = host.actionClient(reference);
  const bound = (permissions: readonly string[]) => bindActionClient(client, () => ({ actor_id: "owner", project_id: "a", audience: "user", permissions }));
  const ports = (permissions: readonly string[]) => ({ projectId: "a", actions: bound(permissions) });
  const server = await serveNativeHttp(async (request, response, url) =>
    await handlePagesNativePluginHttp(request, response, url, ports(PAGES_ACTION_PERMISSIONS))
    || await handlePptNativePluginHttp(request, response, url, () => ports(PPT_ACTION_PERMISSIONS))
    || await handleDatasetNativePluginHttp(request, response, url, () => ports(DATASET_ACTION_PERMISSIONS))
    || await handleFormNativePluginHttp(request, response, url, () => ports(FORM_ACTION_PERMISSIONS))
    || await handleLingguangNativePluginHttp(request, response, url, () => ports(LINGGUANG_ACTION_PERMISSIONS))
    || await handleWorkflowsNativePluginHttp(request, response, url, { actions: bound(WORKFLOWS_ACTION_PERMISSIONS) }));
  t.after(() => server.close());
  return server;
}

const MISSING = "00000000-0000-4000-8000-000000000000";

test("real routes: a record that is not there is 404 <owner>.not_found at Pages, PPT, Dataset, Form and Workflows", async t => {
  const server = await documentRoutes(t);
  for (const owner of ["pages", "ppt", "dataset", "form", "workflows"] as const) {
    const answer = await server.post(`/api/${owner}/${MISSING}/delete`, "{}");
    assert.deepEqual([owner, answer.status, answer.body.code], [owner, 404, `${owner}.not_found`], JSON.stringify(answer.body));
  }
  const spark = await server.post(`/api/lingguang/${MISSING}`, JSON.stringify({ title: "x" }));
  assert.deepEqual([spark.status, spark.body.code], [404, "lingguang.not_found"], JSON.stringify(spark.body));
});

test("real routes: a change made on a stale version is 409 <owner>.conflict at Pages, PPT, Dataset, Form and Workflows", async t => {
  const server = await documentRoutes(t);
  const stale: Record<string, Record<string, unknown>> = {
    pages: { title: "改过" }, ppt: { title: "改过" }, dataset: { title: "改过" }, form: { title: "改过" },
  };
  for (const owner of ["pages", "ppt", "dataset", "form"] as const) {
    const created = await server.post(`/api/${owner}`, JSON.stringify({ title: "原稿" }));
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const record = Object.values(created.body).find((value): value is { id: string; version: number } => typeof value === "object" && value !== null && "id" in value && "version" in value);
    assert.ok(record, `${owner} answers the record it created`);
    const answer = await server.post(`/api/${owner}/${record.id}`, JSON.stringify({ ...stale[owner], expected_version: record.version + 40 }));
    assert.deepEqual([owner, answer.status, answer.body.code], [owner, 409, `${owner}.conflict`], JSON.stringify(answer.body));
  }
  const workflow = await server.post("/api/workflows", JSON.stringify({ title: "流程" }));
  assert.equal(workflow.status, 200, JSON.stringify(workflow.body));
  const saved = workflow.body.workflow as { workflow_id: string; revision: number };
  const answer = await server.post(`/api/workflows/${saved.workflow_id}`, JSON.stringify({ title: "改过", revision: saved.revision + 40 }));
  assert.deepEqual([answer.status, answer.body.code], [409, "workflows.conflict"], JSON.stringify(answer.body));
});

test("real routes: a publish in an environment with no publisher is refused by the plugin's availability object: 409 <owner>.unavailable at Pages, PPT, Dataset and Form", async t => {
  // W3-02-G1-02: the owner classifies its availability refusal as conflict; Kernel and HTTP preserve it without publishing or changing the draft.
  const home = await mkdtemp(join(tmpdir(), "document-error-model-publish-"));
  const pages = openPagesStore(home), ppt = openPptStore(home), dataset = openDatasetStore(home), form = openFormStore(home);
  t.after(async () => { pages.close(); ppt.close(); dataset.close(); form.close(); await rm(home, { recursive: true, force: true }); });
  const server = await serveNativeHttp(async (request, response, url) =>
    await handlePagesNativePluginHttp(request, response, url, pagesTestPorts(pages, "a"))
    || await handlePptNativePluginHttp(request, response, url, () => pptTestPorts(ppt, "a"))
    || await handleDatasetNativePluginHttp(request, response, url, () => datasetTestPorts(dataset, "a"))
    || await handleFormNativePluginHttp(request, response, url, () => formTestPorts(form, "a")));
  t.after(() => server.close());
  for (const owner of ["pages", "ppt", "dataset", "form"] as const) {
    const created = await server.post(`/api/${owner}`, JSON.stringify({ title: "原稿" }));
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const record = Object.values(created.body).find((value): value is { id: string } => typeof value === "object" && value !== null && "id" in value);
    assert.ok(record, `${owner} answers the record it created`);
    const store = { pages, ppt, dataset, form }[owner], before = store.get(record.id);
    const answer = await server.post(`/api/${owner}/${record.id}/promote`, JSON.stringify({ goal_id: "CORE" }));
    assert.deepEqual([owner, answer.status, answer.body.code], [owner, 409, `${owner}.unavailable`], JSON.stringify(answer.body));
    assert.deepEqual(store.get(record.id), before, `${owner}: the refusal keeps the persisted draft unchanged`);
  }
});

test("MCP action port: a Pages failure comes out as its own code and message, not as the generic 能力执行失败", async t => {
  // merge-base: PagesError was not an ActionError, so the port (apps/mcp action-tools.ts, which tells an ActionError's code and message and nothing else) answered
  // { code: "actions.execution_failed", message: "能力执行失败" } for every Pages failure; Form's `refusal()` wrapper existed to get one failure across it.
  const home = await mkdtemp(join(tmpdir(), "document-error-model-mcp-"));
  const store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: "a" }, definitions: pagesManifest.actions!,
    handlers: [...createPagesActionHandlers({ withStore: run => run(store), modelAvailability: () => ({ available: false, code: "actions.connection_required", reason: "请先配置文字模型" }) }),
      ...createPagesContentHandlers(service)] });
  const caller = (): ActionCallContext => ({ actor_id: "mcp-client", project_id: "a", audience: "mcp", permissions: PAGES_ACTION_PERMISSIONS });
  const ports = createActionMcpPorts({ service, context: caller, serverInfo: { name: "pages-edge", version: "1" } });
  const call = async (action: ActionDefinition<never, unknown>, args: Record<string, unknown>) => {
    const reply = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(action), arguments: args } }, ports);
    const result = reply!.result as { isError: boolean; content: Array<{ text: string }> };
    return { isError: result.isError, ...(result.isError ? JSON.parse(result.content[0]!.text) as { code: string; message: string } : {}) };
  };
  assert.deepEqual(await call(pagesActions.get, { id: "no-such-document" }), { isError: true, code: "pages.not_found", message: "找不到这篇文档" });
  const document = store.create({ project_id: "a", title: "原稿" });
  const stale = await call(pagesActions.update, { id: document.id, title: "改过", expected_version: document.version + 5 });
  assert.deepEqual([stale.isError, stale.code], [true, "pages.conflict"]);
});

// Nothing of the old shape is left. These read the sources, so a later change that brings one back is caught here and not only by a reviewer.
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|mts)$/u.test(name) ? [path] : [];
  });
}
const HOST_FILES: Readonly<Record<Owner, readonly RegExp[]>> = {
  pages: [/^pages-.*\.ts$/u], ppt: [/^ppt-.*\.ts$/u], dataset: [/^dataset-.*\.ts$/u], form: [/^form-.*\.ts$/u], lingguang: [/^lingguang-.*\.ts$/u], workflows: [/^workflows?-.*\.ts$/u],
};
function filesOf(owner: Owner): string[] {
  const host = join(REPOSITORY, "apps", "local-host", "src");
  return [...sourceFiles(join(REPOSITORY, "plugins", "native", owner, "src")),
    ...readdirSync(host).filter(name => HOST_FILES[owner].some(pattern => pattern.test(name))).map(name => join(host, name))];
}

// The plugin client files hold the page's scripts as template strings; the only bare Errors allowed elsewhere are the two sentences that report a
// wiring mistake in the code (a route without its Host binding, a UI surface the plugin does not render): nobody can cause them by a request.
const PROGRAMMING_ERROR: readonly RegExp[] = [/没有 Host binding/u, /UI surface .* 不存在/u];
function bareServerErrors(source: string): string[] {
  const file = ts.createSourceFile("plugin.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Error") {
      const argument = node.arguments?.[0]?.getText(file) ?? "";
      if (!PROGRAMMING_ERROR.some(sentence => sentence.test(argument))) errors.push(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return errors;
}

test("the owner-error check ignores browser script text but detects executable template interpolations and server errors", () => {
  assert.deepEqual(bareServerErrors('export const SCRIPT = `throw new Error("browser");`;'), []);
  assert.deepEqual(bareServerErrors('export const SCRIPT = `client ${new Error("server interpolation")}`;'), ['"server interpolation"']);
  assert.deepEqual(bareServerErrors('throw new Error("server input");'), ['"server input"']);
  assert.deepEqual(bareServerErrors('throw new Error("没有 Host binding");'), []);
});

test("no document plugin keeps an error class, a route-error mapper, or a raise of its own code outside its declarations", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const module = await import(spec.pkg) as Record<string, unknown>;
    for (const name of spec.removed) assert.equal(name in module, false, `${spec.pkg} no longer exports ${name}`);
    for (const file of filesOf(owner)) {
      const source = readFileSync(file, "utf8");
      const where = relative(REPOSITORY, file);
      assert.doesNotMatch(source, /\bclass\s+\w+\s+extends\s+Error\b/u, `${where}: an error class`);
      assert.doesNotMatch(source, /\bmapError\b|RouteErrorResponse/u, `${where}: a route-error mapper`);
      assert.doesNotMatch(source, new RegExp(String.raw`new\s+\w*Error\(\s*"${owner}\.[a-z_]+"`, "u"), `${where}: ${owner}.* raised without the declaration (it would answer 400 whatever its kind)`);
      assert.doesNotMatch(source, /Object\.assign\(new Error\(/u, `${where}: an Error given a code afterwards`);
      // Parse actual server expressions: quoted browser scripts are data, but interpolations execute here.
      const bare = bareServerErrors(source);
      assert.deepEqual(bare, [], `${where}: a bare new Error( is a caller-visible 500; raise ${spec.declarations}.<reason>(...) (or a platform code) instead`);
    }
  }
  const creative = readFileSync(join(REPOSITORY, "apps", "local-host", "src", "creative-artifacts.ts"), "utf8");
  assert.doesNotMatch(creative, /\bnew\s+(?:Form|Dataset|Ppt)Error\(|"(?:form|dataset|ppt)\.[a-z_]+"/u, "creative-artifacts.ts raises Form, Dataset and PPT codes through their declarations");
  assert.doesNotMatch(creative, /\bnew\s+Error\(/u, "creative-artifacts.ts raises no bare Error: its refusals are the plugins' declared codes");
});

test("a declared code is used: every reason in a declaration has a raise site", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const sources = filesOf(owner).concat(sourceFiles(join(REPOSITORY, "apps", "local-host", "src")).filter(file => /creative-artifacts/u.test(file))).map(file => readFileSync(file, "utf8")).join("\n");
    for (const reason of Object.keys(spec.status)) {
      assert.ok(new RegExp(String.raw`\b${spec.declarations}\.${reason}\(`, "u").test(sources), `${spec.declarations}.${reason} is raised somewhere; a code nobody raises is not declared`);
    }
  }
});
