import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, createHomeSnapshot, molisWorkHostProjectReference, resolveWebControlToken, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import type { KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { ArtifactImportResult } from "@molis-ai/molis-work-module-artifacts";
import { KnowledgeOrganizer } from "@molis-ai/molis-work-service-knowledge";
import { SearchService } from "@molis-ai/molis-work-service-search";
import { KNOWLEDGE_CARDS_STORE, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

// specs/project-knowledge PMAT-41, PMAT-44: what is imported reaches the project's catalog (the cards each round's directory and
// counts come from) without anyone searching, a ref a search hands back names a card, and an imported file's text is read when
// it is plain text, said when it is not.

test("PMAT-41 PMAT-44 an import reaches the catalog with nobody searching; a search's refs have cards; plain text files are read, others said so", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "knowledge-fresh-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "资料", actor_id: "owner" });
    assert.throws(() => catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "artifacts", actor_id: "owner" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
    return created;
  });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const cards = openKnowledgeCards({ homeDirectory: home });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const post = async <T>(path: string, body: unknown) => {
      const response = await fetch(origin + path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: base,
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() } });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as T;
    };
    const titles = () => cards.list(project.project_id).map(card => card.title).sort();
    const until = async (done: () => boolean, what: string) => {
      for (const end = Date.now() + 20_000; !done() && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(done(), `${what}: ${JSON.stringify(cards.list(project.project_id).map(card => [card.title, card.state]))}`);
    };

    // PMAT-41: nobody searches or opens the knowledge page; the card is there shortly after the import, as each round's catalog reads it.
    await post("/api/artifacts/import", { source: "file", filename: "试用说明.md", content: "# 试用说明\n\n试用期两周，到期前一周提醒客户。" });
    await until(() => titles().includes("试用说明"), "the imported piece has a card without a search");

    // PMAT-44: a CSV's text is read; a binary file is kept with its name only, said so, and listed without going to a model.
    const csv = await post<ArtifactImportResult>("/api/artifacts/import", { source: "file", filename: "价目.csv",
      original_file: { filename: "价目.csv", mime: "text/csv", data_base64: Buffer.from("型号,价格\nTP-2,1299\n").toString("base64") } });
    assert.equal(csv.text_available, true);
    assert.deepEqual(csv.warnings, []);
    const binary = await post<ArtifactImportResult>("/api/artifacts/import", { source: "file", filename: "图像.bin",
      original_file: { filename: "图像.bin", mime: "application/octet-stream", data_base64: Buffer.from([0, 1, 2, 255, 254]).toString("base64") } });
    assert.equal(binary.text_available, false);
    assert.deepEqual(binary.warnings, [{ owner: "workbench", key: "workbench.import.warning-unreadable" }]);

    // PMAT-41: a search right after an import, before the background pass, hands back refs whose cards are there when it answers.
    await post("/api/artifacts/import", { source: "file", filename: "退货政策.md", content: "# 退货政策\n\n签收后 30 天内可无理由退货。" });
    const found = await (await fetch(`${origin}/api/knowledge/search?q=${encodeURIComponent("无理由退货")}`)).json() as KnowledgeSearchResponse;
    const hit = found.cards.find(card => card.title === "退货政策");
    assert.ok(hit, JSON.stringify(found));
    assert.ok(cards.get(project.project_id, hit.subject), "the hit's card exists, so its ref reads it");

    await until(() => ["价目", "图像"].every(title => titles().includes(title)), "the imported files have cards");
    const state = (title: string) => cards.list(project.project_id).find(card => card.title === title)?.state;
    assert.deepEqual([state("价目"), state("图像")], ["pending", "listed"], "the CSV waits for organizing; the binary file is listed by its name");
    const priced = await (await fetch(`${origin}/api/knowledge/search?q=${encodeURIComponent("TP-2")}`)).json() as KnowledgeSearchResponse;
    assert.ok(priced.cards.some(card => card.title === "价目"), "the CSV's text is found");
  } finally {
    cards.close();
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

// BL-knowledge-restore-partial-catalog (73-3): a restored Home's search index is empty and its sources come back one pass at a time.
// The real Host, Home snapshot and restore; the only stand-in is a gate holding every source's index pass, so the catalog stays
// incomplete for as long as the test needs. Each entry gets its own Home, so either one can fail on its own.
async function restoredHome(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "knowledge-restore-")), home = join(root, "home");
  // Hooks run in the order they are added: the Host closes before its Home goes.
  const cleanup: Array<() => Promise<unknown>> = [];
  t.after(async () => { for (const step of cleanup.reverse()) await step(); });
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "资料", actor_id: "owner" }));
  const start = async () => {
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const token = resolveWebControlToken({ homeDirectory: home });
    const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const call = async <T>(path: string, body?: unknown) => {
      const response = await fetch(origin + path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: base,
        "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() } });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return await response.json() as T;
    };
    const stop = async () => { await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve()); await host.close(); };
    return { host, call, stop };
  };
  const cards = () => { const store = openKnowledgeCards({ homeDirectory: home }); try { return store.list(project.project_id); } finally { store.close(); } };
  const rows = () => {
    const file = readdirSync(join(home, KNOWLEDGE_CARDS_STORE)).find(name => /\.(db|sqlite)$/u.test(name)); assert.ok(file, "the card library");
    const db = new DatabaseSync(join(home, KNOWLEDGE_CARDS_STORE, file), { readOnly: true });
    try { return Object.fromEntries((db.prepare("SELECT object_id, card_id FROM knowledge_cards WHERE project_id = ?").all(project.project_id) as Array<{ object_id: string; card_id: number }>)
      .map(row => [row.object_id, row.card_id])); } finally { db.close(); }
  };

  // Before: four imported pieces, one organized earlier by a model, one the person edited, one kept from agents.
  const first = await start();
  for (const name of ["试用说明", "退货政策", "价目说明", "交付清单"]) {
    await first.call("/api/artifacts/import", { source: "file", filename: `${name}.md`, content: `# ${name}\n\n${name}的正文，供恢复后核对。` });
  }
  for (const end = Date.now() + 20_000; cards().length < 4 && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(cards().length, 4, JSON.stringify(cards()));
  const named = (title: string) => cards().find(card => card.title === title)!;
  const store = openKnowledgeCards({ homeDirectory: home });
  const organized = named("试用说明");
  store.put({ ...organized, state: "ready", organized_revision: organized.revision, organized_at: "2026-11-18T00:00:00.000Z", title: "试用期说明", brief: "模型整理的简介：试用两周。", keywords: ["试用期"] });
  store.addUsage(project.project_id, "2026-11-18", { pieces: 1, chars: 30 });
  store.close();
  await first.call("/api/knowledge/edit", { subject: named("退货政策").subject, brief: "本人写的退货简介" });
  await first.call("/api/knowledge/exclude", { subject: named("价目说明").subject, excluded: true });
  const before = { cards: cards().sort((a, b) => a.subject.id.localeCompare(b.subject.id)), rows: rows() };
  await first.stop();

  const snapshot = join(root, "snapshot");
  assert.equal((await createHomeSnapshot({ homeDirectory: home, destination: snapshot })).status, "created");
  assert.equal((await restoreHomeSnapshot({ homeDirectory: home, source: snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");

  // After: every source's first pass waits at the gate until the test lets it through.
  // `runSync` is one source's whole pass, the Search service's own; held here, the source has no complete pass in the index.
  type IndexedSources = { options: { index: { sources(): Array<{ project_id: string | null; state: string; error: string | null }> } } };
  const gate = Promise.withResolvers<void>(); let held = 0, service: IndexedSources | undefined;
  const sync: (this: unknown, ...args: unknown[]) => Promise<void> = Reflect.get(SearchService.prototype, "runSync");
  assert.equal(typeof sync, "function", "the Search service still runs one source's pass in runSync");
  Reflect.set(SearchService.prototype, "runSync", async function (this: IndexedSources, ...args: unknown[]) {
    held += 1; service = this; await gate.promise; return sync.apply(this, args);
  });
  cleanup.push(async () => { Reflect.set(SearchService.prototype, "runSync", sync); });
  const passes: Array<Promise<void>> = [];
  const kick = KnowledgeOrganizer.prototype.kick;
  t.mock.method(KnowledgeOrganizer.prototype, "kick", function (this: KnowledgeOrganizer, projectId: string) { const pass = kick.call(this, projectId); passes.push(pass); return pass; });
  const after = await start();
  cleanup.push(() => { gate.resolve(); return after.stop(); });
  // The person opens the project (not its cards): the Host now has the project's runtime that background work reads with.
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  await after.host.actionClient(reference).discover(await after.host.localPersonContext(reference));
  const sorted = () => cards().sort((a, b) => a.subject.id.localeCompare(b.subject.id));
  // Whether every source of the project holds a complete pass again, as the index itself records it.
  const listed = () => { const sources = service?.options.index.sources().filter(source => source.project_id === project.project_id) ?? [];
    return sources.length > 0 && sources.every(source => source.state === "ready" && !source.error); };
  return { project, before, after, cards: sorted, rows, gate, held: () => held, listed, passes, provider: before.cards[0]!.provider_id };
}

test("BL-knowledge-restore-partial-catalog first opening the cards after a restore keeps every card's row, text, edit and exclusion until its source is listed", { timeout: 120_000 }, async t => {
  const f = await restoredHome(t);
  const opened = await f.after.call<{ listing: boolean }>("/api/knowledge/overview");
  assert.equal(opened.listing, true, "the page says its sources are still being listed");
  assert.ok(f.held() > 0, "the source was still on its first pass");
  assert.deepEqual(f.cards(), f.before.cards, "no card is removed, recreated or marked missing");
  assert.deepEqual(f.rows(), f.before.rows, "each card keeps its own row");
  f.gate.resolve();
  for (const end = Date.now() + 20_000; Date.now() < end;) {
    const page = await f.after.call<{ listing: boolean }>("/api/knowledge/overview");
    if (!page.listing && f.listed()) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.deepEqual([f.cards(), f.rows()], [f.before.cards, f.before.rows], "once listed, the very same cards; nothing waits to be organized again");
});

test("BL-knowledge-restore-partial-catalog the background pass after a restore keeps every card until its source is listed", { timeout: 120_000 }, async t => {
  const f = await restoredHome(t);
  f.after.host.search!.changed(f.provider, f.project.project_id);
  for (const end = Date.now() + 20_000; !f.passes.length && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(f.passes.length, "the background pass ran with nobody opening the cards");
  await Promise.all(f.passes);
  assert.ok(f.held() > 0, "the source was still on its first pass");
  assert.deepEqual([f.cards(), f.rows()], [f.before.cards, f.before.rows], "no card is removed, recreated or marked missing");
  f.gate.resolve();
  const passed = f.passes.length;
  f.after.host.search!.changed(f.provider, f.project.project_id);
  for (const end = Date.now() + 20_000; f.passes.length === passed && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(f.passes.length > passed, "a background pass ran once the source could be listed");
  await Promise.all(f.passes);
  for (const end = Date.now() + 20_000; !f.listed() && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(f.listed(), "the sources are listed completely again");
  f.after.host.search!.changed(f.provider, f.project.project_id);
  for (const end = Date.now() + 20_000; f.passes.length === passed + 1 && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 100));
  await Promise.all(f.passes);
  assert.deepEqual([f.cards(), f.rows()], [f.before.cards, f.before.rows], "once listed, the very same cards; nothing waits to be organized again");
});
