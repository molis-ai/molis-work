import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { AgentMemoryRecallFact } from "@molis-ai/molis-work-contracts/services/agent-host";

// Evaluation-only loading of the installed SDK's public entry; production dependency ownership stays in agent-host.
const sdkEntry = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url)).resolve("@prologue/sdk");
const sdk = await import(pathToFileURL(sdkEntry).href);
const counter: { count(text: string): { tokens: number; basis: "conservative-estimate" | "provider-reported" } } = sdk.createConservativeCounter();

/** Measures exactly the emitted message content, including the existing SDK's data wrapper, not reconstructed memories. */
export function observeEmittedMemory(requests: readonly { body: unknown }[], contexts: AgentMemoryRecallFact["contexts"] | null) {
  const messages: Array<{ requestIndex: number; messageIndex: number; content: string; tokens: number }> = [];
  for (const [requestIndex, request] of requests.entries()) {
    const body = request.body;
    if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) continue;
    for (const [messageIndex, message] of body.messages.entries()) {
      if (!message || typeof message !== "object") continue;
      const contents = typeof message.content === "string" ? [message.content] : Array.isArray(message.content)
        ? message.content.filter((part: { type?: string; text?: unknown }) => part?.type === "text" && typeof part.text === "string").map((part: { text: string }) => part.text) : [];
      for (const content of contents) {
        const separator = content.indexOf("\n");
        if (separator < 0) continue;
        let data: { source?: string };
        try { data = JSON.parse(content.slice(separator + 1)); } catch { continue; }
        if (data.source !== "memory-recall") continue;
        messages.push({ requestIndex, messageIndex, content, tokens: counter.count(content).tokens });
      }
    }
  }
  return {
    basis: "conservative-estimate" as const,
    scope: "actual emitted user.content including untrusted-data wrapper; excludes provider protocol role framing",
    requests: requests.length, messages,
    tokens: requests.length ? messages.reduce((total, message) => total + message.tokens, 0) : null,
    // parts.index addresses the pre-protocol transcript. System folding and tool-result grouping
    // can shift HTTP indices; the public call receipt does not expose a reversible mapping.
    contextCalls: contexts ?? null,
    messageAssociation: { state: "unknown" as const, reason: "HTTP requests have no prepared call id; Context part indices are not HTTP message indices. No origin/text/token matching is used." },
    usedByModel: "not-inferred-from-injection",
  };
}
