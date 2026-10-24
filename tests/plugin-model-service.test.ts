import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineInstructionPrompt, instructed, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { PLUGIN_MODEL_LIMITS, type PluginDefinition, type PluginHostServices, type PluginManifest, type PluginModelClient, type PluginModelResult,
  type PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import {
  homeStores,
  DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkLocalHost, createPluginPlatform, molisWorkHostProjectReference, seedDemoBoard,
  type HostCompleteText, type HostTextRequestOptions,
} from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";

// W3-06 E: a plugin the Host runs itself can call the Host's text model through `services.model`, and only from inside one of its
// own actions that declares model:invoke and is scheduled "concurrent". The Host decides which action is running (the plugin
// passes no call context), asks the call's beforeEffect before the model is asked and again before the answer is handed over, and
// reaches the model through the one path every other caller has: `hostTextGeneration`, which goes to agent-host.

const MODEL_INVOKE = "model:invoke";
const MODEL_READ = "model:read";
const idOf = (name: string) => `io.molis.work.example.${name}`;
/** The error codes a refused call raises, with the sort of failure each is (docs/system/CONTRACT-CHANGES.md; the action error model). */
const CODES = {
  action_required: ["plugin.model_action_required", "forbidden"], permission_undeclared: ["plugin.model_permission_undeclared", "forbidden"],
  action_not_concurrent: ["plugin.model_action_not_concurrent", "forbidden"], instruction_refused: ["plugin.model_instruction_refused", "invalid"],
  limit_exceeded: ["plugin.model_limit_exceeded", "invalid"], output_invalid: ["plugin.model_output_invalid", "upstream"],
} as const;
const refusal = (name: keyof typeof CODES) => ({ code: CODES[name][0], kind: CODES[name][1] });

type Behavior = (run: { model: PluginModelClient; caller: ActionExecutionContext }) => Promise<unknown>;
interface ProbeOptions {
  name?: string;
  /** The whole plugin id, for the tests that need an id the catalog knows. */
  pluginId?: string;
  version?: string;
  /** The publisher signature, which with the plugin id makes the installation: two signatures are two installations of one plugin. */
  signature?: string;
  /** false: the Manifest asks for no model at all. */
  declares?: boolean;
  /** true: model:invoke is a required permission, so a plain start grants it. */
  required?: boolean;
  /** The model permissions the Manifest declares, in place of model:invoke alone; a required one is granted by a plain start. */
  permissions?: ReadonlyArray<{ permission: string; required: boolean }>;
  /** What `ask` and `ask-serial` declare, in place of model:invoke; the Manifest must declare each. */
  asks?: string[];
  execution?: "sandbox";
  /** What the plugin registers as its own instructions; the default is two. */
  instructions?: (pluginId: string) => readonly InstructionPrompt[];
  /** Attempted inside `start()`, where there is no action. */
  atStart?: (model: PluginModelClient) => Promise<unknown>;
}

/** A plugin that exists only for the test: three actions whose handlers do what `plugin.on.<action>` says, over the model it was started with. */
function probe(options: ProbeOptions = {}) {
  const { name = "modelprobe", version = "1.0.0", declares = true, required = false, execution, atStart } = options;
  const pluginId = options.pluginId ?? idOf(name);
  const summarize = defineInstructionPrompt({ owner_id: pluginId, prompt_id: "summarize", version: 1, title: "摘要", purpose: "把材料压成一句话", used_by: ["探针"], body: "把下面的材料压成一句话。" });
  const tone = defineInstructionPrompt({ owner_id: pluginId, prompt_id: "tone", version: 1, title: "语气", purpose: "让回答保持平实", used_by: ["探针"], body: "回答要平实、简短。" });
  const instructions = options.instructions?.(pluginId) ?? [summarize, tone];
  const shape = { scope: "project" as const, audiences: ["user" as const], subject_kinds: [], kind: "operation" as const,
    input_schema: { type: "object", additionalProperties: false } as const, output_schema: { type: "string" } as const };
  const define = (id: string, concurrent: boolean, permissions: string[]): ActionDefinition<Record<string, never>, string> => ({ capability_id: `${pluginId}.${id}`, version: 1,
    operation: "command", action: { ...shape, title: id, description: `探针动作 ${id}`, permissions: declares ? permissions : [], ...(concurrent ? { scheduling: "concurrent" as const } : {}) } });
  const asks = options.asks ?? [MODEL_INVOKE];
  const ask = define("ask", true, asks), serial = define("ask-serial", false, asks), plain = define("ask-plain", true, []);
  const defaults: Behavior = ({ model }) => model.complete(instructed(summarize, "材料正文"));
  const on: Record<"ask" | "serial" | "plain", Behavior> = { ask: defaults, serial: defaults, plain: defaults };
  const started: Array<PluginHostServices | undefined> = [], preflight: Array<PluginUpgradeContext["services"]> = [];
  const attempts: { atStart?: unknown } = {};
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version, name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature: options.signature ?? `probe-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: declares ? (options.permissions ?? [{ permission: MODEL_INVOKE, required }]).map(item => ({ ...item, reason: "让模型把材料压成一句话" })) : [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [ask, serial, plain],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const definition: PluginDefinition = { manifest, ...(execution ? { execution } : {}), ...(instructions.length ? { instructions } : {}),
    async start(context) {
      started.push(context.services);
      if (atStart && context.services?.model) attempts.atStart = await atStart(context.services.model).then(() => "returned", error => error);
      const run = (key: keyof typeof on) => async (caller: ActionExecutionContext) => {
        const model = started.at(-1)?.model;
        if (!model) throw new Error("this start was given no services.model");
        return JSON.stringify(await on[key]({ model, caller }) ?? null);
      };
      return { kind: "app", views: [], actions: [{ ...ask, handle: run("ask") }, { ...serial, handle: run("serial") }, { ...plain, handle: run("plain") }] };
    },
    async validateUpgrade({ context }) { preflight.push(context.services); } };
  return { definition, id: pluginId, ask, serial, plain, summarize, tone, on, started, preflight, attempts,
    model: (): PluginModelClient => started.at(-1)?.model ?? assert.fail("this start was given no services.model") };
}

/** A model that stands in for the Host's: it keeps what it was asked and answers what the test says. */
function standIn(reply: string | ((prompt: string, options: HostTextRequestOptions) => Promise<string>) = "摘要结果") {
  const calls: Array<{ prompt: string; options: HostTextRequestOptions }> = [];
  const complete: HostCompleteText = async (prompt, options = {}) => {
    calls.push({ prompt, options });
    if (typeof reply !== "string") return reply(prompt, options);
    await options.beforeDispatch?.(); // as the Host's own text path does, just before it sends
    return reply;
  };
  return { calls, complete };
}
const deferred = () => { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done; }), resolve }; };

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "plugin-model-service-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

type Injection = HostCompleteText | null | undefined;
/** The platform the way a project's start builds it, over a Home directory. `injection` is read when a call needs it, as the Host's is. */
function platformIn(directory: string, injection: { current: Injection } | null = { current: undefined }, registered?: ActionProviderRegistration[]) {
  const file = join(mkdtempSync(join(directory, "board-")), "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const shared = pluginActions(store, DEMO_PROJECT_ID);
  // The registrations the Runtime makes, kept when a test wants to reach a handler without the kernel in front of it.
  const actions = registered ? { ...shared, registry: { registerProvider: (registration: ActionProviderRegistration) => { registered.push(registration); return shared.registry.registerProvider(registration); } } } : shared;
  const platform = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: injection === null ? null : { directory, completeText: () => injection.current, stores: homeStores() } });
  const installId = (pluginId: string) => platform.runtime.list().find(record => record.plugin_id === pluginId)!.install_id;
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [MODEL_INVOKE], ...extra });
  const invoke = async <T = unknown>(definition: ActionDefinition<Record<string, never>, string>, extra: Partial<ActionCallContext> = {}) =>
    JSON.parse(await actions.client.invoke(caller(extra), definition, {}) as string) as T;
  return { store, platform, installId, invoke, caller, actions };
}
const GRANTED = { grants: [MODEL_INVOKE] };

/** The person's own version of a registered instruction: a row in the Home's agent-definitions store, which every call reads. */
function personEdits(home: string, owner: string, promptId: string, body: string) {
  const db = new DatabaseSync(join(home, "agent-definitions", "agent-definitions.db"));
  try {
    db.prepare("INSERT INTO prompt_overrides(key, revision, base_version, body, updated_at, actor_id) VALUES (?,?,?,?,?,?)")
      .run(`${owner}/${promptId}`, 1, 1, body, new Date().toISOString(), "person");
  } finally { db.close(); }
}

/** The environment can configure a text model (development keys); a test about "no model" must not find one. */
async function withoutEnvironmentModel<T>(run: () => Promise<T>): Promise<T> {
  const names = ["MOLIS_WORK_TEXT_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT", "MINIMAX_API_KEY"];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try { return await run(); } finally { for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; }
}

test("services.model is for a plugin the Host runs itself that declares model:invoke, on a platform that reaches a Home: not for a plugin that declares no model, a sandboxed one, a platform without a Home, or the upgrade preflight", { timeout: 60_000 },
  withDirectory(async directory => {
    const item = platformIn(directory), declared = probe(), undeclared = probe({ name: "nomodel", declares: false });
    try {
      assert.deepEqual((await item.platform.start([{ definition: declared.definition, ...GRANTED }, { definition: undeclared.definition }])).running.sort(), [declared.id, undeclared.id].sort());
      const model = declared.model();
      assert.deepEqual(Object.keys(model).sort(), ["availability", "choices", "complete"]);
      assert.equal(Object.isFrozen(model), true, "what the plugin holds cannot be extended into a way round the Host");
      assert.equal(undeclared.started.at(-1)?.model, undefined, "the Manifest is the account of what a plugin reaches");

      // The preflight of an upgrade is read-only: it is given no model.
      const next = probe({ version: "1.1.0" });
      await item.platform.runtime.upgrade({ install_id: item.installId(declared.id), definition: next.definition, ...GRANTED });
      assert.equal(next.preflight.length, 1, "the new version's preflight ran");
      for (const services of next.preflight) assert.equal((services as Record<string, unknown> | undefined)?.model, undefined);
    } finally { item.store.close(); }

    const sandboxed = platformIn(directory), boxed = probe({ name: "boxed", execution: "sandbox" });
    try {
      // The model is a service of the Host's own process, not of sandboxed code: a sandboxed package that declares it does not start (S-60).
      assert.deepEqual((await sandboxed.platform.start([{ definition: boxed.definition, ...GRANTED }])).running, []);
      assert.equal(boxed.started.length, 0, "the sandboxed plugin's code never ran");
      assert.equal(sandboxed.platform.runtime.get(sandboxed.installId(boxed.id)).last_error_code, "sandbox.service_not_given");
    } finally { sandboxed.store.close(); }

    const homeless = platformIn(directory, null), alone = probe({ name: "alone" });
    try {
      await homeless.platform.start([{ definition: alone.definition, ...GRANTED }]);
      assert.equal(alone.started.at(-1)?.model, undefined, "a platform that reaches no Home has no model to give");
    } finally { homeless.store.close(); }
  }));

test("a call sends the plugin's registered instruction and this call's data kept apart, in the person's version when there is one; system is another of the plugin's own instructions; the limits are the defaults unless the call names its own", { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), item = platformIn(directory, { current: model.complete }), plugin = probe();
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      const result = await item.invoke<PluginModelResult>(plugin.ask);
      assert.deepEqual(result, { text: "摘要结果" }, "a model that reports nothing gives no usage");
      assert.equal(model.calls.length, 1);
      assert.equal(model.calls[0]!.prompt, `${plugin.summarize.body}\n\n材料正文`);
      assert.equal(model.calls[0]!.options.system, undefined);
      assert.equal(model.calls[0]!.options.timeoutMs, PLUGIN_MODEL_LIMITS.default_timeout_ms);
      assert.equal(model.calls[0]!.options.maxOutputTokens, PLUGIN_MODEL_LIMITS.default_output_tokens);
      assert.ok(model.calls[0]!.options.signal instanceof AbortSignal, "the call's own signal reaches the model");
      assert.equal(typeof model.calls[0]!.options.beforeDispatch, "function", "and so does the check made just before it is sent");

      plugin.on.ask = ({ model: client }) => client.complete(instructed(plugin.summarize, "另一份材料"), { system: plugin.tone, timeout_ms: 90_000, max_output_tokens: 800 });
      await item.invoke(plugin.ask);
      assert.equal(model.calls[1]!.options.system, plugin.tone.body, "system is the plugin's own registered instruction");
      assert.equal(model.calls[1]!.options.timeoutMs, 90_000);
      assert.equal(model.calls[1]!.options.maxOutputTokens, 800);

      // The person's own version is what is sent, for the instruction and for system.
      personEdits(directory, plugin.id, "summarize", "用不超过十个字概括。");
      personEdits(directory, plugin.id, "tone", "回答像朋友聊天。");
      await item.invoke(plugin.ask);
      assert.equal(model.calls[2]!.prompt, "用不超过十个字概括。\n\n另一份材料");
      assert.equal(model.calls[2]!.options.system, "回答像朋友聊天。");
    } finally { item.store.close(); }
  }));

test("a call that breaks the rules is refused before anything is sent: a raw string, someone else's instruction, someone else's system, an instruction the plugin never registered, limits beyond the ceiling, an output that is not text or json", { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), item = platformIn(directory, { current: model.complete }), plugin = probe();
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      const foreign = defineInstructionPrompt({ owner_id: idOf("someone-else"), prompt_id: "summarize", version: 1, title: "别人的", purpose: "别人的指令", used_by: [], body: "别人的指令。" });
      const unregistered = defineInstructionPrompt({ owner_id: plugin.id, prompt_id: "never-registered", version: 1, title: "没登记", purpose: "没登记的指令", used_by: [], body: "没登记。" });
      const attempts: Array<[string, Behavior, keyof typeof CODES]> = [
        ["a raw string", ({ model: client }) => client.complete("直接写的一句话" as never), "instruction_refused"],
        ["another owner's instruction", ({ model: client }) => client.complete(instructed(foreign, "材料")), "instruction_refused"],
        ["another owner's system", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { system: foreign }), "instruction_refused"],
        ["an instruction the plugin never registered", ({ model: client }) => client.complete(instructed(unregistered, "材料")), "instruction_refused"],
        ["a system the plugin never registered", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { system: unregistered }), "instruction_refused"],
        ["a timeout past the ceiling", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { timeout_ms: PLUGIN_MODEL_LIMITS.max_timeout_ms + 1 }), "limit_exceeded"],
        ["a timeout that is not a positive whole number", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { timeout_ms: 1.5 }), "limit_exceeded"],
        ["no output tokens", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { max_output_tokens: 0 }), "limit_exceeded"],
        ["output tokens past the ceiling", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { max_output_tokens: PLUGIN_MODEL_LIMITS.max_output_tokens + 1 }), "limit_exceeded"],
        ["an output nobody defined", ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { output: "xml" as never }), "limit_exceeded"],
      ];
      for (const [label, behavior, code] of attempts) {
        plugin.on.ask = behavior;
        await assert.rejects(item.invoke(plugin.ask), refusal(code), label);
      }
      assert.equal(model.calls.length, 0, "nothing of any of them reached the model");
      // The ceilings themselves are allowed.
      plugin.on.ask = ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"),
        { timeout_ms: PLUGIN_MODEL_LIMITS.max_timeout_ms, max_output_tokens: PLUGIN_MODEL_LIMITS.max_output_tokens });
      await item.invoke(plugin.ask);
      assert.equal(model.calls.length, 1);
    } finally { item.store.close(); }
  }));

test("the model is for an action: not for start(), not for a handler of another plugin, not for a serial action, not for an action that did not declare model:invoke, and not for what is left running after the action returned", { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), item = platformIn(directory, { current: model.complete });
    const kept: { atStart?: Promise<unknown> } = {};
    const plugin = probe({ atStart: client => client.complete(instructed(defineInstructionPrompt({ owner_id: idOf("modelprobe"), prompt_id: "summarize", version: 1, title: "摘要",
      purpose: "把材料压成一句话", used_by: ["探针"], body: "把下面的材料压成一句话。" }), "start")) });
    const other = probe({ name: "otherprobe" });
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }, { definition: other.definition, ...GRANTED }]);
      assert.ok(plugin.attempts.atStart instanceof Error, "start() ran, and its call was refused");
      assert.equal((plugin.attempts.atStart as { code?: string }).code, CODES.action_required[0], "start() is not an action");

      // A client held outside any action: a route, a timer, a task started earlier.
      await assert.rejects(plugin.model().complete(instructed(plugin.summarize, "材料")), refusal("action_required"));
      // The right plugin's client in the wrong plugin's action is as outside as any other place.
      other.on.ask = () => plugin.model().complete(instructed(plugin.summarize, "材料"));
      await assert.rejects(item.invoke(other.ask), refusal("action_required"));
      // A serial action, and an action whose declaration does not name the permission.
      await assert.rejects(item.invoke(plugin.serial), refusal("action_not_concurrent"));
      await assert.rejects(item.invoke(plugin.plain, { permissions: [] }), refusal("permission_undeclared"));
      assert.equal(model.calls.length, 0, "none of them reached the model");

      // Work left running after the action returned finds the call over: the Host's lifetime for the action has ended.
      plugin.on.ask = ({ model: client }) => {
        kept.atStart = new Promise(resolve => setTimeout(() => client.complete(instructed(plugin.summarize, "迟到的材料")).then(() => resolve("returned"), resolve), 20));
        return Promise.resolve("done");
      };
      assert.equal(await item.invoke(plugin.ask), "done");
      const late = await kept.atStart as { code?: string };
      assert.equal(late.code, "actions.expired");
      assert.equal(model.calls.length, 0, "and the model was not asked");
      // The same action, called properly, works.
      plugin.on.ask = ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"));
      assert.deepEqual(await item.invoke(plugin.ask), { text: "摘要结果" });
      assert.equal(model.calls.length, 1);
    } finally { item.store.close(); }
  }));

test("the Runtime asks the call itself and not only the kernel: a handler reached with a caller that does not hold model:invoke is refused, and one whose beforeEffect refuses never reaches the model",
  { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), registered: ActionProviderRegistration[] = [];
    const item = platformIn(directory, { current: model.complete }, registered), plugin = probe();
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      const handler = registered.flatMap(registration => registration.handlers).find(binding => binding.capability_id === plugin.ask.capability_id)
        ?? assert.fail("the Runtime registered the plugin's action");
      const context = (extra: Partial<ActionExecutionContext>): ActionExecutionContext => ({ actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user",
        permissions: [MODEL_INVOKE], beforeEffect: async () => {}, ...extra });
      await assert.rejects(Promise.resolve(handler.handle(context({ permissions: [] }), {})), { code: "actions.forbidden" });
      await assert.rejects(Promise.resolve(handler.handle(context({ beforeEffect: async () => { throw new Error("这次调用已经结束"); } }), {})), /这次调用已经结束/);
      assert.equal(model.calls.length, 0, "neither reached the model");
      assert.deepEqual(JSON.parse(await handler.handle(context({}), {}) as string), { text: "摘要结果" });
      assert.equal(model.calls.length, 1);
    } finally { item.store.close(); }
  }));

/** What the handler saw of one call it made: the answer if it was handed one, the refusal if not, and a signal for when it is over. */
function watched(plugin: ReturnType<typeof probe>) {
  const seen = { handed: [] as PluginModelResult[], refused: [] as unknown[], over: deferred() };
  plugin.on.ask = async ({ model }) => {
    try { const result = await model.complete(instructed(plugin.summarize, "材料")); seen.handed.push(result); return result; }
    catch (error) { seen.refused.push(error); throw error; }
    finally { seen.over.resolve(); }
  };
  return seen;
}

test("a call is the call's: cancelled while the model answers, the answer is not handed over, whether the model checks beforeDispatch or ignores the signal and answers anyway", { timeout: 60_000 },
  withDirectory(async directory => {
    for (const checksDispatch of [false, true]) {
      const entered = deferred(), release = deferred();
      let refusedAtDispatch: unknown;
      const model = standIn(async (_prompt, options) => {
        entered.resolve();
        await release.promise;
        if (checksDispatch) await options.beforeDispatch?.().catch(error => { refusedAtDispatch = error; throw error; });
        return "迟到的回答";
      });
      const item = platformIn(directory, { current: model.complete }), plugin = probe({ name: checksDispatch ? "dispatchprobe" : "ignoreprobe" });
      try {
        await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
        const seen = watched(plugin);
        const controller = new AbortController();
        const cancelled = item.invoke(plugin.ask, { signal: controller.signal });
        cancelled.catch(() => {});
        await Promise.race([entered.promise, cancelled]);
        controller.abort(new Error("取消了"));
        release.resolve();
        await seen.over.promise;
        await assert.rejects(cancelled);
        assert.deepEqual(seen.handed, [], `checksDispatch=${checksDispatch}: the answer arrived and was not handed over`);
        assert.equal(seen.refused.length, 1);
        assert.equal(refusedAtDispatch !== undefined, checksDispatch, "the check made just before sending is the one that stopped a model that makes it");
        assert.equal(model.calls.length, 1, "the model had been asked: the call was cancelled while it answered");
      } finally { item.store.close(); }
    }
  }));

test("a call is the plugin's while it runs: stopped while the model answers, the answer is not handed over, and the client of an earlier start stays dead after the plugin runs again",
  { timeout: 60_000 },
  withDirectory(async directory => {
    const entered = deferred(), release = deferred();
    const model = standIn(async () => { entered.resolve(); await release.promise; return "停止后的回答"; });
    const item = platformIn(directory, { current: model.complete }), plugin = probe();
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      const earlier = plugin.model();
      const seen = watched(plugin);
      const pending = item.invoke(plugin.ask);
      pending.catch(() => {});
      await Promise.race([entered.promise, pending]);
      const stopping = item.platform.runtime.stop(item.installId(plugin.id));
      stopping.catch(() => {});
      release.resolve();
      await seen.over.promise;
      await stopping;
      await assert.rejects(pending);
      assert.deepEqual(seen.handed, [], "the plugin was stopped; its call gets no answer");
      assert.equal(seen.refused.length, 1);

      // Running again is a new instance with its own client; the one kept from before is not revived, even inside the new instance's action.
      await item.platform.runtime.start(item.installId(plugin.id));
      assert.notEqual(plugin.model(), earlier);
      plugin.on.ask = () => earlier.complete(instructed(plugin.summarize, "材料"));
      await assert.rejects(item.invoke(plugin.ask), { code: "actions.forbidden" });
      plugin.on.ask = ({ model: current }) => current.complete(instructed(plugin.summarize, "材料"));
      assert.deepEqual(await item.invoke(plugin.ask), { text: "停止后的回答" }, "the new instance's own client works");
    } finally { item.store.close(); }
  }));

test("availability is the model's: with no model set up it says so and complete sends nothing; a stopped plugin says it is stopped; a platform with a model says it is available", { timeout: 60_000 },
  withDirectory(async directory => {
    await withoutEnvironmentModel(async () => {
      const model = standIn(), injection: { current: Injection } = { current: null }, item = platformIn(directory, injection), plugin = probe();
      try {
        await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
        const client = plugin.model();
        // null says the Host was given no model.
        assert.deepEqual(client.availability(), { available: false, code: "actions.connection_required", reason: "请先在「模型设置」里连接文字模型" });
        await assert.rejects(item.invoke(plugin.ask), { code: "actions.connection_required" });
        // Nothing injected, nothing configured in this Home, no environment key: the Host's own check finds no model either.
        injection.current = undefined;
        assert.equal(client.availability().available, false);
        assert.equal((client.availability() as { code: string }).code, "actions.connection_required");
        await assert.rejects(item.invoke(plugin.ask), { code: "actions.connection_required" });
        // A model, read when the call needs it, not when the plugin started.
        injection.current = model.complete;
        assert.deepEqual(client.availability(), { available: true, vision: true }, "a model the Host was given for a test takes images as they are");
        assert.deepEqual(await item.invoke(plugin.ask), { text: "摘要结果" });
        assert.equal(model.calls.length, 1, "only the call made once a model was there reached one");
        // The grant is part of availability, as it is for the action itself.
        await item.platform.runtime.stop(item.installId(plugin.id));
        assert.equal(client.availability().available, false);
        assert.equal((client.availability() as { code: string }).code, "actions.provider_stopped");
      } finally { item.store.close(); }
    });
  }));

test("PG047-01 S-15 model:read reads and never sends: a plugin that holds only model:read is given services.model, lists the models and asks availability, and complete() is refused before anything is sent, whether its Manifest declares model:invoke too or not",
  { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), registered: ActionProviderRegistration[] = [];
    const item = platformIn(directory, { current: model.complete }, registered);
    // One reads and nothing more: model:read is all it declares, so none of its actions can declare model:invoke.
    const reader = probe({ name: "reader", permissions: [{ permission: MODEL_READ, required: true }], asks: [] });
    // One declares both and holds only model:read: its action declares model:invoke, the installation was not given it.
    const both = probe({ name: "both", permissions: [{ permission: MODEL_READ, required: true }, { permission: MODEL_INVOKE, required: false }] });
    try {
      await item.platform.start([{ definition: reader.definition }, { definition: both.definition }]);
      for (const plugin of [reader, both]) {
        const client = plugin.model();
        assert.deepEqual(Object.keys(client).sort(), ["availability", "choices", "complete"]);
        assert.ok(Array.isArray(client.choices()), "model:read lists the models");
        assert.deepEqual(client.availability(), { available: true, vision: true }, "and asks whether one can be reached");
      }
      // The reader's own concurrent action declares no model:invoke: the service refuses the call itself.
      await assert.rejects(item.invoke(reader.ask), refusal("permission_undeclared"));
      // The other one's action declares model:invoke, which the installation does not hold: the action service does not run it,
      // and its handler reached with a caller that holds model:invoke is refused by the grant before the model is asked.
      await assert.rejects(item.invoke(both.ask), { code: "actions.plugin_permission" });
      const handler = registered.flatMap(registration => registration.handlers).find(binding => binding.capability_id === both.ask.capability_id)
        ?? assert.fail("the Runtime registered the plugin's action");
      const context: ActionExecutionContext = { actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [MODEL_INVOKE], beforeEffect: async () => {} };
      await assert.rejects(Promise.resolve(handler.handle(context, {})), { code: "plugin.grant_denied" });
      assert.equal(model.calls.length, 0, "model:read never reached the model");
    } finally { item.store.close(); }
  }));

test("PG047-02 S-15 neither held: a plugin that declares the model permissions and holds neither is refused the list, and availability says the grant is missing; one that declares both and holds only model:invoke still lists",
  { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), item = platformIn(directory, { current: model.complete });
    const both = probe({ name: "neither", permissions: [{ permission: MODEL_READ, required: false }, { permission: MODEL_INVOKE, required: false }] });
    const invoker = probe({ name: "invoker" });
    // model:read is declared and not given, model:invoke is held: the refused one does not end the search, the held one counts.
    const fallback = probe({ name: "fallback", permissions: [{ permission: MODEL_READ, required: false }, { permission: MODEL_INVOKE, required: true }] });
    try {
      await item.platform.start([{ definition: both.definition }, { definition: invoker.definition }, { definition: fallback.definition }]);
      for (const plugin of [both, invoker]) {
        const client = plugin.model();
        assert.throws(() => client.choices(), { code: "plugin.grant_denied" });
        assert.deepEqual(client.availability(), { available: false, code: "actions.plugin_permission", reason: "插件缺少模型授权" });
      }
      assert.ok(Array.isArray(fallback.model().choices()), "model:invoke alone lists the models");
      assert.deepEqual(fallback.model().availability(), { available: true, vision: true });
      assert.equal(model.calls.length, 0);
    } finally { item.store.close(); }
  }));

test("output json: the answer is decoded when it is JSON, a code fence around it is allowed, text stays the model's own words, and an answer that is not JSON is refused as the model's output", { timeout: 60_000 },
  withDirectory(async directory => {
    const answers = ["```json\n{\"items\":[1,2]}\n```", "{\"ok\":true}", "这不是 JSON"];
    const model = standIn(async () => answers.shift()!), item = platformIn(directory, { current: model.complete }), plugin = probe();
    try {
      await item.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      plugin.on.ask = ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { output: "json" });
      assert.deepEqual(await item.invoke(plugin.ask), { text: "```json\n{\"items\":[1,2]}\n```", value: { items: [1, 2] } });
      assert.deepEqual(await item.invoke(plugin.ask), { text: "{\"ok\":true}", value: { ok: true } });
      await assert.rejects(item.invoke(plugin.ask), refusal("output_invalid"));
      assert.equal(model.calls.length, 3);
      plugin.on.ask = ({ model: client }) => client.complete(instructed(plugin.summarize, "材料"), { output: "text" });
      model.calls.length = 0;
      answers.push("{\"not\":\"decoded\"}");
      assert.deepEqual(await item.invoke(plugin.ask), { text: "{\"not\":\"decoded\"}" }, "text asks for no decoding");
    } finally { item.store.close(); }
  }));

test("instructions a definition carries are registered while it runs and only then: once for the install however many projects run it, withdrawn with the last of them, refused when they name another owner or one the platform registers itself", { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), first = platformIn(directory, { current: model.complete }), second = platformIn(directory, { current: model.complete });
    const plugin = probe(), again = probe();
    try {
      await first.platform.start([{ definition: plugin.definition, ...GRANTED }]);
      await second.platform.start([{ definition: again.definition, ...GRANTED }]);
      assert.deepEqual(await first.invoke(plugin.ask), { text: "摘要结果" });
      // One project stops: the other's instructions are still there.
      await first.platform.runtime.stop(first.installId(plugin.id));
      assert.deepEqual(await second.invoke(again.ask), { text: "摘要结果" });
      // The last one stops: kept as not running (PG-051 Q1 b). A version that carries none replaces that record whole, and cannot send one.
      await second.platform.runtime.stop(second.installId(again.id));
      const bare = probe({ version: "1.1.0", instructions: () => [] });
      const third = platformIn(directory, { current: model.complete });
      try {
        await third.platform.start([{ definition: bare.definition, ...GRANTED }]);
        await assert.rejects(third.invoke(bare.ask), refusal("instruction_refused"));
      } finally { third.store.close(); }
    } finally { first.store.close(); second.store.close(); }

    // A definition cannot register instructions under another owner's name, nor for an owner the platform registers itself (PG-051 Q2).
    // What the supervisor shows of a start that failed is a generic line, so the check is that the plugin never started and nothing ran.
    const wrong = platformIn(directory), strange = probe({ name: "strange", instructions: () => [defineInstructionPrompt({ owner_id: idOf("someone-else"), prompt_id: "x",
      version: 1, title: "x", purpose: "x", used_by: [], body: "x" })] });
    const duplicate = platformIn(directory), shadow = probe({ pluginId: "io.molis.work.plugin-builder" });
    try {
      const refused = await wrong.platform.start([{ definition: strange.definition, ...GRANTED }]);
      assert.deepEqual(refused.running, []);
      assert.deepEqual(refused.failed.map(entry => entry.plugin_id), [strange.id]);
      assert.equal(strange.started.length, 0, "the plugin never started");
      const doubled = await duplicate.platform.start([{ definition: shadow.definition, ...GRANTED }]);
      assert.deepEqual(doubled.running, [], "Plugin Builder's instructions are the platform's: a second source for the same owner is refused");
      assert.deepEqual(doubled.failed.map(entry => entry.plugin_id), [shadow.id]);
      assert.equal(shadow.started.length, 0);
    } finally { wrong.store.close(); duplicate.store.close(); }
  }));

test("RAC-194 an owner the platform registers itself is refused instructions from a definition; a built-in plugin's own definition is the one source of its instructions", { timeout: 60_000 },
  withDirectory(async directory => {
    // A second source for such an owner would blend into the platform's row in the register: the assistant's Agent, Plugin Builder's
    // Agents and questions (PG-051 Q2) and Alchemist's instructions, which the Host serves.
    for (const owner of ["io.molis.work.assistant", "io.molis.work.plugin-builder", "io.molis.work.alchemist"]) {
      const item = platformIn(directory), shadow = probe({ pluginId: owner });
      try {
        const refused = await item.platform.start([{ definition: shadow.definition, ...GRANTED }]);
        assert.deepEqual(refused.running, [], `${owner} is registered by the platform`);
        assert.deepEqual(refused.failed.map(entry => entry.plugin_id), [owner]);
        assert.equal(shadow.started.length, 0, "the plugin never started");
      } finally { item.store.close(); }
    }
    // A built-in plugin is no exception: Todo's instructions come with its definition, and nothing else registers them (PG-051).
    const todo = platformIn(directory, { current: standIn().complete }), own = probe({ pluginId: "io.molis.work.todo" });
    try {
      assert.deepEqual((await todo.platform.start([{ definition: own.definition, ...GRANTED }])).running, ["io.molis.work.todo"]);
      assert.deepEqual(await todo.invoke(own.ask), { text: "摘要结果" });
    } finally { todo.store.close(); }
  }));

test("an owner's own registration is its installation's: two installations of one plugin (two signatures) run together, each with its instructions, and the last one out withdraws them", { timeout: 60_000 },
  withDirectory(async directory => {
    const model = standIn(), first = platformIn(directory, { current: model.complete }), second = platformIn(directory, { current: model.complete });
    const one = probe({ signature: "signed-by-one" }), other = probe({ signature: "signed-by-other" });
    try {
      assert.deepEqual((await first.platform.start([{ definition: one.definition, ...GRANTED }])).running, [one.id]);
      assert.deepEqual((await second.platform.start([{ definition: other.definition, ...GRANTED }])).running, [other.id],
        "the first installation's registration of the owner is its own, and no reason to refuse the second");
      assert.deepEqual(await first.invoke(one.ask), { text: "摘要结果" });
      assert.deepEqual(await second.invoke(other.ask), { text: "摘要结果" });
      // One installation stops: the other's instructions are still registered.
      await first.platform.runtime.stop(first.installId(one.id));
      assert.deepEqual(await second.invoke(other.ask), { text: "摘要结果" });
      // The last one stops: nothing of the plugin's is registered any more.
      await second.platform.runtime.stop(second.installId(other.id));
      const bare = probe({ signature: "signed-by-one", instructions: () => [] }), third = platformIn(directory, { current: model.complete });
      try {
        await third.platform.start([{ definition: bare.definition, ...GRANTED }]);
        await assert.rejects(third.invoke(bare.ask), refusal("instruction_refused"));
      } finally { third.store.close(); }
    } finally { first.store.close(); second.store.close(); }
  }));

test("through the Host's text path: a Host given no model reaches the configured one by hostTextGeneration (agent-host's Prologue inference), and the answer carries what the provider reported",
  { timeout: 60_000 },
  withDirectory(async directory => {
    const provider = await startModelStandIn("path-key-0123456789", "来自模型的回答");
    const { home, reference } = await homeWithProject(directory);
    const plugin = probe({ required: true });
    const asUser: ActionCallContext = { actor_id: "web-user", project_id: reference.project_id, audience: "user", permissions: [MODEL_INVOKE] };
    try {
      await withoutEnvironmentModel(async () => {
        Object.assign(process.env, { MOLIS_WORK_TEXT_API_KEY: "path-key-0123456789", MOLIS_WORK_TEXT_BASE_URL: provider.baseUrl, MOLIS_WORK_TEXT_MODEL: "stand-in-model",
          MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions" });
        const host = new MolisWorkLocalHost({ homeDirectory: home, pluginFixtures: { project: [plugin.definition] } });
        try {
          const result = JSON.parse(await host.actionClient(reference).invoke(asUser, plugin.ask, {}) as string) as PluginModelResult;
          assert.equal(result.text, "来自模型的回答");
          assert.deepEqual(result.usage, { input_tokens: 3, output_tokens: 2 }, "what the provider reported");
          assert.deepEqual(provider.requests.map(request => [request.model, request.offeredKey]), [["stand-in-model", "path-key-0123456789"]]);
          assert.deepEqual(plugin.model().availability(), { available: true });
        } finally { await host.close(); }
      });
    } finally { await provider.close(); }
  }));

/** A new Home with one project, a real project database the Host can open. */
async function homeWithProject(directory: string) {
  const home = mkdtempSync(join(directory, "home-"));
  mkdirSync(home, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const created = await catalog.createProject({ display_name: "模型服务", actor_id: "web-user" });
    return { home, reference: molisWorkHostProjectReference({ databasePath: created.database_path, projectId: created.project_id }) };
  } finally { catalog.close(); }
}

test("production path: a fixture the Host is given reaches the model the Host was given from an action called through the Host's action client, with the Host's own injection and the instructions the fixture carries", { timeout: 60_000 },
  withDirectory(async directory => {
    const { home, reference } = await homeWithProject(directory);
    const model = standIn("宿主里的回答"), plugin = probe({ required: true });
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: model.complete, pluginFixtures: { project: [plugin.definition] } });
    const asUser: ActionCallContext = { actor_id: "web-user", project_id: reference.project_id, audience: "user", permissions: [MODEL_INVOKE] };
    try {
      const answer = await host.actionClient(reference).invoke(asUser, plugin.ask, {});
      assert.deepEqual(JSON.parse(answer as string), { text: "宿主里的回答" });
      assert.equal(model.calls.length, 1);
      assert.equal(model.calls[0]!.prompt, `${plugin.summarize.body}\n\n材料正文`, "the instruction the fixture carries was registered when it started");
      // A serial action is refused here as anywhere.
      await assert.rejects(host.actionClient(reference).invoke(asUser, plugin.serial, {}), refusal("action_not_concurrent"));
      assert.equal(model.calls.length, 1);
    } finally { await host.close(); }

    // A Host given no model says there is none.
    const noModel = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [plugin.definition] } });
    try {
      await assert.rejects(noModel.actionClient(reference).invoke(asUser, plugin.ask, {}), { code: "actions.connection_required" });
    } finally { await noModel.close(); }
  }));

test("S-18 RAC-50 RAC-53 background execution needs its declaration and active action, is absent from sandbox/preflight, and needs no model Home", withDirectory(async directory => {
  for (const kind of ["declared", "sandbox", "undeclared"] as const) {
    const item = platformIn(directory, null), probe = backgroundProbe(`background-${kind}`, "project");
    // This platform uses an inert private-storage port; lifecycle/storage refusal is tested over the real Home and project stores.
    delete probe.definition.stop;
    if (kind === "sandbox") probe.definition.execution = "sandbox";
    if (kind === "undeclared") for (const action of probe.definition.manifest.actions ?? []) delete action.action.background_job;
    try {
      const started = await item.platform.start([{ definition: probe.definition, grants: probe.permissions }]);
      if (kind === "sandbox") {
        // Background jobs are not given to sandboxed code (S-60, PG-017 P3): a package that declares them does not start.
        assert.deepEqual(started.running, []);
        assert.equal(probe.contexts.length, 0, "the sandboxed plugin's code never ran");
        assert.equal(item.platform.runtime.get(item.installId(probe.id)).last_error_code, "sandbox.service_not_given");
        continue;
      }
      assert.deepEqual(started.running, [probe.id]);
      const services = probe.contexts.at(-1)!.services!;
      assert.equal(services.model, undefined);
      if (kind !== "declared") assert.equal(services.background, undefined);
      else {
        assert.ok(services.background); assert.equal(Object.isFrozen(services.background), true);
        await assert.rejects(services.background.start(async () => "startup"), { code: "plugin.background_action_required" });
        await item.actions.client.invoke(item.caller({ permissions: probe.permissions }), probe.start, { id: "no-model" });
        assert.equal(await probe.handles[0]!.result, "saved result");
        const next = backgroundProbe(`background-${kind}`, "project", "1.1.0"); delete next.definition.stop;
        await item.platform.runtime.upgrade({ install_id: item.installId(probe.id), definition: next.definition, grants: probe.permissions });
        assert.equal(next.preflight.length, 1); assert.equal(next.preflight[0]!.services?.background, undefined);
      }
    } finally {
      await item.platform.closeCoordination();
      for (const install of item.platform.runtime.list()) if (install.state === "running") await item.platform.runtime.stop(install.install_id);
      item.store.close();
    }
  }
}));
