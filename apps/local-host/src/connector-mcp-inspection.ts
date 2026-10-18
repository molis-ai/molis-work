import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";

type Tools = Awaited<ReturnType<Client["listTools"]>>["tools"];
type Resources = Awaited<ReturnType<Client["listResources"]>>["resources"];
export type McpInspection = { tools: Tools; resources: Resources };
const REQUEST_TIMEOUT = 30_000;

export async function inspectMcpClient(client: Client, signal?: AbortSignal): Promise<McpInspection> {
  const capabilities = client.getServerCapabilities();
  const tools: Tools = [];
  const resources: Resources = [];
  if (capabilities?.tools) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do { const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: REQUEST_TIMEOUT, signal }); tools.push(...page.tools); cursor = page.nextCursor; if (cursor && seen.has(cursor)) throw connectorErrors["connector.mcp.provider"]("MCP 工具分页重复"); if (cursor) seen.add(cursor); } while (cursor);
  }
  if (capabilities?.resources) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    do { const page = await client.listResources(cursor ? { cursor } : undefined, { timeout: REQUEST_TIMEOUT, signal }); resources.push(...page.resources); cursor = page.nextCursor; if (cursor && seen.has(cursor)) throw connectorErrors["connector.mcp.provider"]("MCP 资源分页重复"); if (cursor) seen.add(cursor); } while (cursor);
  }
  return { tools, resources };
}
