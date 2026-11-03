import { parentPort } from "node:worker_threads";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeStoreRegistry, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { initializeInstalledSandboxHomeLibrary, validateInstalledSandboxHomeSchema } from "./installed-plugin-libraries.js";
import { failure, openStatementEngine, type StatementEngine } from "./project-statement-engine.js";
import type { StatementReply, StatementRequest } from "./project-statement-protocol.js";

// SQLite may stay in a native call indefinitely. Only the controller thread owns deadlines and kills the whole process.
let engine: StatementEngine | undefined;
parentPort!.on("message", (request: StatementRequest) => {
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
    } else reply = engine ? engine.handle(request) : failure(request.id, new Error("项目库还没有打开"));
  } catch (error) {
    reply = failure(request.id, error);
    if ((request.op === "validate-home-schema" || request.op === "initialize-owned-home-library") && !reply.ok
      && (error instanceof ActionError || error instanceof SqliteSchemaVersionError)) {
      reply = { ...reply, preparationError: { code: error.code, ...(error instanceof ActionError ? { kind: error.kind, details: error.details } : {}) } };
    }
  }
  parentPort!.postMessage(reply);
});
