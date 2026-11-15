import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_DECIDE_PERMISSION, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, acceptanceActions, type AcceptanceReadResult, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";
import { reply } from "./fixtures/fixture-replies.js";
import { roundParts } from "./fixtures/round-parts.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

installHostUiText();

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

// specs/proactive-assistant §7.3.1 (PWA-144～146) on the Assistant's own tasks (user decision 2026-11-14: the requirements ride the
// Assistant's own delegation tools): what the result must satisfy is hung on the sub-task's own object when it is handed over; the
// sub-task records its delivered version and its checks as itself when it hands back; what counts as verified is the platform's
// finding, which is what the delegating work is told; rework names what it touched and the rest keeps its record.
test("PWA-144 PWA-145 PWA-146 S-assistant-delivery-own-object: a sub-task handed requirements carries them on its own object, reports its delivery as itself and nowhere else, and the delegating work is told the platform's findings, not the sub-task's word", { timeout: 120_000 }, async t => {
  // A real Host with one project in it (and no Goals): `system.acceptance` is the Host's own, and the Assistant reaches it as any Agent does.
  const home = await mkdtemp(join(tmpdir(), "molis-delegation-acceptance-"));
  const built = await backgroundRig(t, backgroundPlugin(() => ({ source: { surface: "example", title: "示例", icon: "list" }, tasks: [] })), ["A"]);
  const local = built.host, project = built.project("A");
  const requests: Array<{ child: boolean; tools: string[]; raw: string }> = [];
  const parentScript = [
    () => reply({ name: "delegate-work", input: { title: "定价页", brief: "起草「定价页」。", acceptance: "三档都在", requirements: [
      { statement: "有三档价格" }, { statement: "年付有折扣", expected: "年付八折" }, { statement: "文案由本人看过", requires_person: true }] } }),
    () => reply({ name: "delegate-work", input: { title: "页脚", brief: "起草「页脚」。", acceptance: "一行字" } }),
    () => reply(undefined, "已交给子任务，做完我再汇总。")];
  const first = { summary: "定价页第一版", checks: [
    { requirement_id: "r1", verdict: "supports", method: "读了页面", observed: "三档都在" },
    { requirement_id: "r2", verdict: "contradicts", method: "读了页面", observed: "没有写年付折扣" }] };
  const OTHER = { provider_id: "plugin.homebg", subject: { kind: "homebg_task", id: "j1" } };
  const pricingScript = [
    // Refused whole, nothing recorded: a report that names an object, and one that names a requirement that is not on the list.
    () => reply({ name: "report-delivery", input: { ...first, subject: OTHER } }),
    () => reply({ name: "report-delivery", input: { summary: "定价页第一版", checks: [{ requirement_id: "r9", verdict: "supports", method: "读了页面", observed: "都好" }] } }),
    () => reply({ name: "report-delivery", input: first }),
    () => reply(undefined, "交回：定价页第一版，年付折扣还没写。"),
    // The follow-up round: a second delivery that does not say what it touched is refused whole; then it says so.
    () => reply({ name: "report-delivery", input: { summary: "补上了年付折扣", checks: [{ requirement_id: "r2", verdict: "supports", method: "读了页面", observed: "年付八折写上了" }] } }),
    () => reply({ name: "report-delivery", input: { summary: "补上了年付折扣", touched: ["r2"], checks: [
      { requirement_id: "r2", verdict: "supports", method: "读了页面", observed: "年付八折写上了" }, { requirement_id: "r1", verdict: "supports", method: "读了页面", observed: "三档还在" }] } }),
    () => reply(undefined, "交回：补上了年付折扣。")];
  let parentStep = 0, pricingStep = 0;
  // The sub-tasks are held until the delegating round has ended, so each result comes back as the material of a round of its own.
  const released = Promise.withResolvers<void>();
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const raw = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(raw) as { messages: unknown; tools?: Array<{ name: string }> }, said = JSON.stringify(body.messages);
    const child = said.includes("委托的子任务");
    requests.push({ child, tools: (body.tools ?? []).map(tool => tool.name), raw });
    if (child) await Promise.race([released.promise, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
    if (child && said.includes("起草「页脚」")) return reply(undefined, "页脚：一行字。");
    if (child) return pricingStep < pricingScript.length ? pricingScript[pricingStep++]!() : reply(undefined, "没有别的了。");
    return parentStep < parentScript.length ? parentScript[parentStep++]!() : reply(undefined, "已核对子任务的结果。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.delegation-acceptance", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work), undefined, undefined, undefined, undefined, undefined, undefined, [], service.delivery(work)),
    projectTitle: async () => "项目" }, "web-user");
  t.after(async () => { released.resolve(); service.continuations.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });

  const sent = await service.send({ text: "把定价页和页脚分给子任务起草，做完汇总", request_id: "req-acceptance" }, { project_ref: project });
  const parentId = sent.work.work_id;
  await until(async () => { const view = await service.read(parentId); return view.work.state === "completed" && view.delegated?.length === 2; }, "the delegating round ended with both sub-tasks under way");
  released.resolve();
  const done = await until(async () => { const view = await service.read(parentId); return view.delegated?.length === 2 && view.delegated.every(child => child.state === "completed") && view.rounds.length >= 2 && view.work.state === "completed" && requests.some(request => !request.child && request.raw.includes("「定价页」：已完成")) ? view : undefined; }, "both sub-tasks handed back");
  const pricing = store.get("web-user", done.delegated!.find(child => child.title === "定价页")!.work_id), footer = store.get("web-user", done.delegated!.find(child => child.title === "页脚")!.work_id);

  // Handed over: the requirements are the sub-task's own object's, numbered by the Host, and its brief names them.
  assert.equal(pricing.delegated_by?.requirements, 3);
  assert.equal(footer.delegated_by?.requirements, undefined, "a sub-task handed none carries none");
  const brief = requests.find(request => request.child && request.raw.includes("起草「定价页」"))!;
  assert.match(brief.raw, /r1：有三档价格/);
  assert.match(brief.raw, /r2：年付有折扣（预期：年付八折）/);
  assert.match(brief.raw, /r3：文案由本人看过［要用户本人认可］/);
  // The report tool is the sub-task's that was handed requirements, and nobody else's.
  assert.ok(brief.tools.includes("report-delivery"));
  assert.ok(!requests.find(request => request.child && request.raw.includes("起草「页脚」"))!.tools.includes("report-delivery"), "a sub-task without requirements has no report tool");
  assert.ok(requests.filter(request => !request.child).every(request => !request.tools.includes("report-delivery")), "the delegating work has no report tool");

  // What the platform kept, read as the person: one delivered version made in the sub-task's own round, a check per reported item.
  const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_DECIDE_PERMISSION] };
  const subject = { provider_id: "io.molis.work.assistant.rules", subject: { kind: "assistant_work", id: pricing.work_id } };
  const asPerson = <T = AcceptanceView>(action: { capability_id: string; version: number }, input: unknown) => local.actionClient(project).invoke(person, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  const readOf = async (one: typeof subject) => (await asPerson<AcceptanceReadResult>(acceptanceActions.read, { subjects: [one] })).views[0]!;
  const read = () => readOf(subject);
  const afterFirst = await read();
  assert.equal(afterFirst.version, "v1");
  assert.equal(afterFirst.round, 1, "the two refused reports left no delivery behind");
  const told = requests.filter(request => request.child).map(request => request.raw);
  assert.ok(told.some(raw => raw.includes('The \\"report-delivery\\" tool does not accept: subject')), "a report that names an object is refused");
  assert.ok(told.some(raw => raw.includes("清单里没有「r9」这一项")), "a report of a requirement that is not on the list is refused");
  assert.deepEqual((await readOf(OTHER)).requirements, [], "nothing was written on the object the report named");
  assert.deepEqual(afterFirst.requirements.map(item => [item.id, item.statement, item.requires_person]), [["r1", "有三档价格", false], ["r2", "年付有折扣", false], ["r3", "文案由本人看过", true]]);
  // The sub-task's own word verifies nothing; what it reported as falling short reads as that; with no machine check every item waits for the person.
  assert.deepEqual(afterFirst.requirements.map(item => [item.id, item.verified, item.gap, item.person]), [["r1", false, "self_only", "pending"], ["r2", false, "contradicted", "pending"], ["r3", false, "evidence_missing", "pending"]]);
  assert.deepEqual(afterFirst.counts, { total: 3, verified: 0, needs_person: 3, accepted: 0, satisfied: 0 });
  assert.equal(afterFirst.complete, false, "a finished round completes nothing");

  // The delegating work's hand-back round is told the platform's record, item by item.
  const handBack = requests.filter(request => !request.child).map(request => request.raw).find(raw => raw.includes("「定价页」：已完成"));
  assert.ok(handBack, "the sub-task's result reached the delegating work: " + JSON.stringify(requests.filter(request => !request.child).map(request => roundParts(request.raw).data.slice(0, 600))));
  assert.match(handBack, /逐项要求（平台的记录，交付版本 v1）：核验通过 0\/3；等用户本人看的 3 项里已认可 0 项/);
  assert.match(handBack, /r1「有三档价格」：只有子任务自己的说法，没有可核对的证据/);
  assert.match(handBack, /r2「年付有折扣」：子任务自己报告没有达到/);
  assert.match(handBack, /r3「文案由本人看过」：子任务没有报告这一项/);
  // And so is its check tool.
  const delegation = service.delegation(store.get("web-user", parentId))!;
  const checked = (await delegation.status({ work_ids: [pricing.work_id] }))[0]!;
  assert.deepEqual(checked.requirements?.counts, afterFirst.counts);
  assert.deepEqual(checked.requirements?.items.map(item => [item.id, item.reported, item.verified, item.gap]), [["r1", true, false, "self_only"], ["r2", true, false, "contradicted"], ["r3", false, false, "evidence_missing"]]);
  assert.equal((await delegation.status({ work_ids: [footer.work_id] }))[0]!.requirements, undefined);

  // The person accepts r1 as it stands. Rework then touches r2 only: r1 keeps its record and the person's word; a second delivery
  // that does not say what it touched writes nothing.
  await asPerson(acceptanceActions.decide, { subject, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [] });
  await delegation.follow_up(pricing.work_id, "补上年付折扣");
  await until(async () => (await read()).version === "v2", "the second delivered version");
  await until(async () => (await service.read(pricing.work_id)).work.state === "completed", "the follow-up round ended");
  const afterSecond = await read();
  assert.equal(afterSecond.round, 2, "the refused report left no delivery behind");
  assert.deepEqual(afterSecond.changes, { summary: "补上了年付折扣", touched: ["r2"] });
  const [r1, r2] = afterSecond.requirements;
  assert.deepEqual([r1!.stands_on, r1!.carried, r1!.person, r1!.check?.checked_version], ["v1", true, "accepted", "v1"], "what was not touched keeps its version, its check and the person's acceptance");
  assert.deepEqual([r2!.stands_on, r2!.carried, r2!.check?.verdict, r2!.check?.checked_version, r2!.gap], ["v2", false, "supports", "v2", "self_only"]);
  assert.equal(r2!.history.filter(entry => entry.type === "check").length, 2, "the earlier finding stays in the record");
  const refused = requests.filter(request => request.child).map(request => request.raw).find(raw => raw.includes("这不是第一次交付"));
  assert.ok(refused, "the sub-task was told why its first report of the round wrote nothing");
});

// A personal work has no project record to hang requirements on: they become part of the brief, and the round is told so.
test("PWA-145 S-assistant-delivery-own-object: in a personal work the requirements are part of the brief and no report tool is offered", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-delegation-acceptance-personal-"));
  const local = new LocalHost({ homeDirectory: home, runtimeFactory: { open: () => ({}), close: () => {} } });
  const requests: Array<{ child: boolean; tools: string[]; raw: string }> = [];
  let step = 0;
  const script = [() => reply({ name: "delegate-work", input: { title: "清单", brief: "起草「清单」。", acceptance: "两条", requirements: [{ statement: "列出两件事" }] } }), () => reply(undefined, "已交给子任务。")];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const raw = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(raw) as { messages: unknown; tools?: Array<{ name: string }> }, child = JSON.stringify(body.messages).includes("委托的子任务");
    requests.push({ child, tools: (body.tools ?? []).map(tool => tool.name), raw });
    return child ? reply(undefined, "清单：两件事。") : step < script.length ? script[step++]!() : reply(undefined, "好了。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.delegation-acceptance-personal", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work), undefined, undefined, undefined, undefined, undefined, undefined, [], service.delivery(work)),
    projectTitle: async () => "项目" }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const sent = await service.send({ text: "把清单交给子任务", request_id: "req-personal" }, {});
  const view = await until(async () => { const now = await service.read(sent.work.work_id); return now.delegated?.length === 1 && now.delegated[0]!.state === "completed" ? now : undefined; }, "the sub-task handed back");
  const child = store.get("web-user", view.delegated![0]!.work_id);
  assert.equal(child.delegated_by?.requirements, undefined);
  const brief = requests.find(request => request.child)!;
  assert.match(brief.raw, /逐项要求：\\n- 列出两件事/);
  assert.ok(!brief.tools.includes("report-delivery"));
  assert.ok(requests.some(request => !request.child && request.raw.includes("这是个人工作，逐项要求没有单独记录")), "the delegating round is told the requirements went into the brief");
});
