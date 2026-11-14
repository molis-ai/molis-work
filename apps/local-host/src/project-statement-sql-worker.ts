import { parentPort, workerData } from "node:worker_threads";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { initializeInstalledSandboxHomeLibrary, validateInstalledSandboxHomeSchema } from "./installed-plugin-libraries.js";
import { failure, openStatementEngine, type StatementEngine } from "./project-statement-engine.js";
import { isDatabaseUpgrade, isPreparation, type StatementPrepared, type StatementReply, type StatementRequest } from "./project-statement-protocol.js";

// SQLite may stay in a native call indefinitely. Only the controller thread owns deadlines and kills the whole process.
let engine: StatementEngine | undefined;
// Ordinary statement processes load only their SQL engine. Load the installed upgrade graph only for the dedicated one-shot request.
const upgrade = (workerData as { upgrade?: boolean } | undefined)?.upgrade
  ? (await import("./installed-database-upgrade.js")).upgradeInstalledDatabase : undefined;
parentPort!.on("message", (request: StatementRequest & { commitGate?: SharedArrayBuffer }) => {
  let reply: StatementReply;
  try {
    if (request.op === "open") {
      engine = openStatementEngine(request.path, request.record);
      reply = { id: request.id, ok: true };
    } else if (request.op === "validate-home-schema") {
      validateInstalledSandboxHomeSchema(request.declaration);
      reply = { id: request.id, ok: true };
    } else if (request.op === "initialize-owned-home-library") {
      initializeInstalledSandboxHomeLibrary(request.home, request.owner, request.declaration, homeStoreRegistry(request.reserved));
      reply = { id: request.id, ok: true };
    } else if (isDatabaseUpgrade(request)) {
      if (!upgrade || !request.commitGate) throw new Error("缺少升级 SQL Worker");
      const view = new Int32Array(request.commitGate);
      upgrade(request, () => {
        const message: StatementPrepared = { id: request.id, prepared: true };
        parentPort!.postMessage(message);
        Atomics.wait(view, 0, 0, Math.max(0, request.deadline - Date.now()));
        if (Atomics.load(view, 0) !== 1 || Date.now() >= request.deadline) {
          throw new ActionError("actions.cancelled", "插件库升级没有在时限内获准提交");
        }
      });
      reply = { id: request.id, ok: true };
    } else reply = engine ? engine.handle(request) : failure(request.id, new Error("项目库还没有打开"));
  } catch (error) {
    reply = failure(request.id, error);
    if (isPreparation(request) && !reply.ok
      && error instanceof ActionError) {
      reply = { ...reply, preparationError: { code: error.code, kind: error.kind, details: error.details } };
    }
  }
  parentPort!.postMessage(reply);
});
