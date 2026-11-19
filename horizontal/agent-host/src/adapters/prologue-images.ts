import { agentErrors } from "../errors.js";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExactRef, Runtime } from "@prologue/sdk";
import { CONVERSATION_ATTACHMENT_IMAGE_TYPES } from "@molis-ai/molis-work-contracts/services/materials";
import { type PrologueRuntimePort } from "./prologue.js";

/**
 * Pictures a Run shows the model: taken in through the Host's private intake directory (authorized once, on first use, emptied at
 * once) and let go when the Run is over. The picture itself stays the caller's conversation attachment, read again for every Run.
 */
export function createPrologueImageIntake(runtime: Runtime, storageRoot: string | undefined): NonNullable<PrologueRuntimePort["images"]> {
  let intakeRoot: Promise<{ path: string; ref: ExactRef<"authorized-root"> }> | undefined;
  return {
    intake: async input => {
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
          if (!item.mediaType || !(CONVERSATION_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(item.mediaType)) throw agentErrors.capability_unavailable("只能带 PNG、JPEG、GIF 或 WebP 图片");
          await batch.publish();
          return { resource: { id: item.ref.id, revision: item.ref.revision }, media_type: item.mediaType };
        } catch (error) { await batch.cancel(); throw error; }
      } finally { await rm(path.join(dir.path, file), { force: true }); }
    },
    release: async resource => { await runtime.resources.revoke({ kind: "resource", id: resource.id, revision: resource.revision } as ExactRef<"resource">); },
  };
}
