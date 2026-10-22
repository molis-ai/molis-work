import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Evaluation-only loading of the installed SDK's public entry; production dependency ownership stays in agent-host.
const sdkEntry = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url)).resolve("@prologue/sdk");
const sdk = await import(pathToFileURL(sdkEntry).href);
const counter: { count(text: string): { tokens: number; basis: "conservative-estimate" | "provider-reported" } } = sdk.createConservativeCounter();

/** Measures exactly the emitted message content, including the existing SDK's data wrapper, not reconstructed memories. */
export function observeEmittedMemory(requests: readonly { body: unknown }[], packed: readonly { ref: string; version: number }[]) {
  const messages: Array<{ requestIndex: number; content: string; refs: string[]; tokens: number }> = [];
  for (const [requestIndex, request] of requests.entries()) {
    const body = request.body;
    if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) continue;
    for (const message of body.messages) {
      if (!message || typeof message !== "object" || typeof message.content !== "string") continue;
      const content = message.content;
      const separator = content.indexOf("\n");
      if (separator < 0) continue;
      let data: { source?: string; origin?: string };
      try { data = JSON.parse(content.slice(separator + 1)); } catch { continue; }
      if (data.source !== "memory-recall") continue;
      const refs = packed.filter(ref => data.origin?.includes(`[memory:${ref.ref}@v${ref.version}]`)).map(ref => ref.ref);
      messages.push({ requestIndex, content, refs, tokens: counter.count(content).tokens });
    }
  }
  return {
    basis: "conservative-estimate" as const,
    scope: "actual emitted user.content including untrusted-data wrapper; excludes provider protocol role framing",
    requests: requests.length, messages,
    tokens: requests.length ? messages.reduce((total, message) => total + message.tokens, 0) : null,
    unmatchedMessages: messages.filter(message => !message.refs.length).length,
    packedButNotObserved: packed.filter(ref => !messages.some(message => message.refs.includes(ref.ref))).map(ref => ref.ref),
    usedByModel: "not-inferred-from-injection",
  };
}
