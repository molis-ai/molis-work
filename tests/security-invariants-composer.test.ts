import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, defineSubjectContextAction, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import * as composer from "@molis-ai/molis-work-contracts/platform/composer";
import { composerDraftKey } from "@molis-ai/molis-work-design-system";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionCrossReferences, inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";
import { NOTE_KIND, composerMountPlugin, composerSourcePlugin } from "./fixtures/composer-plugins.js";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-composer-source-call (docs/system/security-invariants/S-composer-source-call.md; specs/unified-input-voice/implementation-plan.md
// §4 items 1 and 2, slice K0): a source in the unified input's `+` menu gets only this call's query, and a declaration that is not one
// cannot be installed. UIC-01 the contract subpath holds only the K0 items; UIC-02 the declaration checks refuse what is not a source.
// Items 3 to 5 (revoked sources, picks checked again at send, the sandbox frame) are K2's, in its browser cases.

const { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE } = composer;
type Part = Record<string, unknown>;

const reader = defineSubjectContextAction("notes.read", 1, "note", "笔记", []);
/** A source that passes every rule; `over` replaces fields of its action, `top` of its definition. */
const source = (over: Part = {}, top: Part = {}): ActionDefinition => ({
  capability_id: "notes.pick", version: 1, operation: "query",
  action: { title: "选笔记", description: "按名字找本项目的笔记", kind: "query", scope: "project", audiences: ["user", "agent"], permissions: [],
    subject_kinds: ["note"], input_type: COMPOSER_PICK_INPUT_TYPE, output_type: COMPOSER_PICK_OUTPUT_TYPE,
    input_schema: COMPOSER_PICK_INPUT_SCHEMA, output_schema: COMPOSER_PICK_OUTPUT_SCHEMA,
    composer_source: { title: "笔记", layers: ["ai", "plain"] }, ...over },
  ...top,
} as ActionDefinition);
const NOT_A_SOURCE = "能力 notes.pick@1 没有兑现输入框来源协议 v1：需要平台给的输入输出、对本机用户开放的只读查询，动作自己的对象种类，以及名称和所在的层（ai、plain）";
const parsed = (...actions: ActionDefinition[]) => manifestProblems(declarationManifest({ actions }));
/** Registers a source (and a reader) with a Kernel as a provider does; `pick` handles the source, the reader is not called here. */
const registered = (pickDefinition: ActionDefinition, readerDefinition?: ActionDefinition, pick: ActionHandlerBinding["handle"] = () => ({ items: [] })) => {
  const kernel = new ActionService();
  const definitions = readerDefinition ? [pickDefinition, readerDefinition] : [pickDefinition];
  kernel.registerProvider({ provider: { provider_id: "notes", title: "Notes", kind: "plugin" }, definitions, handlers: definitions.map(definition => ({
    capability_id: definition.capability_id, version: definition.version, handle: definition === pickDefinition ? pick : () => { throw new Error("not read here"); } })) });
  return kernel;
};
const widened = (schema: unknown, change: (copy: { properties: Record<string, Record<string, unknown>> }) => void) => {
  const copy = structuredClone(schema) as { properties: Record<string, Record<string, unknown>> };
  change(copy);
  return copy;
};

test("S-composer-source-call UIC-01 the pick input holds only query, limit and near, and the subpath exports only the K0 contract", () => {
  assert.deepEqual(Object.keys(composer).sort(), ["COMPOSER_PICK_INPUT_SCHEMA", "COMPOSER_PICK_INPUT_TYPE", "COMPOSER_PICK_OUTPUT_SCHEMA", "COMPOSER_PICK_OUTPUT_TYPE", "composerErrors"]);
  const input = COMPOSER_PICK_INPUT_SCHEMA as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
  assert.deepEqual([Object.keys(input.properties), input.required, input.additionalProperties], [["query", "limit", "near"], ["query", "limit"], false]);
  assert.deepEqual(Object.entries(composer.composerErrors).map(([reason, raise]) => [raise("x").code, raise("x").kind, reason]), [
    ["composer.source_unavailable", "unavailable", "source_unavailable"], ["composer.subject_unreadable", "not_found", "subject_unreadable"], ["composer.required_missing", "invalid", "required_missing"],
  ]);
});

test("S-composer-source-call UIC-02 a source declared as the platform fixes it, with a reader of its kind, installs", () => {
  assert.deepEqual(inspectActionDeclarations([source(), reader], undefined), []);
  assert.deepEqual(inspectActionCrossReferences([source(), reader]), []);
  assert.equal(parsed(source(), reader), "");
  assert.equal(parsed(source({ scope: "home", audiences: ["user"], effect: "read", composer_source: { title: "笔记", layers: ["ai"] } }), reader), "", "a Home source for the AI layer only");
});

test("S-composer-source-call UIC-02 item 1 a pick schema one character away from the platform's is refused", () => {
  const refusals: Array<[string, ActionDefinition]> = [
    ["a query of 201 characters", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.query!.maxLength = 201; }) })],
    ["a draft field beside the query", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.draft = { type: "string" }; }) })],
    ["a limit past 50", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.limit!.maximum = 51; }) })],
    ["more than 50 items back", source({ output_schema: widened(COMPOSER_PICK_OUTPUT_SCHEMA, copy => { copy.properties.items!.maxItems = 51; }) })],
    ["the pick input type under another output", source({ output_type: "molis.composer.pick.items.v2" })],
    ["a declaration without the pick types", source({ input_type: undefined, output_type: undefined })],
    ["the pick types without a declaration", source({ composer_source: undefined })],
  ];
  for (const [what, definition] of refusals) {
    assert.deepEqual(inspectActionDeclarations([definition, reader], undefined), [NOT_A_SOURCE], what);
    assert.equal(parsed(definition, reader), NOT_A_SOURCE, `${what}: the Manifest is refused`);
    assert.throws(() => registered(definition, reader), (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && error.message === NOT_A_SOURCE,
      `${what}: the Kernel refuses the registration`);
  }
});

test("S-composer-source-call UIC-02 item 2 a source on an action that is not a read-only query open to the person is refused", () => {
  const refusals: Array<[string, ActionDefinition]> = [
    ["a command", source({ kind: "operation" }, { operation: "command" })],
    ["a query that writes", source({ effect: "write" })],
    ["closed to the person", source({ audiences: ["agent", "mcp"] })],
    // The kinds are the action's own; a declaration that writes them again is a field it does not have.
    ["an action that picks no kind", source({ subject_kinds: [] })],
    ["the kinds written again in the declaration", source({ composer_source: { title: "笔记", subject_kinds: ["note"], layers: ["ai"] } })],
    ["no layer", source({ composer_source: { title: "笔记", layers: [] } })],
    ["a layer that is not one", source({ composer_source: { title: "笔记", layers: ["voice"] } })],
    ["no name", source({ composer_source: { title: " ", layers: ["ai"] } })],
    ["a field the declaration does not have", source({ composer_source: { title: "笔记", layers: ["ai"], draft: true } })],
  ];
  for (const [what, definition] of refusals) {
    assert.ok(inspectActionDeclarations([definition, reader], undefined).includes(NOT_A_SOURCE), what);
    assert.ok(parsed(definition, reader).includes(NOT_A_SOURCE), `${what}: the Manifest is refused`);
  }
});

test("S-composer-source-call UIC-02 item 2 a source of a kind its provider has no reader for is refused", () => {
  const foreign = "能力 notes.pick@1 的输入框来源种类 note 不是同一提供方有对象读取器的种类";
  assert.deepEqual(inspectActionCrossReferences([source()]), [foreign], "no reader at all");
  assert.deepEqual(inspectActionCrossReferences([source(), defineSubjectContextAction("pages.read", 1, "page", "页面", [])]), [foreign], "a reader of another kind");
  assert.deepEqual(inspectActionCrossReferences([source({ subject_kinds: ["note", "page"] }), reader]), ["能力 notes.pick@1 的输入框来源种类 page 不是同一提供方有对象读取器的种类"],
    "every kind of the action's own is checked, not only the first");
  assert.equal(parsed(source()), foreign);
  assert.throws(() => registered(source()), (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && error.message === foreign);
});

test("S-composer-source-call item 1 a call carries only query, limit and the near the page handed over; anything else is refused before the handler", async () => {
  const seen: unknown[] = [];
  const kernel = registered(source(), reader, (_context, input) => { seen.push(input); return { items: [] }; });
  const person: ActionCallContext = { actor_id: "local-user", project_id: "p1", audience: "user", permissions: [] };
  const pick = { capability_id: "notes.pick", version: 1 };
  for (const input of [{ query: "q", limit: 5, draft: "没发出的字" }, { query: "q", limit: 5, receiver: "assistant" }, { query: "x".repeat(201), limit: 5 }, { query: "q", limit: 51 }]) {
    await assert.rejects(kernel.invoke(person, pick, input), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid", JSON.stringify(input).slice(0, 60));
  }
  assert.deepEqual(seen, [], "the handler never ran");
  assert.deepEqual(await kernel.invoke(person, pick, { query: "q", limit: 5 }), { items: [] });
  assert.deepEqual(seen, [{ query: "q", limit: 5 }], "no current object unless the page handed one over");
});

// Items 3 to 5 and `near` (slice K2): the Workbench's own route is the only way a composer reaches a source. It lists and calls only
// what the person's directory holds now, hands a source nothing but this call's query (`near` only of its own kind), and a plugin
// page has no way in. The browser half (late results dropped, a pick checked again at send) is tests/composer.e2e.test.ts.
async function composerHome(t: TestContext) {
  const source = composerSourcePlugin(), mount = composerMountPlugin(source.reader);
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [source.definition, mount.definition] } });
  const project = await f.project("统一输入");
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await f.request(`/projects/${encodeURIComponent(project.project_id)}${path}`, { method: "POST", body, headers });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { f, source, mount, project, post };
}

test("S-composer-source-call item 1 near: a source gets only query, limit and the page's object of its own kind", async (t) => {
  const { source, post } = await composerHome(t);
  const listed = await post("/api/composer/sources", { layer: "ai" });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const [entry] = listed.body.sources as Array<Record<string, unknown>>;
  assert.deepEqual(entry, { capability_id: "composernotes.pick", version: 1, provider_id: entry!.provider_id, provider: entry!.provider, title: "测试笔记" });
  const ask = (extra: Record<string, unknown>) => post("/api/composer/pick", { layer: "ai", capability_id: "composernotes.pick", version: 1, provider_id: entry!.provider_id, query: "访谈", limit: 5, ...extra });
  const found = await ask({ near: { kind: NOTE_KIND, id: "n3", plugin_id: source.id }, draft: "没发出的字", receiver: "Coding", materials: [{ kind: "attachment", ref: "x" }] });
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.deepEqual((found.body.items as Array<{ title: string }>).map((item) => item.title), ["访谈记录", "访谈提纲"]);
  assert.deepEqual(source.seen.at(-1), { query: "访谈", limit: 5, near: { kind: NOTE_KIND, id: "n3" } }, "no draft, receiver or other material reaches the source");
  await ask({ near: { kind: "goal", id: "g-private" } });
  assert.deepEqual(source.seen.at(-1), { query: "访谈", limit: 5 }, "another owner's object is not handed over");
  const wide = await ask({ query: "x".repeat(201) });
  assert.equal(wide.status, 400, "the platform's schema bounds the query");
});

test("S-composer-source-call item 3: a source turned off is not listed, an open menu's next query is refused, a forged one too", async (t) => {
  const { source, post } = await composerHome(t);
  const [entry] = (await post("/api/composer/sources", { layer: "plain" })).body.sources as Array<Record<string, unknown>>;
  const pick = (over: Record<string, unknown> = {}) => post("/api/composer/pick", { layer: "plain", capability_id: "composernotes.pick", version: 1, provider_id: entry!.provider_id, query: "", limit: 5, ...over });
  assert.equal((await pick()).status, 200);
  for (const forged of [{ provider_id: "io.molis.work.example.other" }, { version: 2 }, { capability_id: "composernotes.read" }]) {
    const refused = await pick(forged);
    assert.deepEqual([refused.status, refused.body.code], [503, "composer.source_unavailable"], JSON.stringify(forged));
  }
  const calls = source.seen.length;
  source.off();
  assert.deepEqual((await post("/api/composer/sources", { layer: "plain" })).body.sources, [], "off: not listed");
  const late = await pick();
  assert.deepEqual([late.status, late.body.code], [503, "composer.source_unavailable"], "the menu opened before is refused now");
  assert.equal(source.seen.length, calls, "the source is not called");
});

test("S-composer-source-call N42–N56: a pick the page let go of is cancelled at its source; the next one runs as usual", async (t) => {
  const { source, post, f, project } = await composerHome(t);
  const [entry] = (await post("/api/composer/sources", { layer: "plain" })).body.sources as Array<Record<string, unknown>>;
  const body = { layer: "plain", capability_id: "composernotes.pick", version: 1, provider_id: entry!.provider_id, query: "访谈", limit: 5 };
  source.hold();
  const left = new AbortController();
  const asked = f.request(`/projects/${encodeURIComponent(project.project_id)}/api/composer/pick`, { method: "POST", body, signal: left.signal }).catch((error: unknown) => error);
  for (let tries = 0; !source.held.length && tries < 200; tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(source.held.length, 1, "the pick reached its source and waits there");
  assert.equal(source.held[0]!.aborted, false);
  left.abort();
  assert.ok((await asked) instanceof Error, "the page's own request is gone");
  for (let tries = 0; !source.held[0]!.aborted && tries < 200; tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(source.held[0]!.aborted, true, "the source's call gets the page's abort on its signal");
  source.release();
  const calls = source.seen.length;
  const next = await post("/api/composer/pick", body);
  assert.deepEqual([next.status, (next.body.items as Array<{ title: string }>).map((item) => item.title)], [200, ["访谈记录", "访谈提纲"]]);
  assert.equal(source.seen.length, calls + 1, "one request, one call");
});

test("UIC-10 the start-up sweep names the drafts whose project or plugin is gone, and nothing else", async (t) => {
  const { f, project, mount } = await composerHome(t);
  const key = (place: string, install: string) => composerDraftKey({ project: place, install, entry: "comment", conversation: "c1" });
  const kept = [key(project.project_id, mount.id), key(project.project_id, "workbench"), key("home", "io.molis.work.example.gone"), "mw.other:x", "unrelated"];
  const gone = [key("p-deleted", mount.id), key("p-deleted", "workbench"), `molis-plugin-page:h:${mount.id}:p-deleted:${key("p-deleted", mount.id)}`];
  const response = await f.request("/api/composer/drafts/sweep", { method: "POST", body: { keys: [...kept, ...gone, 7] } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { remove: gone }, "a project no longer in the Home goes whole, a framed page's too; this project's plugin, the Workbench's own, Home drafts and other keys stay");
  assert.equal((await f.request("/api/composer/drafts/sweep", { method: "GET" })).status, 405);
});

test("S-composer-source-call item 4: a picked note the target cannot read stops the send; nothing is written", async (t) => {
  const { source, mount, post } = await composerHome(t);
  const material = { kind: "material", ref: { subject: { kind: NOTE_KIND, id: "n1" }, pin: { mode: "current", read_revision: "r1" } }, title: "访谈记录",
    source: { capability_id: "composernotes.pick", version: 1, provider_id: "x" } };
  const submission = { text: "看一下这条", materials: [{ kind: "attachment", ref: "upload:a", title: "a" }, material], controls: {}, request_id: "r-1" };
  source.reading(false);
  const refused = await post(`/api/plugins/${mount.id}/submit`, submission);
  assert.equal(refused.status, 200, JSON.stringify(refused.body));
  assert.deepEqual([refused.body.state, (refused.body.unreadable as Array<{ index: number }>).map((one) => one.index)], ["failed", [1]]);
  assert.deepEqual(mount.sent, [], "not sent without it");
  source.reading(true);
  const accepted = await post(`/api/plugins/${mount.id}/submit`, submission);
  assert.equal(accepted.body.state, "sent", JSON.stringify(accepted.body));
  assert.equal(mount.sent.length, 1);
});

test("S-composer-source-call item 5: a plugin page has no way to the sources: listing and picking are refused", async (t) => {
  const probe = homeProbe("composerpage");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const headers = { "x-molis-plugin-page": (await opened.json()).page_id as string };
  for (const path of ["/api/composer/sources", "/api/composer/pick"]) {
    const response = await f.request(path, { method: "POST", body: { layer: "ai", capability_id: "composernotes.pick", version: 1, query: "", limit: 5 }, headers });
    assert.equal(response.status, 403, `${path}: ${await response.text()}`);
  }
  assert.equal((await f.request("/api/composer/sources", { method: "POST", body: { layer: "ai" } })).status, 200, "the person's own page still lists them");
});


test("S-composer-source-call B10-R4: duplicate owners never receive near, even when one owner is unavailable", async (t) => {
  const owner = composerSourcePlugin(), pretender = composerSourcePlugin("pretender");
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [owner.definition, pretender.definition] } });
  const project = await f.project("近处对象不能泄漏");
  const post = async (path: string, body: unknown) => {
    const response = await f.request(`/projects/${project.project_id}${path}`, { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<{ sources: Array<{ capability_id: string; version: number; provider_id: string }> }>;
  };
  const { sources } = await post("/api/composer/sources", { layer: "ai" });
  const source = sources.find(item => item.capability_id === "pretender.pick")!;
  for (const unavailable of [false, true]) {
    if (unavailable) owner.off();
    await post("/api/composer/pick", { ...source, query: "", limit: 5, near: { kind: NOTE_KIND, id: "private-id", plugin_id: owner.id } });
    assert.deepEqual(pretender.seen.at(-1), { query: "", limit: 5 });
  }
});

test("S-composer-source-call B10-R5: Assistant refuses stale or missing picks before creating any work", async (t) => {
  const { f, post } = await composerHome(t);
  for (const [id, revision] of [["n1", "r0"], ["missing", "r1"]]) {
    const result = await post("/api/assistant/send", { request_id: `refused-${id}`, text: "带上这份资料", materials: [{ material_id: "pick-a", kind: "object", title: "笔记", explicit: true,
      object: { kind: NOTE_KIND, id }, reference: { material: { subject: { kind: NOTE_KIND, id }, pin: { mode: "current", read_revision: revision } } } }] });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(result.body.code, "assistant.invalid");
    assert.equal((result.body.details as { unreadable: Array<{ material_id: string }> }).unreadable[0]!.material_id, "pick-a");
    assert.equal((result.body.details as { work?: unknown }).work, undefined, "no failure draft was created");
  }
  const works = await f.request("/api/assistant/works");
  assert.deepEqual((await works.json() as { works: unknown[] }).works, []);
  const check = await f.request("/api/assistant/requests/never-sent");
  assert.deepEqual(await check.json(), { state: "not-sent" });
  assert.deepEqual((await (await f.request("/api/assistant/works")).json() as { works: unknown[] }).works, []);
});


test("S-composer-source-call B10-R4: a missing page owner does not turn a visible pretender into the near owner", async t => {
  const pretender = composerSourcePlugin("pretender");
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [pretender.definition] } });
  const project = await f.project("当前页主人已不在目录");
  const base = `/projects/${project.project_id}/api/composer`;
  const listed = await f.request(base + "/sources", { method: "POST", body: { layer: "ai" } });
  const entry = (await listed.json() as { sources: Array<{ capability_id: string }> }).sources.find(item => item.capability_id === "pretender.pick")!;
  const result = await f.request(base + "/pick", { method: "POST", body: { ...entry, query: "", limit: 5,
    near: { kind: NOTE_KIND, id: "private-id", plugin_id: "io.molis.work.example.composernotes" } } });
  assert.equal(result.status, 200, await result.text());
  assert.deepEqual(pretender.seen.at(-1), { query: "", limit: 5 });
});
