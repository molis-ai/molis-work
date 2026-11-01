import { Worker } from "node:worker_threads";
import type { StatementFatal, StatementMemoryLimits, StatementReply, StatementRequest } from "./project-statement-protocol.js";

// This process's main thread never runs SQLite. Its timers and disconnect handler remain runnable while the SQL Worker is in
// a native call or the Host is blocked in its own synchronous writer. Ending the entire process releases SQLite's locks.
let engine: Worker | undefined;
let pending: StatementRequest | undefined;
let requestTimer: NodeJS.Timeout | undefined;
let transaction: { id: number; deadline: number; timer: NodeJS.Timeout } | undefined;
let ending = false;

function end(fatal: StatementFatal): void {
  if (ending) return;
  ending = true;
  const kill = () => { process.kill(process.pid, "SIGKILL"); };
  // Delivery is diagnostic, never a prerequisite for releasing the lock when the Host is blocked or gone.
  setTimeout(kill, 20);
  if (!process.connected) { kill(); return; }
  try { process.send?.(fatal, kill); } catch { kill(); }
}

function timeout(): void { end({ fatal: "timeout", message: "项目库的语句或事务已超过截止时间，已终止" }); }

function clearTransaction(): void {
  clearTimeout(transaction?.timer);
  transaction = undefined;
}

function startEngine(limits: StatementMemoryLimits): Worker {
  const worker = new Worker(new URL("./project-statement-sql-worker.js", import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: limits.heapMb },
  });
  worker.on("message", (reply: StatementReply) => {
    const request = pending;
    if (ending || !request || request.id !== reply.id) return;
    if (Date.now() >= request.deadline || (transaction && Date.now() >= transaction.deadline)) { timeout(); return; }
    clearTimeout(requestTimer);
    if ((request.op === "begin" && !reply.ok) || ((request.op === "commit" || request.op === "rollback") && reply.ok)) clearTransaction();
    pending = undefined;
    try { process.send?.(reply, error => { if (error) end({ fatal: "process", message: "宿主通道已经关闭" }); }); }
    catch { end({ fatal: "process", message: "宿主通道已经关闭" }); }
  });
  worker.on("error", error => end({ fatal: "process", message: `项目库 SQL Worker 出错：${error.message.slice(0, 1024)}` }));
  worker.on("exit", code => end({ fatal: "process", message: `项目库 SQL Worker 意外退出（${code}）` }));
  const sampling = setInterval(() => {
    // rss() includes all isolates and native allocations in this process, unlike the Worker's V8 heap limit.
    if ((pending || transaction) && process.memoryUsage.rss() > limits.rssMb * 1024 * 1024) {
      end({ fatal: "memory", message: `项目库的语句用掉的内存超过 ${limits.rssMb} MB，已终止` });
    }
  }, limits.sampleMs);
  sampling.unref();
  return worker;
}

process.on("message", (request: StatementRequest) => {
  if (ending) return;
  if (pending) { end({ fatal: "process", message: "项目库进程一次只处理一个请求" }); return; }
  if (Date.now() >= request.deadline || (transaction && Date.now() >= transaction.deadline)) { timeout(); return; }
  const preparation = request.op === "validate-home-schema" || request.op === "initialize-owned-home-library";
  if (request.op === "open" || preparation) {
    if (engine) { end({ fatal: "process", message: "项目库已经打开" }); return; }
    engine = startEngine(request.limits);
  }
  if (!engine) { end({ fatal: "process", message: "项目库还没有打开" }); return; }
  if (request.op === "begin" && !transaction) {
    const { id, transactionDeadline: deadline } = request;
    if (Date.now() >= deadline) { timeout(); return; }
    const timer = setTimeout(() => { if (transaction?.id === id) timeout(); }, deadline - Date.now());
    transaction = { id, deadline, timer };
  }
  pending = request;
  if (preparation) {
    // Startup and DDL have distinct budgets. This thread remains runnable while SQLite blocks the SQL Worker or the Host.
    requestTimer = setTimeout(() => { if (pending?.id === request.id) timeout(); }, Math.max(0, request.startDeadline - Date.now()));
    engine.once("online", () => {
      if (ending || pending?.id !== request.id) return;
      clearTimeout(requestTimer);
      const deadline = Math.min(request.deadline, Date.now() + request.executionMs);
      pending = { ...request, deadline };
      requestTimer = setTimeout(() => { if (pending?.id === request.id) timeout(); }, Math.max(0, deadline - Date.now()));
      engine!.postMessage(pending);
    });
  } else {
    requestTimer = setTimeout(() => { if (pending?.id === request.id) timeout(); }, request.deadline - Date.now());
    engine.postMessage(request);
  }
});
process.on("disconnect", () => end({ fatal: "process", message: "宿主已经退出" }));
