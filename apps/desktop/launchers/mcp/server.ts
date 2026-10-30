#!/usr/bin/env node
import { runtimeContextHostFromEnvironment, createMcpResidentStarter } from "@molis-ai/molis-work-app-local-host";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import { MolisWorkServer } from "@molis-ai/molis-work-app-desktop";
export { MolisWorkServer } from "@molis-ai/molis-work-app-desktop";
export { runtimeContextHostFromEnvironment } from "@molis-ai/molis-work-app-local-host";
export type { MolisWorkMcpAudience, MolisWorkMcpToolCallContext, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-app-local-host";
export type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
export { MCP_TOOLS as TOOLS } from "@molis-ai/molis-work-app-local-host";
export { RUNTIME_MCP_TOOLS as RUNTIME_TOOLS, MCP_SERVER_INFO as SERVER_INFO } from "@molis-ai/molis-work-app-mcp";

async function runStdio(): Promise<void> {
  const runtimeHost = runtimeContextHostFromEnvironment();
  const resident = createMcpResidentStarter();
  const server = new MolisWorkServer(undefined, undefined, runtimeHost, undefined,
    runtimeHost?.webBaseUrl ?? readProductEnv("WEB_URL") ?? "http://127.0.0.1:4173", resident.ensure);
  try {
    await serveMcpStdio({ handleMessage: (message, signal) => server.handleMessage(message, signal) });
  } finally {
    resident.close();
    await server.close();
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("mcp/server.ts") ||
    process.argv[1].endsWith("mcp/server.js"));

if (isMain) {
  runStdio().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
