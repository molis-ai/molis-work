import { test } from "node:test";
import assert from "node:assert/strict";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { importArtifactDocument } from "../plugins/native/artifacts/src/document-import.js";

test("original file snapshots retain bytes in exact project versions, retry is idempotent, invalid originals never persist", async () => {
  const storage = new LocalProjectDatabase(":memory:"), project = new GoalProjectApplication(storage);
  for (const board_id of ["project-a", "project-b"]) project.initializeBoard({ board_id, title: board_id, actor_id: "fixture", idempotency_key: board_id });
  const artifacts = project.artifacts;
  const ports = { boardId: "project-a", actorId: "fixture", routePrefix: "", artifacts,
    readExternal: async (): Promise<never> => { throw Error("unexpected external request"); }, readHtml: () => ({ title: "", content: "" }) };
  const original = { filename: "brief.pdf", mime: "application/pdf", data_base64: Buffer.from([37, 80, 68, 70, 0, 255]).toString("base64") };
  const input = { source: "file", filename: "material.md", source_id: "onboarding:fixture:brief", content: "Extracted words", original_file: original };
  try {
    const first = await importArtifactDocument(input, ports);
    assert.deepEqual(await importArtifactDocument(input, ports), { ...first, reused: true });
    const record = artifacts.query.getArtifactVersion("project-a", first)!;
    assert.deepEqual((record.payload as any).original_file, original);
    const second = await importArtifactDocument({ ...input, content: "New extraction", original_file: { ...original, data_base64: Buffer.from("new bytes").toString("base64") } }, ports);
    assert.equal(second.artifact_id, first.artifact_id); assert.equal(second.version, 2);
    assert.deepEqual(artifacts.query.getArtifactVersion("project-a", first), record);
    const other = await importArtifactDocument(input, { ...ports, boardId: "project-b" });
    assert.notEqual(other.artifact_id, first.artifact_id); assert.equal(artifacts.query.getArtifactVersion("project-a", other), null);
    for (const file of [{ ...original, filename: "../outside.pdf" }, { ...original, data_base64: "%%%" }, { ...original, data_base64: Buffer.alloc(6_000_001).toString("base64") }]) {
      await assert.rejects(importArtifactDocument({ ...input, original_file: file }, ports), /原文件/);
    }
    assert.equal(artifacts.query.listArtifactVersions("project-a", first.artifact_id).length, 2);
  } finally { storage.close(); }
});
