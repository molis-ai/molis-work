import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { parseImports } from "../scripts/test-imports/parse.mjs";
import { browserPrograms } from "../scripts/gates/browser-programs.mjs";

import { actionMcpToolName, createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { datasetActions, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { formActions, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { serveLingguang } from "./fixtures/lingguang-runtime.js";
import { PAGES_ACTION_PERMISSIONS, createPagesActionHandlers, createPagesContentHandlers, ownPagesStores, pagesActions, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { PPT_ACTION_PERMISSIONS, openPptStore, pptActions } from "@molis-ai/molis-work-plugin-ppt";
import { datasetTestPorts } from "./fixtures/dataset-actions.js";
import { formTestPorts } from "./fixtures/form-actions.js";
import type { NativeHttpAnswer } from "./fixtures/native-http.js";
import { pagesTestPorts } from "./fixtures/pages-actions.js";
import { pptTestPorts } from "./fixtures/ppt-actions.js";
import { openTestHome } from "./fixtures/test-home.js";

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
    status: { invalid: 400, body_too_large: 400, not_found: 404, conflict: 409, unavailable: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403, unsupported: 400 } },
  ppt: { pkg: "@molis-ai/molis-work-plugin-ppt", declarations: "pptErrors", removed: ["PptError", "pptRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403 } },
  dataset: { pkg: "@molis-ai/molis-work-plugin-dataset", declarations: "datasetErrors", removed: ["DatasetError", "datasetRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403 } },
  form: { pkg: "@molis-ai/molis-work-plugin-form", declarations: "formErrors", removed: ["FormError", "formRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, closed: 409, request_conflict: 409, publication_pending: 409, publication_conflict: 409, publication_owner: 403, answer_invalid: 400 } },
  lingguang: { pkg: "@molis-ai/molis-work-plugin-lingguang", declarations: "lingguangErrors", removed: ["LingguangError", "lingguangRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, request_conflict: 409, context_too_large: 400, empty_reply: 400 } },
  workflows: { pkg: "@molis-ai/molis-work-plugin-workflows", declarations: "workflowsErrors", removed: ["WorkflowError", "workflowsRouteErrorResponse"],
    status: { invalid: 400, not_found: 404, conflict: 409, unavailable: 400, not_ready: 400, missing: 400, uncertain: 400, ambiguous: 400, invalid_result: 400 } },
};

test("each document plugin declares its codes, and every code answers the status its deleted mapper gave it", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const module = await import(spec.pkg) as Record<string, unknown>;
    const declared = module[spec.declarations] as Record<string, (message: string, details?: Record<string, unknown>) => ActionError> | undefined;
    assert.ok(declared, `${spec.pkg} exports ${spec.declarations}`);
    assert.deepEqual(Object.keys(declared).sort(), Object.keys(spec.status).sort(), `${spec.declarations} declares exactly the codes ${owner} raises`);
    for (const [reason, status] of Object.entries(spec.status)) {
      const error = declared[reason]!(`${owner} ${reason}`);
      assert.ok(error instanceof ActionError && error.code === `${owner}.${reason}`, `${spec.declarations}.${reason} raises ${owner}.${reason}`);
      const answer = actionErrorResponse(error);
      assert.deepEqual([answer.status, answer.body], [status, { error: `${owner} ${reason}`, code: `${owner}.${reason}` }], `${owner}.${reason}`);
    }
  }
});

// The platform's own codes: one status for one kind of failure, whichever plugin the person was in.
const PLATFORM_STATUS: Readonly<Record<string, number>> = {
  "actions.input_invalid": 400, "actions.forbidden": 403, "actions.scope_mismatch": 403, "actions.owner_mismatch": 403, "actions.plugin_disabled": 403,
  "actions.missing": 404, "actions.subject_changed": 409, "actions.input_too_large": 413, "actions.cancelled": 499, "actions.execution_failed": 500,
  "actions.connection_required": 503, "actions.unredeemed": 503,
};

test("a platform code answers one status at all six document plugins, with the one body { error, code }", () => {
  for (const owner of OWNERS) {
    for (const [code, status] of Object.entries(PLATFORM_STATUS)) {
      const answer = actionErrorResponse(new ActionError(code, "测试消息"));
      assert.deepEqual([owner, code, answer.status, answer.body], [owner, code, status, { error: "测试消息", code }]);
    }
  }
});

test("a failure with no code of ours is a bug or an outage: 500 actions.execution_failed, with its message and nothing of its own code", () => {
  for (const owner of OWNERS) {
    assert.deepEqual(actionErrorResponse(new Error("boom")), { status: 500, body: { error: "boom", code: "actions.execution_failed" } }, `${owner}: a plain Error`);
    assert.deepEqual(actionErrorResponse(Object.assign(new Error("磁盘上没有这个文件"), { code: "ENOENT" })), { status: 500, body: { error: "磁盘上没有这个文件", code: "actions.execution_failed" } }, `${owner}: a system error code`);
    assert.deepEqual(actionErrorResponse("a thrown string"), { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } }, `${owner}: not an Error`);
  }
});

// The declared body limit of each Runtime edge; Lingguang accepts files up to 36 MB.
const BODY_LIMIT: Readonly<Record<Owner, number>> = { pages: 1_000_000, ppt: 1_000_000, dataset: 1_000_000, form: 1_000_000, lingguang: 36_000_000, workflows: 400_000 };

test("a request body that is too large answers 413 and one that is not JSON answers 400, each with its platform code", async t => {
  const factories = { pages: pagesRoutes, ppt: pptRoutes, dataset: datasetRoutes, form: formRoutes, workflows: workflowsRoutes };
  for (const owner of OWNERS) {
    const raw = owner === "lingguang" ? await (async () => {
      const edge = await serveLingguang(t);
      return async (body: string): Promise<NativeHttpAnswer> => {
        const response = await edge.rawRequest(edge.path, { method: "POST", raw: body });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
      };
    })() : await (async () => { const edge = await factories[owner](t); return (body: string) => edge.raw("", body); })();
    const large = await raw(JSON.stringify({ padding: " ".repeat(BODY_LIMIT[owner] + 100_000) }));
    assert.deepEqual([owner, large.status, large.body], [owner, 413, { error: "请求内容过大", code: "actions.input_too_large" }]);
    const broken = await raw("{not json");
    assert.deepEqual([owner, broken.status, broken.body], [owner, 400, { error: "请求不是有效 JSON", code: "actions.input_invalid" }]);
  }
});

test("owner details travel in details and nowhere else", () => {
  const answer = actionErrorResponse(new ActionError("actions.forbidden", "不可以", { details: { reason: "stale", version: 3 } }));
  assert.deepEqual(answer, { status: 403, body: { error: "不可以", code: "actions.forbidden", details: { reason: "stale", version: 3 } } });
});

test("RAC-31 RAC-33 Lingguang Runtime stream keeps failure code/details; rejected bodies never open a stream", async t => {
  let failure: unknown;
  const f = await serveLingguang(t, { completeText: async () => { throw failure; } });
  const { spark } = await f.http<{ spark: { id: string } }>("", { title: "Error test" });
  const { conversation } = await f.http<{ conversation: { id: string } }>("/conversations", { spark_ids: [spark.id] });
  const reply = `/conversations/${conversation.id}/messages`;
  for (const error of [new ActionError("material.model_required", "转写需要下载语音模型", { kind: "invalid", details: { approximate_bytes: 626_000_000, variant: "base" } }),
    new ActionError("actions.connection_required", "请先配置文字模型")]) {
    failure = error;
    const response = await f.request(reply, { body: "继续" });
    const last = lines(await response.text()).at(-1)!;
    const expected = actionErrorResponse(error);
    assert.deepEqual([last.type, last.status, last.error, last.code, last.details], ["error", expected.status, expected.body.error, expected.body.code, expected.body.details]);
    assert.equal(typeof last.call_id, "string", "a dispatched failure carries its diagnostic id");
  }
  for (const suffix of ["", "/material", "/source", reply]) {
    const oversized = await f.request(suffix, { padding: " ".repeat(36_100_000) });
    assert.equal(oversized.status, 413, suffix);
    assert.doesNotMatch(oversized.headers.get("content-type") ?? "", /ndjson/);
    assert.equal((await oversized.json() as { code: string }).code, "actions.input_too_large");
    const raw = await f.rawRequest(f.path + suffix, { method: "POST", raw: "{not json" });
    assert.deepEqual([raw.status, (await raw.json() as { code: string }).code], [400, "actions.input_invalid"]);
  }
});

function lines(text: string): Array<Record<string, unknown>> {
  return text.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
}

// Real routes, real stores: every document plugin now uses the Host Runtime edge.

const MISSING = "00000000-0000-4000-8000-000000000000";

/** Forms on the Plugin Runtime (W4-04): a project in a test Home, reached under its `/api/plugins/io.molis.work.form/forms`, as the page reaches it. */
async function formRoutes(t: test.TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("Form error model");
  const forms = `/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`;
  /** One request as the page sends it, with its raw body; the answer as it comes back. */
  const raw = async (path: string, body: string): Promise<NativeHttpAnswer> => {
    const response = await fetch(home.origin + forms + path, { method: "POST", body, headers: { "content-type": "application/json", origin: home.origin,
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { raw, post: (path: string, body: unknown) => raw(path, JSON.stringify(body)) };
}

/** Dataset on the Plugin Runtime (W5-01): a project in a test Home, under `/api/plugins/io.molis.work.dataset/datasets`. */
async function datasetRoutes(t: test.TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("Dataset error model");
  const base = `/projects/${project.project_id}/api/plugins/io.molis.work.dataset/datasets`;
  const raw = async (path: string, body: string): Promise<NativeHttpAnswer> => {
    const response = await fetch(home.origin + base + path, { method: "POST", body, headers: { "content-type": "application/json", origin: home.origin,
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { raw, post: (path: string, body: unknown) => raw(path, JSON.stringify(body)) };
}

/** Workflows on the Plugin Runtime (W5-01): a project in a test Home, under `/api/plugins/io.molis.work.native.workflows/workflows`. */
async function workflowsRoutes(t: test.TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("Workflows error model");
  const base = `/projects/${project.project_id}/api/plugins/io.molis.work.native.workflows/workflows`;
  const raw = async (path: string, body: string): Promise<NativeHttpAnswer> => {
    const response = await fetch(home.origin + base + path, { method: "POST", body, headers: { "content-type": "application/json", origin: home.origin,
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { raw, post: (path: string, body: unknown) => raw(path, JSON.stringify(body)) };
}

/** PPT on the Plugin Runtime (W5-01): a project in a test Home, under `/api/plugins/io.molis.work.ppt/ppt`. */
async function pptRoutes(t: test.TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("PPT error model");
  const base = `/projects/${project.project_id}/api/plugins/io.molis.work.ppt/ppt`;
  const raw = async (path: string, body: string): Promise<NativeHttpAnswer> => {
    const response = await fetch(home.origin + base + path, { method: "POST", body, headers: { "content-type": "application/json", origin: home.origin,
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { raw, post: (path: string, body: unknown) => raw(path, JSON.stringify(body)) };
}

/** Pages on the Plugin Runtime (W5-01): a project in a test Home, under `/api/plugins/io.molis.work.pages/pages`. */
async function pagesRoutes(t: test.TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("Pages error model");
  const base = `/projects/${project.project_id}/api/plugins/io.molis.work.pages/pages`;
  const raw = async (path: string, body: string): Promise<NativeHttpAnswer> => {
    const response = await fetch(home.origin + base + path, { method: "POST", body, headers: { "content-type": "application/json", origin: home.origin,
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { raw, post: (path: string, body: unknown) => raw(path, JSON.stringify(body)) };
}

test("real routes: a record that is not there is 404 <owner>.not_found at Pages, PPT, Dataset, Form and Workflows", async t => {
  const workflows = await (await workflowsRoutes(t)).post(`/${MISSING}/delete`, {});
  assert.deepEqual([workflows.status, workflows.body.code], [404, "workflows.not_found"], JSON.stringify(workflows.body));
  const page = await (await pagesRoutes(t)).post(`/${MISSING}/delete`, {});
  assert.deepEqual([page.status, page.body.code], [404, "pages.not_found"], JSON.stringify(page.body));
  const ppt = await (await pptRoutes(t)).post(`/${MISSING}/delete`, {});
  assert.deepEqual([ppt.status, ppt.body.code], [404, "ppt.not_found"], JSON.stringify(ppt.body));
  const table = await (await datasetRoutes(t)).post(`/${MISSING}/delete`, {});
  assert.deepEqual([table.status, table.body.code], [404, "dataset.not_found"], JSON.stringify(table.body));
  const form = await (await formRoutes(t)).post(`/${MISSING}/delete`, {});
  assert.deepEqual([form.status, form.body.code], [404, "form.not_found"], JSON.stringify(form.body));
  const sparks = await serveLingguang(t);
  const missingSpark = await sparks.request(`/${MISSING}`, { title: "x" });
  assert.deepEqual([missingSpark.status, (await missingSpark.json() as { code: string }).code], [404, "lingguang.not_found"]);
});

test("real routes: a change made on a stale version is 409 <owner>.conflict at Pages, PPT, Dataset, Form and Workflows", async t => {
  const datasets = await datasetRoutes(t);
  const forms = await formRoutes(t);
  const created = await forms.post("", { title: "原稿" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const record = Object.values(created.body).find((value): value is { id: string; version: number } => typeof value === "object" && value !== null && "id" in value && "version" in value);
  assert.ok(record, "form answers the record it created");
  const staleForm = await forms.post(`/${record.id}`, { title: "改过", expected_version: record.version + 40 });
  assert.deepEqual([staleForm.status, staleForm.body.code], [409, "form.conflict"], JSON.stringify(staleForm.body));
  const documents = await pagesRoutes(t);
  const createdPage = await documents.post("", { title: "原稿" });
  assert.equal(createdPage.status, 200, JSON.stringify(createdPage.body));
  const page = (createdPage.body as { document: { id: string; version: number } }).document;
  const stalePage = await documents.post(`/${page.id}`, { title: "改过", expected_version: page.version + 40 });
  assert.deepEqual([stalePage.status, stalePage.body.code], [409, "pages.conflict"], JSON.stringify(stalePage.body));
  const createdTable = await datasets.post("", { title: "原稿" });
  assert.equal(createdTable.status, 200, JSON.stringify(createdTable.body));
  const table = (createdTable.body as { dataset: { id: string; version: number } }).dataset;
  const staleTable = await datasets.post(`/${table.id}`, { title: "改过", expected_version: table.version + 40 });
  assert.deepEqual([staleTable.status, staleTable.body.code], [409, "dataset.conflict"], JSON.stringify(staleTable.body));
  const decks = await pptRoutes(t);
  const createdDeck = await decks.post("", { title: "原稿" });
  assert.equal(createdDeck.status, 200, JSON.stringify(createdDeck.body));
  const deck = (createdDeck.body as { presentation: { id: string; version: number } }).presentation;
  const staleDeck = await decks.post(`/${deck.id}`, { title: "改过", expected_version: deck.version + 40 });
  assert.deepEqual([staleDeck.status, staleDeck.body.code], [409, "ppt.conflict"], JSON.stringify(staleDeck.body));
  const flows = await workflowsRoutes(t);
  const workflow = await flows.post("", { title: "流程" });
  assert.equal(workflow.status, 200, JSON.stringify(workflow.body));
  const saved = workflow.body.workflow as { workflow_id: string; revision: number };
  const answer = await flows.post(`/${saved.workflow_id}`, { title: "改过", revision: saved.revision + 40 });
  assert.deepEqual([answer.status, answer.body.code], [409, "workflows.conflict"], JSON.stringify(answer.body));
});

test("real routes: a publish in an environment with no publisher is refused by the plugin's availability object: 409 <owner>.unavailable at Pages, PPT, Dataset and Form", async t => {
  // W3-02-G1-02: the owner classifies its availability refusal as conflict; Kernel and HTTP preserve it without publishing or changing the draft.
  const home = await mkdtemp(join(tmpdir(), "document-error-model-publish-"));
  const pages = openPagesStore(home), ppt = openPptStore(home), dataset = openDatasetStore(home), form = openFormStore(home);
  // Forms' routes are its Runtime ones now, and that Runtime always gives it the 成果 service: with no publisher its action is refused by the
  // same availability object, and its route answers that with the SDK's `actionErrorResponse`.
  const formPorts = formTestPorts(form, "a");
  t.after(async () => { pages.close(); ppt.close(); dataset.close(); form.close(); await rm(home, { recursive: true, force: true }); });
  const pagesPorts = pagesTestPorts(pages, "a");
  const { document: draftPage } = await pagesPorts.actions.invoke(pagesActions.create, { title: "原稿" });
  const pageAnswer = await pagesPorts.actions.invoke(pagesActions.promote, { id: draftPage.id, goal_id: "CORE" }).then(() => null, (error: unknown) => actionErrorResponse(error));
  assert.deepEqual([pageAnswer?.status, pageAnswer?.body.code], [409, "pages.unavailable"], JSON.stringify(pageAnswer?.body));
  assert.deepEqual(pages.get(draftPage.id), draftPage, "pages: the refusal keeps the persisted draft unchanged");
  const datasetPorts = datasetTestPorts(dataset, "a");
  const { dataset: draftTable } = await datasetPorts.actions.invoke(datasetActions.create, { title: "原稿" });
  const tableAnswer = await datasetPorts.actions.invoke(datasetActions.promote, { id: draftTable.id }).then(() => null, (error: unknown) => actionErrorResponse(error));
  assert.deepEqual([tableAnswer?.status, tableAnswer?.body.code], [409, "dataset.unavailable"], JSON.stringify(tableAnswer?.body));
  assert.deepEqual(dataset.get(draftTable.id), draftTable, "dataset: the refusal keeps the persisted draft unchanged");
  const pptPorts = pptTestPorts(ppt, "a");
  const { presentation: draftDeck } = await pptPorts.actions.invoke(pptActions.create, { title: "原稿" });
  const deckAnswer = await pptPorts.actions.invoke(pptActions.promote, { id: draftDeck.id }).then(() => null, (error: unknown) => actionErrorResponse(error));
  assert.deepEqual([deckAnswer?.status, deckAnswer?.body.code], [409, "ppt.unavailable"], JSON.stringify(deckAnswer?.body));
  assert.deepEqual(ppt.get(draftDeck.id), draftDeck, "ppt: the refusal keeps the persisted draft unchanged");
  const { form: draft } = await formPorts.actions.invoke(formActions.create, { title: "原稿" });
  const answer = await formPorts.actions.invoke(formActions.promote, { id: draft.id }).then(() => null, (error: unknown) => actionErrorResponse(error));
  assert.deepEqual([answer?.status, answer?.body.code], [409, "form.unavailable"], JSON.stringify(answer?.body));
  assert.deepEqual(form.get(draft.id), draft, "form: the refusal keeps the persisted draft unchanged");
});

test("W5-01-PPT-02: real routes: PPT's Runtime edge reads up to the 1 MB its routes declare, answers more with 413 and a broken body with 400", async t => {
  const decks = await pptRoutes(t);
  const large = await decks.raw("", JSON.stringify({ title: "大", padding: " ".repeat(1_000_000) }));
  assert.deepEqual([large.status, large.body], [413, { error: "请求内容过大", code: "actions.input_too_large" }]);
  const broken = await decks.raw("", "{not json");
  assert.deepEqual([broken.status, broken.body.code], [400, "actions.input_invalid"], JSON.stringify(broken.body));
  const created = await decks.post("", { title: "边界" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
});

test("W5-01-WORKFLOWS-02: real routes: Workflows' Runtime edge reads up to the 400,000 bytes its routes declare, answers more with 413 and a broken body with 400", async t => {
  const flows = await workflowsRoutes(t);
  const large = await flows.raw("", JSON.stringify({ title: "大", padding: " ".repeat(400_000) }));
  assert.deepEqual([large.status, large.body], [413, { error: "请求内容过大", code: "actions.input_too_large" }]);
  const broken = await flows.raw("", "{not json");
  assert.deepEqual([broken.status, broken.body.code], [400, "actions.input_invalid"], JSON.stringify(broken.body));
  // Between the Runtime's 256,000 default and the route's 400,000 a request still comes in, and the route passes on only the fields it names.
  const created = await flows.post("", { title: "边界", padding: " ".repeat(300_000) });
  assert.equal(created.status, 200, JSON.stringify(created.body));
});

test("W5-01-PAGES-02: real routes: Pages' Runtime edge reads up to the 1 MB its routes declare, answers more with 413 and a broken body with 400", async t => {
  const documents = await pagesRoutes(t);
  const large = await documents.raw("", JSON.stringify({ title: "大", padding: " ".repeat(1_000_000) }));
  assert.deepEqual([large.status, large.body], [413, { error: "请求内容过大", code: "actions.input_too_large" }]);
  const broken = await documents.raw("", "{not json");
  assert.deepEqual([broken.status, broken.body.code], [400, "actions.input_invalid"], JSON.stringify(broken.body));
  const created = await documents.post("", { title: "边界" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
});

test("real routes: Form's Runtime edge reads up to the 1 MB its routes declare, answers more with 413 and a broken body with 400", async t => {
  // The Host's Form edge read 1,000,000 bytes; on the Runtime each route declares it (`max_body_bytes`), past the Runtime's 256,000.
  const forms = await formRoutes(t);
  const large = await forms.raw("", JSON.stringify({ title: "大", padding: " ".repeat(1_000_000) }));
  assert.deepEqual([large.status, large.body], [413, { error: "请求内容过大", code: "actions.input_too_large" }]);
  const broken = await forms.raw("", "{not json");
  assert.deepEqual([broken.status, broken.body.code], [400, "actions.input_invalid"], JSON.stringify(broken.body));
  // Between the two limits a request still comes in: an answer file of 300,000 characters, which the action takes up to 400,000.
  const created = await forms.post("", { title: "导入" });
  const form = (created.body as { form: { id: string; version: number } }).form;
  const imported = await forms.raw(`/${form.id}/answers`, JSON.stringify({ files: [{ name: "big.molis-answer.json", content: " ".repeat(300_000) }] }));
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal((imported.body as { rejected: unknown[] }).rejected.length, 1, "read and judged by Form, not refused at the edge");
});

test("real routes: Dataset's Runtime edge reads up to the 1 MB its routes declare, answers more with 413 and a broken body with 400", async t => {
  const datasets = await datasetRoutes(t);
  const large = await datasets.raw("", JSON.stringify({ title: "大", padding: " ".repeat(1_000_000) }));
  assert.deepEqual([large.status, large.body], [413, { error: "请求内容过大", code: "actions.input_too_large" }]);
  const broken = await datasets.raw("", "{not json");
  assert.deepEqual([broken.status, broken.body.code], [400, "actions.input_invalid"], JSON.stringify(broken.body));
  // Between the Runtime's 256,000 default and the route's 1,000,000, a CSV still comes in (the action takes 2,000,000 characters).
  const created = await datasets.post("", { title: "导入" });
  const table = (created.body as { dataset: { id: string; version: number } }).dataset;
  const imported = await datasets.raw(`/${table.id}/import-csv`, JSON.stringify({ csv: "名称\n" + "a".repeat(300_000), expected_version: table.version }));
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
});

test("MCP action port: a Pages failure comes out as its own code and message, not as the generic 能力执行失败", async t => {
  // merge-base: PagesError was not an ActionError, so the port (apps/mcp action-tools.ts, which tells an ActionError's code and message and nothing else) answered
  // { code: "actions.execution_failed", message: "能力执行失败" } for every Pages failure; Form's `refusal()` wrapper existed to get one failure across it.
  const home = await mkdtemp(join(tmpdir(), "document-error-model-mcp-"));
  const store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: "a" }, definitions: pagesManifest.actions!,
    handlers: [...createPagesActionHandlers({ ...ownPagesStores(run => run(store)), prepareImport: async () => { throw new Error("Import is not used by this fixture"); },
      modelAvailability: () => ({ available: false, code: "actions.connection_required", reason: "请先配置文字模型" }) }),
      ...createPagesContentHandlers(bindActionClient(service, () => ({ actor_id: "mcp-client", project_id: "a", audience: "mcp", permissions: PAGES_ACTION_PERMISSIONS })))] });
  const caller = (): ActionCallContext => ({ actor_id: "mcp-client", project_id: "a", audience: "mcp", permissions: PAGES_ACTION_PERMISSIONS });
  const ports = createActionMcpPorts({ service, context: caller, serverInfo: { name: "pages-edge", version: "1" } });
  const call = async (action: ActionDefinition<never, unknown>, args: Record<string, unknown>) => {
    const reply = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(action), arguments: args } }, ports);
    const result = reply!.result as { isError: boolean; content: Array<{ text: string }> };
    return { isError: result.isError, ...(result.isError ? JSON.parse(result.content[0]!.text) as { code: string; error: string } : {}) };
  };
  assert.deepEqual(await call(pagesActions.get, { id: "no-such-document" }), { isError: true, code: "pages.not_found", error: "找不到这篇文档" });
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

// Only modules exclusively reached from the declared browser build can have browser-local Errors.
// Every other source remains checked, including orphan modules and anything also imported by server code.
function browserOnlyFiles(sources: ReadonlyMap<string, string>, browserEntries: readonly string[], serverEntries: readonly string[]): Set<string> {
  const reach = (entries: readonly string[]) => {
    const found = new Set<string>();
    const visit = (file: string): void => {
      if (found.has(file) || !sources.has(file)) return;
      found.add(file);
      for (const imported of parseImports(file, sources.get(file)!, { deep: true })) {
        if (imported.typeOnly || !imported.spec.startsWith(".")) continue;
        const target = join(dirname(file), imported.spec), base = target.replace(/\.m?js$/u, "");
        const resolved = [target, `${base}.ts`, `${base}.mts`, `${target}/index.ts`].find(candidate => sources.has(candidate));
        if (resolved) visit(resolved);
      }
    };
    entries.forEach(visit); return found;
  };
  const browser = reach(browserEntries);
  const server = reach([...serverEntries, ...[...sources.keys()].filter(file => !browser.has(file))]);
  return new Set([...browser].filter(file => !server.has(file)));
}
// A plugin's browser bundle is type-checked by its own tsconfig: Pages' editor (tsconfig.editor.json), Forms' page (tsconfig.browser.json, W4-04).
function browserEntriesFor(owner: Owner): string[] {
  return ["tsconfig.editor.json", "tsconfig.browser.json"].flatMap((name) => {
    const path = join(REPOSITORY, "plugins", "native", owner, name);
    if (!existsSync(path)) return [];
    const config = ts.readConfigFile(path, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path));
    assert.deepEqual(parsed.errors, []);
    return parsed.fileNames;
  });
}

test("the owner-error check excludes browser-only modules but keeps shared, dynamic server imports and orphan modules", () => {
  const sources = new Map([
    ["/src/browser.ts", 'import "./client.js"; import "./shared.js";'],
    ["/src/client.ts", 'throw new Error("browser");'],
    ["/src/shared.ts", 'throw new Error("shared server");'],
    ["/src/server.ts", 'async function load() { await import("./shared.js"); }'],
    ["/src/orphan.ts", 'throw new Error("orphan server");'],
  ]);
  assert.deepEqual([...browserOnlyFiles(sources, ["/src/browser.ts"], ["/src/server.ts"])].sort(), ["/src/browser.ts", "/src/client.ts"]);
  sources.set("/src/server.ts", 'export { default } from "./client.js"; require("./shared.js");');
  assert.deepEqual([...browserOnlyFiles(sources, ["/src/browser.ts"], ["/src/server.ts"])], ["/src/browser.ts"]);
  sources.set("/src/server.ts", 'import type { Shape } from "./client.js"; import shared = require("./shared.js");');
  assert.deepEqual([...browserOnlyFiles(sources, ["/src/browser.ts"], ["/src/server.ts"])].sort(), ["/src/browser.ts", "/src/client.ts"]);
  sources.set("/src/server.ts", 'import "./client";');
  assert.deepEqual([...browserOnlyFiles(sources, ["/src/browser.ts"], ["/src/server.ts"])].sort(), ["/src/browser.ts", "/src/shared.ts"]);
  assert.deepEqual([...browserOnlyFiles(sources, [...sources.keys()], ["/src/server.ts"])].includes("/src/client.ts"), false);
  assert.deepEqual([...browserOnlyFiles(sources, [], ["/src/server.ts"])], []);
});

// Inline browser script bodies are data; their interpolations still run on the server. In server modules, only the two
// programming mistakes below may use bare Errors (missing Host wiring or a UI surface); a request cannot cause them.
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

test("the owner-error check keeps shared browser modules covered when a server export or Host binding consumes them", () => {
  const sources = new Map([
    ["/p/src/browser.ts", 'import "./only-browser.js"; import "./shared.js";'],
    ["/p/src/only-browser.ts", 'throw new Error("browser input");'],
    ["/p/src/shared.ts", 'throw new Error("server input");'],
    ["/p/src/server.ts", 'export * from "./shared.js";'],
  ]);
  const modules = browserOnlyFiles(sources, ["/p/src/browser.ts"], ["/p/src/server.ts"]);
  assert.equal(modules.has("/p/src/only-browser.ts"), true);
  assert.equal(modules.has("/p/src/shared.ts"), false, "a transitive server export keeps the same browser module covered");
  assert.deepEqual(bareServerErrors(sources.get("/p/src/shared.ts")!), ['"server input"']);
  sources.set("/p/host.ts", 'import "./src/only-browser.js";');
  assert.equal(browserOnlyFiles(sources, ["/p/src/browser.ts"], ["/p/src/server.ts"]).has("/p/src/only-browser.ts"), false, "a Host import brings a browser module under the server check");
});

// Browser HTTP failures may retain the response status. Domain codes still come from declarations.
// Unknown/spread augmentation remains rejected; this does not attempt interprocedural alias analysis.
function augmentedErrors(source: string, browser: boolean): string[] {
  const file = ts.createSourceFile("plugin.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors: string[] = [];
  const unwrap = (value: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isNonNullExpression(value)) value = value.expression;
    return value;
  };
  const assign = (node: ts.Node): node is ts.CallExpression => ts.isCallExpression(node)
    && ((ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "Object" && node.expression.name.text === "assign")
      || (ts.isElementAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "Object" && ts.isStringLiteralLike(node.expression.argumentExpression)
        && node.expression.argumentExpression.text === "assign"));
  const errorTarget = (value: ts.Expression): boolean => {
    const node = unwrap(value);
    return (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Error")
      || (assign(node) && !!node.arguments[0] && errorTarget(node.arguments[0]));
  };
  const onlyStatus = (value: ts.Expression): boolean => {
    const node = unwrap(value);
    return ts.isObjectLiteralExpression(node) && node.properties.length > 0 && node.properties.every(property => {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
      const name = property.name;
      return (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === "status";
    });
  };
  const visit = (node: ts.Node): void => {
    if (assign(node) && node.arguments[0] && errorTarget(node.arguments[0])
      && !(browser && node.arguments.length > 1 && node.arguments.slice(1).every(onlyStatus))) errors.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return errors;
}


test("the owner-error check allows only browser HTTP status while rejecting Error code augmentation", () => {
  for (const source of [
    'Object.assign(new Error("bad"), { code: "pages.bad" });',
    'Object.assign(\n new Error("bad"),\n { code: "pages.bad" }\n);',
    'Object.assign(new Error("bad"), {status:500}, {code:"pages.bad"});',
    'Object.assign(new Error("bad"), {code:"pages.bad"}, {status:500});',
    'Object.assign(Object.assign(new Error("bad"), {status:500}), {code:"pages.bad"});',
    'Object["assign"]((new Error("bad")), {["code"]:"pages.bad"});',
    'Object.assign(new Error("bad"), {code});',
    'Object.assign(new Error("bad"), details);',
    'Object.assign(new Error("bad"), {...details, status:500});',
  ]) assert.ok(augmentedErrors(source, true).length, source);
  const http = 'Object.assign(new Error("HTTP"), {status: response.status});';
  for (const source of [http, 'Object.assign(\nnew Error("HTTP"),\n{"status":response.status}\n);',
    'Object.assign(new Error("HTTP"), {status:400}, {status:500});', 'Object.assign(new Error("HTTP"), {status});',
    '// Object.assign(new Error("not code"), {code:"pages.bad"})']) assert.deepEqual(augmentedErrors(source, true), []);
  assert.ok(augmentedErrors(http, false).length, "server code does not get the browser allowance");
  assert.deepEqual(bareServerErrors(http), ['"HTTP"']);
  const source = 'export const TEST_CLIENT_SCRIPT = `(host) => { Object.assign(new Error("bad"), {code:"pages.bad"}); }`;';
  const inline = browserPrograms({ files: ["client.ts"], read: () => source }, () => true);
  assert.deepEqual(inline.problems, []);
  assert.ok(inline.programs.some(program => augmentedErrors(program.text, true).length), "browser script data is checked as executed program text");
});

test("no document plugin keeps an error class, a route-error mapper, or a raise of its own code outside its declarations", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const module = await import(spec.pkg) as Record<string, unknown>;
    for (const name of spec.removed) assert.equal(name in module, false, `${spec.pkg} no longer exports ${name}`);
    const sources = new Map(filesOf(owner).map(file => [file, readFileSync(file, "utf8")]));
    const browserOnly = browserOnlyFiles(sources, browserEntriesFor(owner), [join(REPOSITORY, "plugins", "native", owner, "src", "index.ts")]);
    const manifest = join(REPOSITORY, "plugins", "native", owner, "package.json");
    const programSources = new Map([...sources, [manifest, readFileSync(manifest, "utf8")]]);
    const programs = browserPrograms({ files: [...programSources.keys()], read: file => programSources.get(file) ?? null }, file => /\.(ts|mts)$/u.test(file));
    assert.deepEqual(programs.problems, [], `${owner}: browser programs must be statically inspectable`);
    for (const program of programs.programs) assert.deepEqual(augmentedErrors(program.text, true), [], `${program.where}: Error augmentation outside browser HTTP status`);
    for (const [file, source] of sources) {
      const where = relative(REPOSITORY, file);
      assert.doesNotMatch(source, /\bclass\s+\w+\s+extends\s+Error\b/u, `${where}: an error class`);
      assert.doesNotMatch(source, /\bmapError\b|RouteErrorResponse/u, `${where}: a route-error mapper`);
      assert.doesNotMatch(source, new RegExp(String.raw`new\s+\w*Error\(\s*"${owner}\.[a-z_]+"`, "u"), `${where}: ${owner}.* raised without the declaration (it would answer 400 whatever its kind)`);
      assert.deepEqual(augmentedErrors(source, browserOnly.has(file)), [], `${where}: Error augmentation outside browser HTTP status`);
      // Browser-only modules run in the editor bundle; template interpolations and shared modules still execute on the server.
      const bare = browserOnly.has(file) ? [] : bareServerErrors(source);
      assert.deepEqual(bare, [], `${where}: a bare new Error( is a caller-visible 500; raise ${spec.declarations}.<reason>(...) (or a platform code) instead`);
    }
  }
});

test("a declared code is used: every reason in a declaration has a raise site", async () => {
  for (const owner of OWNERS) {
    const spec = SPECS[owner];
    const sources = filesOf(owner).map(file => readFileSync(file, "utf8")).join("\n");
    for (const reason of Object.keys(spec.status)) {
      assert.ok(new RegExp(String.raw`\b${spec.declarations}\.${reason}\(`, "u").test(sources), `${spec.declarations}.${reason} is raised somewhere; a code nobody raises is not declared`);
    }
  }
});
