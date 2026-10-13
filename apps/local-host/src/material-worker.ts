import { Worker } from "node:worker_threads";
import { materialErrors } from "./material-text.js";

type MaterialWorker = "material-pdf-worker.js" | "material-documents-worker.js" | "material-html-worker.js";
/** Production parsers use their packaged worker, including when a test imports Host source. */
export async function runMaterialWorker<T>(module: MaterialWorker, data: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number }, subject: string): Promise<T> {
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30 * 60_000) throw materialErrors.invalid_limits("提取超时设置无效");
  const worker = new Worker(new URL(`./${module}`, import.meta.resolve("@molis-ai/molis-work-app-local-host")),
    { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 256 } });
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(options.signal!.reason);
      worker.once("message", (message: { result?: T; error?: string }) => {
        if (options.signal?.aborted) { reject(options.signal.reason); return; }
        if (message.result !== undefined) resolve(message.result);
        else reject(materialErrors.extraction_failed(message.error ?? `${subject}提取失败`));
      });
      worker.once("error", error => {
        const failure = materialErrors.extraction_failed(`${subject}解析进程失败，请拆分文件或重试`);
        failure.cause = error; reject(failure);
      });
      worker.once("exit", () => reject(materialErrors.extraction_failed(`${subject}提取进程已退出`)));
      options.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(materialErrors.timeout(`${subject}提取超时`)), timeoutMs);
      if (options.signal?.aborted) abort();
    });
  } finally {
    clearTimeout(timer); if (abort) options.signal?.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
