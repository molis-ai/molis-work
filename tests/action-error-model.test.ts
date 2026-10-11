import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTION_ERROR_CODE,
  ACTION_ERROR_KINDS,
  ActionError,
  defineErrorCodes,
  type ActionErrorKind,
  type BoundActionClient,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { handleTodoNativePluginHttp, handleWorkflowsNativePluginHttp } from "@molis-ai/molis-work-app-local-host";
import {
  actionErrorBody,
  actionErrorFromResponse,
  actionErrorKind,
  actionErrorResponse,
  actionHttpStatus,
} from "@molis-ai/molis-work-plugin-sdk";
import { todoErrors } from "@molis-ai/molis-work-plugin-todo";
import { serveNativeHttp } from "./fixtures/native-http.js";

// specs/repository-anti-corruption W3-02-A: one error model. An error is a code, a message, and optionally a kind and details; the code
// says whose it is (`<owner>.<reason>`), the kind says what sort of failure it is, and the transport derives the status from the kind.

/** The eleven kinds and the one HTTP status each: the table the SDK edge answers with (`satisfies` keeps it exhaustive). */
const STATUS = {
  invalid: 400, forbidden: 403, not_found: 404, conflict: 409, too_large: 413, rate_limited: 429,
  cancelled: 499, internal: 500, upstream: 502, unavailable: 503, timeout: 504,
} as const satisfies Record<ActionErrorKind, number>;

test("every kind answers one status, and no two kinds share one", () => {
  assert.equal(new Set(Object.values(STATUS)).size, Object.keys(STATUS).length);
  for (const [kind, status] of Object.entries(STATUS)) {
    assert.equal(actionHttpStatus(new ActionError("owner.reason", "m", { kind: kind as ActionErrorKind })), status, kind);
  }
});

test("ActionError carries an optional kind, details and cause, and an error without them has no such fields", () => {
  const cause = new Error("底层原因");
  const full = new ActionError("todo.conflict", "冲突", { kind: "conflict", details: { current_revision: 3 }, cause });
  assert.deepEqual([full.name, full.code, full.message, full.kind, full.details, full.cause], ["ActionError", "todo.conflict", "冲突", "conflict", { current_revision: 3 }, cause]);
  const plain = new ActionError("actions.missing", "找不到");
  assert.equal(plain instanceof Error, true);
  for (const field of ["kind", "details", "cause"]) assert.equal(Object.hasOwn(plain, field), false, field);
});

test("the kind comes from the error itself, then from the platform table, and a coded error nobody classified is a caller mistake", () => {
  assert.equal(actionErrorKind(new ActionError("todo.anything", "m", { kind: "conflict" })), "conflict");
  assert.equal(actionErrorKind(new ActionError("actions.plugin_disabled", "m")), "forbidden", "plugin_disabled is forbidden (the roadmap's status)");
  assert.equal(actionErrorKind(new ActionError("actions.missing", "m")), "not_found");
  assert.equal(actionErrorKind(new ActionError("actions.connection_required", "m")), "unavailable");
  assert.equal(actionErrorKind(new ActionError("actions.scope_mismatch", "m")), "forbidden");
  assert.equal(actionErrorKind(new ActionError("actions.cancelled", "m")), "cancelled");
  assert.equal(actionErrorKind(new ActionError("someone.unclassified", "m")), "invalid");
  // An own kind wins over the table; a kind that is not one of the eleven is ignored.
  assert.equal(actionErrorKind(new ActionError("actions.missing", "m", { kind: "conflict" })), "conflict");
  assert.equal(actionErrorKind({ code: "owner.reason", message: "m", kind: "teapot" }), "invalid");
});

test("an error with no code of ours is an internal failure, and so is anything that is not an error", () => {
  assert.equal(actionErrorKind(new Error("boom")), "internal");
  assert.equal(actionErrorKind("boom"), "internal");
  assert.equal(actionErrorKind(undefined), "internal");
  assert.equal(actionErrorKind(Object.assign(new Error("no such file"), { code: "ENOENT" })), "internal", "a system error code is not one of our codes");
  assert.deepEqual(actionErrorResponse(new Error("boom")), { status: 500, body: { error: "boom", code: "actions.execution_failed" } });
  assert.deepEqual(actionErrorResponse("boom"), { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } });
  assert.deepEqual(actionErrorResponse(null), { status: 500, body: { error: "能力执行失败", code: "actions.execution_failed" } });
});

test("the body is { error, code, details? } for an ActionError and for a coded error another realm's class made", () => {
  assert.deepEqual(actionErrorResponse(new ActionError("todo.conflict", "已在别处修改", { kind: "conflict", details: { current_revision: 4 } })),
    { status: 409, body: { error: "已在别处修改", code: "todo.conflict", details: { current_revision: 4 } } });
  assert.deepEqual(actionErrorResponse(new ActionError("actions.forbidden", "不可以")), { status: 403, body: { error: "不可以", code: "actions.forbidden" } });
  // The Runtime bundles and the Studio iframe can hold their own copy of the class: read by shape, never by instanceof.
  class OtherRealmActionError extends Error {
    readonly name = "ActionError";
    constructor(readonly code: string, message: string, readonly kind?: string, readonly details?: Record<string, unknown>) { super(message); }
  }
  const foreign = new OtherRealmActionError("todo.not_found", "没有这件待办", "not_found", { id: "t1" });
  assert.equal(foreign instanceof ActionError, false);
  assert.deepEqual(actionErrorResponse(foreign), { status: 404, body: { error: "没有这件待办", code: "todo.not_found", details: { id: "t1" } } });
  assert.equal(actionHttpStatus({ code: "actions.plugin_disabled", message: "m" }), 403, "a plain object with a code and a message is read the same way");
  assert.equal(actionErrorBody(foreign).details?.id, "t1");
});

test("translate applies to the message only", () => {
  const seen: string[] = [];
  const translate = (message: string) => { seen.push(message); return `EN:${message}`; };
  const response = actionErrorResponse(new ActionError("todo.invalid", "日期不对", { details: { field: "due_date" } }), { translate });
  assert.deepEqual(response, { status: 400, body: { error: "EN:日期不对", code: "todo.invalid", details: { field: "due_date" } } });
  assert.deepEqual(seen, ["日期不对"]);
  assert.equal(actionErrorBody(new Error("boom"), { translate }).error, "EN:boom");
  assert.equal(actionErrorBody("x", { translate }).error, "EN:能力执行失败");
});

test("a response round-trips into the same code, kind and details", () => {
  for (const [kind, status] of Object.entries(STATUS)) {
    const original = new ActionError("owner.reason", "说明", { kind: kind as ActionErrorKind, details: { n: 1 } });
    const response = actionErrorResponse(original);
    assert.equal(response.status, status);
    const rebuilt = actionErrorFromResponse(response.status, response.body);
    assert.deepEqual([rebuilt.code, rebuilt.message, rebuilt.kind, rebuilt.details], ["owner.reason", "说明", kind, { n: 1 }], kind);
  }
  // A status with no kind of its own falls to the class of the number; a body that is not ours still gives a usable error.
  assert.equal(actionErrorFromResponse(401, { error: "未登录", code: "owner.auth" }).kind, "invalid");
  assert.equal(actionErrorFromResponse(418, {}).kind, "invalid");
  assert.equal(actionErrorFromResponse(520, "<html>").kind, "internal");
  const bare = actionErrorFromResponse(502, null);
  assert.deepEqual([bare.code, bare.message, bare.kind], ["actions.execution_failed", "能力执行失败", "upstream"]);
});

// The table: one row for every platform code that exists.
const SOURCE_ROOTS = ["apps/", "packages/", "plugins/", "horizontal/", "modules/", "server/"];
/** The table itself names every code in quotes; it is what the sources are checked against, not a use. */
const TABLE_FILE = "packages/contracts/src/platform/action-errors.ts";
const platformSources = (): Map<string, string> => {
  const listed = execFileSync("git", ["ls-files", "-z", "--", "*.ts", "*.mts"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  return new Map(listed.filter(file => SOURCE_ROOTS.some(root => file.startsWith(root)) && file.includes("/src/") && !file.endsWith(".d.ts") && file !== TABLE_FILE).map(file => [file, readFileSync(file, "utf8")]));
};
/** String literals shaped like an `actions.` code that are not errors, with why. A listed literal that is not in the sources, or has a row after all, fails the test. */
const NOT_ERROR_CODES: Readonly<Record<string, string>> = {
  "actions.catalog": "the Characters plugin's capability id, not an error code",
  "actions.permission_denied": "read at memory-host.ts but raised nowhere (tests throw it as a fake); W3-02-G3 deletes the read",
};

test("every platform code the sources raise has a row in ACTION_ERROR_KINDS, and every row is a code the sources still use", () => {
  const sources = platformSources();
  const literal = /["'](actions\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)["']/gu;
  const found = new Set<string>();
  for (const text of sources.values()) for (const match of text.matchAll(literal)) found.add(match[1]!);
  const rows = new Set(Object.keys(ACTION_ERROR_KINDS));
  assert.deepEqual([...found].filter(code => !rows.has(code) && !(code in NOT_ERROR_CODES)).sort(), [], "give each a row (code and kind) in packages/contracts/src/platform/action-errors.ts");
  assert.deepEqual(Object.keys(NOT_ERROR_CODES).filter(code => !found.has(code) || rows.has(code)).sort(), [], "these exceptions are gone or have a row now: remove them");
  const used = (code: string) => [...sources.values()].some(text => text.includes(`"${code}"`) || text.includes(`'${code}'`));
  assert.deepEqual([...rows].filter(code => !used(code)).sort(), [], "a row is a code that exists: delete the row of a code no source raises any more");
  for (const kind of Object.values(ACTION_ERROR_KINDS)) assert.ok(kind in STATUS, kind);
});

test("the table puts the platform codes where the roadmap and the old mappers put them", () => {
  const kinds: Record<string, ActionErrorKind> = {
    "actions.forbidden": "forbidden", "actions.scope_mismatch": "forbidden", "actions.owner_mismatch": "forbidden", "actions.plugin_permission": "forbidden",
    "actions.home_mismatch": "forbidden", "actions.plugin_disabled": "forbidden",
    "actions.missing": "not_found",
    "actions.subject_changed": "conflict", "actions.binding_changed": "conflict", "actions.provider_changed": "conflict", "actions.host_replaced": "conflict",
    "actions.input_invalid": "invalid", "actions.project_required": "invalid", "actions.input_too_large": "too_large",
    "actions.connection_required": "unavailable", "actions.unredeemed": "unavailable", "actions.plugin_unavailable": "unavailable",
    "actions.service_unavailable": "unavailable", "actions.host_closed": "unavailable",
    "actions.cancelled": "cancelled", "actions.timeout": "timeout", "actions.rate_limited": "rate_limited", "actions.execution_failed": "internal",
    "placement.same_location": "invalid", "search.entry_duplicate": "invalid", "files.entry_duplicate": "invalid", "files.too_large": "too_large",
  };
  for (const [code, kind] of Object.entries(kinds)) assert.equal(ACTION_ERROR_KINDS[code as keyof typeof ACTION_ERROR_KINDS], kind, code);
});

test("defineErrorCodes declares an owner's codes once, each raising an ActionError with that code and kind", () => {
  const errors = defineErrorCodes("notes", { not_found: "not_found", stale: "conflict" });
  const missing = errors.not_found("找不到这条笔记");
  assert.ok(missing instanceof ActionError);
  assert.deepEqual([missing.code, missing.message, missing.kind, missing.details], ["notes.not_found", "找不到这条笔记", "not_found", undefined]);
  assert.deepEqual(errors.stale("过期了", { current_revision: 2 }).details, { current_revision: 2 });
  assert.equal(actionHttpStatus(errors.stale("过期了")), 409);
  // A second segment after the owner is allowed (`goals.event.version_conflict`); every code has the shape the platform checks.
  const grouped = defineErrorCodes("notes.export", { too_big: "too_large" });
  assert.equal(grouped.too_big("太大").code, "notes.export.too_big");
  for (const code of [missing.code, errors.stale("x").code, grouped.too_big("x").code]) assert.match(code, ACTION_ERROR_CODE);
  assert.equal(ACTION_ERROR_CODE.test("Todo.not_found"), false);
  assert.equal(ACTION_ERROR_CODE.test("not_found"), false);
  assert.equal(ACTION_ERROR_CODE.test("todo."), false);
});

test("defineErrorCodes refuses a prefix that is not an owner's name, a reason that is not a word, an unknown kind, and a platform code", () => {
  const kind = { ok: "invalid" } as const;
  for (const prefix of ["", "Todo", "todo.", ".todo", "to-do", "todo..x", "1todo", "todo x"]) {
    assert.throws(() => defineErrorCodes(prefix, kind), /前缀|prefix/iu, `prefix ${JSON.stringify(prefix)}`);
  }
  for (const prefix of ["actions", "actions.extra"]) assert.throws(() => defineErrorCodes(prefix, kind), /actions/u, "actions belongs to the platform");
  for (const reason of ["", "Bad", "has.dot", "has space", "_x", "1x"]) {
    assert.throws(() => defineErrorCodes("notes", { [reason]: "invalid" }), /原因|reason/iu, `reason ${JSON.stringify(reason)}`);
  }
  assert.throws(() => defineErrorCodes("notes", { bad: "teapot" as ActionErrorKind }), /kind/iu);
  assert.throws(() => defineErrorCodes("placement", { same_location: "invalid" }), /placement\.same_location/u, "a platform code cannot be declared again by an owner");
});

test("Todo declares its codes with defineErrorCodes: every one is todo.<reason> and has the kind its old status stood for", () => {
  const raised = {
    not_found: todoErrors.not_found("m"), conflict: todoErrors.conflict("m"), forbidden: todoErrors.forbidden("m"),
    invalid: todoErrors.invalid("m"), model_invalid: todoErrors.model_invalid("m"),
  };
  assert.deepEqual(Object.fromEntries(Object.entries(raised).map(([reason, error]) => [reason, [error.code, actionHttpStatus(error)]])), {
    not_found: ["todo.not_found", 404], conflict: ["todo.conflict", 409], forbidden: ["todo.forbidden", 403],
    invalid: ["todo.invalid", 400], model_invalid: ["todo.model_invalid", 400],
  });
});

// The dispatcher: the body is read inside the try, a body that cannot be read is an ordinary coded error, and a mapper is optional.
const never: BoundActionClient = { discover: async () => [], invoke: async () => { throw new Error("the route must not run"); } };

test("a body that is too large or not JSON reaches a remaining mapper as a coded error and still answers 400", async () => {
  // Workflows keeps its own mapper until its owner slice; its default for a platform code is 400, so nothing changes for its callers.
  const server = await serveNativeHttp((request, response, url) => handleWorkflowsNativePluginHttp(request, response, url, { actions: never }));
  try {
    const notJson = await server.post("/api/workflows/instances", "{not json");
    assert.deepEqual([notJson.status, notJson.body.code, notJson.body.error], [400, "actions.input_invalid", "请求不是有效 JSON"]);
    const tooLarge = await server.post("/api/workflows/instances", JSON.stringify({ padding: " ".repeat(500_000) }));
    assert.deepEqual([tooLarge.status, tooLarge.body.code, tooLarge.body.error], [400, "actions.input_too_large", "请求内容过大"]);
  } finally { await server.close(); }
});

test("a route with no mapper answers through the SDK: 400 for a body that is not JSON, 413 for one that is too large, with the code in the body", async () => {
  const server = await serveNativeHttp((request, response, url) => handleTodoNativePluginHttp(request, response, url, () => never));
  try {
    const notJson = await server.post("/api/todo", "{not json");
    assert.deepEqual([notJson.status, notJson.body.code, notJson.body.error], [400, "actions.input_invalid", "请求不是有效 JSON"]);
    const tooLarge = await server.post("/api/todo", JSON.stringify({ padding: " ".repeat(1_100_000) }));
    assert.deepEqual([tooLarge.status, tooLarge.body.code, tooLarge.body.error], [413, "actions.input_too_large", "请求内容过大"]);
  } finally { await server.close(); }
});
