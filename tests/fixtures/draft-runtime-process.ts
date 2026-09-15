import { MolisWorkServer } from "../../apps/desktop/launchers/mcp/server.js";

// Separate Runtime processes share the real project DB; the test controls only
// when requests are released, never the production transaction implementation.
const [databasePath, boardId] = process.argv.slice(2);
const server = new MolisWorkServer("runtime", { databasePath, boardId, webBaseUrl: "http://127.0.0.1:4173" });
await server.callTool("molis_work_v1_snapshot", { board_id: boardId });
process.send!({ ready: true });
process.on("message", async (message: { id: number; name: string; args: object }) => {
  try {
    const result = JSON.parse(await server.callTool(message.name, message.args));
    process.send!({ id: message.id, result });
  } catch (error) {
    process.send!({ id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
});
process.on("disconnect", () => { void server.close().then(() => process.exit(0)); });
