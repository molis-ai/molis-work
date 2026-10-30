import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { MolisWorkLocalHost, withConnectorConnections, DEMO_PROJECT_ID, LocalProjectDatabase, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { artifactAnalysisContext, artifactOriginalPath, DOCUMENT_ARTIFACT_TYPE, DOCUMENT_IMPORT_MAX_BYTES, importArtifactDocument, type ArtifactDocumentImportPorts, type ImportedArtifactDocument } from "@molis-ai/molis-work-module-artifacts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { documentImportConnections, documentImportConnectionStatus, importLocalArtifactDocument } from "../apps/local-host/dist/artifact-document-import.js";
import { homeIntegrationRegistry } from "../apps/local-host/dist/builtin-integrations.js";
import { blankPng, epub, odt, pptx, rtf, xlsx } from "./fixtures/office-files.js";
import { GoalProjectApplication, boardSnapshot, seedBoard } from "./fixtures/goal-application.js";

const controlToken = "artifact-import-test-control-token-0123456789";
const markdown = "# 导入验收\n\n保留中文正文和 **Markdown**。\n\n<script>importAttack()</script>\n";

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-import-"));
  await new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }).close();
  const databasePath = join(directory, "fixture.db");
  seedBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store), library = openProjectVersionStores(store);
  let server: ReturnType<typeof createMolisWorkWebServer>;
  let origin = "";
  const stop = async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  const start = async () => {
    server = createMolisWorkWebServer({ databasePath, projectId: DEMO_PROJECT_ID, homeDirectory: directory, controlToken });
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
  // The 成果 surface as the workbench reads it; a person's direct visit is redirected into the workbench (checked below).
  const get = (path: string, extraHeaders: Record<string, string> = {}) => fetch(origin + path, { headers: { "accept-language": "zh", "x-molis-work-fragment": "artifact-workbench", ...extraHeaders } });
  return { store, coordinator, library, post, rawPost, get, headers, origin, directory, restart: async () => { await stop(); await start(); } };
}

test("document file HTTP import registers, previews, exports, reuses and survives restart", async t => {
  const { store, library, post, get, origin, restart } = await fixture(t);
  const before = boardSnapshot(store, DEMO_PROJECT_ID);
  // Importing is one entry for the whole project, the side panel's 资料 tab (specs/project-knowledge §8); the 成果库 points there.
  const directory = await (await get("/artifacts")).text();
  assert.doesNotMatch(directory, /data-artifact-import-open|data-artifact-import-dialog/);
  const oldPage = await get("/artifacts/import");
  assert.doesNotMatch(await oldPage.text(), /data-artifact-import-form/);
  const file = { source: "file", filename: "导入验收.md", content: markdown };
  const response = await post(file, "first-file-import");
  assert.equal(response.status, 201);
  const imported = await response.json() as { artifact_id: string; version: number; reused: boolean; url: string; warnings: string[] };
  assert.equal(imported.version, 1);
  assert.equal(imported.reused, false);
  assert.deepEqual(imported.warnings, []);
  const artifact = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, imported);
  assert.ok(artifact);
  assert.equal(artifact.artifact_type_id, DOCUMENT_ARTIFACT_TYPE);
  assert.equal(artifact.scope, "personal");
  assert.equal(artifact.content_kind, "inline");
  assert.equal((artifact.payload as Record<string, unknown>).content, markdown);
  assert.equal((artifact.metadata as Record<string, unknown>).source, "file");
  const direct = await fetch(origin + imported.url, { redirect: "manual" });
  assert.equal(direct.status, 302, "a direct visit opens the workbench");
  assert.equal(new URL(direct.headers.get("location")!, origin).searchParams.get("openItem"), imported.url);
  await direct.text();
  const detail = await get(imported.url);
  assert.equal(detail.status, 200);
  const html = await detail.text();
  assert.match(html, /<h1>导入验收<\/h1>/);
  // The imported file's owner previews it (artifact-positioning A4): Markdown rendered read-only.
  assert.match(html, /data-artifact-business-preview/);
  assert.match(html, /保留中文正文和 <strong>Markdown<\/strong>/);
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
  assert.equal(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, 1);

  await restart();
  const restored = await get(`/api${imported.url}/export`);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), artifact);
  assert.match(await (await get(imported.url)).text(), /保留中文正文和 \*\*Markdown\*\*/);
  const importedAgain = await post(file);
  assert.equal(importedAgain.status, 200);
  assert.deepEqual(await importedAgain.json(), { ...imported, reused: true });
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  for (const field of ["goals", "evidence", "runs", "reviews"] as const) assert.deepEqual(after[field], before[field]);
});

test("HTML import extracts readable content, preserves its source and never executes its markup", async t => {
  const { library, post, get } = await fixture(t);
  const original = '<!doctype html><html><head><title>导出的文档</title></head><body><h1>导出的文档</h1><p>真实正文 <strong>保留文字</strong> &#x1f642; &#999999999999;</p><script>htmlAttack()</script><template>hiddenTemplate</template><script>unfinishedScript()';
  const response = await post({ source: "file", filename: "export.html", content: original });
  assert.equal(response.status, 201);
  const imported = await response.json() as { artifact_id: string; version: number; url: string; warnings: string[] };
  assert.ok(imported.warnings.length > 0);
  const artifact = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, imported)!;
  const payload = artifact.payload as Record<string, unknown>;
  assert.equal(payload.original_html, original);
  assert.equal(payload.title, "导出的文档");
  assert.match(String(payload.content), /真实正文/);
  assert.match(String(payload.content), /🙂/);
  assert.doesNotMatch(String(payload.content), /htmlAttack|hiddenTemplate|unfinishedScript|<script>/);
  const html = await (await get(imported.url)).text();
  assert.match(html, /artifact-document-warnings/);
  assert.match(html, /真实正文/);
  assert.doesNotMatch(html, /<script>htmlAttack\(\)<\/script>/);
  const exported = await (await get(`/api${imported.url}/export`)).json() as { payload: Record<string, unknown> };
  assert.equal(exported.payload.original_html, original);
});

for (const stop of ["cancel", "revoke"] as const) test(`HTML import ${stop} after real parsing leaves no Artifact and a fresh call recovers`, async t => {
  const { library } = await fixture(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  const input = { source: "file", filename: "page.html", content: "<head><title>Page</title></head><p>Original body</p>" };
  const ports = { projectId: DEMO_PROJECT_ID, actorId: "fixture-owner", ownerActorId: LOCAL_PERSON_ACTOR_ID, routePrefix: "/projects/current", artifacts: library.artifacts };
  const previous = library.artifacts.query.listArtifacts(DEMO_PROJECT_ID);
  const pending = importLocalArtifactDocument(input, { ...ports, signal: controller.signal, beforeSave: async () => {
    entered.resolve(); await release.promise;
    if (stop === "revoke") throw new Error("revoked after parsing");
  } });
  const rejected = assert.rejects(pending, stop === "cancel" ? { name: "AbortError" } : /revoked after parsing/);
  try {
    await entered.promise;
    if (stop === "cancel") controller.abort();
    release.resolve(); await rejected;
    assert.deepEqual(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID), previous);
    const saved = await importLocalArtifactDocument(input, ports);
    const record = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, saved)!;
    assert.equal((record.payload as Record<string, unknown>).original_html, input.content);
    assert.equal((record.payload as Record<string, unknown>).content, "Original body");
  } finally { release.resolve(); }
});

test("invalid, empty, oversized and unauthorized imports leave Artifact records unchanged and can recover", async t => {
  const { library, post, rawPost, headers } = await fixture(t);
  const before = library.artifacts.query.listArtifacts(DEMO_PROJECT_ID);
  const cases: Array<{ body: unknown; status: number; code: string }> = [
    // R4B-01: production import refusals retain kind and reason under the Artifacts owner.
    { body: { source: "unsupported" }, status: 400, code: "artifacts.document.source_invalid" },
    { body: { source: "file", filename: "empty.md", content: " \n\t" }, status: 400, code: "artifacts.document.empty" },
    { body: { source: "file", filename: "binary.txt", content: "\u0000binary" }, status: 400, code: "artifacts.document.binary" },
    // Any file is accepted (artifact-positioning A3), but one that is not text must come with its original bytes.
    { body: { source: "file", filename: "report.pdf", content: "PDF" }, status: 400, code: "artifacts.document.original_invalid" },
    { body: { source: "file", filename: "report.pdf", original_file: { filename: "report.pdf", mime: "application/pdf", data_base64: "not base64!" } }, status: 413, code: "artifacts.document.original_invalid" },
    { body: { source: "file", filename: "../report.md", content: "body" }, status: 400, code: "artifacts.document.filename_invalid" },
    { body: { source: "file", filename: "body.md", content: 42 }, status: 400, code: "artifacts.document.content_invalid" },
    // This passes a character-count limit but exceeds the actual UTF-8 byte limit.
    { body: { source: "file", filename: "large.md", content: "文".repeat(Math.floor(DOCUMENT_IMPORT_MAX_BYTES / 3) + 1) }, status: 413, code: "artifacts.document.too_large" },
  ];
  for (const example of cases) {
    const response = await post(example.body);
    assert.equal(response.status, example.status, example.code);
    assert.equal((await response.json() as { code: string }).code, example.code);
    assert.deepEqual(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID), before);
  }
  for (const body of ["{broken", "null", "[]", Buffer.from([0xff, 0xfe])]) {
    const response = await rawPost(body, headers());
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, "artifacts.document.request_invalid");
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
  assert.deepEqual(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID), before);
  const failed = await post({ ...file, content: "" }, "failed-import-retry");
  assert.equal(failed.status, 400, "a document with nothing to import was a 422; no kind stands for 422, so it is the caller's mistake (400)");
  await failed.text();
  const recovered = await post(file, "failed-import-retry");
  assert.equal(recovered.status, 201, "a failed attempt must release its mutation key for a corrected retry");
  await recovered.text();
  assert.equal(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, before.length + 1);
});

test("external document snapshots preserve exact old versions and isolate the same source by project", async t => {
  const { coordinator, library, get } = await fixture(t);
  coordinator.initializeBoard({ project_id: "other-project", actor_id: "fixture-owner", idempotency_key: "create-other-project" });
  let document: ImportedArtifactDocument = {
    source: "notion", source_id: "a1b2c3-source", source_url: "https://www.notion.so/a1b2c3-source",
    title: "来源文档", content: "第一次读取的正文", format: "markdown", warnings: [],
  };
  const observed: Array<{ source: string; url: string }> = [];
  const ports: ArtifactDocumentImportPorts = {
    projectId: DEMO_PROJECT_ID, actorId: "fixture-owner", ownerActorId: LOCAL_PERSON_ACTOR_ID, routePrefix: "/projects/current", artifacts: library.artifacts,
    readExternal: async input => { observed.push(input); return { ...document, warnings: [...document.warnings] }; },
    readHtml: () => { throw new Error("external imports must not read HTML files"); },
    now: () => "2026-09-22T00:00:00.000Z",
  };
  const input = { source: "notion", url: document.source_url };
  const first = await importArtifactDocument(input, ports);
  const original = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first)!;
  assert.ok(first.url.startsWith("/projects/current/artifacts/"));
  assert.deepEqual(observed, [input]);
  assert.equal((original.metadata as Record<string, unknown>).source_url, document.source_url);
  assert.equal((original.metadata as Record<string, unknown>).imported_at, "2026-09-22T00:00:00.000Z");
  assert.deepEqual(await importArtifactDocument(input, ports), { ...first, reused: true });
  document = { ...document, source_url: "https://www.notion.so/renamed-page-a1b2c3-source?share=copy" };
  const alias = await importArtifactDocument({ ...input, url: document.source_url }, ports);
  assert.deepEqual(alias, { ...first, reused: true }, "a different URL for the same source and content must reuse the saved snapshot");
  assert.equal(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, 1);
  assert.deepEqual(library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first), original, "alias imports must preserve the original version and provenance");
  const originalPath = `/artifacts/${encodeURIComponent(first.artifact_id)}/versions/${first.version}`;
  assert.match(await (await get(originalPath)).text(), /href="https:\/\/www\.notion\.so\/a1b2c3-source"[^>]*>打开来源文档<\/a>/);
  document = { ...document, content: "第二次读取的正文", title: "来源文档更新" };
  const second = await importArtifactDocument(input, ports);
  assert.equal(second.artifact_id, first.artifact_id);
  assert.equal(second.version, 2);
  assert.equal(second.reused, false);
  assert.deepEqual(library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first), original);
  const latest = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, second)!;
  assert.equal((latest.payload as Record<string, unknown>).content, "第二次读取的正文");
  assert.equal(latest.supersedes_version, 1);

  const other = await importArtifactDocument(input, { ...ports, projectId: "other-project", routePrefix: "/projects/other" });
  assert.notEqual(other.artifact_id, first.artifact_id);
  assert.equal(other.version, 1);
  assert.ok(other.url.startsWith("/projects/other/artifacts/"));
  assert.equal(library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, other), null);
  assert.equal(library.artifacts.query.getArtifactVersion("other-project", first), null);
  const beforeFailure = library.artifacts.query.listArtifacts(DEMO_PROJECT_ID);
  const permissionDenied = new Error("fixture provider denied permission");
  await assert.rejects(importArtifactDocument(input, { ...ports, readExternal: async () => { throw permissionDenied; } }), error => error === permissionDenied);
  assert.deepEqual(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID), beforeFailure);

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
  const { library, post, get } = await fixture(t);
  const filename = "同名导出.md";
  const firstResponse = await post({ source: "file", filename, content: "第一个文件正文" });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as { artifact_id: string; version: number; url: string };
  const original = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first);
  const secondResponse = await post({ source: "file", filename, content: "第二个文件正文" });
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json() as { artifact_id: string; version: number; url: string };
  assert.notEqual(first.artifact_id, second.artifact_id);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.deepEqual(library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, first), original);
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
  await writeFile(join(directory, "result.txt"), "Explicit configured workspace result");
  server = createMolisWorkWebServer({ homeDirectory: directory, projectRoot: directory, controlToken });
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
    for (const locator of ["project://result.txt", "result.txt"]) {
      const reference = await fetch(origin + prefix + "/api/project-references/" + encodeURIComponent(locator));
      assert.equal(reference.status, 200);
      assert.equal(await reference.text(), "Explicit configured workspace result");
    }
    for (const locator of ["../result.txt", "https://example.com/result.txt", "file:///etc/passwd"]) {
      const reference = await fetch(origin + prefix + "/api/project-references/" + encodeURIComponent(locator));
      assert.equal(reference.status, 400, locator);
      await reference.text();
    }
    const response = await post(prefix);
    assert.equal(response.status, 201);
    const result = await response.json() as Omit<(typeof imported)[number], "prefix">;
    assert.equal(result.version, 1);
    assert.equal(result.reused, false);
    assert.equal(result.url, `${prefix}/artifacts/${encodeURIComponent(result.artifact_id)}/versions/1`);
    const detail = await fetch(origin + result.url, { headers: { "x-molis-work-fragment": "artifact-workbench" } });
    assert.equal(detail.status, 200);
    const html = await detail.text();
    assert.ok(html.includes(content));
    assert.ok(html.includes(`href="${prefix}/api/artifacts/${result.artifact_id}/versions/1/export"`));
    const exported = await fetch(`${origin}${prefix}/api/artifacts/${result.artifact_id}/versions/1/export`);
    assert.equal(exported.status, 200);
    const artifact = await exported.json() as { project_id: string; artifact_id: string; payload: { content: string } };
    assert.equal(artifact.project_id, project.project_id);
    assert.equal(artifact.artifact_id, result.artifact_id);
    assert.equal(artifact.payload.content, content);
    imported.push({ ...result, prefix });
  }
  assert.notEqual(imported[0]!.artifact_id, imported[1]!.artifact_id);
  for (const [own, other] of [[imported[0]!, imported[1]!], [imported[1]!, imported[0]!]]) {
    const foreignPath = `/artifacts/${encodeURIComponent(other.artifact_id)}/versions/1`;
    for (const path of [own.prefix + foreignPath, `${own.prefix}/api${foreignPath}/export`]) {
      const response = await fetch(origin + path, { headers: { "x-molis-work-fragment": "artifact-workbench" } });
      assert.equal(response.status, 404, path);
      assert.ok(!(await response.text()).includes(content), "a foreign exact-version reference must not reveal the document body");
    }
    const response = await post(own.prefix);
    assert.equal(response.status, 200);
    const { prefix: _prefix, ...result } = own;
    assert.deepEqual(await response.json(), { ...result, reused: true });
  }
});

test("any file imports as a 成果 with its original bytes and real media type; a text version continues in Pages", async t => {
  // specs/artifact-positioning A3: one import entry for any file; Pages starts documents from a version, not its own import.
  const { library, post, get, origin, headers } = await fixture(t);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const imageResponse = await post({ source: "file", filename: "封面.png", original_file: { filename: "封面.png", mime: "image/png", data_base64: png.toString("base64") } });
  assert.equal(imageResponse.status, 201);
  const image = await imageResponse.json() as { artifact_id: string; version: number };
  const record = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, image)!;
  assert.equal(record.media_type, "image/png");
  assert.equal(record.title, "封面");
  assert.deepEqual(record.origin, { kind: "imported", file_name: "封面.png" });
  const file = await fetch(`${origin}/api/artifacts/${encodeURIComponent(image.artifact_id)}/versions/1/file`, { headers: { "accept-language": "zh" } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.match(file.headers.get("content-disposition") ?? "", /^inline;/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
  const detail = await (await get(`/artifacts/${encodeURIComponent(image.artifact_id)}/versions/1`)).text();
  assert.match(detail, /<img class="file-preview-image"[^>]*src="data:image\/png;base64,/);
  assert.match(detail, /下载原文件/);
  assert.doesNotMatch(detail, /data-artifact-continue/, "Pages cannot start a document from an image");

  const textResponse = await post({ source: "file", filename: "接着写.md", content: "# 接着写\n\n从这一版继续。" });
  const text = await textResponse.json() as { artifact_id: string; version: number };
  const textDetail = await (await get(`/artifacts/${encodeURIComponent(text.artifact_id)}/versions/1`)).text();
  assert.match(textDetail, /data-artifact-continue="io\.molis\.work\.pages"[^>]*>在 Pages 继续</);
  const download = await fetch(`${origin}/api/artifacts/${encodeURIComponent(text.artifact_id)}/versions/1/file`);
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.equal(await download.text(), "# 接着写\n\n从这一版继续。");
  // 「从这一版继续」 (A4b): the plugin the person chose starts a new object; Pages reads the file the way it imports files.
  const continued = await fetch(origin + "/api/artifacts/continue", { method: "POST", headers: headers(), body: JSON.stringify({ reference: text, plugin_id: "io.molis.work.pages" }) });
  assert.equal(continued.status, 201, await continued.clone().text());
  const result = await continued.json() as { open: { surface: string; id: string; title: string } };
  assert.deepEqual([result.open.surface, result.open.title], ["pages", "接着写"]);
  const pages = (await (await fetch(`${origin}/api/plugins/io.molis.work.pages/pages`)).json() as { documents: Array<{ id: string; title: string }> }).documents;
  assert.deepEqual(pages.filter(document => document.title === "接着写").map(document => document.id), [result.open.id], "exactly one document, the one that opens");
  const refused = await fetch(origin + "/api/artifacts/continue", { method: "POST", headers: headers(), body: JSON.stringify({ reference: image, plugin_id: "io.molis.work.pages" }) });
  assert.equal(refused.status, 400);
  await refused.text();
});

/** A one-page PDF with a text layer: the lines are drawn in Helvetica, the offsets in the cross-reference table are exact. */
function pdfWith(lines: string[]): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td 18 TL ${lines.map(line => `(${line}) '`).join(" ")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("PMAT-14 a PDF or Word file keeps its original, and the text read out of it is what readers of the 成果 get", async t => {
  const { library, post } = await fixture(t);
  const original = (filename: string, mime: string, bytes: Uint8Array) => ({ source: "file", filename, original_file: { filename, mime, data_base64: Buffer.from(bytes).toString("base64") } });
  const saved = async (body: unknown) => {
    const response = await post(body);
    assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json() as { artifact_id: string; version: number; warnings: string[] };
    return { result, record: library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, result)! };
  };

  const pdf = pdfWith(["Quarterly review notes", "The beta pass code is MW-0042."]);
  const fromPdf = await saved(original("review.pdf", "application/pdf", pdf));
  const pdfPayload = fromPdf.record.payload as { content: string; original_file: { data_base64: string } };
  assert.match(pdfPayload.content, /The beta pass code is MW-0042\./u);
  assert.deepEqual(Buffer.from(pdfPayload.original_file.data_base64, "base64"), pdf, "the original is kept byte for byte");
  const pdfContext = artifactAnalysisContext(fromPdf.record);
  assert.match(pdfContext.content, /beta pass code is MW-0042/u, "a reader gets the text");
  assert.doesNotMatch(pdfContext.content, /data_base64|JVBERi0/u, "never the original's bytes");

  const { zipSync } = createRequire(new URL("../apps/local-host/package.json", import.meta.url))("fflate") as { zipSync(entries: Record<string, Uint8Array>): Uint8Array };
  const docx = zipSync({
    "[Content_Types].xml": Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    "word/document.xml": Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>保留事实：试点在三月开始</w:t></w:r></w:p></w:body></w:document>'),
  });
  const fromWord = await saved(original("方案.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx));
  assert.match((fromWord.record.payload as { content: string }).content, /保留事实：试点在三月开始/u);
  assert.match(artifactAnalysisContext(fromWord.record).content, /试点在三月开始/u);

  // A file it cannot read is still imported: the original is kept, the import says so, and its text is empty, so project
  // knowledge lists it by its name and sends it to no model (PMAT-44).
  const broken = await saved(original("scan.pdf", "application/pdf", Buffer.from("%PDF-1.4\nnot really a pdf\n%%EOF\n", "latin1")));
  assert.equal((broken.record.payload as { content: string }).content, "");
  assert.match(broken.result.warnings.join("\n"), /Agent 只能看到它的名字/u, "the import says no text was read, and what that means");
  assert.equal(artifactAnalysisContext(broken.record).content, "");
});

test("PMAT-47 Office, OpenDocument, EPUB and RTF files are read as Markdown; an image is recognized, or the import says why not", async t => {
  const { library, post } = await fixture(t);
  const imported = async (filename: string, mime: string, bytes: Uint8Array) => {
    const response = await post({ source: "file", filename, original_file: { filename, mime, data_base64: Buffer.from(bytes).toString("base64") } });
    assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json() as { artifact_id: string; version: number; warnings: string[] };
    return { warnings: result.warnings, content: (library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, result)!.payload as { content: string }).content };
  };
  const sheet = await imported("价目.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx([["型号", "价格"], ["TP-2", "1299"]]));
  assert.match(sheet.content, /\| 型号 \| 价格 \|\n\| --- \| --- \|\n\| TP-2 \| 1299 \|/u, "a sheet is a Markdown table");
  assert.deepEqual(sheet.warnings, []);
  assert.match((await imported("复盘.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptx("第四季度重点：仓库扩容"))).content, /第四季度重点：仓库扩容/u);
  const text = await imported("制度.odt", "application/vnd.oasis.opendocument.text", odt("值班制度", "夜班每两周轮换一次。"));
  assert.match(text.content, /^# 值班制度\n\n夜班每两周轮换一次。$/u, "a heading stays a heading, with no front matter or HTML");
  assert.match((await imported("手册.epub", "application/epub+zip", epub("保修", "背包保修三年。"))).content, /# 保修\n\n背包保修三年。/u);
  assert.match((await imported("说明.rtf", "application/rtf", rtf("退款说明", "七天内原路退回。"))).content, /退款说明\n\n七天内原路退回。/u);
  // A blank image has nothing to recognize; where the macOS helper is missing the import says that instead. Either way the
  // original is kept with no text and the warning says what agents can see.
  const image = await imported("空白.png", "image/png", blankPng());
  assert.equal(image.content, "");
  assert.match(image.warnings.join("\n"), /^(?:图片里没有识别出文字|这台电脑不能识别文字（需要 macOS 的文字识别组件）)，只保存了原件；Agent 只能看到它的名字。$/u);
});

// Onboarding limits (user 2026-10-22, ONB-LIM-01): an original over the inline 6 MB is sent as the raw body, offered to the 成果库 by
// the Host, kept in its store by digest, and handed back whole; without an offered file an import without bytes is refused.
test("ONB-LIM-01 an original over 6 MB is kept in the 成果库's store by digest and downloads whole", async t => {
  const { library, post, origin, directory, headers } = await fixture(t);
  const bytes = Buffer.alloc(7_000_001, 7); bytes.write("%PDF-1.4 not really", 0);
  const raw = { ...headers(), "content-type": "application/octet-stream", "x-molis-work-filename": encodeURIComponent("大文件.bin") };
  const response = await fetch(origin + "/api/artifacts/import/original", { method: "POST", headers: raw, body: bytes });
  assert.equal(response.status, 201, await response.clone().text());
  const imported = await response.json() as { artifact_id: string; version: number; reused: boolean };
  const artifact = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, imported);
  const original = (artifact!.payload as { original_file: Record<string, unknown> }).original_file;
  assert.equal(original.data_base64, undefined, "the bytes are not in the version's record");
  assert.equal(original.size_bytes, bytes.length);
  assert.match(String(original.sha256), /^[0-9a-f]{64}$/u);
  assert.deepEqual(await readFile(artifactOriginalPath(directory, DEMO_PROJECT_ID, String(original.sha256))), bytes);
  const file = await fetch(`${origin}/api/artifacts/${encodeURIComponent(imported.artifact_id)}/versions/${imported.version}/file`, { headers: { "accept-language": "zh" } });
  assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  // The same bytes again reuse the version; a small one through the same route stays inline.
  const again = await fetch(origin + "/api/artifacts/import/original", { method: "POST", headers: { ...raw, "x-molis-work-idempotency-key": randomUUID() }, body: bytes });
  assert.equal(((await again.json()) as { reused: boolean }).reused, true);
  const small = await fetch(origin + "/api/artifacts/import/original", { method: "POST", headers: { ...headers(), "content-type": "application/octet-stream", "x-molis-work-filename": "small.bin" }, body: Buffer.from("tiny") });
  const smallVersion = library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, await small.json() as { artifact_id: string; version: number });
  assert.equal((smallVersion!.payload as { original_file: { data_base64: string } }).original_file.data_base64, Buffer.from("tiny").toString("base64"));
  // No file offered: an original without its bytes is refused, whoever asks.
  const refused = await post({ source: "file", filename: "x.bin", original_file: { filename: "x.bin", mime: "application/octet-stream" } });
  assert.equal(refused.status, 400);
  assert.equal(((await refused.json()) as { code: string }).code, "artifacts.document.original_not_offered");
  // A name with a path in it is refused before anything is read.
  const named = await fetch(origin + "/api/artifacts/import/original", { method: "POST", headers: { ...headers(), "content-type": "application/octet-stream", "x-molis-work-filename": encodeURIComponent("../x.bin") }, body: Buffer.from("x") });
  assert.equal(named.status, 400);
});

test("ONB-LIM-01 a deleted offered original or a directory is refused with no saved Artifact", async t => {
  const { library, directory } = await fixture(t);
  const removed = join(directory, "removed.bin");
  await writeFile(removed, "original bytes"); await rm(removed);
  const input = { source: "file", filename: "original.bin", original_file: { filename: "original.bin", mime: "application/octet-stream" } };
  const previous = library.artifacts.query.listArtifacts(DEMO_PROJECT_ID);
  for (const offeredPath of [removed, directory]) {
    await assert.rejects(importLocalArtifactDocument(input, {
      projectId: DEMO_PROJECT_ID, actorId: "fixture-owner", ownerActorId: LOCAL_PERSON_ACTOR_ID,
      routePrefix: "/projects/current", artifacts: library.artifacts, offeredPath,
    }), error => {
      assert.ok(error instanceof ActionError);
      assert.deepEqual([error.code, error.message, actionHttpStatus(error)], [
        "artifacts.document.original_not_offered", "交给宿主的原文件已经不在了，请重新选择", 400,
      ]);
      return true;
    });
    assert.deepEqual(library.artifacts.query.listArtifacts(DEMO_PROJECT_ID), previous, "an unavailable original saves nothing");
  }
});

// S-55: the 成果库 reads a file the Host was given only from the call's trusted context; nothing in a request names one for it.
test("S-55 an import reads no file the request names: a path header, a body field or a digest that is not one is refused", async t => {
  const { post, origin, headers, directory } = await fixture(t);
  const secret = join(directory, "secret.txt"); await writeFile(secret, "SECRET");
  const named = await fetch(origin + "/api/artifacts/import", { method: "POST", headers: { ...headers(), "sec-molis-work-original-path": encodeURIComponent(secret) },
    body: JSON.stringify({ source: "file", filename: "secret.bin", original_file: { filename: "secret.bin", mime: "application/octet-stream" } }) });
  assert.equal(named.status, 400);
  assert.equal(((await named.json()) as { code: string }).code, "artifacts.document.original_not_offered");
  const field = await post({ source: "file", filename: "secret.bin", original_file: { filename: "secret.bin", mime: "application/octet-stream", path: secret } });
  assert.equal(field.status, 400, "a path in the input is not a field the import takes");
  assert.throws(() => artifactOriginalPath(directory, DEMO_PROJECT_ID, "../../secret.txt"), /invalid original digest/);
});

// A file too big to hold in memory (review 2026-10-22): the original is still kept whole in the store and the import says its text was
// not read, instead of failing on Node's 2 GiB read limit.
test("ONB-LIM-08 an original over 2 GB is kept whole without its text, and the import says so instead of failing", async t => {
  const { library } = await fixture(t);
  const stored = { sha256: "a".repeat(64), size_bytes: 3_000_000_000 };
  let readText = 0;
  const ports: ArtifactDocumentImportPorts = {
    projectId: DEMO_PROJECT_ID, actorId: "fixture-owner", ownerActorId: LOCAL_PERSON_ACTOR_ID, routePrefix: "/projects/current", artifacts: library.artifacts,
    readExternal: async () => { throw new Error("a file import reads no external document"); },
    readHtml: () => { throw new Error("a file import of a video reads no HTML"); },
    readFileText: async () => { readText++; return { text: "never", warnings: [] }; },
    offered: { size_bytes: stored.size_bytes, store: async () => stored,
      read: async () => { throw Object.assign(new RangeError("File size (3000000000) is greater than 2 GiB"), { code: "ERR_FS_FILE_TOO_LARGE" }); } },
  };
  const result = await importArtifactDocument({ source: "file", filename: "录像.mov", original_file: { filename: "录像.mov", mime: "video/quicktime" } }, ports);
  assert.equal(readText, 0, "no text is read from bytes the Host could not hold");
  assert.deepEqual(result.warnings, ["文件超过 2 GB，没有读取正文；原件完整保存。"]);
  const original = (library.artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, result)!.payload as { original_file: Record<string, unknown> }).original_file;
  assert.deepEqual([original.sha256, original.size_bytes], [stored.sha256, stored.size_bytes]);
});

test("RAC-891 a document import takes only the ways of connecting its integration declares: Feishu's CLI login yes, Notion's no", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-import-methods-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const made = withConnectorConnections(home, store => ({
    feishuCli: store.saveCli({ serviceId: "feishu", displayName: "飞书 CLI", externalId: "feishu-user", accountLabel: "feishu-user" }).connection_id,
    notionCli: store.saveCli({ serviceId: "notion", displayName: "Notion CLI", externalId: "notion-user", accountLabel: "notion-user" }).connection_id,
    notionToken: store.createToken({ serviceId: "notion", displayName: "Notion", token: "notion-token" }).connection_id,
    notionOauth: store.createToken({ serviceId: "notion", displayName: "Notion OAuth", token: "notion-oauth", authMethod: "oauth" }).connection_id,
    driveToken: store.createToken({ serviceId: "google-drive", displayName: "Drive", token: "drive-token" }).connection_id,
    githubToken: store.createToken({ serviceId: "github", displayName: "GitHub", token: "github-token" }).connection_id,
  }));
  const taken = new Set((await documentImportConnections(home)).map(row => row.connection_id));
  assert.deepEqual([made.feishuCli, made.notionToken, made.notionOauth, made.driveToken].filter(id => !taken.has(id)), [], "what the imports declare is taken");
  assert.deepEqual([made.notionCli, made.githubToken].filter(id => taken.has(id)), [], "a way no import declares, or a service no import reads, is not");
  const host = await readFile(new URL("../apps/local-host/src/artifact-document-import.ts", import.meta.url), "utf8");
  assert.doesNotMatch(host, /["'`]feishu["'`]/u, "the Host names no service for the CLI login");
});

// RAC-2426 (T-119 review): the document import's sources are the Home registry's declarations, not the Host build's snapshot: a
// package attached in this Home that declares a document_import integration appears, and leaves when it is detached. The built-in
// sources stay either way, and the import takes the attached service's connection as a candidate.
test("RAC-2426 the document import reads the Home registry's document_import integrations, and a detached package leaves", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-document-registry-"));
  const before = process.env.MOLIS_WORK_HOME;
  try {
    await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
    process.env.MOLIS_WORK_HOME = home;
    const registry = await homeIntegrationRegistry(home);
    const service = { service_id: "docimport-service", title: "Doc import fixture", group_id: "work", summary: "A document source a package declares",
      auth_kind: "token" as const, auth: { methods: [{ kind: "token" as const, label: "Doc import token" }] }, capabilities: [{ label: "文档导入", fulfillment: "live" as const }] };
    const manifest = { schema_version: 2 as const, host_api_version: 2, plugin_id: "io.molis.work.example.docimport", version: "1.0.0", name: "Doc import fixture",
      kind: "integration" as const, publisher: { publisher_id: "io.example", signature: "example-signature-v1" },
      entrypoints: [{ deployment: "local" as const, entrypoint: "./plugin.mjs" }],
      permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }], capabilities: { provides: [], consumes: [] },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" as const }, connection_services: [service],
      integrations: [{ integration_id: "docimport", kind: "document_import" as const, service_id: "docimport-service", document_source: "docimport", connection_methods: ["token"] }] };
    const builtin = await documentImportConnectionStatus(home);
    assert.deepEqual(["notion", "feishu", "lark", "google-docs"].filter(source => !Object.hasOwn(builtin, source)), [], "the built-in document sources are still listed");
    assert.equal(await registry.attach(manifest, () => null, () => true), true);
    assert.equal((await documentImportConnectionStatus(home)).docimport, false, "the attached package's document source is listed, with no connection yet");
    const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "docimport-service", displayName: "Doc import", token: "docimport-token" }).connection_id);
    assert.deepEqual((await documentImportConnections(home)).filter(row => row.connection_id === connection).map(row => row.service_id), ["docimport-service"], "the attached service's connection is a candidate");
    await registry.detach(manifest.plugin_id);
    assert.equal(Object.hasOwn(await documentImportConnectionStatus(home), "docimport"), false, "a detached package's source leaves");
    assert.deepEqual((await documentImportConnections(home)).filter(row => row.connection_id === connection), [], "and its connection is no candidate");
  } finally {
    if (before === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = before;
    await rm(home, { recursive: true, force: true });
  }
});
