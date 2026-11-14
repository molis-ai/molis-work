import { parentPort, workerData } from "node:worker_threads";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { failure, openStatementEngine, type StatementEngine } from "./project-statement-engine.js";
import { isDatabaseUpgrade, isPreparation, type StatementCommitPermit, type StatementPrepared, type StatementStep, type StatementReply, type StatementRequest } from "./project-statement-protocol.js";

// SQLite may stay in a native call indefinitely. Only the controller thread owns deadlines and kills the whole process.
let engine: StatementEngine | undefined;
// Ordinary statement processes load only their SQL engine. Load the installed upgrade graph only for the dedicated one-shot request.
const upgrade = (workerData as { upgrade?: boolean } | undefined)?.upgrade
  ? (await import("./installed-database-upgrade.js")).upgradeInstalledDatabase : undefined;
let prepared: Extract<StatementStep, { op: "commit" }> | undefined;
parentPort!.on("message", async (request: (StatementRequest & { commitGate?: SharedArrayBuffer }) | StatementCommitPermit) => {
  if ("commit_permit" in request) {
    const commit = prepared;
    prepared = undefined;
    parentPort!.postMessage(commit && commit.id === request.commit_permit && engine ? engine.finishCommit(commit)
      : failure(request.commit_permit, new Error("项目提交许可与原事务不一致")));
    return;
  }
  let reply: StatementReply;
  try {
    if (request.op === "open") {
      engine = openStatementEngine(request.path, request.record);
      reply = { id: request.id, ok: true };
    } else if (request.op === "validate-home-schema") {
      const { validateInstalledSandboxHomeSchema } = await import("./installed-plugin-libraries.js");
      validateInstalledSandboxHomeSchema(request.declaration);
      reply = { id: request.id, ok: true };
    } else if (request.op === "initialize-owned-home-library") {
      const { initializeInstalledSandboxHomeLibrary } = await import("./installed-plugin-libraries.js");
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
    } else {
      reply = engine ? engine.handle(request) : failure(request.id, new Error("项目库还没有打开"));
      if (request.op === "commit" && request.decision && reply.ok) {
        prepared = request;
        parentPort!.postMessage({ id: request.id, ready_to_commit: true });
        return;
      }
    }
  } catch (error) {
    reply = failure(request.id, error);
    if (isPreparation(request) && !reply.ok
      && error instanceof ActionError) {
      reply = { ...reply, preparationError: { code: error.code, kind: error.kind, details: error.details } };
    }
  }
  parentPort!.postMessage(reply);
});
