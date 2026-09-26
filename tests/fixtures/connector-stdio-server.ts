import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
if (process.env.APP_ID !== "fixture-app" || process.env.APP_SECRET !== "fixture-secret" || process.env.LARK_DOMAIN !== "https://open.feishu.cn" || process.env.LARK_TOKEN_MODE !== "tenant_access_token") process.exit(2);
const server = new Server({ name: "connector-stdio-fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "read", inputSchema: { type: "object" } }] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: "actual stdio response" }] }));
await server.connect(new StdioServerTransport());
