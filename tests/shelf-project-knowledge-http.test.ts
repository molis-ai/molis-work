import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { openTestShelfStore } from "./shelf-direct-actions.js";

// specs/project-knowledge §9: what Shelf saves into a project is an imported document there, saved through the 成果库's own import
// as the confirming person; the project's agents find and read it like any other piece (Coding's side: tests/coding-materials-http.test.ts).
// Shelf S3: the copy is the Home instance's, the save-as-material pair the project instance's, both under the plugin's own routes.
test("Shelf saves the confirmed full text into project knowledge, a new version when it changed, per project, and refuses what is not text", async t => {
  const home = mkdtempSync(join(tmpdir(), "shelf-knowledge-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "测试项目", actor_id: "web-user" });
  const otherProject = await catalog.createProject({ display_name: "另一个项目", actor_id: "web-user" });
  for (const each of [project, otherProject]) assert.throws(() => catalog.addProjectPlugin({ project_id: each.project_id, plugin_id: "artifacts", actor_id: "web-user" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
  catalog.close();
  const store = new LocalProjectDatabase(project.database_path);
  const token = "shelf-knowledge-test-control-0123456789abcdef";
  let server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  const listen = async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  };
  let origin = await listen();
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); rmSync(home, { recursive: true, force: true }); });
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const shelf = "/api/plugins/io.molis.work.shelf", at = (each: { project_id: string }) => `/projects/${encodeURIComponent(each.project_id)}${shelf}`;
  const documents = () => openProjectVersionStores(store).artifacts.query;

  const original = "﻿旧版🌲\r\n" + "完整原文。".repeat(700) + "\n末尾不能被预览截断";
  const admitted = await request(shelf + "/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
  assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
  const id = admitted.body.item.item_id, material = `/items/${id}/project-material`, path = at(project) + material;
  const preview = await request(path);
  assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.payload.text, original);
  assert.equal(preview.body.project_title, "测试项目"); assert.ok(!JSON.stringify(preview.body).includes(home));
  assert.equal((await request(shelf + material)).status, 400, "outside a project there is no project to save into");

  // What is saved is the confirmed text, not words the request sends along; the same text again keeps its version.
  const save = await request(path, { expected_fingerprint: preview.body.fingerprint, text: "伪造正文" });
  assert.equal(save.status, 200, JSON.stringify(save.body)); assert.equal(save.body.reference.version, 1);
  const first = documents().getArtifactVersion(project.project_id, save.body.reference)!;
  assert.equal(first.artifact_type_id, IMPORTED_DOCUMENT_TYPE);
  assert.ok(JSON.stringify(first.payload).includes("末尾不能被预览截断") && !JSON.stringify(first.payload).includes("伪造正文"));
  assert.deepEqual((await request(path, { expected_fingerprint: preview.body.fingerprint })).body.reference, save.body.reference);

  // Another project gets its own document.
  const other = await request(at(otherProject) + material, { expected_fingerprint: preview.body.fingerprint });
  assert.equal(other.status, 200, JSON.stringify(other.body)); assert.notEqual(other.body.reference.artifact_id, save.body.reference.artifact_id);

  // An edit after the preview is a conflict; confirmed again, it is the next version of the same document, the first kept as it was.
  const changed = "新版🙂\n现在只允许核对文档，不做修改。";
  assert.equal((await request(`${shelf}/items/${id}/edit`, { text: changed })).status, 200);
  assert.equal((await request(path, { expected_fingerprint: preview.body.fingerprint })).status, 409);
  const second = await request(path); assert.notEqual(second.body.fingerprint, preview.body.fingerprint);
  const saved2 = await request(path, { expected_fingerprint: second.body.fingerprint });
  assert.deepEqual([saved2.status, saved2.body.reference.artifact_id, saved2.body.reference.version], [200, save.body.reference.artifact_id, 2]);
  assert.ok(JSON.stringify(documents().getArtifactVersion(project.project_id, saved2.body.reference)!.payload).includes("现在只允许核对文档"));
  await new Promise<void>(resolve => server.close(() => resolve()));
  server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token }); origin = await listen();
  assert.deepEqual(documents().getArtifactVersion(project.project_id, save.body.reference), first, "the first version survives the restart unchanged");

  // A hidden copy, binary, NUL, oversized text and the sample are not saved.
  await request(`${shelf}/items/${id}/hide`, {});
  assert.equal((await request(path)).status, 400);
  for (const [filename, bytes] of [["binary.txt", Buffer.from([0xff, 0xfe, 1])], ["null.txt", Buffer.from("a\0b")], ["large.txt", Buffer.from("长".repeat(20_001))]] as const) {
    const item = (await request(shelf + "/items", { filename, bytes_base64: bytes.toString("base64") })).body.item;
    assert.equal((await request(`${at(project)}/items/${item.item_id}/project-material`)).status, 400, filename);
  }
  const sample = await openTestShelfStore(home, { disabled: true }).seedSample();
  assert.equal((await request(`${at(project)}/items/${sample.item_id}/project-material`)).status, 400);
  assert.deepEqual([...new Set(documents().listArtifacts(project.project_id, { artifact_type_id: IMPORTED_DOCUMENT_TYPE }).map(row => row.artifact_id))], [save.body.reference.artifact_id]);
});
