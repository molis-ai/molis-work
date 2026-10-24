import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ActionDefinition, ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { ASSISTANT_STORE_BASELINE, AssistantService, AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { EXECUTOR_MODES, roleOfCapability, roleViews } from "./fixtures/work-executor-fake.js";

// S-62 (specs/repository-anti-corruption PG-036, C8-3): the Assistant takes a plugin as the executor of a work only by the
// work-executor protocol and the plugin's id. A look-alike is not an executor; a plugin that is gone, unavailable or short of a role is
// refused and no other one takes its place; and nothing in the Assistant names a plugin.

const PLUGIN = "io.molis.work.fixture-agent", KIND = "fixture_session", PROJECT = { project_id: "project", storage_key: "memory:project" };

/** A directory of executor providers; every call that reaches a role is counted by the plugin it reached. */
function directory(rows: Array<{ plugin: string; views: ActionView[] }>) {
  const reached = new Map<string, string[]>();
  const actions: BoundActionClient = { discover: async () => rows.flatMap(row => row.views),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => {
      const row = rows.find(one => one.views.some(view => view.capability_id === definition.capability_id))!;
      const role = roleOfCapability(row.plugin, definition.capability_id);
      reached.set(row.plugin, [...reached.get(row.plugin) ?? [], role]);
      if (role === "state") return { modes: EXECUTOR_MODES, default_mode: "execute", images: false } as Output;
      if (role === "session.open") return { session_id: "session-1" } as Output;
      if (role === "session.read") return { session_id: "session-1", title: "会话", mode: null, runs: [], runtime_session_id: null, recovery: null } as Output;
      if (role === "run.start") return { run_id: "run-1" } as Output;
      return { accepted: true } as Output;
    } };
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const host = { adapter: () => ({ readSession: async () => ({}), read: async () => null }), reviews: { list: () => [] } };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: async () => { throw new Error("not used"); },
    personActions: async () => actions }, "web-user");
  return { reached, store, service, caller: { project_ref: PROJECT } };
}
const choose = { kind: "plugin" as const, plugin_id: PLUGIN };
const send = (text = "做点什么") => ({ executor: choose, scope: { kind: "project" as const, project_id: "project" }, text, request_id: randomUUID() });

test("RAC-440 S-62 a look-alike is not an executor: a provider short of a role, with the roles open to agents only, without a plugin id or without a session kind is not offered", async () => {
  const whole = roleViews(PLUGIN, "样例 Agent", KIND);
  const short = roleViews("io.molis.work.short", "缺一个角色", "short_session", "run.control");
  const agentsOnly = roleViews("io.molis.work.agents", "只给 Agent", "agent_session").map((view): ActionView => ({ ...view, action: { ...view.action, audiences: ["agent"] } }));
  const anonymous = roleViews("io.molis.work.anonymous", "没有插件标识", "anonymous_session").map((view): ActionView => ({ ...view, provider: { provider_id: view.provider.provider_id, kind: "plugin", title: view.provider.title } }));
  const kindless = roleViews("io.molis.work.kindless", "没有会话类型", "kindless_session").map((view): ActionView => ({ ...view, action: { ...view.action, subject_kinds: [] } }));
  const { service, caller, reached } = directory([{ plugin: PLUGIN, views: whole }, { plugin: "io.molis.work.short", views: short }, { plugin: "io.molis.work.agents", views: agentsOnly },
    { plugin: "io.molis.work.anonymous", views: anonymous }, { plugin: "io.molis.work.kindless", views: kindless }]);
  assert.deepEqual((await service.executors(caller)).map(offer => offer.plugin_id), [PLUGIN]);
  for (const name of ["short", "agents", "anonymous", "kindless"]) {
    await assert.rejects(service.send({ ...send(), executor: { kind: "plugin", plugin_id: `io.molis.work.${name}` } }, caller), (error: unknown) => (error as { code?: string }).code === "assistant.executor_unavailable", name);
    assert.equal(reached.get(`io.molis.work.${name}`), undefined, `${name}: none of its actions was called`);
  }
});

test("RAC-441 S-62 an executor whose actions are unavailable is shown with its reason and refused: none of its roles runs and no work is left", async () => {
  const views = roleViews(PLUGIN, "样例 Agent", KIND).map(view => view.capability_id.endsWith(".run.start")
    ? { ...view, availability: { available: false as const, code: "actions.not_granted", reason: "插件的授权已被撤回" } } : view);
  const { service, store, caller, reached } = directory([{ plugin: PLUGIN, views }]);
  const [offer] = await service.executors(caller);
  assert.equal(offer!.problem, "插件的授权已被撤回");
  assert.deepEqual(offer!.modes, []);
  await assert.rejects(service.send(send(), caller), (error: unknown) => (error as { code?: string; message?: string }).code === "assistant.executor_unavailable" && /插件的授权已被撤回/.test((error as Error).message));
  assert.equal(reached.get(PLUGIN)?.filter(role => role !== "state").length ?? 0, 0, "only the offer's read of state was made");
  assert.equal(store.list("web-user").length, 0, "no work was left behind");
});

test("RAC-442 S-62 a work whose executor is gone is refused and no other provider takes its place: no round is recorded and nobody else is called", async () => {
  const mine = roleViews(PLUGIN, "样例 Agent", KIND), other = roleViews("io.molis.work.other-agent", "另一个 Agent", "other_session");
  const { service, store, caller, reached } = directory([{ plugin: PLUGIN, views: mine }, { plugin: "io.molis.work.other-agent", views: other }]);
  const first = await service.send(send(), caller);
  const rounds = store.rounds(first.work.work_id).length, objects = store.relations.forWork({ work_id: first.work.work_id, project_id: "project" }).length;
  mine.length = 0;
  for (const attempt of [() => service.send({ work_id: first.work.work_id, text: "再来一轮", request_id: randomUUID() }, caller),
    () => service.handover(first.work.work_id, { to: { kind: "assistant" } }).then(() => service.handover(first.work.work_id, { to: choose }))]) {
    await assert.rejects(attempt(), (error: unknown) => (error as { code?: string }).code === "assistant.executor_unavailable");
  }
  assert.equal(reached.get("io.molis.work.other-agent"), undefined, "the other provider was never called");
  assert.equal(store.rounds(first.work.work_id).length, rounds, "no round was recorded for the refused ones");
  assert.equal(store.relations.forWork({ work_id: first.work.work_id, project_id: "project" }).length, objects, "no object was linked either");
});

test("RAC-443 S-62 the Assistant names no plugin: assistant-coding.ts is gone and no file of the Assistant spells Coding's id, its actions or its work kind", () => {
  const dir = join(process.cwd(), "apps/local-host/src/assistant");
  assert.equal(existsSync(join(dir, "assistant-coding.ts")), false);
  const found: string[] = [];
  for (const name of readdirSync(dir).filter(file => file.endsWith(".ts"))) {
    const text = readFileSync(join(dir, name), "utf8");
    for (const pattern of [/["'`]coding["'`]/, /\bcoding\.(state|sessions|runs|executor)/, /io\.molis\.work\.coding/, /CodingUnavailable|coding_unavailable|coding_session_id/]) {
      if (pattern.test(text)) found.push(`${name}: ${pattern}`);
    }
  }
  assert.deepEqual(found, []);
});

test("RAC-444 the Assistant store is at version 3 and refuses the store of version 2 it does not translate on read", () => {
  assert.equal(ASSISTANT_STORE_BASELINE.version, 3);
  const db = new DatabaseSync(":memory:");
  db.exec(ASSISTANT_STORE_BASELINE.schema); db.exec("PRAGMA user_version = 2");
  assert.throws(() => new AssistantStore(db), error => error instanceof SqliteSchemaVersionError && error.found === 2 && error.expected === 3);
  db.close();
});
