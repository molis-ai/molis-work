import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { attachConversationFile, forgetInstallationAttachments, forgetProjectAttachments, holdsConversationAttachment, readConversationAttachment } from "@molis-ai/molis-work-app-local-host";
import { attachedImages } from "@molis-ai/molis-work-service-agent-host";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
const upload = (file_name: string, bytes: Buffer) => ({ file_name, data_base64: bytes.toString("base64") });
const coding = { plugin_id: "molis.coding", install_id: "install-coding", project_id: "project-a" };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const blobs = (home: string) => join(home, "conversation-attachments", "blobs");
const notFound = { code: "material.attachment.not_found" };

async function inHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "molis-attachments-"));
  try { await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

test("S-conversation-attachments CATT-01 an attachment is read back only by the installation, in the project, that attached it", async () => inHome(async home => {
  const picture = await attachConversationFile(home, coding, upload("shot.png", pixel));
  const note = await attachConversationFile(home, coding, upload("note.md", Buffer.from("# 要点\n周三同步")));
  assert.equal(picture.kind, "image"); assert.equal(picture.media_type, "image/png");
  assert.deepEqual(picture.ref, { subject: { kind: "conversation_attachment", id: `ca_${sha(pixel)}` }, pin: { mode: "current", read_revision: sha(pixel) } });
  assert.deepEqual((await readConversationAttachment(home, coding, picture.ref, { as: "image" })).image?.bytes, pixel);
  assert.match((await readConversationAttachment(home, coding, note.ref, { as: "text" })).text ?? "", /周三同步/);
  for (const other of [{ ...coding, install_id: "install-other" }, { ...coding, project_id: "project-b" }, { ...coding, project_id: null }, { ...coding, plugin_id: "molis.assistant" }]) {
    await assert.rejects(readConversationAttachment(home, other, picture.ref, { as: "image" }), notFound);
    await assert.rejects(readConversationAttachment(home, other, note.ref, { as: "text" }), notFound);
    assert.equal(holdsConversationAttachment(home, other, picture.ref), false);
  }
  assert.equal(holdsConversationAttachment(home, coding, picture.ref), true);
  // The same bytes attached again by the same owner are the same attachment.
  assert.deepEqual((await attachConversationFile(home, coding, upload("again.png", pixel))).ref, picture.ref);
}));

test("S-conversation-attachments CATT-02 a reference that is not exactly an attachment's is refused, and so is a picture asked of a document", async () => inHome(async home => {
  const picture = await attachConversationFile(home, coding, upload("shot.png", pixel));
  const note = await attachConversationFile(home, coding, upload("note.txt", Buffer.from("plain words")));
  const digest = sha(pixel);
  const forged: MaterialRef[] = [
    { subject: { kind: "project_file", id: `ca_${digest}` }, pin: { mode: "current", read_revision: digest } },
    { subject: { kind: "conversation_attachment", id: digest }, pin: { mode: "current", read_revision: digest } },
    { subject: { kind: "conversation_attachment", id: `ca_${digest}` }, pin: { mode: "current", read_revision: "0".repeat(64) } },
    { subject: { kind: "conversation_attachment", id: `ca_${digest.toUpperCase()}` }, pin: { mode: "current", read_revision: digest.toUpperCase() } },
    { subject: { kind: "conversation_attachment", id: "ca_../../etc/passwd" }, pin: { mode: "current", read_revision: "../../etc/passwd" } },
  ];
  for (const ref of forged) await assert.rejects(readConversationAttachment(home, coding, ref, { as: "image" }), notFound);
  await assert.rejects(readConversationAttachment(home, coding, note.ref, { as: "image" }), { code: "material.attachment.not_image" });
  assert.ok(picture);
}));

test("S-conversation-attachments CATT-03 a cancelled or refused attach keeps nothing; names, sizes and encodings out of bounds are refused before reading", async () => inHome(async home => {
  await assert.rejects(attachConversationFile(home, coding, upload("shot.png", pixel), { beforeEffect: () => { throw new Error("revoked"); } }), /revoked/);
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(attachConversationFile(home, coding, upload("shot.png", pixel), { signal: stopped.signal }));
  assert.equal(existsSync(blobs(home)) ? (await readdir(blobs(home))).length : 0, 0, "no bytes were kept");
  const ref: MaterialRef = { subject: { kind: "conversation_attachment", id: `ca_${sha(pixel)}` }, pin: { mode: "current", read_revision: sha(pixel) } };
  await assert.rejects(readConversationAttachment(home, coding, ref, { as: "image" }), notFound);
  for (const name of ["../shot.png", "a/b.png", "", ".."]) await assert.rejects(attachConversationFile(home, coding, upload(name, pixel)), { code: "material.attachment.invalid_name" });
  await assert.rejects(attachConversationFile(home, coding, { file_name: "x.txt", data_base64: "not base64!" }), { code: "material.attachment.invalid_data" });
  const big = Buffer.alloc(5 * 1024 * 1024 + 1); pixel.copy(big);
  await assert.rejects(attachConversationFile(home, coding, upload("big.png", big)), { code: "material.attachment.too_large" });
  await assert.rejects(attachConversationFile(home, coding, upload("tool.exe", Buffer.from("MZ binary"))), { code: "material.attachment.unsupported" });
}));

test("S-conversation-attachments CATT-04 bytes changed on disk are never shown as the picture that was attached", async () => inHome(async home => {
  const picture = await attachConversationFile(home, coding, upload("shot.png", pixel));
  await writeFile(join(blobs(home), sha(pixel)), Buffer.from("tampered"));
  await assert.rejects(readConversationAttachment(home, coding, picture.ref, { as: "image" }), { code: "material.attachment.unreadable" });
  await rm(join(blobs(home), sha(pixel)));
  assert.equal(holdsConversationAttachment(home, coding, picture.ref), false);
  await assert.rejects(readConversationAttachment(home, coding, picture.ref, { as: "image" }), { code: "material.attachment.unreadable" });
}));

test("B35-R4 a cancelled publication leaves no blob and a same-byte reattach after forget has readable bytes", async () => inHome(async home => {
  const controller = new AbortController();
  await assert.rejects(attachConversationFile(home, coding, upload("cancel.png", pixel), {
    signal: controller.signal, beforeEffect: () => controller.abort(),
  }), { name: "AbortError" });
  assert.deepEqual(await readdir(blobs(home)), []);

  const [first, repeated] = await Promise.all([
    attachConversationFile(home, coding, upload("first.png", pixel)),
    attachConversationFile(home, coding, upload("repeated.png", pixel)),
  ]);
  assert.deepEqual(first, repeated, "both offers return the recorded attachment and its title");
  const other = { ...coding, project_id: "project-b" };
  const attaching = attachConversationFile(home, other, upload("other.png", pixel), {
    beforeEffect: () => forgetProjectAttachments(home, coding.project_id),
  });
  const kept = await attaching;
  await assert.rejects(readConversationAttachment(home, coding, kept.ref, { as: "original" }), notFound);
  assert.deepEqual((await readConversationAttachment(home, other, kept.ref, { as: "original" })).original, pixel);
  assert.deepEqual(await readdir(blobs(home)), [sha(pixel)]);
}));

test("S-conversation-attachments CATT-05 a deleted project or a removed installation takes its attachments; bytes another owner still names stay", async () => inHome(async home => {
  const other = { ...coding, install_id: "install-other" };
  const mine = await attachConversationFile(home, coding, upload("shot.png", pixel));
  await attachConversationFile(home, other, upload("same.png", pixel));
  const words = await attachConversationFile(home, coding, upload("note.txt", Buffer.from("only mine")));
  await forgetInstallationAttachments(home, coding.plugin_id, coding.install_id, coding.project_id);
  await assert.rejects(readConversationAttachment(home, coding, mine.ref, { as: "image" }), notFound);
  assert.equal(existsSync(join(blobs(home), sha(Buffer.from("only mine")))), false, "bytes no one names are removed");
  assert.equal(holdsConversationAttachment(home, other, mine.ref), true, "the other installation's copy of the same bytes stays");
  await forgetProjectAttachments(home, coding.project_id);
  assert.equal(holdsConversationAttachment(home, other, mine.ref), false);
  assert.deepEqual(await readdir(blobs(home)), []);
  assert.ok(words);
}));

test("S-conversation-attachments CATT-06 a round's pictures come only from the caller's own attachments: other kinds, mismatched types and callers without a reader are refused", async () => {
  const ref = (kind = "conversation_attachment"): MaterialRef => ({ subject: { kind, id: `ca_${"a".repeat(64)}` }, pin: { mode: "current", read_revision: "a".repeat(64) } });
  const image = (material_id: string, attachment = ref(), media_type = "image/png") => ({ material_id, title: `${material_id}.png`, attachment, media_type });
  const owned = { attachmentImage: async () => ({ media_type: "image/png", bytes: pixel }) };
  assert.deepEqual(await attachedImages({ image_materials: [image("one")] }, owned), [{ material_id: "one", bytes: pixel }]);
  await assert.rejects(attachedImages({ image_materials: [image("one")] }, {}), /还不能把图片交给模型/);
  await assert.rejects(attachedImages({ image_materials: [image("one", ref("project_file"))] }, owned), /不是这里添加的图片/);
  await assert.rejects(attachedImages({ image_materials: [image("one", ref(), "image/jpeg")] }, owned), /不是能给模型看的图片/);
  await assert.rejects(attachedImages({ image_materials: [image("one")] }, { attachmentImage: async () => { throw Object.assign(new Error("找不到这个附件"), { code: "material.attachment.not_found" }); } }), notFound);
  await assert.rejects(attachedImages({ image_materials: [image("one"), image("one")] }, owned), /不同的图片/);
  await assert.rejects(attachedImages({ image_materials: Array.from({ length: 7 }, (_, index) => image(`p${index}`)) }, owned), /最多带 6 张/);
});
