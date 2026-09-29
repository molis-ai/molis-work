import { isAbsolute } from "node:path";
import type { ResourceBinding, Runtime } from "@prologue/sdk";
import { PrologueInferenceError, type PrologueInputImage } from "../inference.js";

/** Original bytes stay in Node Host intake; no file tools or workspace roots enter the model session. */
export async function withInferenceImages<T>(runtime: Runtime, images: readonly PrologueInputImage[] | undefined,
  check: () => Promise<void>, operation: (attachments?: readonly ResourceBinding[]) => Promise<T>): Promise<T> {
  if (!images?.length) return operation();
  if (images.length > 30) throw new PrologueInferenceError("inference.image_limit", "一次最多读取 30 张原图，请减少材料后重试");
  const groups = new Map<string, (PrologueInputImage & { index: number })[]>();
  for (const [index, image] of images.entries()) {
    if (!isAbsolute(image.root_path)) throw new PrologueInferenceError("inference.image_path", "图片来源目录无效");
    const group = groups.get(image.root_path) ?? []; group.push({ ...image, index }); groups.set(image.root_path, group);
  }
  const batches: ReturnType<Runtime["beginIntake"]>[] = [];
  const attachments: ResourceBinding[] = [];
  let bytes = 0;
  try {
    for (const [rootPath, group] of groups) {
      await check();
      const root = await runtime.workspace.authorize({ path: rootPath, posture: "read-only" });
      await check();
      const batch = runtime.beginIntake(root.ref); batches.push(batch);
      for (const image of group) {
        await check();
        const item = await batch.add(image.relative_path, image.label);
        bytes += item.byteLength;
        if (bytes > 128 * 1024 * 1024) throw new PrologueInferenceError("inference.image_limit", "图片合计超过 128 MiB，请减少材料后重试");
        if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(item.mediaType)) {
          throw new PrologueInferenceError("inference.image_format", "模型原图输入支持 PNG、JPEG、GIF 和 WebP；这份材料的实际格式不受支持");
        }
        attachments[image.index] = { ref: item.ref, as: "original" };
      }
      await check();
      await batch.publish();
    }
    await check();
    return await operation(attachments);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "RESOURCE_LIMIT_EXCEEDED") {
      throw new PrologueInferenceError("inference.image_limit", "图片超出单图 32 MiB、批次或当前共享资源限额，请减少材料后重试");
    }
    throw error;
  } finally {
    // Cancel also discards staged bytes after a partial/failed batch; revoke destroys published bytes.
    const cleanup = await Promise.allSettled(batches.map(async batch => {
      if (batch.state === "published") await Promise.all(batch.items.map(item => runtime.resources.revoke(item.ref)));
      else await batch.cancel();
    }));
    const errors = cleanup.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map(result => result.reason), "图片暂存清理失败");
  }
}
