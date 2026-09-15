import { spawn } from "node:child_process";

/** Host-owned installation probe; never a model-selected project connection. */
export interface McpLauncherValidationContext {
  runtime_id: string;
  launcher_path: string;
  home_directory: string;
  plan_id: string;
}

const MCP_VALIDATION_TIMEOUT_MS = 10_000;

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
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        try {
          const message = JSON.parse(line) as { id?: number; result?: { tools?: unknown[] } };
          if (message.id === 1) {
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
          } else if (message.id === 2 && Array.isArray(message.result?.tools)) {
            finish(true);
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
