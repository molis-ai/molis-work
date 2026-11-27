import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  ACTION_ERROR_CODE,
  ACTION_ERROR_KINDS,
  ActionError,
  defineErrorCodes,
  type ActionDefinition,
  type ActionErrorKind,
  type BoundActionClient,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { handleAgentReviewHttp, handleFunctionsHttp, installHostUiText, MolisWorkLocalHost, runWithLocale, sendLocalWebJson, sendUnhandledWebError } from "@molis-ai/molis-work-app-local-host";
import { AgentHost, AgentReviewQueue, classifyPrologueStopReason, presentToolReview, reviewField, reviewText } from "@molis-ai/molis-work-service-agent-host";
import {
  actionErrorBody,
  actionErrorFromResponse,
  actionErrorKind,
  actionErrorResponse,
  actionHttpStatus,
  bindPluginActionRoute,
} from "@molis-ai/molis-work-plugin-sdk";
import { todoErrors } from "@molis-ai/molis-work-plugin-todo";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { serveNativeHttp } from "./fixtures/native-http.js";

// specs/archive/repository-anti-corruption W3-02-A: one error model. An error is a code, a message, and optionally a kind and details; the code
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
  // The body never carries a code that is not ours either: a system or driver code is neither the answer's code nor its details.
  for (const foreignCode of ["ENOENT", "ERR_SQLITE_ERROR", "Todo.not_found", "todo", "todo."]) {
    const foreign = Object.assign(new Error("no such file, open /x/y"), { code: foreignCode, details: { path: "/x/y" } });
    assert.deepEqual(actionErrorResponse(foreign), { status: 500, body: { error: "no such file, open /x/y", code: "actions.execution_failed" } }, foreignCode);
  }
  // A foreign code with a kind of its own is still not a code of ours: status, code and details agree on one answer.
  assert.deepEqual(actionErrorResponse(new ActionError("ENOENT", "no such file", { kind: "not_found", details: { path: "/x/y" } })),
    { status: 500, body: { error: "no such file", code: "actions.execution_failed" } });
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
  // A body whose code is not ours is read as no code, the same way the edge writes it.
  assert.equal(actionErrorFromResponse(500, { error: "x", code: "ENOENT" }).code, "actions.execution_failed");
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
  for (const code of rows) assert.match(code, ACTION_ERROR_CODE, "a platform code is written in the one format a code has");
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
const never: BoundActionClient = { discoverOne: async () => undefined, discover: async () => [], invoke: async () => { throw new Error("the route must not run"); } };

test("Functions answers through the SDK: invalid JSON is 400 and an oversized body is 413, with exact codes and messages", async () => {
  // W3-02-G2-BODY-01: Functions has no mapper; platform kinds keep the exact body and never execute the action.
  // The existing body limit is checked before JSON parsing.
  const server = await serveNativeHttp((request, response, url) => handleFunctionsHttp(request, response, url, "/unused", { actions: never }));
  try {
    const notJson = await server.post("/api/functions/settings", "{not json");
    assert.deepEqual([notJson.status, notJson.body.code, notJson.body.error], [400, "actions.input_invalid", "请求不是有效 JSON"]);
    const tooLarge = await server.post("/api/functions/settings", "x".repeat(1_100_000));
    assert.deepEqual([tooLarge.status, tooLarge.body.code, tooLarge.body.error], [413, "actions.input_too_large", "请求内容过大"]);
  } finally { await server.close(); }
});

test("a Runtime route answers through the SDK: 400 for a body that is not JSON, 413 for one that is too large, with the code in the body", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), { request } = f;
  // Todo is a partition plugin since batch 108: its route is the personal space's.
  const items = `/projects/${(await f.personal(["todo"])).project_id}/api/plugins/io.molis.work.todo/items`;
  const notJson = await request(items, { method: "POST", raw: "{not json" });
  const notJsonBody = await notJson.json() as { code: string; error: string };
  assert.deepEqual([notJson.status, notJsonBody.code, notJsonBody.error], [400, "actions.input_invalid", "请求不是有效 JSON"]);
  const tooLarge = await request(items, { method: "POST", raw: JSON.stringify({ padding: " ".repeat(1_100_000) }) });
  const tooLargeBody = await tooLarge.json() as { code: string; error: string };
  assert.deepEqual([tooLarge.status, tooLargeBody.code, tooLargeBody.error], [413, "actions.input_too_large", "请求内容过大"]);
});

// W3-02-A: a Runtime plugin's route (a Home probe's here) has no error mapper of its own. The SDK edge reads the failure's kind
// (`actionHttpStatus`), so the platform's codes answer what the platform table says everywhere, and an owner's codes keep their statuses.
test("a Runtime route answers a failure with the status of its kind: the platform codes follow the table, an owner's keep their statuses", { timeout: 60_000 }, async t => {
  const cases: Array<[string, unknown, number, string]> = [
    ["the plugin is not enabled here", new ActionError("actions.plugin_disabled", "此项目未启用该插件"), 403, "actions.plugin_disabled"],
    ["the action is gone", new ActionError("actions.missing", "原动作尚未注册"), 404, "actions.missing"],
    ["another project", new ActionError("actions.scope_mismatch", "调用者与项目不一致"), 403, "actions.scope_mismatch"],
    ["not allowed", new ActionError("actions.forbidden", "没有权限"), 403, "actions.forbidden"],
    ["no model configured", new ActionError("actions.connection_required", "请先配置可用的文字模型"), 503, "actions.connection_required"],
    ["bad input", new ActionError("actions.input_invalid", "输入不合规"), 400, "actions.input_invalid"],
    ["todo.not_found", todoErrors.not_found("找不到这件待办"), 404, "todo.not_found"],
    ["todo.conflict", todoErrors.conflict("已在别处修改，请重新读取后再改"), 409, "todo.conflict"],
    ["todo.forbidden", todoErrors.forbidden("重要标记只能由你自己设置"), 403, "todo.forbidden"],
    ["todo.invalid", todoErrors.invalid("请写下要做什么"), 400, "todo.invalid"],
    ["a failure with no code is not the caller's mistake", new Error("boom"), 500, "actions.execution_failed"],
    ["a system error code is not passed on as the answer's code", Object.assign(new Error("ENOENT: no such file, open /x/y"), { code: "ENOENT" }), 500, "actions.execution_failed"],
    ["nor is a database driver's", Object.assign(new Error("disk I/O error"), { code: "ERR_SQLITE_ERROR" }), 500, "actions.execution_failed"],
  ];
  const id = "com.example.failing";
  const fail: ActionDefinition<{ case: number }, never> = { capability_id: "failing.run", version: 1, operation: "command",
    action: { title: "失败", description: "按编号抛出一种失败", scope: "home", permissions: ["failing:write"], kind: "operation", audiences: ["user"], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, required: ["case"], properties: { case: { type: "integer" } } } } };
  const failing: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "failing", kind: "app",
    publisher: { publisher_id: "example", signature: "home-failing" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "探针" }, { permission: "failing:write", required: true, reason: "探针" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [fail],
    routes: [{ route_id: "run", method: "POST", path: "/run", permission: "failing:write" }] },
    async start(context) {
      return { kind: "app", actions: [{ ...fail, handle: (_caller, input) => { throw cases[input.case]![1]; } }],
        routes: [bindPluginActionRoute(context, fail, request => request.body as { case: number }, "run")] };
    } };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [failing] } });
  for (const [index, [name, , status, code]] of cases.entries()) {
    const answer = await request(`/api/plugins/${id}/run`, { method: "POST", body: { case: index } });
    const body = await answer.json() as { code: string; error: unknown };
    assert.deepEqual([answer.status, body.code], [status, code], name);
    assert.equal(typeof body.error, "string", name);
  }
});

test("Host error edge localizes account.*, technical leaks, and opposite-language strings in zh/en/ja while preserving code and details", async () => {
  const cases: Record<string, (response: import("node:http").ServerResponse, request: import("node:http").IncomingMessage) => void> = {
    "/bilibili-subtitles": (response, request) => sendUnhandledWebError(response, new ActionError("material.source.subtitles_missing", "请粘贴字幕。"), request),
    "/account-expired": (response, request) => sendUnhandledWebError(response, new ActionError("account.login_required", "Account session has expired", { kind: "forbidden", details: { step: "me" } }), request),
    "/leak-model": (response) => sendLocalWebJson(response, 500, { error: "MODEL_HTTP_ERROR: 503 Service Unavailable", code: "actions.execution_failed", details: { trace: "t-1" } }),
    "/leak-sync": (response) => sendLocalWebJson(response, 429, { error: "SYNC_RATE_LIMITED: retry after 60s", code: "actions.rate_limited", details: { trace: "t-1" } }),
    "/leak-ajv": (response) => sendLocalWebJson(response, 400, { error: "输入不符合能力合同：/title must NOT have fewer than 1 characters", code: "actions.input_invalid", details: { trace: "t-1" } }),
    "/leak-path": (response) => sendLocalWebJson(response, 500, { error: "ENOENT: no such file, open /Users/alice/secret.txt", code: "actions.execution_failed", details: { trace: "t-1" } }),
    "/leak-fetch": (response) => sendLocalWebJson(response, 502, { error: "fetch failed", code: "actions.delivery_unknown", details: { trace: "t-1" } }),
    "/todo-missing": (response) => sendLocalWebJson(response, 404, { error: "找不到这件待办，可能已被删除", code: "todo.not_found" }),
  };
  const server = await serveNativeHttp(async (request, response, url) => {
    const locale = url.searchParams.get("locale") ?? "zh";
    const handler = cases[url.pathname];
    if (!handler) return false;
    runWithLocale(locale as never, () => handler(response, request));
    return true;
  });
  try {
    // Upstream account.* raw English is localized cleanly in zh, en, and ja while preserving code & details.
    const expiredZh = await server.post("/account-expired?locale=zh", "{}");
    assert.equal(expiredZh.status, 403);
    assert.equal(expiredZh.body.code, "account.login_required");
    assert.deepEqual(expiredZh.body.details, { step: "me" });
    assert.match(String(expiredZh.body.error), /登录已过期/u);
    const expiredEn = await server.post("/account-expired?locale=en", "{}");
    assert.match(String(expiredEn.body.error), /session expired/i);
    const expiredJa = await server.post("/account-expired?locale=ja", "{}");
    assert.match(String(expiredJa.body.error), /有効期限が切れました/u);

    // B112-07: the HTTP edge preserves the next step in every supported language.
    for (const [locale, words] of [["zh", /粘贴字幕/], ["en", /Paste the subtitles/], ["ja", /字幕を貼り付け/]] as const) {
      const answer = await server.post(`/bilibili-subtitles?locale=${locale}`, "{}");
      assert.equal(answer.body.code, "material.source.subtitles_missing");
      assert.match(String(answer.body.error), words);
    }

    // Technical leaks (Prologue codes, SYNC_*, AJV pointers, OS paths, fetch failed) never pass through.
    for (const path of ["/leak-model", "/leak-sync", "/leak-ajv", "/leak-path", "/leak-fetch"]) {
      for (const locale of ["zh", "en", "ja"] as const) {
        const answer = await server.post(`${path}?locale=${locale}`, "{}");
        assert.deepEqual(answer.body.details, { trace: "t-1" });
        assert.doesNotMatch(String(answer.body.error), /MODEL_HTTP_ERROR|SYNC_RATE_LIMITED|\/title|\/Users\/|ENOENT|fetch failed/u, `${locale}: ${path}`);
      }
    }

    // Opposite-language domain errors are mapped cleanly by status/code; same-language domain errors are preserved.
    const zhDomainInZh = await server.post("/todo-missing?locale=zh", "{}");
    assert.equal(zhDomainInZh.body.error, "找不到这件待办，可能已被删除");
    const zhDomainInEn = await server.post("/todo-missing?locale=en", "{}");
    assert.doesNotMatch(String(zhDomainInEn.body.error), /\p{Script=Han}/u);
    const zhDomainInJa = await server.post("/todo-missing?locale=ja", "{}");
    assert.match(String(zhDomainInJa.body.error), /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  } finally {
    await server.close();
  }
});

test("Host error edge preserves English errors with unquoted CJK user titles while replacing raw Chinese/Japanese backend errors", async () => {
  const preservedCases = [
    "Project 季度复盘 was updated by someone else.",
    "Couldn’t find 季度复盘.",
    "Can’t delete 設計メモ right now.",
    "File 季度复盘.md not found.",
    "You can't edit 季度复盘 because it's locked.",
  ];
  const replacedInEn = [
    "找不到这件待办，可能已被删除",
    "Plugin manifest 无效请检查配置并重试",
    "Codex 会话不存在",
    "无法保存 todo 记录",
    "この操作を行う権限がありません。",
  ];
  const server = await serveNativeHttp(async (_request, response, url) => {
    const locale = (url.searchParams.get("locale") ?? "en") as "zh" | "en" | "ja";
    const message = url.searchParams.get("message") ?? "";
    if (url.pathname !== "/check") return false;
    runWithLocale(locale, () => sendLocalWebJson(response, 409, { error: message, code: "projects.conflict" }));
    return true;
  });
  try {
    for (const message of preservedCases) {
      const answer = await server.post(`/check?locale=en&message=${encodeURIComponent(message)}`, "{}");
      assert.equal(answer.body.error, message, `should preserve in en: ${message}`);
    }
    for (const message of replacedInEn) {
      const answer = await server.post(`/check?locale=en&message=${encodeURIComponent(message)}`, "{}");
      assert.notEqual(answer.body.error, message, `should replace in en: ${message}`);
      assert.doesNotMatch(String(answer.body.error), /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, `no CJK leak in en for: ${message}`);
    }
    const jaInZh = await server.post(`/check?locale=zh&message=${encodeURIComponent("この操作を行う権限がありません。")}`, "{}");
    assert.doesNotMatch(String(jaInZh.body.error), /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
    // IUI-01: raw English prose is caught in zh, localized zh with unquoted katakana titles is preserved,
    // concise pure-kanji ja errors are preserved, and Chinese prose (even with unquoted kana) is replaced in ja.
    const enProseInZh = await server.post(`/check?locale=zh&message=${encodeURIComponent("The requested resource could not be loaded")}`, "{}");
    assert.notEqual(enProseInZh.body.error, "The requested resource could not be loaded");
    assert.match(String(enProseInZh.body.error), /\p{Script=Han}/u);
    const zhWithKanaTitle = "无法读取プロジェクト详情";
    const zhKanaRes = await server.post(`/check?locale=zh&message=${encodeURIComponent(zhWithKanaTitle)}`, "{}");
    assert.equal(zhKanaRes.body.error, zhWithKanaTitle);
    const kanjiOnlyJa = "権限不足";
    const kanjiJaRes = await server.post(`/check?locale=ja&message=${encodeURIComponent(kanjiOnlyJa)}`, "{}");
    assert.equal(kanjiJaRes.body.error, kanjiOnlyJa);
    for (const zhMessage of ["无法读取此项目，请检查权限", "无法读取プロジェクト，请检查权限"]) {
      const res = await server.post(`/check?locale=ja&message=${encodeURIComponent(zhMessage)}`, "{}");
      assert.notEqual(res.body.error, zhMessage, `should replace Chinese prose in ja: ${zhMessage}`);
      assert.match(String(res.body.error), /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
    }
  } finally {
    await server.close();
  }
});

test("Host error, assistant-error, and assistant-stop keys resolve from single-source workbench/{zh,en,ja}.json with zero drift", async () => {
  const packs = Object.fromEntries(
    (["zh", "en", "ja"] as const).map(locale => [
      locale,
      JSON.parse(readFileSync(`apps/workbench/resources/locales/${locale}.json`, "utf8")) as { messages: Record<string, unknown> },
    ]),
  ) as Record<"zh" | "en" | "ja", { messages: Record<string, unknown> }>;

  // Every key declared across all 3 Host error/stop modules must exist in all 3 production workbench packs,
  // with zero inline fallback tables and zero Tier-A jargon left in TS sources.
  const hostFiles = [
    "apps/local-host/src/ui-error-words.ts",
    "apps/local-host/src/assistant/assistant-error.ts",
    "apps/local-host/src/assistant/assistant-present.ts",
  ];
  const declaredKeys = new Set<string>();
  for (const file of hostFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\b(?:ERROR_FALLBACKS|ASSISTANT_ERROR_FALLBACKS|STOP_FALLBACKS)\b/u, `${file} must not keep an inline fallback dictionary`);
    assert.doesNotMatch(source, /上下文上限|context limit|コンテキスト上限/iu, `${file} must not carry Tier-A context-limit jargon`);
    for (const match of source.matchAll(/["']((?:common\.error|workbench\.assistant-error|workbench\.assistant-stop)\.[a-z0-9-]+)["']/gu)) {
      declaredKeys.add(match[1]!);
    }
  }
  assert.ok(declaredKeys.size >= 80, `expected all common.error + assistant-error + assistant-stop keys, found ${declaredKeys.size}`);
  for (const locale of ["zh", "en", "ja"] as const) {
    for (const key of declaredKeys) {
      assert.ok(packs[locale].messages[key] !== undefined, `${locale}:${key} exists in workbench locale pack`);
    }
    const overflow = String(packs[locale].messages["workbench.assistant-stop.context-overflow"]);
    assert.doesNotMatch(overflow, /上下文上限|context limit|コンテキスト上限/iu, `${locale} context-overflow stays jargon-free`);
  }

  // Runtime check both before and after installHostUiText(): HTTP error edge returns the exact workbench/{zh,en,ja}.json wording.
  const runtimeChecks: Array<[string, number, Record<string, unknown>, string]> = [
    ["/overflow", 500, { error: "MODEL_CONTEXT_OVERFLOW: prompt too long", code: "actions.execution_failed" }, "common.error.model-context-overflow"],
    ["/expired", 403, { error: "Account session has expired", code: "account.login_required" }, "common.error.account-session-expired"],
    ["/busy", 503, { error: "SQLITE_BUSY: database is locked", code: "storage.owner.busy" }, "common.error.storage-busy"],
  ];
  const server = await serveNativeHttp(async (_request, response, url) => {
    const locale = (url.searchParams.get("locale") ?? "zh") as "zh" | "en" | "ja";
    const entry = runtimeChecks.find(([path]) => path === url.pathname);
    if (!entry) return false;
    runWithLocale(locale, () => sendLocalWebJson(response, entry[1], entry[2]));
    return true;
  });
  try {
    for (const phase of ["standalone", "installed"] as const) {
      if (phase === "installed") installHostUiText();
      for (const locale of ["zh", "en", "ja"] as const) {
        for (const [path, , , key] of runtimeChecks) {
          const res = await server.post(`${path}?locale=${locale}`, "{}");
          assert.equal(res.body.error, packs[locale].messages[key], `${phase}:${locale}:${key} matches workbench/${locale}.json verbatim`);
        }
      }
    }
  } finally {
    await server.close();
  }
});

test("classifyPrologueStopReason is the single canonical stop-category classifier", () => {
  const cases: Array<[string, string | null]> = [
    ["MEMORY_SCOPE_DENIED: forbidden", "memory-permission"],
    ["too many tool turns", "turn-limit"],
    ["MODEL_CONTEXT_OVERFLOW: prompt is too long", "context-overflow"],
    ["AGENT_BUDGET_EXCEEDED: This run already used 1200 of its 390 tokens", "budget"],
    ["MODEL_TIMEOUT: timed out", "time-limit"],
    ["MODEL_HTTP_ERROR: 401 unauthorized", "auth"],
    ["MODEL_HTTP_ERROR: 529 overloaded", "rate-limit"],
    ["MODEL_HTTP_ERROR: 503 Service Unavailable", "service-unavailable"],
    ["MODEL_NETWORK_FAILED: fetch failed", "network"],
    ["MODEL_REFUSED: safety", "refused"],
    ["MODEL_OUTPUT_TRUNCATED", "output-truncated"],
    ["RUN_INTERRUPTED", "interrupted"],
    ["compaction-cancelled", "compaction-cancelled"],
    ["CONTEXT_COMPACTION_FAILED", "compaction-failed"],
    ["护栏 safety 自身出错，已按绊停处理", "guardrail-error"],
    ["被护栏 safety 拦下：policy", "guardrail"],
    ["连续 3 次调用都没有成功，这一轮先停在这里", "circuit-breaker"],
    ["已取消", "cancelled"],
    ["stopped", "stopped"],
    ["RUNTIME_INTERNAL_CRASH", "model-error"],
    ["ordinary domain message", null],
  ];
  for (const [reason, expected] of cases) {
    assert.equal(classifyPrologueStopReason(reason), expected, reason);
  }
});

test("GET /api/agent/reviews guarantees stable structured field.key on tool-operation review documents", async () => {
  installHostUiText();
  const queue = new AgentReviewQueue();
  const agentHost = new AgentHost({ reviews: queue });
  const localHost = new MolisWorkLocalHost();
  const browserDoc = presentToolReview(
    { kind: "tool-operation", tool: "surface-act", summary: "在 https://example.com 向网站上传本机文件" },
    [
      reviewField("网站", "https://example.com", "site"),
      reviewField("动作", "向网站上传本机文件", "action"),
      reviewField("详情", "file.txt", "detail"),
      reviewField("注意", "上传会把这个文件发送给该网站", "warning", { value: [reviewText("surface.site-upload-warning")] }),
    ],
  );
  queue.request({
    review_id: "rev-browser-upload",
    reference: { owner: { kind: "agent-review", project_id: "p-1", plugin_id: "io.molis.work.coding", install_id: "inst-1" }, id: "rev-browser-upload", version: "v1" },
    run: { run_id: "run-1", session_id: "sess-1" },
    project_id: "p-1",
    plugin_id: "io.molis.work.coding",
    kind: "tool-operation",
    document: browserDoc,
    requested_at: "2026-11-24T00:00:00.000Z",
    expires_at: null,
  });
  queue.request({
    review_id: "rev-legacy-fixture",
    reference: { owner: { kind: "agent-review", project_id: "p-1", plugin_id: "io.molis.work.coding", install_id: "inst-1" }, id: "rev-legacy-fixture", version: "v1" },
    run: { run_id: "run-2", session_id: "sess-2" },
    project_id: "p-1",
    plugin_id: "io.molis.work.coding",
    kind: "tool-operation",
    document: { kind: "tool-operation", tool: "surface-act", summary: "legacy", fields: [{ label: "网站", value: "https://legacy.test" }, { label: "注意", value: "上传提醒" }, { label: "应用", value: "Test App" }] },
    requested_at: "2026-11-24T00:00:01.000Z",
    expires_at: null,
  });

  const server = createServer((request, response) => {
    void runWithLocale("ja", () => handleAgentReviewHttp(
      request,
      response,
      new URL(request.url ?? "/", "http://127.0.0.1"),
      { host: localHost, projectId: "p-1", agentHost, actorId: "web-user" },
    ));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${origin}/api/agent/reviews?status=pending`);
    assert.equal(res.status, 200);
    const payload = await res.json() as { reviews: Array<{ request: { review_id: string; document: { fields?: Array<{ key?: string; label: string; value: string }> } } }> };
    const byId = new Map(payload.reviews.map(row => [row.request.review_id, row.request.document.fields ?? []]));
    assert.deepEqual(byId.get("rev-browser-upload")?.map(f => f.key), ["site", "action", "detail", "warning"]);
    assert.deepEqual(byId.get("rev-legacy-fixture")?.map(f => f.key), ["site", "warning", "app"]);
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await localHost.close();
  }
});
