import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
/** Bounded process execution. No shell, inherited stdin, raw stderr or credentials in errors. */
export function capture(executable: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; signal: AbortSignal; timeout?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let output = "", failure: Error | undefined;
    const stop = (message: string) => { failure = new Error(message); try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
    const abort = () => stop("已取消");
    const timer = setTimeout(() => stop("本地运行超过时限，已终止；未自动重试"), options.timeout ?? 180_000);
    options.signal.addEventListener("abort", abort, { once: true });
    if (options.signal.aborted) abort();
    child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 2_000_000) stop("运行输出超过上限"); });
    child.stderr.on("data", () => {});
    child.on("error", () => { failure = new Error("无法启动本地运行程序，请检查路径和依赖"); });
    child.on("close", code => { clearTimeout(timer); options.signal.removeEventListener("abort", abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`本地运行失败（退出码 ${code}）；请检查登录、依赖或模型配置`)); else resolve(output); });
  });
}
export class JsonWorker {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: { resolve: (v: any) => void; reject: (e: Error) => void };
  private buffer = "";
  private fatal?: Error;
  constructor(private executable: string, private args: string[], private cwd: string) {}
  request(input: unknown, signal: AbortSignal): Promise<any> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (!this.child) {
      this.child = spawn(this.executable, this.args, { cwd: this.cwd, stdio: "pipe", detached: true, env: { ...process.env, USE_TF: "0", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" } });
      this.child.stdout.on("data", chunk => {
        this.buffer += chunk.toString();
        if (this.buffer.length > 1_000_000) { this.fail(new Error("Laya 输出超过上限")); this.close(); return; }
        let index: number;
        while ((index = this.buffer.indexOf("\n")) >= 0) {
          const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
          try { const result = JSON.parse(line); if (result.fatal) this.fail(new Error(result.fatal)); else if (result.error) this.pending?.reject(new Error(result.error)); else this.pending?.resolve(result); }
          catch { this.fail(new Error("Laya 返回无效 JSON")); }
        }
      });
      this.child.stderr.on("data", () => {});
      this.child.on("error", () => this.fail(new Error("无法启动 Laya Python 环境")));
      this.child.on("close", () => this.fail(new Error("Laya 进程已结束")));
    }
    return new Promise((resolve,reject) => {
      const abort = () => { this.fail(new Error("已取消")); this.close(); };
      const timer = setTimeout(() => { this.fail(new Error("Laya 加载或推理超时")); this.close(); },180_000);
      const clean = () => { clearTimeout(timer); signal.removeEventListener("abort",abort); this.pending = undefined; };
      this.pending = { resolve: v => { clean(); resolve(v); }, reject: e => { clean(); reject(e); } };
      signal.addEventListener("abort",abort,{once:true});
      if (signal.aborted) { abort(); return; }
      this.child!.stdin.write(JSON.stringify(input)+"\n", error => { if (error) this.fail(new Error("Laya 输入通道已关闭")); });
    });
  }
  private fail(e: Error) { this.fatal = e; this.pending?.reject(e); }
  close() { if (this.child?.pid) { try { process.kill(-this.child.pid,"SIGKILL"); } catch { this.child.kill("SIGKILL"); } } }
}
