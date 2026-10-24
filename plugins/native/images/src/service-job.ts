import { randomUUID } from "node:crypto";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { GeneratedImage, ImageJob } from "@molis-ai/molis-work-contracts/modules/images";
import { imagesErrors, isImagesFailure } from "./error.js";
import { generateProviderImages } from "./providers.js";
import type { ImagesServiceOptions, ImagesControl } from "./service.js";
import { IMAGES_ASSETS } from "./owner-files.js";
import type { ImagesStore, StoredConnection } from "./store.js";

interface JobRun extends ImagesServiceOptions {
  job: ImageJob;
  connection: StoredConnection;
  revision: string;
  control: ImagesControl;
  current(): void;
  read(): ImageJob;
  write<T>(control: ImagesControl, apply: (store: ImagesStore) => T): Promise<T>;
}

export async function runImageJob(run: JobRun): Promise<void> {
  const { job, connection, control } = run;
  const target = { slot_id: connection.id, base_url: connection.base_url };
  let resultRevision: string | undefined;
  const check = () => {
    control.signal?.throwIfAborted(); requireSynchronous(control.assert_authority_current?.()); run.current();
    if (run.read().status !== "running") throw imagesErrors.cancelled("任务已停止。");
    const state = run.imageGeneration.inspect(target);
    if (!state.available || resultRevision !== undefined && state.revision !== resultRevision) throw imagesErrors.connection_changed("图像连接已改变，本次结果未保存。");
  };
  const lifetime = createExecutionLifetime({ signal: control.signal, monitor: { intervalMs: 200, check } });
  const guarded: PluginExecutionControl = { ...control, signal: lifetime.signal, assert_authority_current: () => { lifetime.assertActive(); check(); },
    beforeEffect: async () => { lifetime.assertActive(); check(); await control.beforeEffect(); lifetime.assertActive(); check(); } };
  try {
    check();
    const images = await generateProviderImages({ ...target, expected_revision: run.revision, protocol: connection.api_format,
      model: connection.model, prompt: job.prompt, ...(job.size ? { size: job.size } : {}), ...(job.aspect_ratio ? { aspect_ratio: job.aspect_ratio } : {}) },
      lifetime.signal, async (request, signal) => {
        const result = await run.imageGeneration.generate(request, { signal });
        resultRevision = result.revision;
        return result.images;
      });
    check();
    const saved: GeneratedImage[] = [];
    for (const image of images) {
      const id = randomUUID(), extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[image.mime];
      const filename = `${id}.${extension}`;
      // The check and the write are one synchronous step: nothing can change the job or the connection between them.
      await run.files.write(writer => { requireSynchronous(guarded.assert_authority_current?.()); writer.writeFile(`${IMAGES_ASSETS}/${filename}`, image.bytes, "create"); });
      saved.push({ id, filename, mime_type: image.mime, byte_length: image.bytes.length });
    }
    await run.write(guarded, store => store.finish(job.project_id, job.id, "succeeded", saved, ""));
  } catch (error) {
    // Lost authority, changed connections, cancellation and deleted jobs produce no business write.
    try {
      check();
      const state = run.imageGeneration.inspect(target);
      if (state.revision !== (resultRevision ?? run.revision)) return;
      resultRevision = state.revision;
    } catch { return; }
    await run.write(guarded, store => store.finish(job.project_id, job.id, "failed", [], failureMessage(error)));
  } finally { lifetime.dispose(); }
  // Unreferenced files from a partial write are reclaimed during the next authorized plugin start.
}

function failureMessage(error: unknown): string {
  if (isImagesFailure(error)) return error.message;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && "message" in error && typeof error.message === "string") {
    if ("kind" in error && error.kind === "timeout") return "等待厂商响应已超过 180 秒。厂商可能仍在生成或计费，请检查用量后再手动重试。";
    if (["host.image_runtime_unavailable", "host.image_provider_failed"].includes(error.code)) return error.message;
  }
  return "生成失败：无法连接厂商、下载图片或保存结果。请检查网络、API 基址及磁盘空间，然后手动重试。";
}
