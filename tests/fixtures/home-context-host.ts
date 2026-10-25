import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createDesktopWebHost, openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";

export async function homeContextHost(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "home-context-resident-"));
  let host: MolisWorkLocalHost | undefined, server: ReturnType<ReturnType<typeof createDesktopWebHost>> | undefined;
  t.after(async () => {
    if (server) { const closing = new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve())); server.closeAllConnections(); await closing; }
    await host?.close(); await rm(home, { recursive: true, force: true });
  });
  host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: project => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(project)) });
  server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const access = host.ensureWebCatalog(home, openMolisWorkProjectCatalog);
  await access.warm();
  return { home, host, server, origin: `http://127.0.0.1:${address.port}`, token: resolveWebControlToken({ homeDirectory: home }),
    catalog: access.withCatalog };
}

/** The shipped launcher, not another test MCP composition. */
export async function homeContextStdio(t: TestContext, options: { home: string; origin: string; panelId?: string; workContext?: string; omitHome?: boolean; sessionTitle?: string; workspace?: string }) {
  const client = new Client({ name: "untrusted-context-name", version: "1" });
  t.after(() => client.close());
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      HOME: options.home, MOLIS_WORK_HOME: options.omitHome ? "" : options.home, MOLIS_WORK_RUNTIME_ID: "codex", MOLIS_WORK_WEB_URL: options.origin,
      MOLIS_WORK_WORK_CONTEXT_ID: options.workContext ?? "context-stdio-session", MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      MOLIS_WORK_PANEL_ID: options.panelId ?? "", MOLIS_WORK_GOAL_ID: "", MOLIS_WORK_SESSION_ID: "", CODEX_THREAD_ID: "",
      CLAUDE_CODE_SESSION_NAME: options.sessionTitle ?? "",
      PWD: options.workspace ?? process.cwd(),
    }, stderr: "pipe" });
  let errors = ""; transport.stderr?.on("data", chunk => { errors = (errors + String(chunk)).slice(-3000); });
  await client.connect(transport).catch(error => { throw new Error(String(error) + errors); });
  return client;
}

export async function contextTool<Output>(client: Client, name: string, input: Record<string, unknown> = {}, meta?: Record<string, unknown>): Promise<Output> {
  const result = await client.callTool({ name: `molis_work_v1_${name}`, arguments: input, ...(meta ? { _meta: meta } : {}) });
  assert.equal(result.isError, false, JSON.stringify(result));
  const content = result.content;
  assert.ok(Array.isArray(content) && content[0]?.type === "text" && typeof content[0].text === "string");
  return JSON.parse(content[0].text) as Output;
}
