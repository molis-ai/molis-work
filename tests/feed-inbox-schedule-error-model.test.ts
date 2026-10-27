import { FEED_API, handleFeedTestHttp } from "./fixtures/feed-http.js";
import { handleInboxTestHttp } from "./fixtures/inbox-http.js";
import { handleScheduleTestHttp } from "./fixtures/schedule-http.js";
import { wakeupInstallation } from "./fixtures/scheduler-owner.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Database from "better-sqlite3";

import * as attentionContracts from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import * as feedContracts from "@molis-ai/molis-work-contracts/modules/feed";
import { ActionError, type ActionExecutionContext, type ActionHandlerBinding, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { schedulerErrors } from "@molis-ai/molis-work-contracts/services/scheduler";
import { actionErrorResponse, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import * as feedPlugin from "@molis-ai/molis-work-plugin-feed";
import * as inboxPlugin from "@molis-ai/molis-work-plugin-inbox";
import * as schedulePlugin from "@molis-ai/molis-work-plugin-schedule";

// specs/repository-anti-corruption W3-02-E: Feed, Inbox and Schedule lose their route-error mappers and their error classes. Their failures are
// ActionErrors whose codes the owners declare (`defineErrorCodes`); the Host's edge answers every one through the SDK, so the status comes from the
// failure's kind and the same platform code gets the same status at all three plugins.
//
// What each part proves, and what it did on the merge-base (origin/main with W3-02-A):
//   1. the declarations exist and every owner code answers the status the deleted mapper gave its old name (PARITY: the tables below were made by running the
//      three mappers over every owner code on the merge-base; this fails there only because the declarations do not exist yet);
//   2. a platform code answers the same status at all three edges (FAILS on the merge-base: Feed and Schedule gave most of them 400, Inbox gave `missing` 400);
//   3. a request body that is too large answers 413, one that is not JSON 400, a failure with no code of ours 500 (FAILS there: the body escaped the edge, and
//      an uncoded failure answered 400);
//   4. the Feed connector failure keeps the provider's own code in details, and the codes the Feed classifies a failure by are the new ones;
//   5. nothing of the old shape is left: no error class, no mapper, no bare `new Error(` for a caller's mistake, no owner code raised without its declaration,
//      no old code name in the sources.
//   6. the scheduler's own declared refusals leave every Schedule action as Schedule's declared failures: the five wrappers of the three action files
//      (actions.ts `bind`, reminder-actions.ts, operation-actions.ts) are driven with the scheduler's public raisers and with the real scheduler, so deleting one of them,
//      which no static scan can see, turns a stale-job toggle into a 500 here.

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");

interface OwnerCodes {
  readonly prefix: string;
  /** The status each owner code answered through its own mapper on the merge-base, by reason. */
  readonly status: Readonly<Record<string, number>>;
}
type Raiser = (message: string, details?: Record<string, unknown>) => ActionError;
type Declarations = Readonly<Record<string, Raiser>>;

const FEED: OwnerCodes = { prefix: "feed", status: {
  contract_source_history_decision_required: 500,
  item_not_found: 404, source_not_found: 404, out_rule_not_found: 404,
  revision_conflict: 409, source_paused: 409, source_use_catalog: 409,
  invalid_transition: 400, request_invalid: 400, out_rule_invalid: 400,
  source_connection_changed: 400, source_sync_interrupted: 400, source_idempotency_required: 400, source_idempotency_conflict: 400,
  source_not_syncable: 400, source_invalid_state: 400, source_query_invalid: 400, source_invalid_configuration: 400, source_definition_unavailable: 400,
  source_invalid_schedule: 400, source_configuration_changed: 400, source_changed: 400, source_wrong_sync_kind: 400,
  connector_wrong_sync_kind: 400, connector_needs_auth: 400, connector_failed: 400,
  custom_rss_url_invalid: 400, youtube_channel_invalid: 400, source_use_youtube_channel: 400, source_use_official_reddit: 400,
} };
const INBOX: OwnerCodes = { prefix: "inbox", status: { entry_not_found: 404, invalid: 400, revision_conflict: 409 } };
const SCHEDULE: OwnerCodes = { prefix: "schedule", status: { task_not_found: 404, task_invalid: 400, job_not_found: 404, job_invalid: 400 } };

/** Where each owner's declaration lives: Feed's and Inbox's in the contracts the two plugins, the Host and the RSS and YouTube integrations share, Schedule's in the plugin. */
function declarationsOf(owner: "feed" | "inbox" | "schedule"): Declarations | undefined {
  const holder = owner === "feed" ? feedContracts : owner === "inbox" ? attentionContracts : schedulePlugin;
  return (holder as Record<string, unknown>)[`${owner}Errors`] as Declarations | undefined;
}

const platformErrors = (): Array<[string, number]> => [
  ["actions.input_invalid", 400], ["actions.forbidden", 403], ["actions.scope_mismatch", 403], ["actions.owner_mismatch", 403], ["actions.plugin_disabled", 403],
  ["actions.missing", 404], ["actions.subject_changed", 409], ["actions.binding_changed", 409], ["actions.provider_changed", 409], ["actions.input_too_large", 413],
  ["actions.cancelled", 499], ["actions.execution_failed", 500], ["actions.connection_required", 503], ["actions.unredeemed", 503],
];

// ---- a loopback server around one Host edge, failing with whatever the test sets ---------------------------------------------------------------------------
interface Answer { readonly status: number; readonly body: Record<string, unknown> }

async function failingEdge(owner: "feed" | "inbox" | "schedule") {
  const failure: { current: unknown } = { current: undefined };
  const actions: BoundActionClient = { discover: async () => [], invoke: async () => { throw failure.current; } };
  const handle = (request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> => owner === "feed" ? handleFeedTestHttp(request, response, url, actions)
    : owner === "inbox" ? handleInboxTestHttp(request, response, url, actions)
      : handleScheduleTestHttp(request, response, url, actions);
  // A route of the plugin whose handler calls one action, so the failure comes out of the action and goes through the edge.
  const route = { feed: ["POST", `${FEED_API}/items/item-1/read`], inbox: ["POST", "/api/plugins/io.molis.work.inbox/entries/entry-1/status"], schedule: ["POST", "/api/plugins/io.molis.work.schedule/tasks"] }[owner] as [string, string];
  const server = createServer((request, response) => {
    handle(request, response, new URL(request.url ?? "/", "http://127.0.0.1")).then(handled => {
      if (!handled) { response.statusCode = 404; response.end("{}"); }
    }, (error: unknown) => {
      // A handler that rejects instead of answering is reported as 599, so "the error escaped the edge" is a wrong status and not a hung request.
      response.statusCode = 599;
      response.end(JSON.stringify({ escaped: error instanceof Error ? error.message : String(error) }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (method: string, path: string, body?: string): Promise<Answer> => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body }) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const requestBody = owner === "inbox" ? { status: "done", expected_revision: 1 } : owner === "schedule" ? { title: "晨报", instructions: "读未读", time: "08:30" } : {};
  return {
    /** The route runs and its action fails with `error`. */
    async fail(error: unknown): Promise<Answer> { failure.current = error; return await send(route[0], route[1], JSON.stringify(requestBody)); },
    /** The body itself cannot be read. */
    body: (text: string) => send(route[0], route[1], text),
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}

// ---- 1. declarations and parity -----------------------------------------------------------------------------------------------------------------------------
test("each owner declares its codes, every one <owner>.<reason> with the kind its old status stood for", () => {
  const cases: Array<["feed" | "inbox" | "schedule", OwnerCodes]> = [["feed", FEED], ["inbox", INBOX], ["schedule", SCHEDULE]];
  for (const [owner, spec] of cases) {
    const declared = declarationsOf(owner);
    assert.ok(declared, `${owner}Errors is exported (Feed's from contracts modules/feed, Inbox's from contracts modules/attention-resumption, Schedule's from the plugin)`);
    assert.deepEqual(Object.keys(declared).sort(), Object.keys(spec.status).sort(), `${owner}Errors declares exactly the codes ${owner} raises`);
    for (const [reason, status] of Object.entries(spec.status)) {
      const error = declared[reason]!(`${owner} ${reason}`, { n: 1 });
      assert.ok(error instanceof ActionError, `${owner}Errors.${reason} raises an ActionError`);
      assert.deepEqual([error.code, error.message, error.details, actionHttpStatus(error)], [`${spec.prefix}.${reason}`, `${owner} ${reason}`, { n: 1 }, status], `${owner}.${reason}`);
    }
  }
});

test("every owner code answers, through the Host's real edge, the status its deleted mapper gave it, with the one body { error, code }", async () => {
  const cases: Array<["feed" | "inbox" | "schedule", OwnerCodes]> = [["feed", FEED], ["inbox", INBOX], ["schedule", SCHEDULE]];
  for (const [owner, spec] of cases) {
    const declared = declarationsOf(owner);
    assert.ok(declared, `${owner}Errors is exported`);
    const edge = await failingEdge(owner);
    try {
      for (const [reason, status] of Object.entries(spec.status)) {
        const answer = await edge.fail(declared[reason]!(`${owner} ${reason}`));
        assert.deepEqual([answer.status, answer.body], [status, { error: `${owner} ${reason}`, code: `${spec.prefix}.${reason}` }], `${owner}.${reason}`);
      }
    } finally { await edge.close(); }
  }
});

// ---- 2. one status for one platform code, whichever plugin the person was in ----------------------------------------------------------------------
test("a platform code answers one status at Feed, Inbox and Schedule, with the one body { error, code }", async () => {
  for (const owner of ["feed", "inbox", "schedule"] as const) {
    const edge = await failingEdge(owner);
    try {
      for (const [code, status] of platformErrors()) {
        const answer = await edge.fail(new ActionError(code, "测试消息"));
        assert.deepEqual([owner, code, answer.status, answer.body], [owner, code, status, { error: "测试消息", code }]);
      }
    } finally { await edge.close(); }
  }
});

// ---- 3. what is not a failure of ours --------------------------------------------------------------------------------------------------------------------------
test("a failure with no code of ours is a bug or an outage: 500 actions.execution_failed, with its message and nothing of its own code", async () => {
  for (const owner of ["feed", "inbox", "schedule"] as const) {
    const edge = await failingEdge(owner);
    // Feed's routes are the Runtime's like the others' (FI-7), so its uncoded failures are hidden behind the same sentence.
    const hidden = "请求未能完成，请重试。";
    try {
      assert.deepEqual(await edge.fail(new Error("boom")), { status: 500, body: { error: hidden, code: "actions.execution_failed" } }, `${owner}: a plain Error`);
      assert.deepEqual(await edge.fail(Object.assign(new Error("没有这个文件"), { code: "ENOENT" })), { status: 500, body: { error: hidden, code: "actions.execution_failed" } }, `${owner}: a system error code`);
      // The names the three owners used before are not codes of ours any more: a stray one is a bug, not a caller's mistake.
      assert.deepEqual(await edge.fail(Object.assign(new Error("找不到"), { code: "feed_item_not_found" })), { status: 500, body: { error: hidden, code: "actions.execution_failed" } }, `${owner}: an old snake code`);
      assert.deepEqual(await edge.fail("a thrown string"), { status: 500, body: { error: hidden, code: "actions.execution_failed" } }, `${owner}: not an Error`);
    } finally { await edge.close(); }
  }
});

// The body limit of each edge: Feed, Inbox and Schedule read 256,000 characters.
test("a request body that is too large answers 413 and one that is not JSON answers 400, each with its platform code", async () => {
  for (const owner of ["feed", "inbox", "schedule"] as const) {
    const edge = await failingEdge(owner);
    try {
      const large = await edge.body(JSON.stringify({ padding: " ".repeat(356_000) }));
      assert.deepEqual([owner, large.status, large.body], [owner, 413, { error: "请求内容过大", code: "actions.input_too_large" }]);
      const broken = await edge.body("{not json");
      assert.deepEqual([owner, broken.status, broken.body], [owner, 400, { error: "请求不是有效 JSON", code: "actions.input_invalid" }]);
    } finally { await edge.close(); }
  }
});

test("owner details travel in details and nowhere else", async () => {
  const edge = await failingEdge("feed");
  try {
    const declared = declarationsOf("feed");
    assert.ok(declared, "feedErrors is exported");
    const answer = await edge.fail(declared.connector_failed!("授权已失效", { error_code: "connector.needs_auth" }));
    assert.deepEqual(answer, { status: 400, body: { error: "授权已失效", code: "feed.connector_failed", details: { error_code: "connector.needs_auth" } } });
  } finally { await edge.close(); }
});

// ---- 4. what the Feed classifies a failure by -----------------------------------------------------------------------------------------------------------------
test("the Feed classifies a thrown failure by its new code, and a connector failure by the provider's own code it carries in details", () => {
  const feed = declarationsOf("feed");
  assert.ok(feed, "feedErrors is exported");
  const publicError = (error: unknown) => { const { code, category, retryable, user_action } = feedPlugin.toFeedPublicError(error); return { code, category, retryable, user_action }; };
  assert.deepEqual(publicError(feed.source_connection_changed!("账号连接已断开或改变")), { code: "feed.source_connection_changed", category: "auth", retryable: false, user_action: "reconnect" });
  assert.deepEqual(publicError(feed.connector_needs_auth!("连接已断开")), { code: "feed.connector_needs_auth", category: "auth", retryable: false, user_action: "reconnect" });
  assert.deepEqual(publicError(feed.source_changed!("拉取期间来源已变化")), { code: "feed.source_changed", category: "conflict", retryable: false, user_action: "refresh" });
  assert.deepEqual(publicError(feed.source_configuration_changed!("来源配置已变化")), { code: "feed.source_configuration_changed", category: "configuration", retryable: false, user_action: "fix_configuration" });
  assert.deepEqual(publicError(feed.source_sync_interrupted!("同步没有终态")), { code: "feed.source_sync_interrupted", category: "interrupted", retryable: true, user_action: "retry" });
  // The failure a provider reported keeps the provider's own code: that code is what a run and a source fault have always stored.
  assert.deepEqual(publicError(feed.connector_failed!("授权失效", { error_code: "connector.needs_auth" })), { code: "connector.needs_auth", category: "auth", retryable: false, user_action: "reconnect" });
  assert.deepEqual(publicError(feed.connector_failed!("稍后再试", { error_code: "connector.rate_limited" })), { code: "connector.rate_limited", category: "rate_limit", retryable: true, user_action: "retry" });
  // Stored codes are still read as they were written.
  assert.equal(feedPlugin.toFeedPublicError({ code: "connector.rate_limited", message: "Retry later" }).category, "rate_limit");
});

test("FAS-01: Attention maps only its current declared refusals at the Feed edge", () => {
  const cases = [
    [attentionContracts.attentionErrors.revision_conflict("版本已变化"), "feed.revision_conflict", 409],
    [attentionContracts.attentionErrors.invalid_reference("无效引用"), "feed.invalid_transition", 400],
    [attentionContracts.attentionErrors.invalid_transition("无效状态"), "feed.invalid_transition", 400],
  ] as const;
  for (const [failure, code, status] of cases) assert.throws(() => feedPlugin.callAttention(() => { throw failure; }), (error: unknown) =>
    error instanceof ActionError && error.code === code && error.message === failure.message && actionHttpStatus(error) === status);
  for (const failure of [new ActionError("attention.unlisted", "外部原因"), new ActionError("actions.forbidden", "外部拒绝")]) {
    assert.throws(() => feedPlugin.callAttention(() => { throw failure; }), (error: unknown) => error === failure);
  }
});

test("the old error classes, the mappers and the old exports are gone", () => {
  const gone: Array<[string, Record<string, unknown>, string[]]> = [
    ["@molis-ai/molis-work-plugin-feed", feedPlugin as Record<string, unknown>, ["FeedStoreError", "feedRouteErrorResponse"]],
    ["@molis-ai/molis-work-plugin-inbox", inboxPlugin as Record<string, unknown>, ["inboxRouteErrorResponse"]],
    ["@molis-ai/molis-work-plugin-schedule", schedulePlugin as Record<string, unknown>, ["ScheduleTaskError", "scheduleRouteErrorResponse"]],
    ["@molis-ai/molis-work-contracts/modules/feed", feedContracts as Record<string, unknown>, ["FeedDomainError"]],
  ];
  for (const [name, module, removed] of gone) for (const exported of removed) assert.equal(exported in module, false, `${name} no longer exports ${exported}`);
  // FAS-02: callers use the shared model and current owner declarations.
  assert.equal("FeedError" in feedContracts, false);
  assert.equal("AttentionError" in attentionContracts, false);
});

// ---- 5. nothing of the old shape is left --------------------------------------------------------------------------------------------------------------------
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|mts)$/u.test(name) ? [path] : [];
  });
}
const HOST = join(REPOSITORY, "apps", "local-host", "src");
const hostFiles = (...patterns: RegExp[]) => readdirSync(HOST).filter(name => patterns.some(pattern => pattern.test(name))).map(name => join(HOST, name));
const FILES = {
  feed: () => [...sourceFiles(join(REPOSITORY, "plugins", "native", "feed", "src")), ...hostFiles(/^feed-.*\.ts$/u, /^research-library-source\.ts$/u, /^content-action-providers\.ts$/u),
    ...sourceFiles(join(REPOSITORY, "plugins", "official-integrations", "rss", "src")), ...sourceFiles(join(REPOSITORY, "plugins", "official-integrations", "youtube", "src"))],
  inbox: () => [...sourceFiles(join(REPOSITORY, "plugins", "native", "inbox", "src")), ...hostFiles(/^inbox-.*\.ts$/u)],
  schedule: () => [...sourceFiles(join(REPOSITORY, "plugins", "native", "schedule", "src")), ...hostFiles(/^schedule-.*\.ts$/u)],
};
/** The names the three owners used before, as quoted strings. Reading one of them back would find nothing any more. */
const OLD_CODES = ["feed_item_not_found", "inbox_entry_not_found", "feed_source_not_found", "feed_out_rule_not_found", "feed_revision_conflict", "feed_invalid_transition", "feed_read_not_supported",
  "feed_source_connection_changed", "feed_source_sync_interrupted", "feed_source_idempotency_required", "feed_source_idempotency_conflict", "feed_source_paused", "feed_out_rule_invalid",
  "feed_source_not_syncable", "feed_source_invalid_state", "feed_source_query_invalid", "feed_source_invalid_configuration", "feed_source_definition_unavailable", "feed_source_use_catalog",
  "feed_source_invalid_schedule", "feed_source_configuration_changed", "feed_source_changed", "feed_source_wrong_sync_kind", "connector_wrong_sync_kind", "connector_needs_auth",
  "invalid_custom_rss_url", "invalid_youtube_channel", "inbox_source_use_youtube_channel", "inbox_source_use_official_reddit",
  "schedule_task_invalid", "schedule_task_not_found"];
// A plugin client file is the page's own script (a template string, or the reader of the bundle built from the typed code under `src/browser/`) and runs in the browser; it never raises an action's failure.
const BROWSER_SCRIPT = /[\\/]client\.ts$/u;
const BROWSER_CODE = /^(.*[\\/])src[\\/]browser[\\/]/u;
// What may stay a bare Error, each anchored on its own sentence so a caller's mistake with another sentence is still found:
//   - a wiring mistake in the code (a route without its Host binding, a UI surface the plugin does not render): nobody can cause it by a request;
//   - the failures of a run that already started (a due task, reminder or timed operation that cannot be carried out, a pull of the research library or a
//     public feed that fails): they are recorded on the task, the job or the source run and never answered to a caller as they are;
// The internal deletion contract is declared as internal, rather than exempted here.
const STAYS_BARE: readonly RegExp[] = [
  /^`(?:Feed|Inbox|Schedule) route \$\{[^`]*没有 Host binding`/u, /^`(?:Feed|Inbox|Schedule) UI surface /u,
  /^"定时执行尚未登记本次持久记录"/u, /^"本次执行结果未知，不能自动重跑"/u, /^"定时操作已暂停、取消或改变"/u, /^"定时操作的安装身份已改变"/u, /^"本次定时执行已被处理"/u,
  /^"提醒的原安装身份已不可用，记录已保留/u, /^"定时任务已暂停或改变，本轮结果未保存"/u, /^"定时操作的安装执行入口已改变"/u,
  /^"(?:还没有配置到点执行的 Agent|闹钟叫醒没有项目现场|提醒没有项目现场|定时操作没有项目现场)"/u,
  /^"(?:还没有可用的 Agent Runtime：|这个项目还没有绑定工作区，|Schedule 没有声明可运行的 Agent|到点执行不能停下来等人确认|Agent 没有写出正文|到点执行超时)/u, /^(?:view\.stop_reason|`这一轮以 )/u,
  /^"Installed caller (?:replaced|stopped)"/u, /^"仓库配置无效"/u, /^`发布包缺少 /u, /^"来源已暂停"\)/u, /^"feed response exceeds local ingest limit"/u,
];

test("no owner keeps an error class, a route-error mapper, a body reader of its own, an old code name, or a raise of its own code outside its declarations", () => {
  for (const owner of ["feed", "inbox", "schedule"] as const) {
    for (const file of FILES[owner]()) {
      const source = readFileSync(file, "utf8");
      const where = relative(REPOSITORY, file);
      assert.doesNotMatch(source, /\bclass\s+\w+\s+extends\s+Error\b/u, `${where}: an error class`);
      assert.doesNotMatch(source, /\bmapError\b|RouteErrorResponse|\bFeedStoreError\b|\bFeedDomainError\b|\bScheduleTaskError\b/u, `${where}: an old error class or mapper`);
      assert.doesNotMatch(source, /function readBody\(|function readOptionalBody\(/u, `${where}: its own body reader (the shared readNativePluginJsonBody reads it, inside the try)`);
      assert.doesNotMatch(source, new RegExp(String.raw`new\s+\w*Error\(\s*"(?:feed|inbox|schedule)\.[a-z_]+"`, "u"), `${where}: an owner code raised without its declaration (it would answer 400 whatever its kind)`);
      assert.doesNotMatch(source, /new ScheduleError\(/u, `${where}: the scheduler's class raised for a Schedule failure; raise scheduleErrors.<reason>(...)`);
      assert.doesNotMatch(source, /Object\.assign\(new Error\(/u, `${where}: an Error given a code afterwards`);
      const browserCode = BROWSER_CODE.exec(file);
      if (browserCode) {
        assert.match(readFileSync(join(browserCode[1]!, "tsconfig.browser.json"), "utf8"), /src\/browser\/\*\*/u, `${where}: exempt from the bare-Error rule only as browser code the build type-checks and bundles for the page`);
        continue;
      }
      if (BROWSER_SCRIPT.test(file)) {
        assert.match(source, /^export const \w+_CLIENT(?:_FACTORY)?_SCRIPT = (?:String\.raw`|readFileSync\()/mu, `${where}: exempt from the bare-Error rule only as a browser script`);
        continue;
      }
      for (const code of OLD_CODES) assert.ok(!source.includes(`"${code}"`) && !source.includes(`'${code}'`), `${where}: the old name ${code} is read or raised`);
      // A caller's mistake is an owner code; a bare Error would answer 500 `actions.execution_failed` for it.
      const bare = [...source.matchAll(/\bnew\s+Error\(([^\n]*)/gu)].map(match => match[1]!).filter(rest => !STAYS_BARE.some(sentence => sentence.test(rest)));
      assert.deepEqual(bare, [], `${where}: a bare new Error( is a caller-visible 500; raise <owner>Errors.<reason>(...) (or a platform code) instead`);
    }
  }
});

test("a declared code is used: every reason in a declaration has a raise site", () => {
  for (const [owner, spec] of [["feed", FEED], ["inbox", INBOX], ["schedule", SCHEDULE]] as const) {
    const sources = [...FILES[owner](), ...(owner === "inbox" ? FILES.feed() : [])].map(file => readFileSync(file, "utf8")).join("\n");
    for (const reason of Object.keys(spec.status)) {
      assert.ok(new RegExp(String.raw`\b${owner}Errors\.${reason}\(`, "u").test(sources), `${owner}Errors.${reason} is raised somewhere; a code nobody raises is not declared`);
    }
  }
});

// ---- 6. the scheduler's refusals leave Schedule's actions as Schedule's declared failures ---------------------------------------------------------------------
const SCHEDULE_PROJECT = "schedule-error-project";
const SCHEDULE_PLUGIN = "io.molis.work.generated.a";
const CLOCK = Date.parse("2026-10-12T00:00:00Z");
const userContext = (overrides: Partial<ActionExecutionContext> = {}): ActionExecutionContext =>
  ({ actor_id: "owner", project_id: SCHEDULE_PROJECT, audience: "user", permissions: [], beforeEffect: async () => {}, ...overrides });
const pluginContext = (overrides: Partial<ActionExecutionContext> = {}): ActionExecutionContext =>
  userContext({ actor_id: `plugin:${SCHEDULE_PLUGIN}`, audience: "plugin", plugin_install_id: "install-1", ...overrides });
const notUsed = (): never => { throw new Error("this port is not used by the test"); };
const schedulePorts = (overrides: Partial<schedulePlugin.ScheduleActionPorts>): schedulePlugin.ScheduleActionPorts => ({
  listJobs: notUsed, setEnabled: notUsed, recoverReminder: notUsed, listTasks: notUsed, createTask: notUsed, updateTask: notUsed, archiveTask: notUsed, setTaskEnabled: notUsed, openTask: notUsed,
  ...overrides,
});
const bindingOf = (handlers: readonly ActionHandlerBinding[], definition: { capability_id: string; version: number }): ActionHandlerBinding => {
  const found = handlers.find(row => row.capability_id === definition.capability_id && row.version === definition.version);
  assert.ok(found, `${definition.capability_id} is bound`);
  return found;
};
/** What a caller of the action sees: the status the Host's edge answers and the code and message in the body. */
async function refusalOf(run: () => unknown): Promise<{ status: number; code: string | undefined; message: string }> {
  try { await run(); } catch (error) {
    const { status, body } = actionErrorResponse(error);
    return { status, code: body.code, message: body.error };
  }
  return assert.fail("the action was expected to refuse");
}

const SCHEDULER_REFUSALS: ReadonlyArray<readonly [`scheduler.${keyof typeof schedulerErrors}`, string, string, number]> = [
  ["scheduler.job_not_found", "定时任务不存在", "schedule.job_not_found", 404],
  ["scheduler.job_invalid", "时间无效", "schedule.job_invalid", 400],
  ["scheduler.interval_too_short", "间隔不能短于 5 秒", "schedule.job_invalid", 400],
  ["scheduler.path_refused", "对象钥匙不能是文件路径", "schedule.job_invalid", 400],
  ["scheduler.handler_missing", "叫醒对象还没有提供执行接口", "schedule.job_invalid", 400],
];

test("the scheduler's refusals leave the Schedule, reminder and timed-operation actions as Schedule's own codes with the scheduler's message, at every wrapper", async () => {
  for (const [schedulerCode, message, code, status] of SCHEDULER_REFUSALS) {
    const refuse = (): never => { throw schedulerErrors[schedulerCode.slice("scheduler.".length) as keyof typeof schedulerErrors](message); };
    const jobs = schedulePlugin.createScheduleActionHandlers(SCHEDULE_PROJECT, schedulePorts({ setEnabled: refuse }));
    const reminders = schedulePlugin.createReminderActionHandlers(SCHEDULE_PROJECT, { pluginId: id => id === "install-1" ? SCHEDULE_PLUGIN : null, add: refuse, cancel: refuse });
    const operations = schedulePlugin.createScheduledOperationActionHandlers(SCHEDULE_PROJECT, { pluginId: id => id === "install-1" ? SCHEDULE_PLUGIN : null, add: refuse, cancel: refuse });
    const sites: ReadonlyArray<readonly [string, ActionHandlerBinding, ActionExecutionContext, unknown]> = [
      ["bind (the Schedule actions)", bindingOf(jobs, schedulePlugin.scheduleActions.setJobEnabled), userContext(), { job_id: "job-1", enabled: false }],
      ["reminders.add", bindingOf(reminders, schedulePlugin.reminderActions.add), pluginContext(), { at: "2026-10-12T08:00:00+08:00", text: "复习" }],
      ["reminders.cancel", bindingOf(reminders, schedulePlugin.reminderActions.cancel), pluginContext(), { reminderId: "reminder-1" }],
      ["schedules.add", bindingOf(operations, schedulePlugin.scheduledOperationActions.add), pluginContext(), { operation: "daily", at: "2026-10-12T08:00:00+08:00" }],
      ["schedules.cancel", bindingOf(operations, schedulePlugin.scheduledOperationActions.cancel), pluginContext(), { scheduleId: "schedule-1" }],
    ];
    for (const [site, binding, context, input] of sites) {
      assert.deepEqual(await refusalOf(() => binding.handle(context, input)), { status, code, message }, `${site}: the scheduler's ${schedulerCode} answers ${code} (${status})`);
    }
  }
});

test("what is not the scheduler's refusal passes the wrapper untouched: another declared failure keeps its code and a bare Error stays an uncoded 500", async () => {
  const jobs = schedulePlugin.createScheduleActionHandlers(SCHEDULE_PROJECT, schedulePorts({ setEnabled: () => { throw new Error("disk exploded"); } }));
  const toggle = bindingOf(jobs, schedulePlugin.scheduleActions.setJobEnabled);
  const failure = await refusalOf(() => toggle.handle(userContext(), { job_id: "job-1", enabled: true }));
  assert.equal(failure.status, 500);
  assert.equal(failure.code, "actions.execution_failed");
  // A failure that is already an ActionError (a platform or an owner code) is not relabelled.
  const owned = schedulePlugin.createScheduleActionHandlers(SCHEDULE_PROJECT, schedulePorts({ setEnabled: () => { throw schedulePlugin.scheduleErrors.task_invalid("不是调度器的拒绝"); } }));
  assert.deepEqual(await refusalOf(() => bindingOf(owned, schedulePlugin.scheduleActions.setJobEnabled).handle(userContext(), { job_id: "job-1", enabled: true })),
    { status: 400, code: "schedule.task_invalid", message: "不是调度器的拒绝" });
  assert.deepEqual(await refusalOf(() => toggle.handle(userContext({ project_id: "another-project" }), { job_id: "job-1", enabled: true })),
    { status: 403, code: "actions.scope_mismatch", message: "请求项目与定时任务所在项目不一致" });
  // Without the Host's readiness check the action says so as the platform's own code.
  const readiness = bindingOf(jobs, schedulePlugin.scheduleActions.readiness);
  assert.equal((await refusalOf(() => readiness.handle(userContext(), {}))).code, "actions.unredeemed");
});

test("with the real scheduler: a toggle of a job that is gone is schedule.job_not_found, a refusal of the scheduler's own registration is schedule.job_invalid, a live job still toggles", async () => {
  const db = new Database(":memory:");
  const installation = wakeupInstallation(SCHEDULE_PLUGIN);
  installation.action("test.wakeup", async () => {});
  const schedule = installation.scheduler(db, { now: () => new Date(CLOCK) });
  const registration = { plugin_id: SCHEDULE_PLUGIN, capability_id: "test.wakeup", object_ref: "source:alpha", title: "拉一次", due_at: "2026-10-12T03:00:00.000Z" };
  try {
    // The ports stand in for the Host's, which call the scheduler the same way.
    let register = registration as Parameters<typeof schedule.register>[0];
    const handlers = schedulePlugin.createScheduleActionHandlers(SCHEDULE_PROJECT, schedulePorts({
      setEnabled: (jobId, enabled) => schedule.setEnabled(jobId, enabled),
      listJobs: () => { schedule.register(register); return []; },
    }));
    const toggle = bindingOf(handlers, schedulePlugin.scheduleActions.setJobEnabled), list = bindingOf(handlers, schedulePlugin.scheduleActions.list);

    const live = schedule.register(registration);
    const toggled = await toggle.handle(userContext(), { job_id: live.job_id, enabled: false }) as { job: { job_id: string; enabled: boolean } };
    assert.deepEqual([toggled.job.job_id, toggled.job.enabled], [live.job_id, false]);

    schedule.cancel(live.job_id, SCHEDULE_PLUGIN);
    assert.deepEqual(await refusalOf(() => toggle.handle(userContext(), { job_id: live.job_id, enabled: true })), { status: 404, code: "schedule.job_not_found", message: "定时任务不存在" });
    assert.equal((await refusalOf(() => toggle.handle(userContext(), { job_id: "never-existed", enabled: true }))).code, "schedule.job_not_found");

    const refused: ReadonlyArray<readonly [string, Parameters<typeof schedule.register>[0], RegExp]> = [
      ["an interval below the minimum", { ...registration, recurrence: { kind: "interval", interval_ms: 1 } }, /5 秒/u],
      ["an object key that is a path", { ...registration, object_ref: "/etc/passwd" }, /文件路径/u],
      ["a capability nobody serves", { ...registration, capability_id: "absent.wakeup" }, /执行接口/u],
      ["a time that is not one", { ...registration, due_at: "someday" }, /时间无效/u],
    ];
    for (const [what, wrong, message] of refused) {
      register = wrong;
      const failure = await refusalOf(() => list.handle(userContext(), {}));
      assert.deepEqual([failure.status, failure.code], [400, "schedule.job_invalid"], what);
      assert.match(failure.message, message, what);
    }
  } finally { db.close(); }
});

test("with the real reminder and timed-operation services: the caller's mistakes are schedule.job_invalid, an identity they cannot take is actions.forbidden, a good call still works", async () => {
  const db = new Database(":memory:");
  db.exec(schedulePlugin.SCHEDULE_PROJECT_DATABASE.schema);
  const installation = wakeupInstallation(schedulePlugin.SCHEDULE_PLUGIN_ID);
  installation.action(schedulePlugin.SCHEDULE_REMINDER_WAKEUP, async () => {});
  installation.action(schedulePlugin.SCHEDULE_OPERATION_WAKEUP, async () => {});
  const schedule = installation.scheduler(db, { now: () => new Date(CLOCK) });
  const reminders = schedulePlugin.createScheduleReminders({ db, projectId: SCHEDULE_PROJECT, schedule, now: () => CLOCK,
    describe: identity => ({ title: "论语日课", link: `/plugins/${identity.pluginId}`, generation: "install-1@2026" }) });
  const operations = schedulePlugin.createScheduledOperations({ db, projectId: SCHEDULE_PROJECT, schedule, now: () => CLOCK, link: pluginId => `/plugins/${pluginId}`,
    describe: identity => identity.installationId !== "install-1" ? null
      : { installationId: "install-1", generation: "install-1@2026", title: "论语日课", version: "1.0.0", operations: [{ id: "daily", description: "每日一章" }] } });
  try {
    const reminderHandlers = schedulePlugin.createReminderActionHandlers(SCHEDULE_PROJECT, { pluginId: id => id === "install-1" ? SCHEDULE_PLUGIN : null,
      add: (identity, input) => reminders.add(identity, input), cancel: (identity, input) => reminders.cancel(identity, input) });
    const operationHandlers = schedulePlugin.createScheduledOperationActionHandlers(SCHEDULE_PROJECT, { pluginId: id => id === "install-1" ? SCHEDULE_PLUGIN : null,
      add: (identity, input) => operations.add(identity, input), cancel: (identity, input) => operations.cancel(identity, input) });
    const addReminder = bindingOf(reminderHandlers, schedulePlugin.reminderActions.add), cancelReminder = bindingOf(reminderHandlers, schedulePlugin.reminderActions.cancel);
    const addOperation = bindingOf(operationHandlers, schedulePlugin.scheduledOperationActions.add), cancelOperation = bindingOf(operationHandlers, schedulePlugin.scheduledOperationActions.cancel);
    const invalid = (failure: { status: number; code: string | undefined }) => [failure.status, failure.code];
    const future = "2026-10-12T08:00:00+08:00";

    // Reminders: a time without a zone, a time that has passed, and a repeat nobody knows are the caller's mistakes.
    assert.deepEqual(invalid(await refusalOf(() => addReminder.handle(pluginContext(), { at: "2026-10-12 08:00", text: "复习" }))), [400, "schedule.job_invalid"]);
    assert.deepEqual(invalid(await refusalOf(() => addReminder.handle(pluginContext(), { at: "2026-10-10T00:00:00Z", text: "复习" }))), [400, "schedule.job_invalid"]);
    assert.deepEqual(invalid(await refusalOf(() => addReminder.handle(pluginContext(), { at: future, text: "复习", repeat: "hourly" }))), [400, "schedule.job_invalid"]);
    const reminder = await addReminder.handle(pluginContext(), { at: future, text: "复习《学而》第一章" }) as { reminderId: string };
    assert.equal(typeof reminder.reminderId, "string");
    assert.deepEqual(await cancelReminder.handle(pluginContext(), { reminderId: reminder.reminderId }), { cancelled: true });

    // Timed operations: the same, plus an operation the plugin does not have and a plugin that is not installed.
    assert.deepEqual(invalid(await refusalOf(() => addOperation.handle(pluginContext(), { operation: "daily", at: "2026-10-10T00:00:00Z" }))), [400, "schedule.job_invalid"]);
    assert.deepEqual(invalid(await refusalOf(() => addOperation.handle(pluginContext(), { operation: "nope", at: future }))), [400, "schedule.job_invalid"]);
    assert.deepEqual(invalid(await refusalOf(() => addOperation.handle(pluginContext({ plugin_install_id: "install-gone" }), { operation: "daily", at: future }))), [403, "actions.forbidden"]);
    const operation = await addOperation.handle(pluginContext(), { operation: "daily", at: future }) as { scheduleId: string };
    assert.deepEqual(await cancelOperation.handle(pluginContext(), { scheduleId: operation.scheduleId }), { cancelled: true });

    // Identity is not a mistake in the request: a user, a plugin without an installation, or an empty plugin id is refused as the platform's own code, and another project is a scope mismatch.
    for (const [site, binding, input] of [["reminders.add", addReminder, { at: future, text: "复习" }], ["reminders.cancel", cancelReminder, { reminderId: "x" }],
      ["schedules.add", addOperation, { operation: "daily", at: future }], ["schedules.cancel", cancelOperation, { scheduleId: "x" }]] as const) {
      for (const [who, context] of [["a user", userContext()], ["a plugin without an installation", pluginContext({ plugin_install_id: undefined })]] as const) {
        assert.deepEqual(invalid(await refusalOf(() => binding.handle(context, input))), [403, "actions.forbidden"], `${site} as ${who}`);
      }
      assert.deepEqual(invalid(await refusalOf(() => binding.handle(pluginContext({ project_id: "another-project" }), input))), [403, "actions.scope_mismatch"], `${site} in another project`);
    }
    assert.deepEqual(invalid(await refusalOf(() => addReminder.handle(pluginContext({ plugin_install_id: "missing" }), { at: future, text: "复习" }))), [403, "actions.forbidden"],
      "an installation absent from the trusted directory is refused, and the wrapper leaves it a platform code");
    assert.deepEqual(invalid(await refusalOf(() => addOperation.handle(pluginContext({ plugin_install_id: "missing" }), { operation: "daily", at: future }))), [403, "actions.forbidden"]);
  } finally { db.close(); }
});
