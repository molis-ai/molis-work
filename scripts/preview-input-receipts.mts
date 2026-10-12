/**
 * R0 — the input-receipt experience, as a preview (specs/ai-input-receipts §18). It reads recorded facts from a real
 * Prologue SDK and draws them; it does not run a model, open a Home or touch product code.
 *
 *   node --import tsx scripts/preview-input-receipts.mts [--port 4292]
 */
import { createPreviewServer } from "./input-receipts-slice/server.ts";

const args = process.argv.slice(2);
if (args.length > 0 && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1] ?? ""))) throw new Error("Usage: preview-input-receipts.mts [--port 4292]");
const port = args.length > 0 ? Number(args[1]) : 4292;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be between 1024 and 65535");
const server = await createPreviewServer();
server.on("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`R0 回执预览：http://127.0.0.1:${port} · 事件来自录好的 SDK 事实，Molis 层为模拟，不连接 Home\n`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { server.closeAllConnections(); server.close(); });
