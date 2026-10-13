import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const controlToken = "artifact-continue-control-token-0123456789";

// specs/artifact-positioning A4b: 「从这一版继续」 starts a new object with the pinned version's content, in the plugin the
// person chose; the version and the original object are left as they are.
test("a pinned document, form, deck and table each continue as a new object of their own plugin", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-continue-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const server = createMolisWorkWebServer({ databasePath, projectId: DEMO_PROJECT_ID, homeDirectory: directory, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  await (await fetch(origin + "/health")).text();
  const post = async (path: string, body: unknown, status = 200) => {
    const response = await fetch(origin + path, { method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin, "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    assert.equal(response.status, status, `${path}: ${await response.clone().text()}`);
    return await response.json() as Record<string, any>;
  };
  const get = async (path: string) => await (await fetch(origin + path)).json() as Record<string, any>;
  const detail = async (artifact: { artifact_id: string; version: number }) => await (await fetch(`${origin}/artifacts/${encodeURIComponent(artifact.artifact_id)}/versions/${artifact.version}`,
    { headers: { "x-molis-work-fragment": "artifact-workbench" } })).text();
  const continueFrom = async (artifact: { artifact_id: string; version: number }, plugin_id: string) => (await post("/api/artifacts/continue", { reference: artifact, plugin_id }, 201)).open as { surface: string; id: string; title: string };

  // Pages: a new document with the version's title and text.
  const page = (await post("/api/pages", { title: "方案", markdown: "第一稿" })).document as { id: string; version: number };
  const pinnedPage = (await post(`/api/pages/${page.id}/promote`, { expected_version: page.version })).artifact as { artifact_id: string; version: number };
  assert.match(await detail(pinnedPage), /data-artifact-continue="io\.molis\.work\.pages"[^>]*>在 Pages 继续</);
  const pageOpen = await continueFrom(pinnedPage, "io.molis.work.pages");
  assert.notEqual(pageOpen.id, page.id);
  assert.equal(pageOpen.surface, "pages");
  const copiedPage = (await get(`/api/pages/${pageOpen.id}`)).document as { title: string; body: unknown };
  assert.equal(copiedPage.title, "方案");
  assert.match(JSON.stringify(copiedPage.body), /第一稿/);

  // Forms: the questions come along; answers never do.
  let form = (await post("/api/form", { title: "满意度" })).form as { id: string; version: number };
  form = (await post(`/api/form/${form.id}`, { description: "季度回访", questions: [{ type: "text", title: "哪里可以更好？", required: true }], expected_version: form.version })).form;
  const pinnedForm = (await post(`/api/form/${form.id}/promote`, { expected_version: form.version })).artifact as { artifact_id: string; version: number };
  const formOpen = await continueFrom(pinnedForm, "io.molis.work.form");
  const copiedForm = (await get(`/api/form/${formOpen.id}`)).form as { title: string; description: string; questions: Array<{ title: string }> };
  assert.deepEqual([copiedForm.title, copiedForm.description, copiedForm.questions.map(question => question.title)], ["满意度", "季度回访", ["哪里可以更好？"]]);

  // PPT: slides and colours.
  let deck = (await post("/api/ppt", { title: "周会" })).presentation as { id: string; version: number };
  deck = (await post(`/api/ppt/${deck.id}`, { slides: [{ title: "进展", bullets: ["上线", "复盘"], notes: "" }], expected_version: deck.version })).presentation;
  const pinnedDeck = (await post(`/api/ppt/${deck.id}/promote`, { expected_version: deck.version })).artifact as { artifact_id: string; version: number };
  const deckOpen = await continueFrom(pinnedDeck, "io.molis.work.ppt");
  const copiedDeck = (await get(`/api/ppt/${deckOpen.id}`)).presentation as { title: string; slides: Array<{ title: string; bullets: string[] }> };
  assert.deepEqual([copiedDeck.title, copiedDeck.slides.map(slide => [slide.title, slide.bullets])], ["周会", [["进展", ["上线", "复盘"]]]]);

  // Dataset: columns and rows.
  let table = (await post("/api/dataset", { title: "预算" })).dataset as { id: string; version: number; columns: Array<{ id: string }> };
  table = (await post(`/api/dataset/${table.id}`, { columns: [{ id: "c1", name: "项目", type: "text" }, { id: "c2", name: "金额", type: "number" }],
    rows: [{ id: "r1", cells: { c1: "差旅", c2: "1200" } }], expected_version: table.version })).dataset;
  const pinnedTable = (await post(`/api/dataset/${table.id}/promote`, { expected_version: table.version })).artifact as { artifact_id: string; version: number };
  const tableOpen = await continueFrom(pinnedTable, "io.molis.work.dataset");
  const copiedTable = (await get(`/api/dataset/${tableOpen.id}`)).dataset as { title: string; columns: Array<{ name: string }>; rows: Array<{ cells: Record<string, string> }> };
  assert.deepEqual([copiedTable.title, copiedTable.columns.map(column => column.name), copiedTable.rows.map(row => Object.values(row.cells))], ["预算", ["项目", "金额"], [["差旅", "1200"]]]);

  // Only a plugin that declares it can continue from a type is accepted.
  await post("/api/artifacts/continue", { reference: pinnedTable, plugin_id: "io.molis.work.pages" }, 400);
});
