import { createPreviewServer } from "./ai-interaction-slice/server.ts";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]!))) {
  throw new Error("Usage: node --import tsx scripts/preview-ai-interaction.mts [--port 4319]");
}
const port = args.length ? Number(args[1]) : 4319;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be between 1024 and 65535");
const server = await createPreviewServer();
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  console.log(`I0 独立演示：http://127.0.0.1:${port} · 固定示例，提交与执行均为模拟`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  server.closeAllConnections();
  server.close();
});
