import { parentPort, workerData } from "node:worker_threads";
import { extractMaterialHtml, extractMaterialText } from "./material-text.js";

try {
  const result = workerData.kind === "document" ? extractMaterialHtml(workerData.html, true)
    : extractMaterialText(workerData.bytes, workerData.extension, workerData.markdown, workerData.limits);
  parentPort!.postMessage({ result });
} catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "HTML 提取失败" }); }
