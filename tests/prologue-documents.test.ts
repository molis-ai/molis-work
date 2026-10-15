import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

test("W2-18-PARSE-RESOURCES-01 successful and failed text extraction release owned resources while another image stays readable", { timeout: 120_000 }, async () => {
  // 36 parses of 8 MiB: each stages and publishes the source (~0.6 s here) and, since W2-18, revokes it and its derived
  // resource before returning (~0.8 s, the SDK's revoke of 8 MiB). That is about 52 s of real work on a loaded machine.
  const home = await mkdtemp(join(tmpdir(), "prologue-document-resources-"));
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
  const source = Buffer.alloc(8 * 1024 * 1024); pixel.copy(source);
  let fail = false;
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.document-resource-test", appVersion: "1.0.0" }, storageRoot: join(home, "runtime"),
    modelConfiguration: async () => { throw new Error("Parsing must not select a model"); }, resolveCredential: () => { throw new Error("Parsing must not resolve a credential"); },
    documentParsers: [{ mediaTypes: ["image/png"], async parse({ bytes }) {
      assert.equal(bytes.byteLength, source.byteLength);
      if (fail) throw new Error("fixture parser rejected the document");
      return { text: "Extracted source text", pages: 1 };
    } }] });
  try {
    const documents = adapter.documents!;
    const kept = await documents.intakeImage!({ bytes: pixel, name: "kept.png" });
    for (const refusal of [false, true]) {
      fail = refusal;
      // Each batch alone exceeds the Home's 128 MiB total limit if this port retains its 8 MiB input.
      for (let index = 0; index < 18; index++) {
        const pending = documents.parse({ bytes: source, name: "source.png" });
        if (refusal) await assert.rejects(pending, /fixture parser rejected/);
        else assert.deepEqual(await pending, { text: "Extracted source text", truncated: false, pages: 1 });
      }
      // The port hands back bytes (a Uint8Array); what is compared is the bytes.
      assert.deepEqual(Buffer.from(await documents.readImage!(kept.resource)), pixel, "releasing parsed inputs must not revoke another consumer's image");
      await documents.intakeImage!({ bytes: pixel, name: "after.png" });
    }
  } finally { await adapter.close(); await rm(home, { recursive: true, force: true }); }
});
