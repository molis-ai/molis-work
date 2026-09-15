import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openArtifactProjectReference, ArtifactProjectReferenceError } from "@molis-ai/molis-work-plugin-artifacts";
import { readProjectReference, ProjectReferenceError } from "@molis-ai/molis-work-module-evidence-verification";
import type { EvidenceProjectReferenceSource } from "@molis-ai/molis-work-contracts/modules/evidence-verification";

const source: EvidenceProjectReferenceSource = {
  board_id: "project", evidence_id: "evidence", locator: "project://result.txt",
  locator_status: "verified", locator_workspace_root: null,
};

test("Artifact result opening preserves original workspace bytes and does not expose the reader's path", async () => {
  const original = await mkdtemp(join(tmpdir(), "molis-work-artifact-source-"));
  const current = await mkdtemp(join(tmpdir(), "molis-work-artifact-current-"));
  try {
    await writeFile(join(original, "result.txt"), "原始结果\n");
    await writeFile(join(current, "result.txt"), "Wrong workspace\n");
    const recorded = { ...source, locator_workspace_root: original };
    const before = structuredClone(recorded);
    const opened = openArtifactProjectReference({
      evidence: { getProjectReferenceSource: (boardId, evidenceId) => {
        assert.equal(boardId, "project"); assert.equal(evidenceId, "evidence");
        return recorded;
      } },
      readProjectReference,
    }, { boardId: "project", evidenceId: "evidence", reference: source.locator, projectRoot: current });
    assert.equal(Buffer.from(opened.content).toString("utf8"), "原始结果\n");
    assert.equal(opened.fileName, "result.txt");
    assert.deepEqual(Object.keys(opened).sort(), ["content", "fileName"]);
    assert.deepEqual(recorded, before);
    await rm(join(original, "result.txt"));
    assert.throws(() => openArtifactProjectReference({
      evidence: { getProjectReferenceSource: () => recorded }, readProjectReference,
    }, { boardId: "project", evidenceId: "evidence", reference: source.locator, projectRoot: current }),
    (error: unknown) => error instanceof ProjectReferenceError && error.status === 404);
  } finally {
    await rm(original, { recursive: true, force: true });
    await rm(current, { recursive: true, force: true });
  }
});

test("Artifact result opening rejects missing, different and unverified Evidence before reading a file", () => {
  for (const [record, status] of [
    [null, 404],
    [{ ...source, locator: "project://different.txt" }, 404],
    [{ ...source, locator_status: "unverified" }, 409],
  ] as const) {
    assert.throws(() => openArtifactProjectReference({
      evidence: { getProjectReferenceSource: () => record },
      readProjectReference: () => { assert.fail("Rejected Evidence must not read content"); },
    }, { boardId: "project", evidenceId: "evidence", reference: source.locator, projectRoot: "/unused" }),
    (error: unknown) => error instanceof ArtifactProjectReferenceError && error.status === status);
  }
});

test("Artifact result opening preserves legacy workspace fallback and refuses unknown workspace", () => {
  const reads: string[] = [];
  const ports = {
    evidence: { getProjectReferenceSource: () => source },
    readProjectReference: (root: string, reference: string) => {
      reads.push(root); assert.equal(reference, source.locator);
      return { content: new Uint8Array([65]), fileName: "result.txt" };
    },
  };
  const input = { boardId: "project", evidenceId: "evidence", reference: source.locator };
  openArtifactProjectReference(ports, { ...input, projectRoot: "/legacy-workspace" });
  assert.deepEqual(reads, ["/legacy-workspace"]);
  assert.throws(() => openArtifactProjectReference(ports, input), /历史 Evidence 没有记录原始工作区/);
  assert.throws(() => openArtifactProjectReference(ports, { ...input, evidenceId: null }), /项目引用没有可确认的原始工作区/);
  assert.deepEqual(reads, ["/legacy-workspace"]);
});

test("ordinary project result references use the bounded reader without querying or registering Evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-reference-"));
  try {
    await writeFile(join(directory, "result.txt"), "Ordinary output\n");
    const ports = {
      evidence: { getProjectReferenceSource: () => { assert.fail("No Evidence was requested"); } },
      readProjectReference,
    };
    const input = { boardId: "project", reference: source.locator, projectRoot: directory };
    assert.equal(Buffer.from(openArtifactProjectReference(ports, input).content).toString("utf8"), "Ordinary output\n");
    assert.throws(() => openArtifactProjectReference(ports, { ...input, reference: "project://../outside.txt" }),
      (error: unknown) => error instanceof ProjectReferenceError && error.status === 400);
    await writeFile(join(directory, "result.txt"), new Uint8Array([0, 1]));
    assert.throws(() => openArtifactProjectReference(ports, input),
      (error: unknown) => error instanceof ProjectReferenceError && error.status === 415);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
