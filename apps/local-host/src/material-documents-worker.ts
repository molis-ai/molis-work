import { parentPort, workerData } from "node:worker_threads";
import { parseMaterialDocuments } from "./material-documents-parser.js";

try { parentPort!.postMessage({ result: await parseMaterialDocuments(workerData.sources) }); }
catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : "文档提取失败" }); }
