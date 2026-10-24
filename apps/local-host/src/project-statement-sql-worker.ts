import { parentPort } from "node:worker_threads";
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
    } else reply = engine ? engine.handle(request) : failure(request.id, new Error("项目库还没有打开"));
  } catch (error) { reply = failure(request.id, error); }
  parentPort!.postMessage(reply);
});
