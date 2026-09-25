#!/usr/bin/env node
import { runtimeContextHostFromEnvironment } from "@molis-ai/molis-work-app-local-host";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkServer } from "@molis-ai/molis-work-app-desktop";
export { MolisWorkServer } from "@molis-ai/molis-work-app-desktop";
export { runtimeContextHostFromEnvironment } from "@molis-ai/molis-work-app-local-host";
export type { MolisWorkMcpAudience, MolisWorkMcpToolCallContext, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-app-local-host";
export type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
export { MCP_TOOLS as TOOLS, RUNTIME_MCP_TOOLS as RUNTIME_TOOLS, MCP_SERVER_INFO as SERVER_INFO } from "@molis-ai/molis-work-app-mcp";

async function runStdio(): Promise<void> {
  const runtimeHost = runtimeContextHostFromEnvironment();
  const server = new MolisWorkServer(undefined, undefined, runtimeHost, undefined,
    runtimeHost?.homeDirectory ? runtimeHost.webBaseUrl ?? "http://127.0.0.1:4173" : undefined);
  try {
    await serveMcpStdio({ handleMessage: message => server.handleMessage(message) });
  } finally {
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
