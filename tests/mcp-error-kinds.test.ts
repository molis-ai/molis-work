import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { dispatchMcpProjectTool, formatMcpToolError, isPlatformMcpTool, isRuntimeContextMcpTool } from "@molis-ai/molis-work-app-mcp";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { RuntimeProjectConnection, assertMcpStartInput, assertMcpToolAllowed, createPresentationError, mcpErrorKind, mcpErrors, requireMcpRuntimeContextHost, runtimeConnectionIdentity, type McpErrorReason } from "@molis-ai/molis-work-app-local-host";
import type { RuntimeWorkContext } from "@molis-ai/molis-work-contracts/modules/private-work-context";

// T-340 (RAC-2713, RAC-2714): every `mcp.*` code is declared once with its kind, every throw site raises through that
// declaration, and a code raised from two paths has one kind. The statuses that the HTTP edges derive from those kinds stay
// what they were (invalid 400 where the edge answers, forbidden 403 / not_found 404 for the preflight codes, unavailable 503
// for the startup codes).
const DECLARED: Readonly<Record<McpErrorReason, string>> = {
  action_revoked: "forbidden", permission_revoked: "forbidden", authority_denied: "forbidden", tool_unknown: "not_found",
  unexpected_field: "invalid", startup_entry_missing: "unavailable", startup_failed: "unavailable",
  grant_invalid: "invalid", grant_scope: "invalid", grant_missing: "invalid", grant_requires: "invalid",
  context_host_missing: "invalid", runtime_identity_missing: "invalid",
  context_changed: "invalid", context_refresh_required: "conflict", tool_disabled: "unavailable", connection_incomplete: "unavailable",
  not_found: "not_found", path_required: "invalid", url_invalid: "invalid", runtime_decide_unsupported: "invalid",
};
/**
 * The one throw site that cannot go through the declaration: `scripts/gates/goals-management-wiring.mjs` pins the exact AST shape
 * of `mcp-v1-tool.ts`'s `mcp.path_required` refusal (a bare `new ActionError` with the code literal and two arguments). The task
 * record carries it as an approved acceptance exception; closing it needs a gate change (MISC). Its `actionErrorKind` is the
 * default `invalid`, which is what the declaration says too, so nothing behaves differently without the explicit kind.
 */
const PINNED_BARE_THROW = { path: "apps/local-host/src/mcp-v1-tool.ts", code: "mcp.path_required" };
const CALL_CONTEXT = { runtimeSessionId: null, runtimeSessionIdSource: null };
const RUNTIME_STATE = { audience: "runtime", connectionState: {}, runtimeConnection: null, runtimeContextHost: null };
const EMPTY_CATALOG = { entries: [], known_names: new Set<string>(), home_scoped_names: new Set<string>() };
const kindOf = (run: () => unknown): unknown => {
  try { run(); } catch (error) { return (error as { kind?: unknown }).kind; }
  assert.fail("the code did not throw");
};

test("RAC-2713 every declared mcp code raises with its declared kind, and no throw site builds one by hand", () => {
  for (const [reason, kind] of Object.entries(DECLARED) as [McpErrorReason, string][]) {
    const error = mcpErrors[reason]("message") as { code?: string; kind?: string };
    assert.deepEqual({ code: error.code, kind: error.kind }, { code: `mcp.${reason}`, kind }, reason);
  }
  const sources: { path: string; text: string }[] = [];
  for (const root of ["apps/local-host/src", "apps/mcp/src"]) {
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        if (name.isDirectory()) walk(path);
        else if (name.name.endsWith(".ts")) sources.push({ path, text: readFileSync(path, "utf8") });
      }
    };
    walk(fileURLToPath(new URL(`../${root}`, import.meta.url)));
  }
  let pinned = 0;
  for (const source of sources) {
    for (const match of source.text.matchAll(/new ActionError\(\s*"mcp\.([a-z0-9_]+)"/gu)) {
      const code = `mcp.${match[1]}`;
      assert.equal(source.path.endsWith(PINNED_BARE_THROW.path) && code === PINNED_BARE_THROW.code, true,
        `${source.path}: a bare mcp code is raised by hand (${code}); only the gate-pinned exception may be`);
      assert.equal(actionErrorKind(new ActionError(code, "message")), DECLARED.path_required);
      pinned += 1;
    }
    for (const match of source.text.matchAll(/createError\("(mcp\.[a-z0-9_]+)"/gu)) {
      assert.notEqual(mcpErrorKind(match[1]), undefined, `${source.path}: ${match[1]} is not declared`);
    }
    // The one literal that is not a fixed code: the settings route names the discovery's own availability code without a kind
    // of its own (`state.code`, or this fallback); every other `mcp.*` literal must be a declared code.
    for (const match of source.text.matchAll(/"(mcp\.[a-z0-9_]+)"/gu)) {
      const code = match[1];
      assert.ok(code === "mcp.json" || code === "mcp.grant_unavailable" || mcpErrorKind(code) !== undefined,
        `${source.path}: ${code} is not a declared mcp code`);
    }
  }
  assert.equal(pinned, 1, "the gate-pinned refusal is the only bare mcp throw");
  assert.ok(sources.length > 20, "the source scan saw the two trees");
});

test("RAC-2714 authority_denied and tool_unknown carry one kind from the preflight, the authority check and the tool dispatch", async () => {
  const preflightAuthorityDenied = kindOf(() => assertMcpStartInput("runtime", "molis_work_v1_initialize", {}));
  const authorityDenied = kindOf(() => assertMcpToolAllowed(RUNTIME_STATE as never, "molis_work_v1_initialize", CALL_CONTEXT, EMPTY_CATALOG as never));
  const dispatchedAuthorityDenied = await dispatchMcpProjectTool(null, "molis_work_v1_initialize", {}, { audience: "runtime", createError: createPresentationError })
    .then(() => "no error", (error: { kind?: unknown }) => error.kind);
  assert.deepEqual([preflightAuthorityDenied, authorityDenied, dispatchedAuthorityDenied], ["forbidden", "forbidden", "forbidden"]);

  const preflightToolUnknown = kindOf(() => assertMcpStartInput("runtime", "molis_work_v1_no_such_tool", {}));
  const authorityToolUnknown = kindOf(() => assertMcpToolAllowed(RUNTIME_STATE as never, "molis_work_v1_no_such_tool", CALL_CONTEXT, EMPTY_CATALOG as never));
  const dispatchedToolUnknown = await dispatchMcpProjectTool(null, "molis_work_v1_no_such_tool", {}, { audience: "runtime", createError: createPresentationError })
    .then(() => "no error", (error: { kind?: unknown }) => error.kind);
  assert.deepEqual([preflightToolUnknown, authorityToolUnknown, dispatchedToolUnknown], ["not_found", "not_found", "not_found"]);
});

test("RAC-2761 RAC-2762 runtime is denied a platform management tool without a catalog, while management is allowed", () => {
  const name = "molis_work_v1_initialize";
  assert.equal(isPlatformMcpTool(name), true);
  assert.equal(isRuntimeContextMcpTool(name), false);
  const state = { audience: "runtime" as const, connectionState: new RuntimeProjectConnection(), runtimeConnection: null, runtimeContextHost: null };
  // RAC-2763: omit the catalog so changing only this production branch's raiser must fail these assertions.
  const error = kindOfError(() => assertMcpToolAllowed(state, name, CALL_CONTEXT));
  assert.ok(error instanceof ActionError);
  assert.equal(error.code, "mcp.authority_denied");
  assert.equal(actionErrorKind(error), "forbidden");
  assert.doesNotThrow(() => assertMcpToolAllowed({ ...state, audience: "management" }, name, CALL_CONTEXT));
});

test("RAC-2713 the statuses the HTTP edges derive from these kinds are the ones they answered before", () => {
  // Codes whose throw sites answer HTTP: context gateway identity checks and the settings grant errors keep 400.
  for (const code of ["mcp.context_host_missing", "mcp.runtime_identity_missing", "mcp.grant_invalid", "mcp.grant_scope", "mcp.grant_missing", "mcp.grant_requires"]) {
    assert.equal(actionHttpStatus(createPresentationError(code, "message")), 400, code);
  }
  assert.equal(actionHttpStatus(kindOfError(() => requireMcpRuntimeContextHost({ runtimeContextHost: null }))), 400);
  assert.equal(actionHttpStatus(kindOfError(() => runtimeConnectionIdentity(null, CALL_CONTEXT))), 400);
  // The preflight and startup codes that already had kinds keep them.
  assert.equal(actionHttpStatus(kindOfError(() => assertMcpStartInput("runtime", "molis_work_v1_initialize", {}))), 403);
  assert.equal(actionHttpStatus(kindOfError(() => assertMcpStartInput("runtime", "molis_work_v1_no_such_tool", {}))), 404);
  assert.equal(actionHttpStatus(mcpErrors.startup_failed("message")), 503);
});

function kindOfError(run: () => unknown): Error {
  try { run(); } catch (error) { return error as Error; }
  assert.fail("the code did not throw");
  return new Error("unreachable");
}

test("RAC-2713 four changed kinds and one unchanged kind in this group are carried by Host errors, and the MCP wire carries no kind", () => {
  // The one transport that reads a kind is the HTTP edge (`actionErrorResponse`); these five leave through the MCP JSON-RPC
  // error text instead, which `formatMcpToolError` builds from code, message and details only (apps/mcp/src/tool-error.ts →
  // actionErrorBody). Their declared kinds therefore change no wire value: the statuses below are what they were (invalid 400 /
  // not_found 404 fallback before) only where the JSON-RPC text carries no status at all. The abort reason used by
  // mcp-server.ts:47 is re-thrown unchanged by `throwIfAborted`, so its kind is the declared one too.
  const changed: [McpErrorReason, string, number][] = [
    ["context_changed", "invalid", 400],
    ["context_refresh_required", "conflict", 409],
    ["tool_disabled", "unavailable", 503],
    ["connection_incomplete", "unavailable", 503],
    ["not_found", "not_found", 404],
  ];
  for (const [reason, kind, status] of changed) {
    const error = mcpErrors[reason]("message");
    assert.equal((error as { kind?: string }).kind, kind, reason);
    assert.equal(actionHttpStatus(error), status, reason);
    const wire = JSON.parse(formatMcpToolError(error)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(wire).sort(), ["code", "error"], `${reason}: the MCP wire carries code and message, not kind`);
  }
  const controller = new AbortController();
  controller.abort(mcpErrors.context_changed("MCP 调用主体已变化"));
  assert.equal(kindOf(() => controller.signal.throwIfAborted()), "invalid", "the abort reason keeps its declared kind");
  // Real throw sites for two more of the five: a known method the project turned off, and a runtime call with no project connection.
  const turnedOff = kindOfError(() => assertMcpToolAllowed(RUNTIME_STATE as never, "test.turned.off", CALL_CONTEXT,
    { entries: [], known_names: new Set(["test.turned.off"]), home_scoped_names: new Set() } as never));
  assert.deepEqual([turnedOff.code, (turnedOff as { kind?: string }).kind], ["mcp.tool_disabled", "unavailable"]);
  const notConnected = kindOfError(() => assertMcpToolAllowed({ ...RUNTIME_STATE, connectionState: new RuntimeProjectConnection({} as never) } as never,
    "test.runtime.action", CALL_CONTEXT, { entries: [{ definition: { name: "test.runtime.action" } }], known_names: new Set(), home_scoped_names: new Set() } as never));
  assert.deepEqual([notConnected.code, (notConnected as { kind?: string }).kind], ["mcp.connection_incomplete", "unavailable"]);
});

test("RAC-2713 the session-refresh refusal keeps its details flat on the wire, so the recovery fields are read where callers look", () => {
  // The real throw site (mcp-authority.ts:55) passes the recovery fields as the details object; the declaration raiser takes the
  // details directly, so a `{ details: … }` wrapper would nest them under wire `details.details` and break the documented recovery
  // shape (`next_action`, `requires_bind`, …). Check the actual throw and the production formatting.
  const connection = new RuntimeProjectConnection();
  const contextA: RuntimeWorkContext = { runtime_id: "runtime-1", stable_work_context_id: "session-1" };
  const contextB: RuntimeWorkContext = { runtime_id: "runtime-1", stable_work_context_id: "session-2" };
  connection.accept({} as never, contextA);
  connection.observe(contextB);
  const state = { audience: "runtime", connectionState: connection, runtimeConnection: null, runtimeContextHost: { runtimeContext: contextB } };
  // A runtime-surface action (not a context tool, which returns before the refresh check) with a catalog that knows it by name.
  const catalog = { entries: [{ definition: { name: "test.runtime.action" } }], known_names: new Set(["test.runtime.action"]), home_scoped_names: new Set() };
  const error = kindOfError(() => assertMcpToolAllowed(state as never, "test.runtime.action", CALL_CONTEXT, catalog as never));
  assert.deepEqual((error as { details?: unknown }).details, { next_action: "context_resolve_then_retry", requires_bind: false,
    requires_user_confirmation: false, retry_same_idempotency_key: true, retry_when_context_status: "bound" });
  const wire = JSON.parse(formatMcpToolError(error)) as { code?: string; details?: Record<string, unknown> };
  assert.equal(wire.code, "mcp.context_refresh_required");
  assert.equal(wire.details?.next_action, "context_resolve_then_retry", "the recovery field stays at wire details.next_action");
  assert.equal(Object.hasOwn(wire.details ?? {}, "details"), false, "no nested details wrapper on the wire");
});
