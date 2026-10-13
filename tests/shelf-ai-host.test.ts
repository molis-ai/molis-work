import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { shelfActions as a, SHELF_ACTIONS, SHELF_ACTION_PERMISSIONS, SHELF_PLUGIN_ID, SHELF_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-shelf";
import { createExtractablePdf, openShelfStore, SHELF_RECIPES } from "@molis-ai/molis-work-module-shelf";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { agentDefinitionsFor } from "../apps/local-host/src/agent-definitions/agent-definitions.js";
import { shelfAiPorts } from "../apps/local-host/src/shelf-ai.js";
import { extractMaterial } from "../apps/local-host/src/material-extraction.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-registrations.js";

type Request = { model: string; messages: any[] };
async function fixture(run: (f: {
  home: string; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
  host: MolisWorkLocalHost; actions: ReturnType<typeof bindActionClient>;
  requests: Request[]; answer(handler: (request: Request) => string | Promise<string>): void;
}) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "shelf-ai-host-")), old = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  let handler = async (_request: Request): Promise<string> => "# 摘要\n\n交付日期：周五。";
  const requests: Request[] = [];
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw); requests.push(request);
    const text = await handler(request);
    if (res.destroyed) return;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ model: "actual-fixture-model", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const connection = withConnectorConnections(home, store => {
    const connection = store.createToken({ serviceId: "model-api", displayName: "Shelf fixture", token: "local-fixture-only" });
    store.assertTarget(connection.connection_id, "model-api", origin); return connection;
  });
  catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "fixture", display_name: "Fixture", api_format: "openai-chat-completions", base_url: origin + "/v1", prompt_cache: "off",
    models: [{ model_id: "text", enabled: true }, { model_id: "vision", enabled: true, vision: true }] });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS }));
  try { await run({ home, catalog, host, actions, requests, answer(next) { handler = async request => next(request); } }); }
  finally {
    await host.close(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    catalog.close(); resetSecretStoreCache(); if (old === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = old;
    await rm(home, { recursive: true, force: true });
  }
}

test("Shelf Action -> registered prompt override -> shared Prologue -> result and truthful receipt", async () => fixture(async f => {
  const definitions = agentDefinitionsFor(f.home, builtinRegistrations);
  const prompt = SHELF_INSTRUCTIONS.find(row => row.prompt_id === "shelf.summarize.short")!;
  const key = `${SHELF_PLUGIN_ID}/${prompt.prompt_id}`;
  const registered = definitions.prompt(key);
  definitions.save(registered.key, "OVERRIDDEN_SHELF: summarize the supplied material.", null, "owner");
  const { item } = await f.actions.invoke(a.admit, { text: "周五交付，预算 12 万元。", title: "计划", capture_pages: false });
  const outcome = await f.actions.invoke(a.generate, { recipe: "summarize", item_id: item.item_id, option_id: "short" });
  assert.equal(outcome.job.runtime, "prologue"); assert.equal(outcome.job.execution?.state, "completed");
  assert.equal(outcome.job.execution?.configuredModel, "text"); assert.deepEqual(outcome.job.execution?.reportedModels, ["actual-fixture-model"]);
  assert.equal(outcome.job.execution?.usage[0]?.input.source, "estimated"); assert.ok(outcome.job.execution!.usage[0]!.input.tokens! > 0);
  assert.equal(outcome.job.execution?.usage[0]?.cost.source, "unknown"); assert.equal(outcome.job.execution?.usage[0]?.cost.amount, undefined);
  const sent = JSON.stringify(f.requests[0]!.messages);
  assert.match(sent, /OVERRIDDEN_SHELF/); assert.match(sent, /周五交付/); assert.doesNotMatch(sent, /把完整结果写成文件|\/shelf\/files/);
  assert.equal(definitions.uses(registered.key).length, 1);
  assert.match(openShelfStore(f.home).readFile(outcome.result!.item_id).bytes.toString(), /周五/);
  const saved = JSON.parse(readFileSync(join(f.home, "shelf", "catalog.json"), "utf8"));
  assert.deepEqual(saved.jobs[0].execution, JSON.parse(JSON.stringify(outcome.job.execution)));
}));

test("every recipe reaches its registered instruction; JSON alone uses JSON files and malformed output retains execution facts", async () => fixture(async f => {
  const { item } = await f.actions.invoke(a.admit, { text: "A source document", title: "source", capture_pages: false });
  const second = (await f.actions.invoke(a.admit, { text: "Another source", title: "second", capture_pages: false })).item;
  for (const spec of SHELF_RECIPES.filter(spec => spec.requires_agent)) for (const choice of spec.choices) {
    const recipe = spec.recipe, option = choice.id;
    f.answer(() => option === "json" ? '```json\n{"amount":120000}\n```' : "# 交付正文\n\n材料来自 source。");
    const out = await f.actions.invoke(a.generate, { recipe, item_ids: recipe === "combine" ? [item.item_id, second.item_id] : [item.item_id], option_id: option });
    assert.equal(out.job.status, "succeeded");
    if (recipe === "extract_structure") {
      assert.equal(out.result?.name.endsWith(option === "json" ? ".json" : ".md"), true);
      if (option === "json") assert.deepEqual(JSON.parse(openShelfStore(f.home).readFile(out.result!.item_id).bytes.toString()), { amount: 120000 });
    }
  }
  await f.actions.invoke(a.saveSettings, { shortcuts: [{ id: "custom", name: "提炼", prompt: "CUSTOM_USER_TASK", kinds: ["markdown", "text"] }] });
  await f.actions.invoke(a.generate, { recipe: "shortcut", item_id: item.item_id, shortcut_id: "custom" });
  const messages = f.requests.at(-1)!.messages;
  assert.ok(messages.some(message => message.role === "user" && JSON.stringify(message.content).includes("CUSTOM_USER_TASK")));
  assert.ok(!messages.some(message => message.role === "system" && JSON.stringify(message.content).includes("CUSTOM_USER_TASK")));
  for (const invalid of ["not json", "[]", "null"]) {
    f.answer(() => invalid);
    await assert.rejects(f.actions.invoke(a.generate, { recipe: "extract_structure", item_id: item.item_id, option_id: "json" }));
    const saved = JSON.parse(readFileSync(join(f.home, "shelf", "catalog.json"), "utf8"));
    assert.equal(saved.jobs[0].status, "failed"); assert.ok(saved.jobs[0].execution.run_ref.id);
  }
  f.answer(() => "已写入 summary.md");
  await assert.rejects(f.actions.invoke(a.generate, { recipe: "summarize", item_id: item.item_id }), /没有可交付的正文/);
}));

test("original images require the selected vision model; folder and PDF contents keep their source identity", async () => fixture(async f => {
  const bytes = readFileSync(new URL("./fixtures/shelf-ocr-text.png", import.meta.url));
  const image = (await f.actions.invoke(a.admit, { filename: "original.png", mime: "image/png", bytes_base64: bytes.toString("base64") })).item;
  await assert.rejects(f.actions.invoke(a.generate, { recipe: "summarize", item_id: image.item_id }), /支持图片/);
  assert.equal(f.requests.length, 0);
  await f.actions.invoke(a.saveSettings, { model_selection: { provider_id: "fixture", model_id: "vision" } });
  const out = await f.actions.invoke(a.generate, { recipe: "summarize", item_id: image.item_id });
  assert.equal(out.job.execution?.configuredModel, "vision");
  const parts = f.requests.at(-1)!.messages.at(-1).content;
  assert.equal(parts.find((part: any) => part.type === "image_url").image_url.url, `data:image/png;base64,${bytes.toString("base64")}`);
  const folder = (await f.actions.invoke(a.admitFolder, { name: "sources", entries: [
    { relative: "nested/code.ts", bytes_base64: Buffer.from("export const amount = 12;").toString("base64") },
    { relative: "notes.pdf", bytes_base64: createExtractablePdf("PDF facts").toString("base64") },
  ] })).item;
  await f.actions.invoke(a.generate, { recipe: "summarize", item_id: folder.item_id });
  const prompt = JSON.stringify(f.requests.at(-1)!.messages);
  assert.match(prompt, /sources\/nested\/code.ts/); assert.match(prompt, /amount = 12/); assert.match(prompt, /PDF facts/);
  await f.actions.invoke(a.saveSettings, { model_selection: { provider_id: "missing", model_id: "missing" } });
  const count = f.requests.length;
  await assert.rejects(f.actions.invoke(a.generate, { recipe: "summarize", item_id: folder.item_id }), { code: "shelf.no_model" });
  assert.equal(f.requests.length, count);
  const directory = await f.host.homeActionClient().discover({ actor_id: "reader", project_id: null, audience: "mcp", permissions: SHELF_ACTION_PERMISSIONS });
  assert.equal(directory.find(row => row.capability_id === a.generate.capability_id)?.availability.available, false);
  assert.equal(directory.find(row => row.capability_id === a.extract.capability_id)?.availability.available, true);
  assert.equal(f.requests.length, count, "discovery does not call the model");
}));

test("discovery has separate model cost/permissions, AI cannot borrow local extraction permission, and no compatibility entry is left", async () => fixture(async f => {
  assert.equal(a.generate.action.execution?.cost, "metered"); assert.ok(a.generate.action.permissions.includes("model:invoke"));
  assert.equal(a.extract.action.execution?.cost, "none");
  assert.equal("runJob" in a, false, "the compatibility entry shelf.jobs.run is gone"); assert.equal(SHELF_ACTIONS.some(definition => definition.capability_id === "shelf.jobs.run"), false);
  assert.equal((await f.host.homeActionClient().discover({ actor_id: "reader", project_id: null, audience: "mcp", permissions: SHELF_ACTION_PERMISSIONS })).some(row => row.capability_id === "shelf.jobs.run"), false);
  const local = bindActionClient(f.host.homeActionClient(), () => ({ actor_id: "local", project_id: null, audience: "user", permissions: ["shelf:write", "shelf:read"] }));
  const item = (await local.invoke(a.admit, { filename: "sample.pdf", mime: "application/pdf", bytes_base64: createExtractablePdf("Local PDF").toString("base64") })).item;
  await assert.rejects(local.invoke(a.generate, { recipe: "summarize", item_id: item.item_id }), { code: "actions.forbidden" });
  assert.equal(f.requests.length, 0); assert.equal((await f.actions.invoke(a.snapshot, {})).running_jobs.length, 0);
  const out = await local.invoke(a.extract, { recipe: "extract_text", item_id: item.item_id });
  assert.equal(out.job.runtime, "pdfkit"); assert.equal(f.requests.length, 0);
}));


test("Shelf rechecks the exact model binding after the final business authority wait", async () => fixture(async f => {
  const materials = { extract: extractMaterial }, port = shelfAiPorts(f.home, materials);
  const store = openShelfStore(f.home, { disabled: true }, materials, { ...port, generate: async (input, control) => {
    const result = await port.generate(input, control);
    const provider = f.catalog.models.list()[0]!;
    f.catalog.models.upsert({ ...provider, models: provider.models.map(model => ({ ...model, enabled: false })) });
    return result;
  } });
  const item = store.admit({ filename: "fact.md", bytes: Buffer.from("Original facts") });
  await assert.rejects(store.runJob({ recipe: "summarize", item_id: item.item_id }), { code: "shelf.configuration_changed" });
  assert.equal(f.requests.length, 1); assert.equal(store.snapshot().results.length, 0);
  assert.equal(JSON.parse(readFileSync(join(store.root, "catalog.json"), "utf8")).jobs[0].status, "running");
}));

test("partial extraction remains visible on JSON results, and unsupported folder contents never silently disappear", async () => fixture(async f => {
  const materials = { extract: (source: Parameters<typeof extractMaterial>[0], options: Parameters<typeof extractMaterial>[1]) => extractMaterial(source, { ...options, limits: { ...options?.limits, maxCharacters: 5 } }) };
  const store = openShelfStore(f.home, { disabled: true }, materials, shelfAiPorts(f.home, materials));
  const pdf = store.admit({ filename: "partial.pdf", bytes: createExtractablePdf("A long PDF document with important facts.") });
  f.answer(() => '{"facts":true}');
  const out = await store.runJob({ recipe: "extract_structure", item_id: pdf.item_id, option_id: "json" });
  assert.deepEqual(JSON.parse(store.readFile(out.result!.item_id).bytes.toString()), { facts: true });
  assert.ok(out.result!.material_coverage?.some(note => note.includes("partial.pdf")));
  assert.deepEqual(out.result!.material_coverage, out.job.material_coverage);
  assert.match(JSON.stringify(f.requests.at(-1)), /partial.pdf/);
  const folder = store.admitFolder({ name: "mixed", entries: [
    { relative: "valid.md", bytes: Buffer.from("facts") }, { relative: "binary.bin", bytes: Buffer.from([0, 1, 2, 3]) },
  ] });
  const count = f.requests.length;
  await assert.rejects(store.runJob({ recipe: "summarize", item_id: folder.item_id }), /二进制/);
  assert.equal(f.requests.length, count);
}));

for (const mode of ["cancel", "revoke"] as const) test(`Shelf ${mode} during a real model response leaves no result or failed record`, async () => fixture(async f => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  let valid = true;
  f.answer(async () => { started.resolve(); await release.promise; return "Late model answer"; });
  const caller = bindActionClient(f.host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS,
    signal: controller.signal, validate_permissions: async () => { if (!valid) throw new Error("revoked"); } }));
  const item = (await f.actions.invoke(a.admit, { text: "Original", title: "fact", capture_pages: false })).item;
  const pending = caller.invoke(a.generate, { recipe: "summarize", item_id: item.item_id });
  const rejected = assert.rejects(pending);
  await started.promise;
  if (mode === "cancel") controller.abort(new Error("cancelled")); else valid = false;
  release.resolve(); await rejected;
  const snapshot = await f.actions.invoke(a.snapshot, {});
  assert.equal(snapshot.results.length, 0);
  const saved = JSON.parse(readFileSync(join(f.home, "shelf", "catalog.json"), "utf8"));
  assert.equal(saved.jobs[0].status, "running"); assert.equal(saved.jobs[0].error, null);
}));
