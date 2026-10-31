import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { dispatchMcpProjectTool } from "@molis-ai/molis-work-app-mcp";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { assertMcpStartInput, assertMcpToolAllowed, createPresentationError, mcpErrorKind, mcpErrors, requireMcpRuntimeContextHost, runtimeConnectionIdentity, type McpErrorReason } from "@molis-ai/molis-work-app-local-host";

// T-340 (RAC-2713, RAC-2714): every `mcp.*` code is declared once with its kind, every throw site raises through that
// declaration, and a code raised from two paths has one kind. The statuses that the HTTP edges derive from those kinds stay
// what they were (invalid 400 where the edge answers, forbidden 403 / not_found 404 for the preflight codes, unavailable 503
// for the startup codes).
const DECLARED: Readonly<Record<McpErrorReason, string>> = {
  action_revoked: "forbidden", permission_revoked: "forbidden", authority_denied: "forbidden", tool_unknown: "not_found",
  unexpected_field: "invalid", startup_entry_missing: "unavailable", startup_failed: "unavailable",
  grant_invalid: "invalid", grant_scope: "invalid", grant_missing: "invalid", grant_requires: "invalid",
  context_host_missing: "invalid", runtime_identity_missing: "invalid",
  context_changed: "conflict", context_refresh_required: "conflict", tool_disabled: "unavailable", connection_incomplete: "unavailable",
  not_found: "not_found", path_required: "invalid", url_invalid: "invalid", runtime_decide_unsupported: "invalid",
};
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
      // scripts/gates/goals-management-wiring.mjs pins this one refusal's AST shape (a bare ActionError with the code literal
      // mcp.path_required); changing it needs a gate change, and its kind is the default invalid, which is what it declares.
      assert.ok(source.path.endsWith("apps/local-host/src/mcp-v1-tool.ts") && code === "mcp.path_required",
        `${source.path}: a bare mcp code is raised by hand (${code})`);
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
