import assert from "node:assert/strict";
import test from "node:test";

import type { ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  HOME_PAGE_CONTENT_TYPE, homePageActions, type HomePageApprovalReceipt, type HomePageDraft, type HomePageDraftAdoptionResult,
  type HomePageFile, type HomePageReadInput, type HomePageReadResult, type HomePageVersion,
} from "@molis-ai/molis-work-contracts/services/home";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";
import { inspectHomePageDraft } from "@molis-ai/molis-work-plugin-sdk";

const action = { capability_id: "notes.list", version: 1, provider_id: "system.connectors#mcp:notes" };
const html = { path: "index.html", media_type: "text/html", text: "<h1>Weekly review</h1>" } satisfies HomePageFile;
const js = { path: "assets/review.js", media_type: "text/javascript", text: "document.title = 'Review';" } satisfies HomePageFile;
const draft: HomePageDraft = { title: "Weekly review", entry: html.path, files: [html, js], actions: [action] };
const page = { page_id: "weekly-home", version: 2 };
const savedVersion: HomePageVersion = {
  ...page, title: draft.title, entry: draft.entry, actions: draft.actions, author: "assistant", based_on: 1,
  created_at: "2026-11-09T00:00:00Z",
  files: draft.files.map(({ path, media_type, text }) => ({ path, media_type, bytes: Buffer.byteLength(text), sha256: "a".repeat(64) })),
};
const adoption: HomePageDraftAdoptionResult = { outcome: "created", subject: { kind: "home-page", id: page.page_id }, revision: page.version, version: savedVersion };
const approval: HomePageApprovalReceipt<"adopt"> = {
  operation: "adopt", request_id: "approve-week-home", selection: { kind: "page", ...page }, revision: "home-12",
  approval: { page, approved_actions: [action], approved_at: "2026-11-09T01:00:00Z" },
};

function reject(schema: ActionSchema, ...values: unknown[]): void {
  for (const value of values) assert.throws(() => assertActionInput(schema, value), { code: "actions.input_invalid" }, JSON.stringify(value));
}

function result(definition: ActionDefinition): ReturnType<typeof compileActionSchema> {
  assert.ok(definition.action.output_schema);
  return compileActionSchema(definition.action.output_schema);
}

test("SPC-C06: save separates new drafts, observed versions, and a closed content adoption", () => {
  const { saveDraft } = homePageActions;
  const schema = saveDraft.action.input_schema;
  const adopt = { request_id: "adopt-scene:home", blueprint: { source: { kind: "draft", draft_id: "scene", revision: 2 }, part_id: "home" },
    selection: { kind: "create" }, body: draft };
  assert.equal(HOME_PAGE_CONTENT_TYPE, "molis.home-page.v1");
  assert.deepEqual(saveDraft.action.audiences, ["user", "agent"]);
  assertActionInput(schema, { draft });
  assertActionInput(schema, { draft, page_id: page.page_id, expected_version: 1, based_on: 1 });
  assertActionInput(schema, adopt);
  reject(schema,
    { draft, page_id: page.page_id },
    { draft, page_id: page.page_id, expected_version: Number.MAX_SAFE_INTEGER + 1 },
    { draft, based_on: 1 },
    { draft: { ...draft, author: "person" } },
    { ...adopt, draft },
    { ...adopt, selection: { kind: "update", subject: adoption.subject } },
    { ...adopt, blueprint: { ...adopt.blueprint, install_id: "forged" } },
    { ...adopt, actor_id: "someone-else" },
  );
  const validate = result(saveDraft);
  assert.equal(validate({ version: savedVersion }), true);
  assert.equal(validate(adoption), true);
  assert.equal(validate({ ...adoption, approval: approval.approval }), false);
});

test("SPC-C06/C07: readback separates draft adoption, approval and current selection", () => {
  const { read } = homePageActions;
  const current = { selection: { kind: "basic" }, revision: "home-13" } as const;
  const input: HomePageReadInput = { queries: [
    { by: "request", operation: "adopt", request_id: "adopt-scene:home" },
    { by: "approval_request", operation: "adopt", request_id: approval.request_id },
    { by: "approval_request", operation: "restore", request_id: "new-restore" },
  ] };
  assertActionInput(read.action.input_schema, {});
  assertActionInput(read.action.input_schema, input);
  reject(read.action.input_schema,
    { queries: [{ by: "approval_request", operation: "revert", request_id: "wrong" }] },
    { queries: [{ by: "approval_request", operation: "adopt" }] },
    { queries: [{ by: "approval_request", operation: "adopt", request_id: approval.request_id, project_id: "forged" }] },
  );
  const output: HomePageReadResult = { results: [
    { kind: "receipt", operation: "adopt", request_id: "adopt-scene:home", receipt: adoption, current: { state: "missing" } },
    { kind: "receipt", receipt: approval, current },
    { kind: "missing", current },
  ] };
  const validate = result(read);
  assert.equal(validate(output), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...current, versions: [{ ...savedVersion, approval: approval.approval }] }), true);
  assert.equal(validate({ ...current, versions: [{ ...savedVersion, approval: null, files: draft.files }] }), false);
  assert.equal(validate({ results: [{ kind: "receipt", receipt: { ...approval, request_id: "" }, current }] }), false);
  assert.equal(validate({ results: [{ kind: "missing", receipt: approval, current }] }), false);
});

test("SPC-C06: approvals and returning to Basic require the original observation and request key", () => {
  const { adopt, restore, select } = homePageActions;
  const input = { ...page, approved_actions: [action], request_id: approval.request_id, expected_revision: "home-11" };
  for (const [definition, operation] of [[adopt, "adopt"], [restore, "restore"]] as const) {
    assert.deepEqual(definition.action.audiences, ["user"]);
    assertActionInput(definition.action.input_schema, input);
    reject(definition.action.input_schema,
      { ...input, expected_revision: null },
      { ...input, request_id: "" },
      { ...input, approved_actions: [{ capability_id: action.capability_id, version: action.version }] },
      { ...input, actor_id: "someone-else" },
      { ...input, page_subject: "home-page:other-project/page@2" },
    );
    assert.equal(result(definition)({ ...approval, operation }), true);
    assert.equal(result(definition)({ ...approval, operation: operation === "adopt" ? "restore" : "adopt" }), false);
  }
  assertActionInput(select.action.input_schema, { kind: "basic", request_id: "basic-week-home", expected_revision: approval.revision });
  reject(select.action.input_schema, { kind: "basic", request_id: "basic-week-home" }, { ...input, kind: "page" });
  assert.equal(result(select)({ selection: { kind: "basic" }, revision: "home-13", approval: null }), true);
});

test("SPC-C06: file reads, preview and diff use exact versions and closed results", () => {
  const { preview, readFiles, diff } = homePageActions;
  assert.deepEqual(preview.action.audiences, ["user"]);
  assert.deepEqual(readFiles.action.audiences, ["user"]);
  assertActionInput(preview.action.input_schema, page);
  assertActionInput(readFiles.action.input_schema, page);
  reject(readFiles.action.input_schema, { page_id: page.page_id }, { ...page, plugin_install_id: "forged" });
  assert.equal(result(preview)({ page, page_session_id: "session-not-page" }), true);
  assert.equal(result(preview)({ page }), false);
  const files = { version: savedVersion, files: draft.files };
  const validateFiles = result(readFiles);
  assert.equal(validateFiles(files), true);
  assert.equal(validateFiles({ ...files, version: { ...savedVersion, files: [{ ...savedVersion.files[0], sha256: "A".repeat(64) }] } }), false);
  const compare = { page_id: page.page_id, from_version: 1, to_version: page.version };
  assertActionInput(diff.action.input_schema, compare);
  const change = { path: js.path, kind: "added" };
  const diffResult = { ...compare, files: [change], entry: { before: html.path, after: html.path }, actions: { added: [action], removed: [] } };
  assert.equal(result(diff)(diffResult), true);
  assert.equal(result(diff)({ ...diffResult, files: [{ ...change, text: js.text }] }), false);
});

test("SPC-C06: SDK inspects relative file paths, HTML entry, media types and exact references", () => {
  assert.deepEqual(inspectHomePageDraft(draft), []);
  for (const path of ["../index.html", "/index.html", "C:/index.html", "a\\index.html", "a/./index.html", "a//index.html"]) {
    assert.equal(inspectHomePageDraft({ ...draft, files: [{ ...html, path }, js] })[0]?.path, "$.files[0].path");
  }
  assert.equal(inspectHomePageDraft({ ...draft, files: [html, { ...js, path: html.path }] })[0]?.path, "$.files[1].path");
  assert.equal(inspectHomePageDraft({ ...draft, entry: js.path })[0]?.path, "$.entry");
  assert.equal(inspectHomePageDraft({ ...draft, entry: "other.html" })[0]?.path, "$.entry");
  assert.equal(inspectHomePageDraft({ ...draft, files: [{ ...html, media_type: "application/json" }] })[0]?.path, "$.files[0].media_type");
  assert.equal(inspectHomePageDraft({ ...draft, actions: [{ capability_id: action.capability_id, version: 1 }] })[0]?.path, "$.actions[0]");
  assert.equal(inspectHomePageDraft({ ...draft, actions: [action, action] })[0]?.path, "$.actions");
});

test("SPC-C06: draft budgets count actual UTF-8 bytes and the number of files", () => {
  const max = "😀".repeat(262_144);
  const oneMiB = { ...html, text: max };
  assert.deepEqual(inspectHomePageDraft({ ...draft, files: [oneMiB] }), []);
  assert.equal(inspectHomePageDraft({ ...draft, files: [{ ...oneMiB, text: max + "界" }] })[0]?.path, "$.files[0].text");
  const atTotal = [oneMiB, ...Array.from({ length: 3 }, (_, index) => ({ ...js, path: `script-${index}.js`, text: max }))];
  assert.deepEqual(inspectHomePageDraft({ ...draft, files: atTotal }), []);
  assert.equal(inspectHomePageDraft({ ...draft, files: [...atTotal, { ...js, text: "é" }] })[0]?.path, "$.files");
  const atCount = [html, ...Array.from({ length: 63 }, (_, index) => ({ ...js, path: `script-${index}.js` }))];
  assert.deepEqual(inspectHomePageDraft({ ...draft, files: atCount }), []);
  assert.equal(inspectHomePageDraft({ ...draft, files: [...atCount, js] })[0]?.path, "$.files");
});
