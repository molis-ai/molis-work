/**
 * The scenes. Each drives the real SDK the way the two layouts would (the person steers, withdraws, stops, queues,
 * answers a question; the model reads, acknowledges, or never gets to), and keeps what the SDK reported.
 */
import type { Flavor, Said } from "./record-content.mts";
import { calls, gate, partial, recordRun, says, startRun, type Lab, type RawRun, type RunHandle, type SdkSession } from "./record-lab.mts";
import type { Checkpoint, Projection, QueueView, RecordedRun, Scene } from "./facts.ts";

type Dict = Record<string, unknown>;
const toolItem = (id: string | undefined, said: Said): Dict => ({ input: id, ...said.ack });
const ackCall = (id: string, items: readonly Dict[]) => ({ id, name: "acknowledge-inputs", args: { items } });
const hasText = (handle: RunHandle, count: number, text: string): boolean =>
  handle.events.filter(event => event.type === "text-delta" && event["text"] === text).length >= count;
const promptId = (run: RecordedRun, text: string): string => {
  const found = run.events.find(event => event.type === "prompt" && event["text"] === text);
  const id = found?.["steerId"];
  if (typeof id !== "string") throw new Error(`no recorded input "${text}"`);
  return id;
};
const snapshot = async (session: SdkSession): Promise<QueueView> => JSON.parse(JSON.stringify(await session.inputQueue())) as QueueView;

/** Keeps the SDK's projection only at the prefixes where its answer changed. */
export function compress(run: RawRun): RecordedRun {
  const kept: Projection[] = [];
  let last = "";
  run.projections.forEach((receipts, index) => {
    const now = JSON.stringify(receipts);
    if (now !== last) kept.push({ at: index + 1, receipts: receipts as never });
    last = now;
  });
  return { label: run.label, events: run.events as never, projections: kept };
}
const record = (lab: Lab, label: string, handle: RunHandle): RecordedRun => compress(recordRun(lab, label, handle));

/**
 * main: a run in which the person talks while the model works — one input withdrawn before it was read, three read
 * and acknowledged, one app notice, three more of which two are acknowledged and one is read and never explained —
 * then a second run in which the person insists on the input the model did not adopt.
 */
export async function mainScene(lab: Lab, f: Flavor): Promise<Scene> {
  const session = await lab.newSession();
  const g1 = gate();
  const g2 = gate();
  lab.script(({ n, ids }) => {
    if (n === 0) return { partial: partial(f.working[0]), until: g1.promise };
    if (n === 1) return calls(ackCall("ack-1", [toolItem(ids[0], f.constraint), toolItem(ids[1], f.newTask), toolItem(ids[2], f.notAdopted)]));
    if (n === 2) return { partial: partial(f.working[1]), until: g2.promise };
    if (n === 3) return calls(ackCall("ack-2", [toolItem(ids[4], f.later), toolItem(ids[6], f.clarify)]));
    return says(f.final);
  });
  lab.at(60);
  const one = await startRun(lab, session, `rec-${f.id}-main-1`, f.task);
  await one.waitFor("first reply", () => hasText(one, 1, f.working[0]));
  lab.at(130);
  const dropped = await one.control.steer({ text: f.withdrawn, key: "in-0" });
  lab.at(131);
  await one.control.withdrawSteer(dropped.steerId);
  let seconds = 150;
  for (const [key, said] of [["in-1", f.constraint], ["in-2", f.newTask], ["in-3", f.notAdopted]] as const) {
    lab.at(seconds); seconds += 15;
    await one.control.steer({ text: said.text, key });
  }
  lab.at(seconds);
  await one.control.steer({ text: f.host, source: "app", key: "host-1" });
  g1.open();
  await one.waitFor("second reply", () => hasText(one, 1, f.working[1]));
  lab.at(260);
  await one.control.steer({ text: f.later.text, key: "in-4" });
  lab.at(272);
  await one.control.steer({ text: f.unacknowledged, key: "in-5" });
  lab.at(285);
  await one.control.steer({ text: f.clarify.text, key: "in-6" });
  g2.open();
  await one.ended;
  const first = record(lab, "第一轮", one);

  // Second run: the person insists on the one the model did not adopt; the correction names it (`about`).
  const g3 = gate();
  lab.script(({ n, ids }) => {
    if (n === 0) return { partial: partial("好的，继续写。"), until: g3.promise };
    if (n === 1) return calls(ackCall("ack-3", [toolItem(ids[0], f.correction)]));
    return says(f.final);
  });
  lab.at(420);
  const two = await startRun(lab, session, `rec-${f.id}-main-2`, f.followUp, { history: "session" });
  await two.waitFor("second run reply", () => hasText(two, 1, "好的，继续写。"));
  lab.at(432);
  await two.control.steer({ text: f.correction.text, key: "fix-1", about: promptId(first, f.notAdopted.text) });
  g3.open();
  await two.ended;
  const second = record(lab, "第二轮", two);
  const cps: Checkpoint[] = [
    { id: "settled", label: "第一轮结束", run: 0, at: first.events.length },
    { id: "corrected", label: "你坚持采纳之后", run: 1, at: second.events.length },
  ];
  return { id: "main", label: "运行中补充、说明与第一轮的结论", runs: [first, second], checkpoints: cps };
}

/** stopped: a run ends with two inputs the model never read, the app queues a third on its own; then carry or withdraw. */
export async function stoppedScene(lab: Lab, f: Flavor, branch: "carry" | "withdraw"): Promise<Scene> {
  const session = await lab.newSession();
  const g1 = gate();
  lab.script(({ n }) => {
    if (n === 0) return { partial: partial("我先看一下。"), until: g1.promise };
    return { partial: partial("正在处理第一条……"), until: new Promise<void>(() => undefined) };
  });
  lab.at(600);
  const one = await startRun(lab, session, `rec-${f.id}-stopped-${branch}-1`, f.stopped.task);
  await one.waitFor("first reply", () => hasText(one, 1, "我先看一下。"));
  lab.at(640);
  await one.control.steer({ text: f.stopped.first, key: "q-1" });
  g1.open();
  await one.waitFor("second reply", () => hasText(one, 1, "正在处理第一条……"));
  lab.at(655);
  await one.control.steer({ text: f.stopped.second, key: "q-2" });
  lab.at(670);
  one.control.stop("cancelled");
  await one.ended;
  lab.at(700);
  await session.queueInput({ text: f.stopped.direct, key: "q-3" });
  const first = record(lab, "被停下的一轮", one);
  const stopped = await snapshot(session);
  const cps: Checkpoint[] = [{ id: "stopped", label: "停下之后", run: 0, at: first.events.length, queue: stopped }];
  const runs: RecordedRun[] = [first];
  if (branch === "carry") {
    lab.script(({ n, ids }) => (n === 0
      ? calls(ackCall("ack-q", [
        toolItem(ids[0], { text: "", ack: { treatment: "apply-now", kind: "supplement", impacts: ["scope"], note: "按你补充的先检查邮箱格式" } }),
        toolItem(ids[1], { text: "", ack: { treatment: "later-step", kind: "request", impacts: ["acceptance"], note: "排在当前这一步之后" } }),
        toolItem(ids[2], { text: "", ack: { treatment: "noted", kind: "request", impacts: [], note: "收尾时列出来" } })]))
      : says(f.stopped.final)));
    lab.at(760);
    const two = await startRun(lab, session, `rec-${f.id}-stopped-carry-2`, f.stopped.next, { history: "session", queued: "carry" });
    await two.ended;
    const second = record(lab, "带上排着的输入", two);
    runs.push(second);
    cps.push({ id: "carried", label: "带到下一轮之后", run: 1, at: second.events.length, queue: await snapshot(session) });
  } else {
    lab.at(760);
    for (const item of stopped.queued) await session.withdrawQueuedInput(item.inputId);
    cps.push({ id: "withdrawn", label: "全部撤回之后", run: 0, at: first.events.length, queue: await snapshot(session) });
  }
  return { id: `stopped-${branch}`, label: "一轮被停下，留下没读到的输入", runs, checkpoints: cps };
}

/** question: the model asks and waits; the person adds something to the run meanwhile (the chip's "补充这一轮"), then answers. */
export async function questionScene(lab: Lab, f: Flavor): Promise<Scene> {
  const session = await lab.newSession();
  lab.script(({ n, ids }) => {
    if (n === 0) return calls({ id: "ask-1", name: "ask-user", args: { why: f.question.why, questions: [{ prompt: f.question.prompt, options: f.question.options.map(label => ({ label })) }] } });
    if (n === 1) return calls(ackCall("ack-s", [toolItem(ids[0], f.question.supplement)]));
    return says(f.question.final);
  });
  lab.at(900);
  const one = await startRun(lab, session, `rec-${f.id}-question-1`, f.question.task, {}, ["ask-user", "acknowledge-inputs"]);
  await one.waitFor("question", all => all.some(event => event.type === "awaiting-input"));
  const asked = one.events.length;
  lab.at(930);
  await one.control.steer({ text: f.question.supplement.text, key: "side-1" });
  const waiting = one.events.length;
  const pending = one.events.find(event => event.type === "awaiting-input");
  lab.at(960);
  await lab.runtime.effects.pendings.answer(pending?.["pendingRef"], { kind: "questionnaire", answers: [{ question: 0, indexes: [0] }] }, await lab.runtime.readClock());
  await one.ended;
  const run = record(lab, "等回答的一轮", one);
  // The recording kept the ledger up to `waiting` events as the waiting point; the projections are looked up by prefix.
  return { id: "question", label: "有问题等回答时的补充", runs: [run], checkpoints: [
    { id: "asked", label: "问题在等你回答", run: 0, at: asked, awaiting: true },
    { id: "waiting", label: "你补充了一句，问题还在等", run: 0, at: waiting, awaiting: true },
    { id: "answered", label: "回答之后", run: 0, at: run.events.length },
  ] };
}
