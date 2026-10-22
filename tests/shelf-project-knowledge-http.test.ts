import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, GoalProjectApplication, DEMO_PROJECT_ID, openHostShelfStore, seedDemoBoard, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { MolisWorkLocalHost, molisWorkHostProjectReference, handleShelfNativePluginHttp } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { SHELF_ACTION_PERMISSIONS, SHELF_PROJECT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";

// specs/project-knowledge §9: what Shelf saves into a project is an imported document there, saved through the 成果库's own import
// as the confirming person; the project's agents find and read it like any other piece (Coding's side: tests/coding-materials-http.test.ts).
test("Shelf saves the confirmed full text into project knowledge, a new version when it changed, per project, and refuses what is not text", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-knowledge-")), dbPath = join(home, "board.db");
  seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const otherPath = join(home, "other.db"), otherStore = new LocalProjectDatabase(otherPath);
  new GoalProjectApplication(otherStore).initializeBoard({ project_id: "other-project", actor_id: "web-user", idempotency_key: "init-other" });
  otherStore.close();
  // Shelf copies are personal (Home); saving one into a project runs in that project's action client.
  const localHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const shelfActions = bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS }));
  const projectShelf = (databasePath: string, projectId: string) => {
    const reference = molisWorkHostProjectReference({ databasePath, projectId });
    return { title: "测试项目", actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: SHELF_PROJECT_ACTION_PERMISSIONS })) };
  };
  const documents = () => openProjectVersionStores(store).artifacts.query;
  const server = createServer((request, response) => { void (async () => {
    const url = new URL(request.url!, "http://localhost"), project = url.searchParams.get("project");
    await handleShelfNativePluginHttp(request, response, url, { actions: shelfActions,
      ...(project === "none" ? {} : { project: project === "other" ? projectShelf(otherPath, "other-project") : projectShelf(dbPath, DEMO_PROJECT_ID) }) });
  })().catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const original = "﻿旧版🌲\r\n" + "完整原文。".repeat(700) + "\n末尾不能被预览截断";
    const admitted = await request("/api/shelf/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
    assert.equal(admitted.status, 200);
    const id = admitted.body.item.item_id, path = `/api/shelf/items/${id}/project-material`;
    const preview = await request(path);
    assert.equal(preview.status, 200); assert.equal(preview.body.payload.text, original);
    assert.equal(preview.body.project_title, "测试项目"); assert.ok(!JSON.stringify(preview.body).includes(home));
    assert.equal((await request(path + "?project=none")).status, 400);

    // What is saved is the confirmed text, not words the request sends along; the same text again keeps its version.
    const save = await request(path, { expected_fingerprint: preview.body.fingerprint, text: "伪造正文" });
    assert.equal(save.status, 200, JSON.stringify(save.body)); assert.equal(save.body.reference.version, 1);
    const first = documents().getArtifactVersion(DEMO_PROJECT_ID, save.body.reference)!;
    assert.equal(first.artifact_type_id, IMPORTED_DOCUMENT_TYPE);
    assert.ok(JSON.stringify(first.payload).includes("末尾不能被预览截断") && !JSON.stringify(first.payload).includes("伪造正文"));
    assert.deepEqual((await request(path, { expected_fingerprint: preview.body.fingerprint })).body.reference, save.body.reference);

    // Another project gets its own document.
    const other = await request(path + "?project=other", { expected_fingerprint: preview.body.fingerprint });
    assert.equal(other.status, 200, JSON.stringify(other.body)); assert.notEqual(other.body.reference.artifact_id, save.body.reference.artifact_id);

    // An edit after the preview is a conflict; confirmed again, it is the next version of the same document, the first kept as it was.
    const changed = "新版🙂\n现在只允许核对文档，不做修改。";
    assert.equal((await request(`/api/shelf/items/${id}/edit`, { text: changed })).status, 200);
    assert.equal((await request(path, { expected_fingerprint: preview.body.fingerprint })).status, 409);
    const second = await request(path); assert.notEqual(second.body.fingerprint, preview.body.fingerprint);
    const saved2 = await request(path, { expected_fingerprint: second.body.fingerprint });
    assert.deepEqual([saved2.status, saved2.body.reference.artifact_id, saved2.body.reference.version], [200, save.body.reference.artifact_id, 2]);
    assert.ok(JSON.stringify(documents().getArtifactVersion(DEMO_PROJECT_ID, saved2.body.reference)!.payload).includes("现在只允许核对文档"));
    await localHost.closeProject(molisWorkHostProjectReference({ databasePath: dbPath, projectId: DEMO_PROJECT_ID }));
    assert.deepEqual(documents().getArtifactVersion(DEMO_PROJECT_ID, save.body.reference), first, "the first version survives the restart unchanged");

    // A hidden copy, binary, NUL, oversized text and the sample are not saved.
    await request(`/api/shelf/items/${id}/hide`, {});
    assert.equal((await request(path)).status, 400);
    for (const [filename, bytes] of [["binary.txt", Buffer.from([0xff, 0xfe, 1])], ["null.txt", Buffer.from("a\0b")], ["large.txt", Buffer.from("长".repeat(20_001))]] as const) {
      const item = (await request("/api/shelf/items", { filename, bytes_base64: bytes.toString("base64") })).body.item;
      assert.equal((await request(`/api/shelf/items/${item.item_id}/project-material`)).status, 400, filename);
    }
    const sample = await openHostShelfStore(home, { disabled: true }).seedSample();
    assert.equal((await request(`/api/shelf/items/${sample.item_id}/project-material`)).status, 400);
    assert.deepEqual([...new Set(documents().listArtifacts(DEMO_PROJECT_ID, { artifact_type_id: IMPORTED_DOCUMENT_TYPE }).map(row => row.artifact_id))], [save.body.reference.artifact_id]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await localHost.close(); store.close(); rmSync(home, { recursive: true, force: true });
  }
});
