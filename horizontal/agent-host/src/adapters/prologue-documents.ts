import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExactRef, Runtime } from "@prologue/sdk";
import { PrologueAdapterError, type PrologueRuntimePort } from "./prologue.js";

/** Images a model call can carry, as recognised from their bytes. */
const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Documents and images people bring: read back what the runtime holds, take an image in through the Host's private
 * intake directory (authorized once, on first use, emptied at once), parse a document with the App's parsers.
 */
export function createPrologueDocuments(runtime: Runtime, storageRoot: string | undefined): NonNullable<PrologueRuntimePort["documents"]> {
  let intakeRoot: Promise<{ path: string; ref: ExactRef<"authorized-root"> }> | undefined;
  return {
    readImage: async resource => {
      const ref = { kind: "resource" as const, id: resource.id, revision: resource.revision } as ExactRef<"resource">;
      const handle = runtime.resources.inspect(ref);
      if (!handle || handle.byteLength > 20 * 1024 * 1024) return null;
      const bytes = new Uint8Array(handle.byteLength);
      for (let offset = 0; offset < bytes.byteLength;) {
        const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
        if (!chunk.bytes.byteLength) return null;
        bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
      }
      return bytes;
    },
    intakeImage: async input => {
      // The runtime takes files in only from an authorized directory: a private one of the Host's, emptied at once.
      const dir = await (intakeRoot ??= (async () => {
        const where = storageRoot ? path.join(storageRoot, "image-intake") : await mkdtemp(path.join(tmpdir(), "molis-image-intake-"));
        await mkdir(where, { recursive: true, mode: 0o700 });
        const canonical = await realpath(where);
        return { path: canonical, ref: (await runtime.workspace.authorize({ path: canonical })).ref };
      })());
      const file = `${randomUUID()}.img`;
      await writeFile(path.join(dir.path, file), input.bytes, { mode: 0o600 });
      try {
        const batch = runtime.beginIntake(dir.ref);
        try {
          const item = await batch.add(file, input.name.slice(0, 120) || "image");
          if (!item.mediaType || !IMAGE_MEDIA_TYPES.includes(item.mediaType)) throw new PrologueAdapterError("agent.capability_unavailable", "只能带 PNG、JPEG、GIF 或 WebP 图片");
          await batch.publish();
          return { resource: { id: item.ref.id, revision: item.ref.revision }, media_type: item.mediaType, byte_length: item.byteLength };
        } catch (error) { await batch.cancel(); throw error; }
      } finally { await rm(path.join(dir.path, file), { force: true }); }
    },
    parse: input => parsePrologueDocument(runtime, input),
  };
}


/** This port returns text, so neither the source bytes nor its derived resource have a consumer. */
export async function parsePrologueDocument(runtime: Runtime, input: { bytes: Uint8Array; name: string }) {
  const stage = runtime.resources.stage({ mediaKind: "binary", byteLength: input.bytes.byteLength, label: input.name.slice(0, 120) || "attachment" });
  let derived: ExactRef<"resource"> | undefined;
  try {
    stage.write(input.bytes);
    await stage.publishDurable();
    const parsed = await runtime.parseResource({ ref: stage.ref });
    derived = parsed.ref;
    return { text: parsed.text, truncated: parsed.truncated, ...(parsed.pages !== undefined ? { pages: parsed.pages } : {}) };
  } finally {
    // Try both even when releasing the derived bytes fails. The SDK also cancels unfinished durable publication.
    try { if (derived) await runtime.resources.revoke(derived); }
    finally { await runtime.resources.revoke(stage.ref); }
  }
}
