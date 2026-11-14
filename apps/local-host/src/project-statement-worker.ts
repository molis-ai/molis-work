import { Worker } from "node:worker_threads";
import { isDatabaseUpgrade, isPreparation, type StatementFatal, type StatementMemoryLimits, type StatementPrepared, type StatementReply, type StatementRequest, type StatementUpgradeDecision } from "./project-statement-protocol.js";

// This process's main thread never runs SQLite. Its timers and disconnect handler remain runnable while the SQL Worker is in
// a native call or the Host is blocked in its own synchronous writer. Ending the entire process releases SQLite's locks.
let engine: Worker | undefined;
let pending: StatementRequest | undefined;
let requestTimer: NodeJS.Timeout | undefined;
let transaction: { id: number; deadline: number; timer: NodeJS.Timeout } | undefined;
let ending = false;
let commit: { view: Int32Array; prepared: boolean; sent: boolean } | undefined;

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

function startEngine(limits: StatementMemoryLimits, upgrade: boolean): Worker {
  const worker = new Worker(new URL("./project-statement-sql-worker.js", import.meta.url), {
    resourceLimits: { maxOldGenerationSizeMb: limits.heapMb },
    workerData: { upgrade },
  });
  worker.on("message", (reply: StatementReply | StatementPrepared) => {
    const request = pending;
    if (ending || !request || request.id !== reply.id) return;
    if (Date.now() >= request.deadline || (transaction && Date.now() >= transaction.deadline)) { timeout(); return; }
    if ("prepared" in reply) {
      if (!commit || commit.prepared) { end({ fatal: "process", message: "重复或无效的升级提交请求" }); return; }
      commit.prepared = true;
      forward(reply);
      return;
    }
    clearTimeout(requestTimer);
    commit = undefined;
    if ((request.op === "begin" && !reply.ok) || ((request.op === "commit" || request.op === "rollback") && reply.ok)) clearTransaction();
    pending = undefined;
    forward(reply);
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

function forward(reply: StatementReply | StatementPrepared): void {
  try { process.send?.(reply, error => { if (error) end({ fatal: "process", message: "宿主通道已经关闭" }); }); }
  catch { end({ fatal: "process", message: "宿主通道已经关闭" }); }
}

process.on("message", (request: StatementRequest | StatementUpgradeDecision) => {
  if (ending) return;
  if ("publishUpgrade" in request) {
    if (!pending || pending.id !== request.id || !commit?.prepared || commit.sent) {
      end({ fatal: "process", message: "宿主的升级提交不匹配" });
      return;
    }
    if (Date.now() >= pending.deadline) { timeout(); return; }
    commit.sent = true;
    Atomics.store(commit.view, 0, 1);
    Atomics.notify(commit.view, 0);
    return;
  }
  if (pending) { end({ fatal: "process", message: "项目库进程一次只处理一个请求" }); return; }
  if (Date.now() >= request.deadline || (transaction && Date.now() >= transaction.deadline)) { timeout(); return; }
  const preparation = isPreparation(request);
  if (request.op === "open" || preparation) {
    if (engine) { end({ fatal: "process", message: "项目库已经打开" }); return; }
    engine = startEngine(request.limits, isDatabaseUpgrade(request));
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
      if (isDatabaseUpgrade(request)) {
        const commitGate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
        commit = { view: new Int32Array(commitGate), prepared: false, sent: false };
        engine!.postMessage({ ...pending, commitGate });
      } else engine!.postMessage(pending);
    });
  } else {
    requestTimer = setTimeout(() => { if (pending?.id === request.id) timeout(); }, request.deadline - Date.now());
    engine.postMessage(request);
  }
});
process.on("disconnect", () => end({ fatal: "process", message: "宿主已经退出" }));
