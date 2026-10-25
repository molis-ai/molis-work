import { serveHomeRuntime, person } from "./fixtures/home-runtime.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { directoryForHome } from "@molis-ai/molis-work-app-local-host";
import { createDatasetActionHandlers, createDatasetContentHandlers, datasetActions, datasetContentActions, datasetManifest, DATASET_ACTION_PERMISSIONS, openDatasetStore, ownDatasetStores } from "@molis-ai/molis-work-plugin-dataset";
import { createFormActionHandlers, formActions, formManifest, FORM_ACTION_PERMISSIONS, formResultsCsv, openFormStore, ownFormStores } from "@molis-ai/molis-work-plugin-form";
import { createPagesActionHandlers, createPagesContentHandlers, pagesActions, pagesContentActions, pagesManifest, PAGES_ACTION_PERMISSIONS, ownPagesStores, type PagesActionPorts } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { createPptActionHandlers, pptActions, pptManifest, PPT_ACTION_PERMISSIONS, openPptStore, ownPptStores } from "@molis-ai/molis-work-plugin-ppt";
import { createCogniaActionHandlers, ownCogniaStores, cogniaActions, cogniaManifest, COGNIA_ACTION_PERMISSIONS, openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";

const paragraph = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

type Completion = (prompt: Parameters<NonNullable<PagesActionPorts["complete"]>>[0], options: Parameters<NonNullable<PagesActionPorts["complete"]>>[1]) => Promise<string>;
async function owners(t: TestContext, completion?: Completion) {
  const home = await mkdtemp(join(tmpdir(), "content-owner-"));
  const pages = openPagesStore(home), forms = openFormStore(home), datasets = openDatasetStore(home), ppt = openPptStore(home);
  t.after(async () => { pages.close(); forms.close(); datasets.close(); ppt.close(); await rm(home, { recursive: true, force: true }); });
  const project = "content-project", service = new ActionService();
  const modelAvailability = () => completion ? { available: true as const } : { available: false as const, code: "actions.connection_required", reason: "No test model" };
  const provider = (manifest: Pick<typeof pagesManifest, "plugin_id" | "name">) => ({ provider_id: manifest.plugin_id, title: manifest.name, kind: "plugin" as const, project_id: project });
  service.registerProvider({ provider: provider(pagesManifest), definitions: pagesManifest.actions!, handlers: [
    ...createPagesActionHandlers({ ...ownPagesStores(run => run(pages)), modelAvailability, ...(completion ? { complete: async (prompt, options) => ({ text: await completion(prompt, options), validateResult: () => {} }) } : {}), prepareImport: async () => { throw new Error("Import is not used by this fixture"); } }),
    ...createPagesContentHandlers(bindActionClient(service, () => caller)),
  ] });
  service.registerProvider({ provider: provider(formManifest), definitions: Object.values(formActions),
    handlers: createFormActionHandlers({ ...ownFormStores(run => run(forms)), modelAvailability }) });
  const datasetStores = ownDatasetStores(run => run(datasets));
  service.registerProvider({ provider: provider(datasetManifest), definitions: datasetManifest.actions!, handlers: [
    ...createDatasetActionHandlers({ ...datasetStores, modelAvailability }), ...createDatasetContentHandlers(datasetStores),
  ] });
  const caller: ActionCallContext = { actor_id: "person", actor_kind: "user", audience: "user", project_id: project,
    permissions: [...new Set([...PAGES_ACTION_PERMISSIONS, ...FORM_ACTION_PERMISSIONS, ...DATASET_ACTION_PERMISSIONS, ...PPT_ACTION_PERMISSIONS])] };
  return { home, project, service, caller, bound: bindActionClient(service, () => caller), pages, forms, datasets, ppt, provider };
}

test("W2-18-DATASET-SCHEMA-01: rejected CSV keeps the nonempty table and its public reads; the exact schema bound works", async t => {
  const f = await owners(t);
  const { dataset } = await f.bound.invoke(datasetActions.create, { title: "Existing" });
  const before = (await f.bound.invoke(datasetActions.import, { id: dataset.id, csv: 'Name,Note\r\nAlice,"first\nsecond, ""quoted"""' })).dataset;
  await assert.rejects(f.bound.invoke(datasetActions.import, { id: dataset.id, csv: "A".repeat(81) + "\nchanged" }), { code: "dataset.invalid" });
  assert.deepEqual((await f.bound.invoke(datasetActions.get, { id: dataset.id })).dataset, before);
  assert.deepEqual((await f.bound.invoke(datasetActions.list, {})).datasets, [before]);
  const header = "A".repeat(80);
  const normal = (await f.bound.invoke(datasetActions.import, { id: dataset.id, csv: header + '\r\n"left\nright, ""quote"""' })).dataset;
  assert.equal(normal.columns[0]!.name, header);
  assert.equal(normal.rows[0]!.cells[normal.columns[0]!.id], 'left\nright, "quote"');
  const unicode = (await f.bound.invoke(datasetActions.import, { id: dataset.id, csv: "🟢".repeat(80) + "\nvalid" })).dataset;
  assert.equal(unicode.columns[0]!.name, "🟢".repeat(80), "maxLength is the public Unicode-character bound");
});

test("W2-18-DATASET-SCHEMA-02: legal large/long-title Forms refuse conversion atomically and keep answers and CSV", async t => {
  const f = await owners(t);
  for (const questions of [[{ id: "long", title: "L".repeat(81) }], Array.from({ length: 40 }, (_, index) => ({ id: `q${index}`, title: `Question ${index + 1}` }))]) {
    const form = f.forms.receive(f.project, "form-" + questions.length, "Original form", questions);
    f.forms.submit(form.id, Object.fromEntries(questions.map(question => [question.id, "kept answer"])), f.project, { source: "preview", requestId: "answers-" + questions.length });
    const answers = f.forms.listSubmissions(form.id, f.project), csv = formResultsCsv(form, answers);
    const file = join(f.home, `answers-${questions.length}.csv`); await writeFile(file, csv);
    const before = f.datasets.list(f.project);
    const input = { title: "Responses", body: csv, source: "Form", feed_item_id: null, request_id: `workflow:instance-${questions.length}:0` };
    await assert.rejects(f.bound.invoke(datasetContentActions.receive, input), { code: "dataset.invalid" });
    assert.deepEqual(f.datasets.list(f.project), before);
    assert.deepEqual(f.forms.listSubmissions(form.id, f.project), answers);
    assert.equal(await readFile(file, "utf8"), csv);
    // The same request id remains usable (W4-6-02): a refusal left neither a table nor a receipt behind.
    const received = await f.bound.invoke(datasetContentActions.receive, { ...input, body: "Name,Answer\nAlice,usable" });
    const table = f.datasets.get(received.item_id, f.project);
    assert.deepEqual(table.columns.map(column => column.name), ["Name", "Answer"]);
    assert.deepEqual(Object.values(table.rows[0]!.cells), ["Alice", "usable"]);
  }
});

test("W2-18-FORM-ANSWER-01: the owner keeps the 4000 bound and checks required answers for every declared id", async t => {
  const f = await owners(t);
  const { form } = await f.bound.invoke(formActions.create, { title: "Answer boundary" });
  const configured = (await f.bound.invoke(formActions.update, { id: form.id, questions: [{ id: "constructor", title: "Required text", required: true }] })).form;
  await assert.rejects(f.bound.invoke(formActions.submit, { id: configured.id, answers: {}, source: "preview", request_id: "missing" }), { code: "form.invalid" });
  await assert.rejects(f.bound.invoke(formActions.submit, { id: configured.id, answers: { constructor: "x".repeat(4001) }, source: "preview", request_id: "oversized" }), { code: "actions.input_invalid" });
  assert.equal(f.forms.listSubmissions(form.id, f.project).length, 0);
  await f.bound.invoke(formActions.submit, { id: configured.id, answers: { constructor: "x".repeat(4000) }, source: "preview", request_id: "valid" });
  await f.bound.invoke(formActions.submit, { id: configured.id, answers: { constructor: "x".repeat(4000) }, source: "preview", request_id: "valid" });
  assert.equal(f.forms.listSubmissions(form.id, f.project).length, 1);
  assert.equal(f.forms.listSubmissions(form.id, f.project)[0]!.answers.constructor, "x".repeat(4000));
});

test("W2-18-PAGES-EXPORT-01: the public content consumer receives every cell paragraph and card/mention fact", async t => {
  const f = await owners(t);
  const rich = { type: "doc" as const, content: [
    { type: "table", content: [{ type: "table_row", content: [{ type: "table_cell", content: [paragraph("First cell paragraph").content[0], paragraph("Second cell paragraph").content[0]] }] }] },
    { type: "task_card", attrs: { title: "Call Alice", description: 'Keep "quoted" detail', status: "doing", due: "2026-11-03" } },
    { type: "event_card", attrs: { title: "Launch meeting", at: "2026-11-05" } },
    { type: "page_ref", attrs: { title: "Source page", page_id: "source" } },
    { type: "paragraph", content: [{ type: "page_mention", attrs: { title: "Another page", page_id: "another" } }] },
  ] };
  const { document } = await f.bound.invoke(pagesActions.create, { title: "Rich source", body: rich });
  const result = await f.bound.invoke(pagesContentActions.read, { item_id: document.id });
  for (const fact of ["First cell paragraph", "Second cell paragraph", "Call Alice", 'Keep "quoted" detail', "进行中", "2026-11-03", "Launch meeting", "2026-11-05", "Source page", "Another page"]) assert.ok(result.body.includes(fact), fact);
  assert.match(result.body, /First cell paragraph<br>Second cell paragraph/);
});

test("W2-18-PAGES-SOURCES-01: prepared clipped snapshots generate once, disclose their boundary and link real Pages", async t => {
  let prompt = "", calls = 0;
  const f = await owners(t, async (input, control) => { await control.beforeDispatch?.(); prompt = JSON.stringify(input); calls++; return "# Combined\nOnly adopted evidence."; });
  const a = f.pages.create({ project_id: f.project, title: "A".repeat(80), body: paragraph("Prefix A " + "a".repeat(1700) + " OMITTED_A") });
  const b = f.pages.create({ project_id: f.project, title: "B".repeat(80), body: paragraph("Prefix B " + "b".repeat(1700) + " OMITTED_B") });
  const snapshots = [a, b];
  const prepared = await f.bound.invoke(pagesActions.fragmentOffers, { request_id: "confirmed-sources", fragment: {
    object: { kind: "pages_document", id: a.id, version: a.version, title: a.title }, granularity: "objects",
    targets: snapshots.map((record, index) => ({ kind: "object" as const, role: "object", ref: { kind: "pages_document", id: record.id, version: record.version, title: record.title },
      text: (index ? "Prefix B " + "b".repeat(1700) : "Prefix A " + "a".repeat(1700)).slice(0, 1500), truncated: true })),
  } });
  const offer = prepared.offers.find(item => item.offer_id === "synthesize")!;
  assert.ok(offer);
  await f.service.invoke(f.caller, offer.action, offer.input);
  await f.service.invoke(f.caller, offer.action, offer.input);
  assert.equal(calls, 1);
  assert.match(JSON.parse(prompt).data, /"truncated":true/); assert.doesNotMatch(prompt, /OMITTED_A|OMITTED_B/);
  const generated = f.pages.list(f.project).find(record => record.id !== a.id && record.id !== b.id)!;
  const text = (await f.bound.invoke(pagesContentActions.read, { item_id: generated.id })).body;
  assert.match(text, /已截断的节选，并非完整原文/);
  for (const source of snapshots) assert.ok(text.includes(`openPlugin=pages&openItem=${source.id}`));
  assert.doesNotMatch(text, /inbox_entry=pages/);
  assert.deepEqual(f.pages.get(a.id, f.project), a); assert.deepEqual(f.pages.get(b.id, f.project), b);
});

test("W2-18-COGNIA-EFFECT-01: only the originating grant is revoked during real IO; no staged preview is written", async t => {
  const home = await mkdtemp(join(tmpdir(), "cognia-origin-"));
  const store = openCogniaStore(home), db = openHomeSqliteDatabase(home, "cognia"), service = new ActionService();
  t.after(async () => { db.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const entered = deferred(), release = deferred(), grants = new Set(Object.values(cogniaActions).map(action => action.capability_id));
  const check = (reference?: { capability_id: string }) => { if (reference && !grants.has(reference.capability_id)) throw new ActionError("actions.forbidden", "Origin grant revoked"); };
  const caller: ActionCallContext = { actor_id: "knowledge-owner", actor_kind: "user", audience: "user", permissions: COGNIA_ACTION_PERMISSIONS,
    validate_authority: check, assert_authority_current: check };
  const vault = join(home, "vault"); await mkdir(vault);
  await writeFile(join(vault, "vault.md"), "# Fixed evidence\nActual bytes read before the barrier.");
  const runtime = await serveHomeRuntime(t); await runtime.host.homePlugins!.ready();
  const reader = person(["cognia:read", "cognia:write", "directory:read"]);
  const grant = await directoryForHome(runtime.home).select({plugin_id: cogniaManifest.plugin_id, project_id: null, actor_id: reader.actor_id}, async () => ({status: "picked", path: vault}));
  assert.ok(grant);
  let scans = 0;
  service.registerProvider({ provider: { provider_id: cogniaManifest.plugin_id, title: "Cognia", kind: "plugin" }, definitions: cogniaManifest.actions!, handlers: createCogniaActionHandlers({
    ...ownCogniaStores(run => run(store)), model: () => ({}), ai: () => ({}), actions: bindActionClient(service, () => caller),
    scan: async (grantId, path, signal) => { scans++; const scanned = await runtime.host.homeActionClient().invoke({...reader, signal}, cogniaActions.scan, {grant_id: grantId, path}); entered.resolve(); await release.promise; return scanned; },
  }) });
  const counts = () => ["cognia_previews", "cognia_materials", "cognia_sources"].map(table => Number(db.prepare(`SELECT count(*) AS total FROM ${table}`).get()!.total));
  const before = counts(), bound = bindActionClient(service, () => caller);
  const input = { grant_id: grant.grant_id, path: ".", kind: "markdown" as const };
  const external = bindActionClient(service, () => ({ ...caller, actor_id: "external-client", actor_kind: null, audience: "mcp" as const }));
  await assert.rejects(external.invoke(cogniaActions.previewDirectory, input), { code: "actions.forbidden" });
  await assert.rejects(external.invoke(cogniaActions.scan, { grant_id: grant.grant_id, path: "." }), { code: "actions.forbidden" });
  assert.equal(scans, 0, "MCP cannot enter directory IO even with a person's valid directory grant");
  assert.deepEqual(counts(), before);
  const pending = bound.invoke(cogniaActions.previewDirectory, input);
  await entered.promise; grants.delete(cogniaActions.previewDirectory.capability_id); release.resolve();
  await assert.rejects(pending, { code: "actions.forbidden" }); assert.deepEqual(counts(), before);
  assert.equal(scans, 1); assert.ok(grants.has(cogniaActions.scan.capability_id), "only the originating preview grant was revoked");
  grants.add(cogniaActions.previewDirectory.capability_id);
  const preview = await bound.invoke(cogniaActions.previewDirectory, input);
  await bound.invoke(cogniaActions.commit, { preview_id: preview.preview.id });
  assert.equal(scans, 2);
  assert.equal(store.materials().length, 1); assert.match(store.materials()[0]!.body, /Actual bytes read before the barrier/);
});

for (const refusal of ["revoke", "cancel", "disable", "edit"] as const) test(`W2-18-PPT-01: local Pages outline preserves the original deck on ${refusal} during source reading`, async t => {
  const f = await owners(t), entered = deferred(), release = deferred(), controller = new AbortController();
  let revoked = false;
  const check = (reference?: { capability_id: string }) => { if (revoked && reference?.capability_id === pptActions.outline.capability_id) throw new ActionError("mcp.permission_revoked", "Origin revoked"); };
  const context: ActionCallContext = { ...f.caller, signal: controller.signal, validate_authority: check, assert_authority_current: check };
  const stop = f.service.registerProvider({ provider: f.provider(pptManifest), definitions: Object.values(pptActions), handlers: createPptActionHandlers({
    ...ownPptStores(run => run(f.ppt)), readPage: async (id, caller) => {
      const page = await bindActionClient(f.service, () => caller).invoke(pagesContentActions.read, { item_id: id });
      entered.resolve(); await release.promise; return { title: page.title, body: page.body };
    },
  }) });
  const source = f.pages.create({ project_id: f.project, title: "Source", body: paragraph("## Generated slide\n- exact bullet") });
  const original = f.ppt.create({ project_id: f.project, title: "Original" });
  const pending = bindActionClient(f.service, () => context).invoke(pptActions.outline, { id: original.id, page_id: source.id });
  await entered.promise;
  const expected = refusal === "edit" ? f.ppt.update(original.id, { description: "External draft", expected_version: original.version }, f.project) : original;
  if (refusal === "revoke") revoked = true;
  if (refusal === "cancel") controller.abort();
  if (refusal === "disable") stop();
  release.resolve(); await assert.rejects(pending);
  assert.deepEqual(f.ppt.get(original.id, f.project), expected);
  assert.deepEqual(f.pages.get(source.id, f.project), source);
});

test("W2-18-PPT-03: title-only slides survive append; a genuinely empty starter and explicit replace still work", async t => {
  const f = await owners(t);
  f.service.registerProvider({ provider: f.provider(pptManifest), definitions: Object.values(pptActions), handlers: createPptActionHandlers({ ...ownPptStores(run => run(f.ppt)) }) });
  const created = f.ppt.create({ title: "Deck", project_id: f.project });
  const titled = f.ppt.update(created.id, { slides: [{ id: created.slides[0]!.id, title: "Original heading", bullets: [], notes: "" }] }, f.project);
  const appended = await f.bound.invoke(pptActions.outline, { id: titled.id, text: "## Added\n- bullet", replace: false });
  assert.equal(appended.presentation.slides[0]!.id, titled.slides[0]!.id);
  assert.equal(appended.presentation.slides[0]!.title, "Original heading"); assert.equal(appended.presentation.slides.length, 2);
  const replaced = await f.bound.invoke(pptActions.outline, { id: titled.id, text: "## Replacement\n- one", replace: true });
  assert.deepEqual(replaced.presentation.slides.map(slide => slide.title), ["Replacement"]);
  const empty = f.ppt.create({ title: "Empty", project_id: f.project });
  const filled = await f.bound.invoke(pptActions.outline, { id: empty.id, text: "## First\n- one", replace: false });
  assert.equal(filled.presentation.slides.length, 1); assert.equal(filled.presentation.slides[0]!.title, "First");
});
