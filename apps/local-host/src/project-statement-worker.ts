import { failure, openStatementEngine, type StatementEngine } from "./project-statement-engine.js";
import type { StatementReply, StatementRequest } from "./project-statement-protocol.js";

// The entry of the process that runs a sandboxed plugin's statements (`project-statement-process.ts` starts it with `fork`). It
// answers one request at a time over the IPC channel and leaves when the Host's end closes. It holds no secrets and reads no
// environment; the Host kills it whenever a statement runs too long or grows it past its memory.

let engine: StatementEngine | undefined;

process.on("message", (request: StatementRequest) => {
  let reply: StatementReply;
  try {
    if (request.op === "open") {
      engine?.close();
      engine = openStatementEngine(request.path, request.record);
      reply = { id: request.id, ok: true };
    } else reply = engine ? engine.handle(request) : failure(request.id, new Error("项目库还没有打开"));
  } catch (error) { reply = failure(request.id, error); }
  process.send?.(reply);
});
process.on("disconnect", () => { engine?.close(); process.exit(0); });
