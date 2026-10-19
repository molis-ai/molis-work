import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginModelDispatch } from "@molis-ai/molis-work-plugin-runtime";
import type { PrologueInputImage } from "@molis-ai/molis-work-service-agent-host";

/** Only copied bytes enter this Host-owned source directory; the SDK owns its separate intake resources. */
export async function withPluginModelImages<T>(dispatch: PluginModelDispatch, run: (images?: readonly PrologueInputImage[]) => Promise<T>): Promise<T> {
  if (!dispatch.images?.length) return run();
  await dispatch.beforeDispatch();
  dispatch.signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "molis-plugin-model-"));
  try {
    await chmod(directory, 0o700);
    const images: PrologueInputImage[] = [];
    for (const [index, image] of dispatch.images.entries()) {
      await dispatch.beforeDispatch();
      dispatch.signal.throwIfAborted();
      const relative_path = String(index);
      await writeFile(join(directory, relative_path), image.bytes, { mode: 0o600, flag: "wx" });
      dispatch.signal.throwIfAborted();
      images.push({ root_path: directory, relative_path, ...(image.label === undefined ? {} : { label: image.label }) });
    }
    await dispatch.beforeDispatch();
    dispatch.signal.throwIfAborted();
    return await run(images);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
