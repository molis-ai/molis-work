import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
import * as shelfModule from "@molis-ai/molis-work-module-shelf";
import * as cogniaPlugin from "@molis-ai/molis-work-plugin-cognia";
import * as imagesPlugin from "@molis-ai/molis-work-plugin-images";
import * as jellyPlugin from "@molis-ai/molis-work-plugin-jelly";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import * as shelfPlugin from "@molis-ai/molis-work-plugin-shelf";
import type { ShelfActionPorts } from "@molis-ai/molis-work-plugin-shelf";

// specs/repository-anti-corruption W3-02-F: Shelf, Jelly, Cognia and Images lose their route-error mappers and their error classes, and so do the Host's
// material errors (Jelly's source and material readers, the text extractor). Their failures are ActionErrors whose codes the owners declare
// (`defineErrorCodes`); the Host's edge answers every one through the SDK, so the status comes from the failure's kind and the same platform code gets the
// same status at all four plugins.
//
// What each part proves, and what it did on the merge-base (origin/main with W3-02-A):
//   1. the declarations exist and every owner code has the status its deleted mapper or its class gave it (PARITY: the tables below were made by running the
//      three mappers over every owner code, and by reading the `status` argument of every `new XError(...)` site, on the merge-base; the few codes whose
//      status moves are listed in CHANGED; this fails there only because the declarations do not exist yet);
//   2. each owner code, raised through a real Host edge, answers that status with the one body { error, code, details? } (same reason);
//   3. a platform code answers the same status at all four edges (FAILS on the merge-base: the mappers disagreed, and most gave 400);
//   4. a body that is too large answers 413 and one that is not JSON 400, a failure with no code of ours 500 `actions.execution_failed`, except Images, whose
//      edge keeps its own generic sentence for the unexpected (`images.internal`); Images used to answer its own codes for the body (FAILS there);
//   5. the failed Shelf job still comes back with the shelf beside the error, and Jelly's streamed error event keeps the code and the details Lingguang reads
//      (a model download is asked for by code, its size from the details) with the status of the kind (FAILS there: 400);
//   6. nothing of the old shape is left: no error class, no mapper, no `mapError`, no `readBody`, no owner code raised without its declaration, and no bare
//      `new Error(` for a caller's mistake in the owners' server sources.

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");

type Owner = "shelf" | "jelly" | "cognia" | "images";
type Raiser = (message: string, details?: Record<string, unknown>) => ActionError;

interface OwnerSpec {
  /** The module that holds `<owner>Errors`. */
  readonly holder: Record<string, unknown>;
  /** The status of each owner code, by reason: what the code answered on the merge-base, unless CHANGED says otherwise. */
  readonly status: Readonly<Record<string, number>>;
}

const SPECS: Readonly<Record<Owner, OwnerSpec>> = {
  shelf: { holder: shelfModule, status: {
    busy: 400, cancelled: 400, configuration_changed: 409, conflict: 409, empty_file: 400, empty_selection: 400, extraction_unavailable: 400, hash_changed: 400,
    image_unsupported: 400, invalid: 400, invalid_file: 400, invalid_result: 400, item_not_found: 404, job_failed: 400, job_timeout: 400, missing_output: 400,
    no_model: 409, no_ocr: 400, no_text: 400, not_found: 404, not_result: 400, not_text: 400, origin_changed: 400, path_invalid: 400, recipe_unavailable: 409,
    source_conflict: 400, too_large: 400, unavailable: 400,
  } },
  jelly: { holder: jellyPlugin, status: {
    ai_invalid: 400, ai_unavailable: 400, cancelled: 499, confirmation_required: 409, conflict: 409, corrupt: 500, import_conflict: 409, invalid: 400,
    linked_task: 409, no_history: 409, not_found: 404, schedule_conflict: 409, source_changed: 409, stale_preview: 409,
  } },
  cognia: { holder: cogniaPlugin, status: {
    cancelled: 499, conflict: 409, directory_unavailable: 503, invalid: 400, model_invalid: 502, model_unavailable: 503, not_found: 404, too_large: 413,
  } },
  images: { holder: imagesPlugin, status: {
    already_open: 409, busy: 429, cancelled: 409, closed: 503, connection_changed: 409, connection_invalid: 409, internal: 500, invalid: 400, invalid_image: 502,
    invalid_url: 400, key_required: 409, no_image: 502, not_found: 404, not_sent: 409, provider_http: 502, request_conflict: 409, response_too_large: 502,
    running: 409, runtime_unavailable: 503, save_failed: 500, timeout: 504,
  } },
};

/**
 * The codes whose status is not the one the merge-base gave them, as "<owner>.<reason>": [before, after] (a code that was raised with two statuses lists the
 * one it loses). Every one is an expected change in the PR text. The rest of SPECS equals the merge-base.
 */
const CHANGED: Readonly<Record<string, readonly [number, number]>> = {
  "jelly.cancelled": [400, 499], "jelly.not_found": [400, 404], "shelf.not_found": [400, 404], "jelly.source_changed": [400, 409], "images.key_required": [400, 409],
  // The model or quick action changed while it generated: the data moved on (specs/ai-interaction-experience D26).
  "shelf.configuration_changed": [400, 409],
};

const declarationsOf = (owner: Owner): Readonly<Record<string, Raiser>> | undefined => SPECS[owner].holder[`${owner}Errors`] as Readonly<Record<string, Raiser>> | undefined;

/** What each platform code answers, from its kind: the same at every edge. The mappers gave most of these 400. */
const PLATFORM: ReadonlyArray<readonly [string, number]> = [
  ["actions.input_invalid", 400], ["actions.forbidden", 403], ["actions.scope_mismatch", 403], ["actions.owner_mismatch", 403], ["actions.plugin_disabled", 403],
  ["actions.missing", 404], ["actions.subject_changed", 409], ["actions.binding_changed", 409], ["actions.provider_changed", 409], ["actions.input_too_large", 413],
  ["actions.cancelled", 499], ["actions.execution_failed", 500], ["actions.connection_required", 503], ["actions.unredeemed", 503],
];

// ---- a loopback server around one Host edge, failing with whatever the test sets ---------------------------------------------------------------------------
interface Answer { readonly status: number; readonly body: Record<string, unknown>; readonly text: string }

async function failingEdge(owner: Owner, t: TestContext) {
  if (owner === "cognia") return failingCogniaRuntime(t);
  if (owner === "jelly" || owner === "images") return failingMigratedRuntime(owner, t);
  return failingShelfRuntime(t);
}

/** Shelf S3: the shelf's routes are its Home instance's, so its failures cross the actual Runtime action and route too. */
async function failingShelfRuntime(t: TestContext) {
  let failure: unknown;
  const methods = [t.mock.method(shelfModule.ShelfStore.prototype, "seedSample", async () => { throw failure; }),
    t.mock.method(shelfModule.ShelfStore.prototype, "runJob", async () => { throw failure; })];
  const f = await serveHomeRuntime(t);
  // A route of the plugin whose handler calls one action first, so the failure comes out of the action and goes through the edge.
  const root = "/api/plugins/io.molis.work.shelf/sample";
  const send = async (verb: string, path: string, payload?: string): Promise<Answer> => {
    const response = await f.request(path, { method: verb, raw: payload });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* a streamed answer is read through `text` */ }
    return { status: response.status, text, body };
  };
  return {
    fail: (error: unknown) => { failure = error; return send("POST", root, "{}"); },
    rawBody: (payload: string) => send("POST", root, payload), send,
    setFailure(error: unknown) { failure = error; },
    close: async () => { for (const method of methods) method.mock.restore(); },
  };
}

/** W5-01-JMC-03 / W5-01-IMGPORT-03: migrated errors cross their actual Runtime action and route. */
async function failingMigratedRuntime(owner: "jelly" | "images", t: TestContext) {
  let failure: unknown;
  const method = owner === "jelly"
    ? t.mock.method(jellyPlugin.JellyStore.prototype, "previewImport", () => { throw failure; })
    : t.mock.method(imagesPlugin.ImagesService.prototype, "start", async () => { throw failure; });
  const f = await serveHomeRuntime(t, { completeText: async () => { throw failure; } });
  const root = owner === "jelly" ? "/api/plugins/io.molis.work.jelly/preview"
    : `/projects/${(await f.project("图片错误回归")).project_id}/api/plugins/io.molis.work.images/jobs`;
  const input = owner === "jelly" ? { kind: "import", source: "x" }
    : { request_id: "error-parity", connection_id: "chosen", prompt: "画" };
  const send = async (verb: string, path: string, payload?: string): Promise<Answer> => {
    const response = await f.request(path, { method: verb, raw: payload });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* NDJSON is asserted through text. */ }
    return { status: response.status, text, body };
  };
  return {
    fail: (error: unknown) => { failure = error; return send("POST", root, JSON.stringify(input)); },
    rawBody: (payload: string) => send("POST", root, payload), send,
    setFailure(error: unknown) { failure = error; },
    close: async () => { method.mock.restore(); },
  };
}

/** RAC-40: error parity now traverses Cognia's actual Home Runtime and SDK route binding. */
async function failingCogniaRuntime(t: TestContext) {
  const f = await serveHomeRuntime(t), root = "/api/plugins/io.molis.work.cognia/library/domains";
  let failure: unknown;
  const method = t.mock.method(cogniaPlugin.CogniaStore.prototype, "createDomain", () => { throw failure; });
  const send = async (method: string, path: string, payload?: string): Promise<Answer> => {
    const response = await f.request(path, { method, raw: payload });
    const text = await response.text(); return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
  };
  return {
    fail: (error: unknown) => { failure = error; return send("POST", root, JSON.stringify({ name: "领域" })); },
    rawBody: (payload: string) => send("POST", root, payload), send,
    setFailure(error: unknown) { failure = error; },
    close: async () => { method.mock.restore(); },
  };
}

const OWNERS: readonly Owner[] = ["shelf", "jelly", "cognia", "images"];

// ---- 1. declarations and parity -----------------------------------------------------------------------------------------------------------------------------
test("each owner declares its codes, every one <owner>.<reason> with the kind that gives it the status it answered before", () => {
  for (const owner of OWNERS) {
    const declared = declarationsOf(owner);
    assert.ok(declared, `${owner}Errors is exported (Shelf's from the Shelf module, the others from their plugins)`);
    const spec = SPECS[owner];
    assert.deepEqual(Object.keys(declared).sort(), Object.keys(spec.status).sort(), `${owner}Errors declares exactly the codes ${owner} raises`);
    for (const [reason, status] of Object.entries(spec.status)) {
      const error = declared[reason]!(`${owner} ${reason}`, { n: 1 });
      assert.ok(error instanceof ActionError, `${owner}Errors.${reason} raises an ActionError`);
      assert.deepEqual([error.code, error.message, error.details, actionHttpStatus(error)], [`${owner}.${reason}`, `${owner} ${reason}`, { n: 1 }, status], `${owner}.${reason}`);
    }
  }
  for (const key of Object.keys(CHANGED)) {
    const [owner, reason] = [key.split(".")[0] as Owner, key.split(".")[1]!];
    assert.equal(SPECS[owner].status[reason], CHANGED[key]![1], `${key} is listed at its new status`);
  }
});

// ---- 2. every owner code through the real edge ----------------------------------------------------------------------------------------------------------------
test("every owner code answers, through the Host's real edge, its status with the one body { error, code, details }", async t => {
  for (const owner of OWNERS) {
    const declared = declarationsOf(owner);
    assert.ok(declared, `${owner}Errors is exported`);
    const edge = await failingEdge(owner, t);
    try {
      for (const [reason, status] of Object.entries(SPECS[owner].status)) {
        const answer = await edge.fail(declared[reason]!(`${owner} ${reason}`, { n: 1 }));
        assert.equal(answer.status, status, `${owner}.${reason}`);
        assert.equal(answer.body.code, `${owner}.${reason}`, `${owner}.${reason} keeps its code`);
        assert.equal(answer.body.error, `${owner} ${reason}`);
        assert.deepEqual(answer.body.details, { n: 1 }, `${owner}.${reason} keeps its details`);
      }
    } finally { await edge.close(); }
  }
});

// ---- 3. a platform code answers the same everywhere -------------------------------------------------------------------------------------------------------------
test("a platform code answers the status of its kind at all four edges", async t => {
  const disagreements: string[] = [];
  for (const owner of OWNERS) {
    const edge = await failingEdge(owner, t);
    try {
      for (const [code, status] of PLATFORM) {
        const answer = await edge.fail(new ActionError(code, `平台 ${code}`));
        if (answer.status !== status || answer.body.code !== code || answer.body.error !== `平台 ${code}`) disagreements.push(`${owner}: ${code} answered ${answer.status} ${String(answer.body.code)}, not ${status}`);
      }
    } finally { await edge.close(); }
  }
  assert.deepEqual(disagreements, []);
});

// ---- 4. the body, and a failure that is not ours -----------------------------------------------------------------------------------------------------------------
test("a body that is not JSON answers 400 with a code, at all four edges", async t => {
  for (const owner of OWNERS) {
    const edge = await failingEdge(owner, t);
    try {
      const answer = await edge.rawBody("{");
      assert.deepEqual([answer.status, answer.body.code], [400, "actions.input_invalid"], owner);
      assert.equal(typeof answer.body.error, "string");
    } finally { await edge.close(); }
  }
});

test("Images reads its body with the shared reader: too large is 413 actions.input_too_large, a JSON that is not an object is images.invalid", async t => {
  const edge = await failingEdge("images", t);
  try {
    const large = await edge.rawBody(JSON.stringify({ prompt: "a".repeat(170_000) }));
    assert.deepEqual([large.status, large.body.code, large.body.error], [413, "actions.input_too_large", "请求内容过大"]);
    for (const text of ["[]", "null", "7"]) {
      const answer = await edge.rawBody(text);
      assert.deepEqual([answer.status, answer.body.code, answer.body.error], [400, "images.invalid", "请求必须是 JSON 对象"], text);
    }
  } finally { await edge.close(); }
});

test("unknown failures keep each owner contract: Shelf uses the Host generic sentence and Images its own", async t => {
  for (const owner of ["shelf", "jelly", "cognia"] as const) {
    const edge = await failingEdge(owner, t);
    try {
      for (const error of [new Error("没有码的失败"), Object.assign(new Error("系统错误"), { code: "ENOENT" })]) {
        const answer = await edge.fail(error);
        // BL-404: Shelf's Runtime routes pass unknown failures to the Host, which hides the raw exception.
        const message = owner === "shelf" ? "请求未能完成，请重试。" : error.message;
        assert.deepEqual([answer.status, answer.body.code, answer.body.error], [500, "actions.execution_failed", message], owner);
        if (owner === "shelf") assert.ok(!JSON.stringify(answer.body).includes(error.message), "Shelf does not expose the raw exception");
      }
    } finally { await edge.close(); }
  }
  const images = await failingEdge("images", t);
  try {
    const answer = await images.fail(new Error("SQLITE_CORRUPT: /secret/path"));
    assert.deepEqual([answer.status, answer.body.code, answer.body.error], [500, "images.internal", "图片操作失败，请稍后重试"], "the unexpected failure of Images does not show its message");
  } finally { await images.close(); }
});

// ---- 5. the two answers that carry more than the error ------------------------------------------------------------------------------------------------------------
test("a failed Shelf job comes back with the shelf beside the error, and the status of the failure's kind", async t => {
  const shelfErrors = declarationsOf("shelf");
  assert.ok(shelfErrors, "shelfErrors is exported");
  const edge = await failingEdge("shelf", t);
  try {
    const cases: Array<[unknown, number, string]> = [
      [shelfErrors.no_model("请先配置模型"), 409, "shelf.no_model"], [shelfErrors.no_text("没有正文"), 400, "shelf.no_text"],
      [new ActionError("actions.plugin_disabled", "此项目未启用该插件"), 403, "actions.plugin_disabled"],
    ];
    for (const [error, status, code] of cases) {
      edge.setFailure(error);
      const answer = await edge.send("POST", "/api/plugins/io.molis.work.shelf/jobs", JSON.stringify({ recipe: "extract_text", item_id: "item-1" }));
      // The shelf comes back as it is (the first-run sample on it), beside the error.
      assert.deepEqual([answer.status, answer.body.code, Array.isArray((answer.body.snapshot as { materials?: unknown } | undefined)?.materials)], [status, code, true], code);
      assert.equal(typeof answer.body.error, "string");
    }
  } finally { await edge.close(); }
});

test("the Shelf subject and file readers answer a code that ends in .not_found for a copy that is gone: the placement service reads that as the object being deleted", async () => {
  // horizontal/placement/src/index.ts decides "原对象已删除" (state `missing`, a row that can be cleaned up) with `code.endsWith(".not_found")`; a reader code
  // that ends in anything else (`shelf.item_not_found`) is shown as an unavailable object that cannot be cleaned up. FAILS before the fix: the readers raised item_not_found.
  const ports: Pick<ShelfActionPorts, "snapshot" | "readFile"> = {
    snapshot: () => ({ materials: [], results: [], clipboard: [], running_jobs: [] }) as Partial<ShelfSnapshot> as ShelfSnapshot,
    readFile: () => assert.fail("the file is not read for a copy that is not there"),
  };
  const handlers = shelfPlugin.createShelfActionHandlers(ports as ShelfActionPorts);
  const caller = {} as never;
  const gone: Array<[string, unknown]> = [["shelf.subject.read", { subject_id: "item-gone" }], ["shelf.files.content", { subject: { kind: "shelf_item", id: "item-gone" } }]];
  for (const [capability, input] of gone) {
    const handler = handlers.find(binding => binding.capability_id === capability);
    assert.ok(handler, `${capability} has a handler`);
    const failure = await Promise.resolve().then(() => handler.handle(caller, input)).then(() => undefined, (error: unknown) => error);
    assert.ok(failure instanceof ActionError, `${capability} fails with an ActionError`);
    assert.deepEqual([failure.code, actionHttpStatus(failure)], ["shelf.not_found", 404], capability);
    assert.ok(failure.code.endsWith(".not_found"), `${capability}: ${failure.code} is read by the placement service as the object being gone`);
  }
});

test("Jelly's streamed error event keeps the code and the details, and carries the status of the kind", async t => {
  const edge = await failingEdge("jelly", t);
  try {
    const download = new ActionError("material.model_required", "需要下载语音模型", { kind: "conflict", details: { approximate_bytes: 626_000_000, variant: "base" } });
    for (const [error, status, code, details, atStore] of [
      [download, 409, "material.model_required", { approximate_bytes: 626_000_000, variant: "base" }, false],
      [new ActionError("actions.plugin_disabled", "此项目未启用该插件"), 403, "actions.plugin_disabled", undefined, false],
      [new Error("没有码"), 500, "actions.execution_failed", undefined, true],
      [new Error("模型失败"), 502, "plugin.model_failed", undefined, false],
    ] as const) {
      edge.setFailure(error);
      // W5-01-SHM-01 / W5-01-JMC-03: generic domain failures remain 500; a raw model failure crosses the model service and becomes upstream 502.
      const read = atStore ? t.mock.method(jellyPlugin.JellyStore.prototype, "read", () => { throw error; }) : undefined;
      const answer = await edge.send("POST", "/api/plugins/io.molis.work.jelly/ai?stream=1", JSON.stringify({ kind: "decompose", source_type: "text", text: "写周报" })).finally(() => read?.mock.restore());
      assert.equal(answer.status, 200, "a stream starts as 200 and says what went wrong in its last line");
      const events = answer.text.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
      const event = events.at(-1)!;
      assert.deepEqual([event.type, event.status, event.code], ["error", status, code], code);
      assert.deepEqual(event.details, details, `${code} details`);
    }
  } finally { await edge.close(); }
});

// ---- 6. nothing of the old shape is left ----------------------------------------------------------------------------------------------------------------
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (name === "node_modules" || name === "dist") continue;
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|mts)$/u.test(name) && !name.endsWith(".d.ts")) found.push(path);
  }
  return found;
}
const read = (path: string): string => readFileSync(join(REPOSITORY, path), "utf8");

/** The owners' server-side sources: their plugin, module and the Host files that serve them (the browser programs, strings inside `*client*.ts` or typed files under `src/browser/`, are not read). */
function ownerSources(): string[] {
  const hostFiles = readdirSync(join(REPOSITORY, "apps/local-host/src")).filter(name => /^(?:shelf|jelly|cognia|images|material)-.*\.ts$/u.test(name))
    .map(name => `apps/local-host/src/${name}`);
  return [...["plugins/native/shelf/src", "modules/shelf/src", "plugins/native/jelly/src", "plugins/native/cognia/src", "plugins/native/images/src"]
    .flatMap(directory => sourceFiles(join(REPOSITORY, directory)).map(path => relative(REPOSITORY, path))).filter(path => !/client/u.test(path.split("/").at(-1)!) && !path.includes("/src/browser/")), ...hostFiles];
}

test("no error class, no route-error mapper, no mapError and no readBody is left in the owners' sources", () => {
  const removed = ["JellyError", "CogniaError", "ImagesError", "ShelfError", "isShelfError", "JellySourceError", "JellyMaterialError", "MaterialExtractionError",
    "shelfRouteErrorResponse", "jellyRouteErrorResponse", "cogniaRouteErrorResponse"];
  const everywhere = ["apps", "packages", "plugins", "modules", "horizontal", "server"].flatMap(directory => sourceFiles(join(REPOSITORY, directory))).map(path => relative(REPOSITORY, path));
  for (const path of everywhere) {
    const text = read(path);
    for (const name of removed) assert.ok(!new RegExp(`\\b${name}\\b`, "u").test(text), `${path} still mentions ${name}`);
  }
  for (const path of ["plugins/native/shelf/src/route-handlers.ts", "plugins/native/jelly/src/plugin-routes.ts", "plugins/native/images/src/routes.ts"]) {
    const text = read(path);
    assert.ok(!/\bmapError\b/u.test(text), `${path} passes no mapError: the dispatcher answers through the SDK`);
    assert.ok(!/\breadBody\b/u.test(text), `${path} reads its body with the shared reader`);
  }
  assert.ok(!/class \w+ extends \w*Error\b/u.test(ownerSources().map(read).join("\n")), "the owners' sources declare no error class");
});

test("an owner's code is raised through its declaration, never as a literal ActionError", () => {
  for (const path of ownerSources()) {
    const text = read(path);
    for (const match of text.matchAll(/new ActionError\(\s*"((?:shelf|jelly|cognia|images|material)(?:\.[a-z_]+)+)"/gu)) assert.fail(`${path} raises ${match[1]} as a literal ActionError`);
  }
});

test("a caller's mistake in the owners' server sources has a code: the bare new Error( that is left are the programming mistakes", () => {
  // Wiring and lookup mistakes of the code itself (a surface or a recipe that does not exist, a route without its binding, a plugin started without its output service,
  // a runner identity) stay uncoded and are 500.
  const kept = [
    "plugins/native/shelf/src/plugin.ts", "plugins/native/shelf/src/routes.ts", "plugins/native/shelf/src/settings-ui.ts", "plugins/native/shelf/src/ui.ts", "plugins/native/shelf/src/prompts.ts",
    "modules/shelf/src/recipes.ts", "plugins/native/jelly/src/ui.ts", "plugins/native/images/src/ui.ts", "plugins/native/images/src/store.ts",
    "apps/local-host/src/material-source-reader.ts",
  ];
  for (const path of ownerSources()) {
    const matches = [...read(path).matchAll(/new (?:Error|TypeError|RangeError)\(/gu)];
    if (!matches.length) continue;
    assert.ok(kept.includes(path), `${path} has ${matches.length} bare new Error( : a caller's mistake there would answer 500 (raise the owner's invalid)`);
  }
});
