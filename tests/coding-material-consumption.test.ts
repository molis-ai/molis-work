import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// W2-18-ALL-03 / S5: fixed Shelf bytes are consumed through the actual Host, workspace catalog and installed SDK.
test("Coding actually consumes Shelf's fixed original bytes after an edit, and refuses another project's material before inference", { timeout: 45_000 }, async t => {
  const { project, other, workspaceId, call, ended: waitRun, requests } = await codingProductHost(t, () => cogniaModelResponse("已读取固定原文。", 5));
  const prefix = "/api/plugins/io.molis.work.coding", original = "\ufeff固定原件🌲\r\n" + "Shelf 选择的完整材料。".repeat(120) + "\n独特尾句：只认这一版";
  const admitted = await call<{ item: { item_id: string } }>(project.project_id, "/api/shelf/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
  assert.equal(admitted.status, 200, JSON.stringify(admitted.body)); const item = admitted.body.item.item_id;
  const path = `/api/shelf/items/${item}/project-material`;
  const preview = await call<{ fingerprint: string }>(project.project_id, path);
  const pinned = await call<{ reference: ArtifactReference }>(project.project_id, path, { expected_fingerprint: preview.body.fingerprint }); assert.equal(pinned.status, 200);
  assert.equal((await call(project.project_id, `/api/shelf/items/${item}/edit`, { text: "后来改写：不能替代原件" })).status, 200);
  const session = await call<{ session: { session_id: string } }>(project.project_id, prefix + "/sessions", {}); assert.equal(session.status, 200);
  const start = { task: "说明这份固定材料。", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model", materials: [pinned.body.reference] };
  const started = await call<{ run: { ref: AgentRunRef } }>(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, start);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const ended = await waitRun(started.body.run.ref);
  assert.equal(ended.phase, "completed", ended.stop_reason); assert.equal(requests.length, 1);
  const texts = requests[0]!.messages.flatMap(message => typeof message.content === "string" ? [message.content] : message.content.flatMap(part => part.type === "text" && part.text ? [part.text] : []));
  const packed = texts.find(text => text.startsWith("Untrusted context data.") && text.includes(pinned.body.reference.artifact_id)); assert.ok(packed);
  const data = JSON.parse(packed.slice(packed.indexOf("\n") + 1)) as { text: string };
  assert.ok(data.text.endsWith(original), "the actual SDK request contains all fixed bytes, including BOM, CRLF and tail");
  assert.ok(!data.text.includes("后来改写")); assert.equal(ended.frozen.text_materials[0]?.source_version, 1);
  const foreignPreview = await call<{ fingerprint: string }>(other.project_id, path);
  const foreign = await call<{ reference: ArtifactReference }>(other.project_id, path, { expected_fingerprint: foreignPreview.body.fingerprint }); assert.equal(foreign.status, 200);
  const refused = await call(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, { ...start, materials: [foreign.body.reference] });
  assert.equal(refused.status, 400); assert.equal(requests.length, 1, "foreign material never reaches a new model request");
});
