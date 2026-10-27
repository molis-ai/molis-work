import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { cogniaScriptedResponse } from "./cognia-model-response.js";
import { endingReviewAnswer } from "./ending-review.js";
import { isKnowledgeOrganize, organizedCardFor } from "./knowledge-organize.js";

export type ScriptedCall = { name: string; input: unknown };
/** A real loopback model transport with deterministic replies; no external account or model is used. */
export async function scriptedModelServer(t: TestContext, script: (body: Record<string, unknown>, turn: number) => ScriptedCall | string, review: (given: string) => string[] = () => []) {
  const requests: Record<string, unknown>[] = [], allRequests: Record<string, unknown>[] = [];
  const transportRequests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const server = createServer(async (request, response) => {
    // Count every actual HTTP request before its body is read, parsed or classified as background work.
    transportRequests.push({ method: request.method, url: request.url });
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), body = JSON.parse(raw) as Record<string, unknown>;
    // The Home's background knowledge cards (specs/project-knowledge §5) are answered aside and kept out of both lists: they are not the assistant's calls.
    const card = isKnowledgeOrganize(raw) ? organizedCardFor(raw) : undefined;
    if (card === undefined) allRequests.push(body);
    const reviewed = card ?? endingReviewAnswer(body, review);
    if (reviewed === undefined) requests.push(body);
    const next = reviewed ?? script(body, requests.length);
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaScriptedResponse(typeof next === "string" ? undefined : next, typeof next === "string" ? next : "").text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  return { requests, allRequests, transportRequests, base };
}

export async function connectorAssistantModel(t: TestContext, home: string, script: (body: Record<string, unknown>, turn: number) => ScriptedCall | string, review: (given: string) => string[] = () => []) {
  const { requests, allRequests, transportRequests, base } = await scriptedModelServer(t, script, review);
  await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const connection = withConnectorConnections(home, store => {
      const row = store.createToken({ serviceId: "model-api", displayName: "Scripted model", token: "fixture-loopback-model" });
      store.assertTarget(row.connection_id, "model-api", base); return row;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "setup-fixture", display_name: "Local setup test", base_url: base,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  return { requests, allRequests, transportRequests };
}

/** Inspect result data, never contract definitions returned by capability discovery. */
function resultField(value: unknown, key: string): unknown {
  if (typeof value === "string") { try { return resultField(JSON.parse(value), key); } catch { return undefined; } }
  if (!value || typeof value !== "object") return undefined;
  if (!Array.isArray(value) && key in value) return (value as Record<string, unknown>)[key];
  for (const [field, one] of Object.entries(value).reverse()) {
    if (["input_schema", "output_schema", "parameters"].includes(field)) continue;
    const found = resultField(one, key); if (found !== undefined) return found;
  }
  return undefined;
}

/** The latest actual Anthropic tool result; model inputs, messages and discovered schemas are not evidence. */
export function toolField(messages: unknown, key: string): unknown {
  if (!Array.isArray(messages)) return undefined;
  for (const message of messages.toReversed()) {
    if (message?.role !== "user" || !Array.isArray(message.content)) continue;
    for (const block of message.content.toReversed()) {
      if (block?.type !== "tool_result" || block.is_error) continue;
      const found = resultField(block.content, key); if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** The JSON payload of one Host material, after the provider's untrusted-data envelope. */
export function modelMaterial(messages: unknown, title: string): unknown {
  if (!Array.isArray(messages)) return undefined;
  for (const message of messages.toReversed()) {
    if (message?.role !== "user" || typeof message.content !== "string" || !message.content.startsWith("Untrusted context data.")) continue;
    const data = JSON.parse(message.content.slice(message.content.indexOf("{")));
    if (data.source !== "source-hit" || typeof data.text !== "string") continue;
    const split = data.text.indexOf("\n\n");
    if (split < 0 || JSON.parse(data.text.slice(0, split)).title !== title) continue;
    return JSON.parse(data.text.slice(split + 2));
  }
  return undefined;
}

export async function untilSetup<T>(read: () => Promise<T | undefined>, label: string, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) { const value = await read(); if (value !== undefined) return value; assert.ok(Date.now() < deadline, `Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 40)); }
}
