import { spawn } from "node:child_process";

/** Host-owned installation probe; never a model-selected project connection. */
export interface McpLauncherValidationContext {
  runtime_id: string;
  launcher_path: string;
  home_directory: string;
  plan_id: string;
  onProtocolError?(step: "initialize" | "tools/list", code: number): void;
}

// Includes the launcher handshake and the resident's existing 20-second cold start budget.
const MCP_VALIDATION_TIMEOUT_MS = 30_000;

export async function validateMolisWorkMcpLauncher(context: McpLauncherValidationContext): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(context.launcher_path, [], {
      env: {
        ...process.env,
        MOLIS_WORK_HOME: context.home_directory,
        MOLIS_WORK_MCP_AUDIENCE: "runtime",
        MOLIS_WORK_RUNTIME_ID: context.runtime_id,
        MOLIS_WORK_WORK_CONTEXT_ID: `integration-validation-${context.plan_id}`,
        MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let settled = false;
    let buffer = "";
    let expected = 1;
    const finish = (valid: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(valid);
    };
    const timer = setTimeout(() => finish(false), MCP_VALIDATION_TIMEOUT_MS);
    child.on("error", () => finish(false));
    child.on("exit", () => finish(false));
    // CI-MCP-PIPE-01: a launcher can close its input before replying; pipe errors are asynchronous and outlive a pending write.
    child.stdin.on("error", () => finish(false));
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        if (settled) break;
        try {
          const message = JSON.parse(line) as { id?: number; result?: { tools?: unknown[] }; error?: { code: number } };
          if (message.id !== expected) continue;
          if (message.error || !message.result || typeof message.result !== "object") {
            finish(false);
            if (Number.isInteger(message.error?.code)) context.onProtocolError?.(expected === 1 ? "initialize" : "tools/list", message.error!.code);
            break;
          }
          if (expected === 1) {
            expected = 2;
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
          } else {
            finish(Array.isArray(message.result.tools));
          }
        } catch {
          finish(false);
        }
      }
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "molis-work-validator", version: "1" } },
    })}\n`);
  });
}
