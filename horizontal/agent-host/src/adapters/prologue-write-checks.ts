import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Runtime } from "@prologue/sdk";
import type { AgentWriteChecks } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodeIntelligence } from "../code-intelligence/index.js";

/**
 * The check before review of a round's writes (Coding A4-2): before a `write` or `edit` is proposed, the round's language server
 * formats the new text and reports the errors it brings. A formatted text replaces the call's input (F-1: the rewritten input is
 * the proposal the person reviews), and the facts are kept for the file card under the exact text they describe, so a card for
 * any other text gets none. A check that cannot run lets the write through unchanged; the card then simply has no check line.
 */

/** The facts the cards of a session can still ask for: a bounded memory, oldest first out. */
const KEPT = 200;
const CHECK_MS = 15_000;

export function writeCheckKey(sessionId: string, file: string, text: string): string {
  return `${sessionId}\u0000${path.posix.normalize(file).replace(/^\.\//u, "")}\u0000${createHash("sha256").update(text).digest("hex")}`;
}

/** Keep `checks` for a card to find, forgetting the oldest beyond the bound. */
export function keepWriteCheck(store: Map<string, AgentWriteChecks>, key: string, checks: AgentWriteChecks): void {
  store.delete(key); store.set(key, checks);
  for (const old of store.keys()) { if (store.size <= KEPT) break; store.delete(old); }
}

/** Register the session's hook; returns the way to take it off. Only `write` and `edit` inside the round's directory are touched. */
export function registerWriteChecks(runtime: Runtime, store: Map<string, AgentWriteChecks>, input: { readonly sessionId: string; readonly rootPath: string; readonly intelligence: CodeIntelligence }): () => void {
  const id = `molis-write-check-${input.sessionId}`;
  runtime.hooks.unregister(id);
  runtime.hooks.register({ id, event: "tool-before", blocking: true, forSession: input.sessionId, handler: async context => {
    if (context.toolName !== "write" && context.toolName !== "edit") return { kind: "allow" as const };
    const args = context.input as { path?: unknown; text?: unknown; find?: unknown; replace?: unknown } | undefined;
    if (typeof args?.path !== "string") return { kind: "allow" as const };
    const file = args.path;
    const before = await readFile(path.resolve(input.rootPath, file), "utf8").catch(() => undefined);
    const after = proposedText(context.toolName, args, before);
    if (after === undefined) return { kind: "allow" as const };
    let checked: Awaited<ReturnType<CodeIntelligence["checkWrite"]>>;
    try {
      checked = await Promise.race([input.intelligence.checkWrite({ path: file, before, after }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), CHECK_MS).unref?.())]);
    } catch { return { kind: "allow" as const }; }
    keepWriteCheck(store, writeCheckKey(input.sessionId, file, checked.text), checked.checks);
    if (checked.text === after) return { kind: "allow" as const };
    // An edit becomes the whole-file replacement of the text it was checked against: if the file changes before it runs, the
    // find no longer matches and the edit fails as any stale edit does.
    const rewritten = context.toolName === "write" ? { path: file, text: checked.text } : { path: file, find: before!, replace: checked.text };
    return { kind: "rewrite" as const, input: rewritten, why: "格式化后再审查" };
  } });
  return () => runtime.hooks.unregister(id);
}

/** The whole new text a call proposes; undefined when it cannot be worked out exactly (an edit whose find is not there once). */
function proposedText(tool: "write" | "edit", args: { text?: unknown; find?: unknown; replace?: unknown }, before: string | undefined): string | undefined {
  if (tool === "write") return typeof args.text === "string" ? args.text : undefined;
  if (before === undefined || typeof args.find !== "string" || typeof args.replace !== "string" || !args.find) return undefined;
  const at = before.indexOf(args.find);
  if (at < 0 || before.indexOf(args.find, at + 1) >= 0) return undefined;
  return before.slice(0, at) + args.replace + before.slice(at + args.find.length);
}
