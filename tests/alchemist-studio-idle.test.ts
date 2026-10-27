import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";
import { initializeBoard } from "./fixtures/goals-board.js";

// W4-09-04 (roadmap §4.11): an open studio drains its jobs four times a second; one nobody uses and with nothing to do is
// closed, and the next action opens it again. A job waiting or running, or an action still in flight, keeps it open.

const WORKER_MS = 250, IDLE_MS = 300;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("W4-09-04: an idle studio is closed and opened again by the next action; a running job or an action in flight keeps it open", { timeout: 60_000 }, async t => {
  // The studio's worker is the only interval of this period: count the live ones.
  const live = new Set<ReturnType<typeof setInterval>>();
  const [create, clear] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = ((handler: Parameters<typeof setInterval>[0], ms?: number, ...rest: unknown[]) => {
    const timer = create(handler, ms, ...rest); if (ms === WORKER_MS) live.add(timer); return timer; }) as typeof setInterval;
  globalThis.clearInterval = ((timer?: Parameters<typeof clearInterval>[0]) => { live.delete(timer as ReturnType<typeof setInterval>); clear(timer); }) as typeof clearInterval;
  t.after(() => { globalThis.setInterval = create; globalThis.clearInterval = clear; });
  const studioOpen = () => live.size > 0;
  const until = async (done: () => boolean, label: string) => {
    for (let n = 0; n < 200 && !done(); n++) await wait(25);
    assert.ok(done(), label);
  };

  const home = await mkdtemp(join(tmpdir(), "alchemist-studio-idle-"));
  const { ai } = controlledAlchemistAi();
  let held: PromiseWithResolvers<void> | null = null;
  const generate = ai.generate.bind(ai);
  ai.generate = async input => { if (held) await held.promise; return generate(input); };
  const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture", idleReclaimMs: IDLE_MS } });
  t.after(async () => { held?.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-a" });
  await initializeBoard(host, ref, { actor_id: "setup", idempotency_key: "init" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const bound = bindActionClient(host.actionClient(ref), () => caller);

  const { direction } = await bound.invoke(a.directionCreate, { description: "空闲的研究空间会被关掉，下一次操作再打开" });
  assert.ok(studioOpen(), "the first action opens the studio");
  await until(() => !studioOpen(), "a studio with nothing to do is closed once it has been idle");

  // Opened again by the next action, with what was written before.
  const read = await bound.invoke(a.directionContext, { subject_id: direction.id });
  assert.equal(read.subject.id, direction.id);
  assert.ok(studioOpen(), "the next action opens it again");

  // A job waiting on the model keeps it open well past the idle time.
  held = Promise.withResolvers<void>();
  const receipt = await bound.invoke(a.explorationStart, { id: direction.id });
  await wait(IDLE_MS * 4);
  assert.ok(studioOpen(), "a running job keeps the studio open");
  held.resolve(); held = null;
  for (let n = 0; n < 200; n++) {
    if ((await bound.invoke(a.explorationGet, { id: receipt.runId })).exploration.status === "completed") break;
    await wait(25);
  }
  await until(() => !studioOpen(), "closed again once the job is done and the studio is idle");

  // So does an action still waiting on the model.
  held = Promise.withResolvers<void>();
  const reply = bound.invoke(a.conversationSend, { body: "还在等模型的时候不关", context: { kind: "direction", label: direction.title, directionId: direction.id } });
  await until(studioOpen, "the action opens the studio");
  await wait(IDLE_MS * 4);
  assert.ok(studioOpen(), "an action in flight keeps the studio open");
  held.resolve(); held = null;
  await reply;
  await until(() => !studioOpen(), "closed once the action has returned and the studio is idle");
});

test("LOGIC-07 a request while an idle studio is closing does not open a second one", { timeout: 60_000 }, async t => {
  const live = new Set<ReturnType<typeof setInterval>>();
  const [create, clear] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = ((handler: Parameters<typeof setInterval>[0], ms?: number, ...rest: unknown[]) => {
    const timer = create(handler, ms, ...rest); if (ms === WORKER_MS) live.add(timer); return timer; }) as typeof setInterval;
  globalThis.clearInterval = ((timer?: Parameters<typeof clearInterval>[0]) => { live.delete(timer as ReturnType<typeof setInterval>); clear(timer); }) as typeof clearInterval;
  t.after(() => { globalThis.setInterval = create; globalThis.clearInterval = clear; });
  const until = async (done: () => boolean, label: string) => {
    for (let n = 0; n < 200 && !done(); n++) await wait(25);
    assert.ok(done(), label);
  };
  const home = await mkdtemp(join(tmpdir(), "alchemist-studio-closing-"));
  const { ai } = controlledAlchemistAi();
  let release: (() => void) | undefined, hung = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture", idleReclaimMs: 40, wrapStudio(runtime) {
    if (hung) return;
    hung = true;
    const close = runtime.close.bind(runtime);
    runtime.close = () => new Promise((resolve, reject) => { release = () => { void close().then(resolve, reject); }; });
  } } });
  t.after(async () => { release?.(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-a" });
  await initializeBoard(host, ref, { actor_id: "setup", idempotency_key: "init" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const bound = bindActionClient(host.actionClient(ref), () => caller);
  const { direction } = await bound.invoke(a.directionCreate, { description: "关掉的过程中不能再开一个" });
  assert.equal(live.size, 1);
  await until(() => release !== undefined, "idle reclaim started closing the studio");
  await assert.rejects(bound.invoke(a.directionContext, { subject_id: direction.id }), (error: { code?: string }) => error.code === "alchemist.closing");
  assert.equal(live.size, 1, "the closing studio is still the only one");
  const finish = release!;
  release = undefined;
  finish();
  await until(() => live.size === 0, "the studio leaves the process table after close finishes");
  const read = await bound.invoke(a.directionContext, { subject_id: direction.id });
  assert.equal(read.subject.id, direction.id);
  assert.equal(live.size, 1, "the next action opens it again");
});

test("W5-01-ALC-LIFE-07: idle close failure is observed and retains the only studio for explicit retry", { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-idle-failure-"));
  const { ai } = controlledAlchemistAi();
  const failed = Promise.withResolvers<void>();
  let attempts = 0, opened = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, idleReclaimMs: 100,
    wrapStudio(studio) {
      opened++;
      const close = studio.close.bind(studio);
      studio.close = async () => { if (++attempts === 1) { failed.resolve(); throw new Error("idle close failed once"); } await close(); };
    },
  } });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-a" });
  await initializeBoard(host, ref, { actor_id: "setup", idempotency_key: "init" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const bound = bindActionClient(host.actionClient(ref), () => caller);
  await bound.invoke(a.bootstrap, {});
  await failed.promise;
  await assert.rejects(bound.invoke(a.bootstrap, {}), { code: "alchemist.closing" });
  assert.equal(opened, 1);
  await host.close();
  assert.ok(attempts >= 2, "explicit close retries the retained resource");
});
