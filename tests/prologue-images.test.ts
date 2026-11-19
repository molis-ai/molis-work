import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueImageIntake, takeImagesIn } from "@molis-ai/molis-work-service-agent-host";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
const image = (material_id: string) => ({ material_id, title: `${material_id}.png`, media_type: "image/png",
  attachment: { subject: { kind: "conversation_attachment", id: `ca_${"a".repeat(64)}` }, pin: { mode: "current" as const, read_revision: "a".repeat(64) } } });

/** A runtime that records what it was asked to take in, publish, cancel and revoke. */
function fakeRuntime(mediaType = "image/png") {
  const seen = { authorized: [] as string[], published: 0, cancelled: 0, revoked: [] as string[] };
  let next = 0;
  const runtime = {
    workspace: { authorize: async ({ path }: { path: string }) => { seen.authorized.push(path); return { ref: { kind: "authorized-root", id: "root", revision: 1 } }; } },
    beginIntake: () => ({
      add: async () => ({ mediaType, ref: { id: `res-${++next}`, revision: 1 } }),
      publish: async () => { seen.published += 1; },
      cancel: async () => { seen.cancelled += 1; },
    }),
    resources: { revoke: async (ref: { id: string }) => { seen.revoked.push(ref.id); } },
  };
  return { runtime, seen };
}

test("W2-18-PARSE-RESOURCES-01 a Run's pictures are taken in through an emptied private directory and each revoked once the Run lets them go", async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-images-"));
  try {
    const { runtime, seen } = fakeRuntime();
    const intake = createPrologueImageIntake(runtime as never, home);
    const port = { images: intake } as never;
    const taken = await takeImagesIn(port, [image("one"), image("two")], { images: [{ material_id: "one", bytes: pixel }, { material_id: "two", bytes: pixel }] } as never);
    assert.deepEqual(taken.materials.map(item => item.resource.id), ["res-1", "res-2"]);
    assert.equal(seen.published, 2);
    assert.equal(seen.authorized.length, 1, "the intake directory is authorized once");
    assert.deepEqual(await readdir(join(home, "image-intake")), [], "no copy is left in the intake directory");
    taken.release(); taken.release();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(seen.revoked, ["res-1", "res-2"], "each picture is revoked exactly once");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("a picture whose bytes were not read, or that the runtime does not take as a picture, stops the Run and lets go of what was taken", async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-images-"));
  try {
    const { runtime, seen } = fakeRuntime();
    const port = { images: createPrologueImageIntake(runtime as never, home) } as never;
    await assert.rejects(takeImagesIn(port, [image("one"), image("two")], { images: [{ material_id: "one", bytes: pixel }] } as never), /图片「two\.png」没有读到/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(seen.revoked, ["res-1"], "the one already taken in is let go");

    const other = fakeRuntime("application/pdf");
    const refusing = { images: createPrologueImageIntake(other.runtime as never, home) } as never;
    await assert.rejects(takeImagesIn(refusing, [image("one")], { images: [{ material_id: "one", bytes: pixel }] } as never), /只能带 PNG、JPEG、GIF 或 WebP 图片/);
    assert.equal(other.seen.cancelled, 1);
    assert.equal(other.seen.published, 0);
    await assert.rejects(takeImagesIn({} as never, [image("one")], { images: [{ material_id: "one", bytes: pixel }] } as never), /没有发给模型/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
