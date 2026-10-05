import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openArtifactProjectReference, ArtifactProjectReferenceError } from "@molis-ai/molis-work-plugin-artifacts";
import { readProjectReference, ProjectReferenceError } from "@molis-ai/molis-work-app-local-host";

test("project result references are read from the project's workspace through the bounded reader", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-reference-"));
  try {
    await writeFile(join(directory, "result.txt"), "Ordinary output\n");
    const input = { reference: "project://result.txt", projectRoot: directory };
    assert.equal(Buffer.from(openArtifactProjectReference({ readProjectReference }, input).content).toString("utf8"), "Ordinary output\n");
    assert.throws(() => openArtifactProjectReference({ readProjectReference }, { ...input, reference: "project://../outside.txt" }),
      (error: unknown) => error instanceof ProjectReferenceError && error.status === 400);
    await writeFile(join(directory, "result.txt"), new Uint8Array([0, 1]));
    assert.throws(() => openArtifactProjectReference({ readProjectReference }, input),
      (error: unknown) => error instanceof ProjectReferenceError && error.status === 415);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a project without a known workspace opens no reference", () => {
  const ports = { readProjectReference: () => assert.fail("Nothing is read without a workspace") };
  assert.throws(() => openArtifactProjectReference(ports, { reference: "project://result.txt" }),
    (error: unknown) => error instanceof ArtifactProjectReferenceError && error.status === 409);
});
