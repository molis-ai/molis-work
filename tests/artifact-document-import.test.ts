import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_BOARD_ID, GoalProjectApplication, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import {
  DOCUMENT_ARTIFACT_TYPE, DOCUMENT_IMPORT_MAX_BYTES, importArtifactDocument,
  type ArtifactDocumentImportPorts, type ImportedArtifactDocument,
} from "@molis-ai/molis-work-plugin-artifacts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const controlToken = "artifact-import-test-control-token-0123456789";
const markdown = "# 导入验收\n\n保留中文正文和 **Markdown**。\n\n<script>importAttack()</script>\n";

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-import-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  let server: ReturnType<typeof createMolisWorkWebServer>;
  let origin = "";
  const stop = async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  const start = async () => {
    server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory, controlToken });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    origin = `http://127.0.0.1:${address.port}`;
    // Match the existing Artifact browser fixture: finish host initialization before snapshots.
    await (await fetch(origin + "/health")).text();
  };
  t.after(async () => { await stop(); store.close(); await rm(directory, { recursive: true, force: true }); });
  await start();
  const headers = (key = randomUUID()) => ({
    "content-type": "application/json", origin, "accept-language": "zh",
    "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": key,
  });
  const post = (body: unknown, key?: string) => fetch(origin + "/api/artifacts/import", {
    method: "POST", headers: headers(key), body: JSON.stringify(body),
  });
  const rawPost = (body: string | Buffer, requestHeaders: Record<string, string>) => fetch(origin + "/api/artifacts/import", {
    method: "POST", headers: requestHeaders, body,
  });
  const get = (path: string, extraHeaders: Record<string, string> = {}) => fetch(origin + path, { headers: { "accept-language": "zh", ...extraHeaders } });
  return { store, coordinator, post, rawPost, get, headers, restart: async () => { await stop(); await start(); } };
}

test("document file HTTP import registers, previews, exports, reuses and survives restart", async t => {
  const { store, coordinator, post, get, restart } = await fixture(t);
  const before = store.snapshot(DEMO_BOARD_ID);
  const page = await get("/artifacts/import");
  assert.equal(page.status, 200);
  const form = await page.text();
  assert.match(form, /data-artifact-import-form/);
  for (const source of ["notion", "feishu", "lark", "google-docs", "file"]) {
    assert.ok(form.includes(`value="${source}"`), source);
  }
  const file = { source: "file", filename: "导入验收.md", content: markdown };
  const response = await post(file, "first-file-import");
  assert.equal(response.status, 201);
  const imported = await response.json() as { artifact_id: string; version: number; reused: boolean; url: string; warnings: string[] };
  assert.equal(imported.version, 1);
  assert.equal(imported.reused, false);
  assert.deepEqual(imported.warnings, []);
  const artifact = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, imported);
  assert.ok(artifact);
  assert.equal(artifact.artifact_type_id, DOCUMENT_ARTIFACT_TYPE);
  assert.equal(artifact.scope, "personal");
  assert.equal(artifact.content_kind, "inline");
  assert.equal((artifact.payload as Record<string, unknown>).content, markdown);
  assert.equal((artifact.metadata as Record<string, unknown>).source, "file");
  const detail = await get(imported.url);
  assert.equal(detail.status, 200);
  const html = await detail.text();
  assert.match(html, /<h1>导入验收<\/h1>/);
  assert.match(html, /artifact-document-body/);
  assert.match(html, /保留中文正文和 \*\*Markdown\*\*/);
  assert.match(html, /&lt;script&gt;importAttack\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>importAttack\(\)<\/script>/);
  assert.match(html, /原文后续修改不会自动同步/);
  assert.doesNotMatch(html, /没有兼容插件/);
  const exported = await get(`/api${imported.url}/export`);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("content-disposition"), 'attachment; filename="artifact-v1.json"');
  assert.deepEqual(await exported.json(), artifact);

  const replay = await post(file, "first-file-import");
  assert.equal(replay.status, 409, "a repeated mutation key must not execute twice");
  await replay.text();
  const duplicate = await post(file);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { ...imported, reused: true });
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length, 1);

  await restart();
  const restored = await get(`/api${imported.url}/export`);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), artifact);
  assert.match(await (await get(imported.url)).text(), /保留中文正文和 \*\*Markdown\*\*/);
  const importedAgain = await post(file);
  assert.equal(importedAgain.status, 200);
  assert.deepEqual(await importedAgain.json(), { ...imported, reused: true });
  const after = store.snapshot(DEMO_BOARD_ID);
  for (const field of ["goals", "evidence", "runs", "reviews"] as const) assert.deepEqual(after[field], before[field]);
});

test("HTML import extracts readable content, preserves its source and never executes its markup", async t => {
  const { coordinator, post, get } = await fixture(t);
  const original = '<!doctype html><html><head><title>导出的文档</title></head><body><h1>导出的文档</h1><p>真实正文 <strong>保留文字</strong></p><script>htmlAttack()</script></body></html>';
  const response = await post({ source: "file", filename: "export.html", content: original });
  assert.equal(response.status, 201);
  const imported = await response.json() as { artifact_id: string; version: number; url: string; warnings: string[] };
  assert.ok(imported.warnings.length > 0);
  const artifact = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, imported)!;
  const payload = artifact.payload as Record<string, unknown>;
  assert.equal(payload.original_html, original);
  assert.equal(payload.title, "导出的文档");
  assert.match(String(payload.content), /真实正文/);
  assert.doesNotMatch(String(payload.content), /htmlAttack|<script>/);
  const html = await (await get(imported.url)).text();
  assert.match(html, /artifact-document-warnings/);
  assert.match(html, /真实正文/);
  assert.doesNotMatch(html, /<script>htmlAttack\(\)<\/script>/);
  const exported = await (await get(`/api${imported.url}/export`)).json() as { payload: Record<string, unknown> };
  assert.equal(exported.payload.original_html, original);
});

test("invalid, empty, oversized and unauthorized imports leave Artifact records unchanged and can recover", async t => {
  const { coordinator, post, rawPost, headers } = await fixture(t);
  const before = coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID);
  const cases: Array<{ body: unknown; status: number; code: string }> = [
    { body: { source: "unsupported" }, status: 400, code: "document.source_invalid" },
    { body: { source: "file", filename: "empty.md", content: " \n\t" }, status: 422, code: "document.empty" },
    { body: { source: "file", filename: "binary.txt", content: "\u0000binary" }, status: 415, code: "document.binary" },
    { body: { source: "file", filename: "report.pdf", content: "PDF" }, status: 415, code: "document.file_unsupported" },
    { body: { source: "file", filename: "../report.md", content: "body" }, status: 400, code: "document.filename_invalid" },
    { body: { source: "file", filename: "body.md", content: 42 }, status: 400, code: "document.content_invalid" },
    // This passes a character-count limit but exceeds the actual UTF-8 byte limit.
    { body: { source: "file", filename: "large.md", content: "文".repeat(Math.floor(DOCUMENT_IMPORT_MAX_BYTES / 3) + 1) }, status: 413, code: "document.too_large" },
  ];
  for (const example of cases) {
    const response = await post(example.body);
    assert.equal(response.status, example.status, example.code);
    assert.equal((await response.json() as { code: string }).code, example.code);
    assert.deepEqual(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID), before);
  }
  for (const body of ["{broken", "null", "[]", Buffer.from([0xff, 0xfe])]) {
    const response = await rawPost(body, headers());
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, "document.request_invalid");
  }
  const file = { source: "file", filename: "valid.txt", content: "可以重试并导入" };
  const validBody = JSON.stringify(file);
  for (const missing of ["origin", "x-molis-work-control-token"] as const) {
    const requestHeaders: Record<string, string> = headers();
    delete requestHeaders[missing];
    const response = await rawPost(validBody, requestHeaders);
    assert.equal(response.status, 403, missing);
    await response.text();
  }
  for (const change of [{ origin: "https://malicious.example" }, { "x-molis-work-control-token": "incorrect-token" }]) {
    const response = await rawPost(validBody, { ...headers(), ...change });
    assert.equal(response.status, 403);
    await response.text();
  }
  const noKey: Record<string, string> = headers();
  delete noKey["x-molis-work-idempotency-key"];
  const missingKey = await rawPost(validBody, noKey);
  assert.equal(missingKey.status, 400);
  await missingKey.text();
  assert.deepEqual(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID), before);
  const failed = await post({ ...file, content: "" }, "failed-import-retry");
  assert.equal(failed.status, 422);
  await failed.text();
  const recovered = await post(file, "failed-import-retry");
  assert.equal(recovered.status, 201, "a failed attempt must release its mutation key for a corrected retry");
  await recovered.text();
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length, before.length + 1);
});

test("external document snapshots preserve exact old versions and isolate the same source by project", async t => {
  const { coordinator, get } = await fixture(t);
  coordinator.initializeBoard({ board_id: "other-project", title: "Other project", actor_id: "fixture-owner", idempotency_key: "create-other-project" });
  let document: ImportedArtifactDocument = {
    source: "notion", source_id: "a1b2c3-source", source_url: "https://www.notion.so/a1b2c3-source",
    title: "来源文档", content: "第一次读取的正文", format: "markdown", warnings: [],
  };
  const observed: Array<{ source: string; url: string }> = [];
  const ports: ArtifactDocumentImportPorts = {
    boardId: DEMO_BOARD_ID, actorId: "fixture-owner", routePrefix: "/projects/current", artifacts: coordinator.artifacts,
    readExternal: async input => { observed.push(input); return { ...document, warnings: [...document.warnings] }; },
    readHtml: () => { throw new Error("external imports must not read HTML files"); },
    now: () => "2026-09-22T00:00:00.000Z",
  };
  const input = { source: "notion", url: document.source_url };
  const first = await importArtifactDocument(input, ports);
  const original = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first)!;
  assert.ok(first.url.startsWith("/projects/current/artifacts/"));
  assert.deepEqual(observed, [input]);
  assert.equal((original.metadata as Record<string, unknown>).source_url, document.source_url);
  assert.equal((original.metadata as Record<string, unknown>).imported_at, "2026-09-22T00:00:00.000Z");
  assert.deepEqual(await importArtifactDocument(input, ports), { ...first, reused: true });
  document = { ...document, source_url: "https://www.notion.so/renamed-page-a1b2c3-source?share=copy" };
  const alias = await importArtifactDocument({ ...input, url: document.source_url }, ports);
  assert.deepEqual(alias, { ...first, reused: true }, "a different URL for the same source and content must reuse the saved snapshot");
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length, 1);
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first), original, "alias imports must preserve the original version and provenance");
  const originalPath = `/artifacts/${encodeURIComponent(first.artifact_id)}/versions/${first.version}`;
  assert.match(await (await get(originalPath)).text(), /href="https:\/\/www\.notion\.so\/a1b2c3-source"[^>]*>打开来源文档<\/a>/);
  document = { ...document, content: "第二次读取的正文", title: "来源文档更新" };
  const second = await importArtifactDocument(input, ports);
  assert.equal(second.artifact_id, first.artifact_id);
  assert.equal(second.version, 2);
  assert.equal(second.reused, false);
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first), original);
  const latest = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, second)!;
  assert.equal((latest.payload as Record<string, unknown>).content, "第二次读取的正文");
  assert.equal(latest.supersedes_version, 1);

  const other = await importArtifactDocument(input, { ...ports, boardId: "other-project", routePrefix: "/projects/other" });
  assert.notEqual(other.artifact_id, first.artifact_id);
  assert.equal(other.version, 1);
  assert.ok(other.url.startsWith("/projects/other/artifacts/"));
  assert.equal(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, other), null);
  assert.equal(coordinator.artifacts.query.getArtifactVersion("other-project", first), null);
  const beforeFailure = coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID);
  const permissionDenied = new Error("fixture provider denied permission");
  await assert.rejects(importArtifactDocument(input, { ...ports, readExternal: async () => { throw permissionDenied; } }), error => error === permissionDenied);
  assert.deepEqual(coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID), beforeFailure);

  // Stored metadata may come from an older producer; both display surfaces must
  // treat it as data even when the current external adapters validate their URLs.
  for (const sourceUrl of ["javascript:alert('unsafe')", "data:text/html,<script>alert('unsafe')</script>", "file:///tmp/private.txt"]) {
    document = { ...document, source_id: sourceUrl, source_url: sourceUrl, content: "非 HTTP 来源仍可阅读正文" };
    const unsafe = await importArtifactDocument(input, ports);
    const unsafePath = `/artifacts/${encodeURIComponent(unsafe.artifact_id)}/versions/${unsafe.version}`;
    for (const extraHeaders of [{}, { "x-molis-work-fragment": "frame-block" }]) {
      const response = await get(unsafePath, extraHeaders);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /非 HTTP 来源仍可阅读正文/);
      assert.doesNotMatch(html, /class="artifact-document-source"|>打开来源文档<\/a>/);
      assert.doesNotMatch(html, /href="(?:javascript:|data:|file:)/i);
    }
  }
});

test("different local files with the same filename never overwrite the earlier snapshot", async t => {
  const { coordinator, post, get } = await fixture(t);
  const filename = "同名导出.md";
  const firstResponse = await post({ source: "file", filename, content: "第一个文件正文" });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as { artifact_id: string; version: number; url: string };
  const original = coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first);
  const secondResponse = await post({ source: "file", filename, content: "第二个文件正文" });
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json() as { artifact_id: string; version: number; url: string };
  assert.notEqual(first.artifact_id, second.artifact_id);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.deepEqual(coordinator.artifacts.query.getArtifactVersion(DEMO_BOARD_ID, first), original);
  const firstHtml = await (await get(first.url)).text();
  assert.match(firstHtml, /第一个文件正文/);
  assert.doesNotMatch(firstHtml, /第二个文件正文/);
  assert.match(await (await get(second.url)).text(), /第二个文件正文/);
});

test("catalog project HTTP imports keep independent snapshots and all read paths stay in the selected project", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-import-projects-"));
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  t.after(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const alpha = await catalog.createProject({ display_name: "Alpha imports", actor_id: "fixture-user" });
  const beta = await catalog.createProject({ display_name: "Beta imports", actor_id: "fixture-user" });
  for (const project of [alpha, beta]) {
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "artifacts", actor_id: "fixture-user" });
  }
  catalog.close();
  server = createMolisWorkWebServer({ homeDirectory: directory, controlToken });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const content = "PROJECT-ISOLATION-BODY：两个项目各自保存的同一文档";
  const file = { source: "file", filename: "共享输入.md", content };
  const post = (prefix: string) => fetch(origin + prefix + "/api/artifacts/import", {
    method: "POST", headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify(file),
  });
  const imported: Array<{ prefix: string; artifact_id: string; version: number; url: string; reused: boolean; warnings: string[] }> = [];
  for (const project of [alpha, beta]) {
    const prefix = `/projects/${project.project_id}`;
    const response = await post(prefix);
    assert.equal(response.status, 201);
    const result = await response.json() as Omit<(typeof imported)[number], "prefix">;
    assert.equal(result.version, 1);
    assert.equal(result.reused, false);
    assert.equal(result.url, `${prefix}/artifacts/${encodeURIComponent(result.artifact_id)}/versions/1`);
    const detail = await fetch(origin + result.url);
    assert.equal(detail.status, 200);
    const html = await detail.text();
    assert.ok(html.includes(content));
    assert.ok(html.includes(`href="${prefix}/api/artifacts/${result.artifact_id}/versions/1/export"`));
    const exported = await fetch(`${origin}${prefix}/api/artifacts/${result.artifact_id}/versions/1/export`);
    assert.equal(exported.status, 200);
    const artifact = await exported.json() as { board_id: string; artifact_id: string; payload: { content: string } };
    assert.equal(artifact.board_id, project.board_id);
    assert.equal(artifact.artifact_id, result.artifact_id);
    assert.equal(artifact.payload.content, content);
    imported.push({ ...result, prefix });
  }
  assert.notEqual(imported[0]!.artifact_id, imported[1]!.artifact_id);
  for (const [own, other] of [[imported[0]!, imported[1]!], [imported[1]!, imported[0]!]]) {
    const foreignPath = `/artifacts/${encodeURIComponent(other.artifact_id)}/versions/1`;
    for (const path of [own.prefix + foreignPath, `${own.prefix}/api${foreignPath}/export`]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 404, path);
      assert.ok(!(await response.text()).includes(content), "a foreign exact-version reference must not reveal the document body");
    }
    const response = await post(own.prefix);
    assert.equal(response.status, 200);
    const { prefix: _prefix, ...result } = own;
    assert.deepEqual(await response.json(), { ...result, reused: true });
  }
});
