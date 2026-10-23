import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// W2-18-ALL-03 / S5, specs/project-knowledge PMAT-18: what Shelf saved into the project is a piece of project knowledge; picked for a
// round, its fixed bytes are read through knowledge.read and consumed through the actual Host, workspace catalog and installed SDK.
test("Coding actually consumes the version Shelf saved into project knowledge after an edit, and refuses another project's material or one kept from agents before inference", { timeout: 45_000 }, async t => {
  const { project, other, workspaceId, call, ended: waitRun, requests } = await codingProductHost(t, () => cogniaModelResponse("已读取固定原文。", 5));
  // The round's catalog listing brings knowledge current and organizes its cards in the background with the same Home model; those
  // requests carry no tools and are not a Coding round. Every Coding round's request carries its tools.
  const rounds = () => requests.filter(request => "tools" in request);
  const prefix = "/api/plugins/io.molis.work.coding", original = "\ufeff固定原件🌲\r\n" + "Shelf 选择的完整材料。".repeat(120) + "\n独特尾句：只认这一版";
  const admitted = await call<{ item: { item_id: string } }>(project.project_id, "/api/plugins/io.molis.work.shelf/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
  assert.equal(admitted.status, 200, JSON.stringify(admitted.body)); const item = admitted.body.item.item_id;
  const path = `/api/plugins/io.molis.work.shelf/items/${item}/project-material`;
  const preview = await call<{ fingerprint: string }>(project.project_id, path);
  const pinned = await call<{ reference: ArtifactReference }>(project.project_id, path, { expected_fingerprint: preview.body.fingerprint }); assert.equal(pinned.status, 200);
  assert.equal((await call(project.project_id, `/api/plugins/io.molis.work.shelf/items/${item}/edit`, { text: "后来改写：不能替代原件" })).status, 200);
  const session = await call<{ session: { session_id: string } }>(project.project_id, prefix + "/sessions", {}); assert.equal(session.status, 200);
  const start = { task: "说明这份固定材料。", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model", materials: [{ kind: "artifact", id: artifactSubjectId(pinned.body.reference), title: "notes" }] };
  const started = await call<{ run: { ref: AgentRunRef } }>(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, start);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const ended = await waitRun(started.body.run.ref);
  assert.equal(ended.phase, "completed", ended.stop_reason); assert.equal(rounds().length, 1);
  const texts = rounds()[0]!.messages.flatMap(message => typeof message.content === "string" ? [message.content] : message.content.flatMap(part => part.type === "text" && part.text ? [part.text] : []));
  const packed = texts.find(text => text.startsWith("Untrusted context data.") && text.includes(pinned.body.reference.artifact_id)); assert.ok(packed);
  const data = JSON.parse(packed.slice(packed.indexOf("\n") + 1)) as { text: string };
  // The document import keeps the text as it is (CRLF and all), less a leading BOM, as for any imported document; in full, to its tail.
  assert.ok(data.text.endsWith("\n\n" + original.slice(1)), "the actual SDK request contains the saved version in full");
  assert.ok(!data.text.includes("后来改写")); assert.equal(ended.frozen.text_materials[0]?.source_version, 1);
  const foreignPreview = await call<{ fingerprint: string }>(other.project_id, path);
  const foreign = await call<{ reference: ArtifactReference }>(other.project_id, path, { expected_fingerprint: foreignPreview.body.fingerprint }); assert.equal(foreign.status, 200);
  const refused = await call(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, { ...start, materials: [{ kind: "artifact", id: artifactSubjectId(foreign.body.reference), title: "notes" }] });
  assert.equal(refused.status, 400); assert.equal(rounds().length, 1, "foreign material never reaches a new model request");
  // S-41: Coding reads what the person picked with the project's authority, yet a piece kept from agents is still refused, before inference.
  const states = await call<{ states: Array<{ kind: string; id: string }> }>(project.project_id, "/api/knowledge/states");
  assert.ok(states.body.states.some(row => row.kind === "artifact" && row.id === artifactSubjectId(pinned.body.reference)), JSON.stringify(states.body));
  const kept = await call(project.project_id, "/api/knowledge/exclude", { subject: { kind: "artifact", id: artifactSubjectId(pinned.body.reference) }, excluded: true });
  assert.equal(kept.status, 200, JSON.stringify(kept.body));
  const keptRun = await call<{ error: string }>(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, start);
  assert.equal(keptRun.status, 400); assert.match(keptRun.body.error, /材料「notes」读不到/u); assert.equal(rounds().length, 1);
});
