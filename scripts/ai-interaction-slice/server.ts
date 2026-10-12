import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { renderPreview } from "./render.ts";

const modules = ["client", "controller", "bindings", "dom", "paint", "model", "state", "validation", "execution", "recommendation"];
/** Creates only an in-memory, read-only preview server. Caller explicitly starts/stops it. */
export async function createPreviewServer() {
  const content = new Map<string, { type: string; body: string }>();
  content.set("/", { type: "text/html; charset=utf-8", body: renderPreview() });
  for (const name of modules) {
    const source = await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8");
    content.set(`/slice/${name}.ts`, { type: "text/javascript; charset=utf-8", body: stripTypeScriptTypes(source) });
  }
  // The design system's own shared client, served as the module the preview imports (`/packages/design-system/src/…`).
  const shared = await readFile(new URL("../../packages/design-system/src/interaction-client.ts", import.meta.url), "utf8");
  content.set("/packages/design-system/src/interaction-client.ts", { type: "text/javascript; charset=utf-8", body: stripTypeScriptTypes(shared) });
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    const route = (request.url ?? "/").split("?")[0]!;
    const asset = content.get(route);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!asset) { response.writeHead(404); response.end("Preview route not found"); return; }
    response.writeHead(200, { "Content-Type": asset.type });
    response.end(request.method === "HEAD" ? undefined : asset.body);
  });
}
