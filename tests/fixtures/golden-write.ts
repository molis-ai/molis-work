import assert from "node:assert/strict";

/** What the golden replay hands each owner's write case (tests/golden-writes/<owner>.ts, specs/upgrade-continuity/golden-replay-design.md §4 step 6). */
export interface GoldenWriteContext {
  /** An action through the Host's real client, as the person, holding exactly the permissions the action asks for. */
  call(capability: string, input?: Record<string, unknown>, options?: { version?: number; user_action?: Record<string, unknown> }): Promise<unknown>;
  /** A settings entry of the Host's real web surface, for the owners whose only write entry is there. */
  http(route: string, options?: { method?: string; body?: unknown }): Promise<unknown>;
  readonly projectId: string;
  /** Differs between generating and replaying, so the same case makes a new record each time rather than a duplicate. */
  readonly tag: string;
}

/** The first `key` anywhere in an answer: the owners wrap the record they return differently, and a write case only needs its id or revision. */
export function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const own = (value as Record<string, unknown>)[key];
  if (own !== undefined) return own;
  for (const child of Object.values(value)) { const found = field(child, key); if (found !== undefined) return found; }
  return undefined;
}

/** The written text came back. The failure message names only the case, so a replay's output stays free of data. */
export function readsBack(answer: unknown, marker: string): void {
  assert.ok(JSON.stringify(answer ?? null).includes(marker), "the write did not come back through the owner's read");
}

/** Keep a transport failure diagnosable without logging routes, bodies, secrets or service messages. The refusal still propagates. */
export function diagnoseGoldenHttp(http: GoldenWriteContext["http"]): GoldenWriteContext["http"] {
  return async (...args) => {
    try { return await http(...args); }
    catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z_]{1,64}$/.test(cause.code)
        ? cause.code : "unclassified";
      process.stderr.write(`golden HTTP failure: ${error instanceof TypeError ? "type_error" : error instanceof SyntaxError ? "syntax_error" : "error"}; cause=${code}\n`);
      throw error;
    }
  };
}
