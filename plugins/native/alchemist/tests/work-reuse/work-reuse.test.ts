import { afterEach, describe, expect, it } from "vitest";
import { alchemistActions as a } from "../../src/studio/shared/contracts/actions.js";
import { fixture } from "./fixture.js";
let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => { await f?.close(); });
async function firstRound() {
  f = await fixture(); const { plan } = await f.plan(); const first = await f.run(plan.id);
  const report = first.workspace.lenses.market_space.report!;
  const { reference } = await f.call(a.reusePublish,{reportId:report.id});
  const method = await f.confirmMethod(report.id, report.summary);
  return { reference, method, report };
}
describe("cross-task work reuse through original Alchemist owners", { timeout: 30000 }, () => {
  it("runs three research/proposal rounds with fixed versions, edits, restart, real Artifact and Ledger persistence", async () => {
    const {reference,method,report}=await firstRound();
    expect((await f.call(a.memoryGet,{})).playbook[0]!.applications).toEqual([]);
    expect(await f.call(a.reusePublish,{reportId:report.id})).toEqual({reference});
    const candidates=await f.call(a.reuseCandidates,{intent:"第二轮研究",directionId:f.direction.id});
    expect(candidates.artifacts[0]!.warnings.join(" ")).toContain("30 天");
    expect(candidates.artifacts[0]!.excerpt).toBe(report.summary);
    expect(candidates.methods[0]!.negativeExamples).toEqual(["仅有推广软文"]);
    const {plan:second}=await f.plan({artifacts:[{reference,reason:"沿用研究结构，重新核对价格与访谈"}],methodIds:[method.id]},"market_space",f.ideas[1]);
    expect(second.key.ideaId).not.toBe(f.idea.id);
    expect((await f.call(a.reuseReceipt,{planId:second.id})).receipt).toBeNull();
    await f.restart();const round2=await f.run(second.id,"market_space",f.ideas[1]);
    expect(round2.workspace.lenses.market_space.status).toBe("completed");
    const prompt=JSON.parse(f.requests.find(r=>r.operationId===second.id+":cross_checking")!.userPrompt);
    expect(prompt.confirmedResearchPlaybook[0]).toMatchObject({version:1,methodChange:"先看用户原话，保留反证",negativeExamples:["仅有推广软文"]});
    expect(prompt.historicalBackground[0].reference).toEqual(reference);
    expect(prompt.historicalBackground[0].text).toContain(report.summary);
    const receipt=(await f.call(a.reuseReceipt,{planId:second.id})).receipt!;
    expect(receipt).toMatchObject({runId:round2.run.id,relationState:"recorded",methods:[{version:1}]});
    expect(f.ledger.query.list(f.access)).toHaveLength(1);
    await f.call(a.reuseFeedback,{planId:second.id,explanation:"只补充本轮价格变化",preparation:"沿用来源框架，仍需新的访谈",corrections:"未证明付费意愿",result:"形成可编辑提案；不声称节省比例"});
    const {reference:ref2}=await f.call(a.reusePublish,{reportId:round2.workspace.lenses.market_space.report!.id});
    const {rule:revised}=await f.call(a.playbookRevise,{id:method.id,expectedVersion:1,methodChange:"分别核对使用意愿与付费意愿",positiveExamples:["第二轮独立访谈"],negativeExamples:["把使用量当付费证据"]});
    expect(revised.version).toBe(2);
    const {plan:third}=await f.plan({artifacts:[{reference:ref2,reason:"沿用第二轮未知与反证，新增付费访谈"}],methodIds:[method.id]});
    const round3=await f.run(third.id);expect(round3.workspace.lenses.market_space.status).toBe("completed");
    const {plan:cost}=await f.plan({artifacts:[],methodIds:[]},"build_cost");await f.run(cost.id,"build_cost");
    const decision=await f.call(a.decisionCreate,{id:f.idea.id,version:1,outcome:"hold",reason:"三次研究均未得到付费证据，先做新的访谈",revisitCondition:"获得独立付费意愿证据"});
    expect(decision.decision.reportBindings).toHaveLength(2);
    expect((await f.call(a.reuseReceipt,{planId:third.id})).receipt!.methods[0]!.version).toBe(2);
    expect((await f.call(a.reuseReceipt,{planId:second.id})).receipt!.methods[0]!.version).toBe(1);
    expect(f.ledger.query.list(f.access)).toHaveLength(2);
    await f.restart();expect((await f.call(a.reuseReceipt,{planId:second.id})).receipt!.feedback!.explanation).toContain("价格变化");
  });
  it("rejects inappropriate/changed/disabled methods without spending model calls",async()=>{
    const {method}=await firstRound();
    await expect(f.plan({artifacts:[],methodIds:[method.id]},"build_cost")).rejects.toMatchObject({code:"REUSE_METHOD_NOT_APPLICABLE"});
    const {plan}=await f.plan();const before=f.requests.length;
    await f.call(a.playbookRevise,{id:method.id,expectedVersion:1,methodChange:"新方法",positiveExamples:[],negativeExamples:[]});
    await expect(f.call(a.playbookRevise,{id:method.id,expectedVersion:1,methodChange:"覆盖",positiveExamples:[],negativeExamples:[]})).rejects.toMatchObject({code:"REUSE_METHOD_CHANGED"});
    await expect(f.run(plan.id)).rejects.toMatchObject({code:"REUSE_METHOD_CHANGED"});expect(f.requests.length).toBe(before);
    await f.call(a.playbookDisable,{id:method.id});expect((await f.call(a.reuseCandidates,{intent:"下一次",directionId:f.direction.id})).methods).toHaveLength(0);
  });
  it("checks withdrawal and permission both before and after model waits, never creating false consumption",async()=>{
    const {reference,method}=await firstRound();
    const reuse={artifacts:[{reference,reason:"背景"}],methodIds:[method.id]};
    const {plan}=await f.plan(reuse);f.afterGenerate(()=>f.deny());
    const result=await f.run(plan.id);expect(result.workspace.lenses.market_space.run!.errorCode).toBe("REUSE_SOURCE_UNAVAILABLE");
    expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt).toBeNull();
    f.afterGenerate();f.deny(false);
    f.artifacts.commands.archiveVersion({board_id:"board-test",actor_id:"actor-local",...reference});
    await expect(f.plan(reuse)).rejects.toMatchObject({code:"REUSE_SOURCE_WITHDRAWN"});
    expect((await f.call(a.reuseCandidates,{intent:"再开始",directionId:f.direction.id})).artifacts).toHaveLength(0);
  });
  it("does not record malformed AI output; recovers relation writes without another AI invocation",async()=>{
    const {reference,method}=await firstRound();
    const input={intent:"复用",directionId:f.direction.id,references:[reference],methodIds:[method.id]};
    f.bad();await expect(f.call(a.reuseAssess,input)).rejects.toThrow("AI_OUTPUT_INVALID");f.bad(false);
    expect((await f.call(a.reuseAssess,input)).recommendations).toHaveLength(2);
    const {plan}=await f.plan({artifacts:[{reference,reason:"背景"}],methodIds:[method.id]});
    f.linkFailure();await f.run(plan.id);
    expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt!.relationState).toBe("pending");
    const count=f.requests.length;await f.restart();f.linkFailure(false);
    await f.call(a.reuseReconcile,{planId:plan.id});await f.call(a.reuseReconcile,{planId:plan.id});
    expect(f.requests.length).toBe(count);expect(f.ledger.query.list(f.access)).toHaveLength(1);
    const outsider=f.runtime.actionsFor("other-actor");expect((await outsider.invoke(a.reuseReceipt,{planId:plan.id})).receipt).toBeNull();
  });
  it("rechecks method-only authority and rejects a late summary after write permission is revoked",async()=>{
    const {method}=await firstRound();
    const {plan}=await f.plan({artifacts:[],methodIds:[method.id]});
    f.afterGenerate(()=>{if(f.requests.at(-1)!.operationId.endsWith(':synthesizing'))f.allowWrite(false)});
    const result=await f.run(plan.id);
    expect(result.workspace.lenses.market_space.run!.errorCode).toBe('REUSE_ACCESS_DENIED');
    expect(result.workspace.lenses.market_space.report!.runId).not.toBe(result.run.id);
    // The cross-check did happen; an honest receipt remains, while the final report failed.
    expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt!.runId).toBe(result.run.id);
    await expect(f.call(a.reuseAssess,{intent:'复核',directionId:f.direction.id,references:[],methodIds:[method.id]})).rejects.toMatchObject({code:'REUSE_ACCESS_DENIED'});
  });
  it("resumes pending method confirmation and refuses duplicate run dispatch",async()=>{
    const {report,method}=await firstRound();
    const context=await f.call(a.playbookContext,{subject_id:method.id});expect(context.content).toContain('仅有推广软文');expect(context.revision).toBe('1:active');
    const {annotation}=await f.call(a.annotationCreate,{target:{kind:'lens_report',objectId:report.id,revision:1,blockId:'summary'},quotedSnapshot:report.summary,comment:'增加反证查找'});
    const {proposal}=await f.call(a.playbookPropose,{id:annotation.id,methodChange:'主动找反证',positiveExamples:['需求研究'],negativeExamples:['宣传稿'],scopeKind:'direction'});
    await f.restart();expect((await f.call(a.proposalList,{})).proposals[0]!.id).toBe(proposal.id);
    await f.call(a.proposalReject,{id:proposal.id});expect((await f.call(a.proposalList,{})).proposals).toHaveLength(0);
    const {plan}=await f.plan();
    const calls=await Promise.allSettled([f.call(a.researchStart,{id:f.idea.id,lens:'market_space',planId:plan.id}),f.call(a.researchStart,{id:f.idea.id,lens:'market_space',planId:plan.id})]);
    expect(calls.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it("bounds format correction to one Prologue call and the original plan budget",async()=>{
    f=await fixture();f.transformOutput((input,text)=>input.operationId.endsWith(':cross_checking')?'invalid JSON':text);
    const {plan:limited}=await f.plan();await f.run(limited.id);
    expect(f.requests.some(r=>r.operationId.endsWith(':format_correction'))).toBe(false);
    expect((await f.call(a.reuseReceipt,{planId:limited.id})).receipt).toBeNull();
    const {plan}=await f.plan(undefined,'market_space',f.idea,4);const result=await f.run(plan.id);
    expect(result.workspace.lenses.market_space.status).toBe('completed');
    const correction=f.requests.filter(r=>r.operationId===plan.id+':cross_checking:format_correction');expect(correction).toHaveLength(1);
    expect(Object.keys(JSON.parse(correction[0]!.userPrompt)).sort()).toEqual(['invalidOutput','schema']);
    const events=await f.call(a.runEvents,{id:result.run.jobId});
    expect(events.events.filter(e=>e.type==='call_started').map(e=>e.payload.callsUsed)).toEqual([1,2,3,4]);
    f.transformOutput((input,text)=>input.operationId.includes(':cross_checking')?'still invalid':text);
    const {plan:bad}=await f.plan(undefined,'market_space',f.idea,4);await f.run(bad.id);
    expect(f.requests.filter(r=>r.operationId.startsWith(bad.id))).toHaveLength(2);
    expect((await f.call(a.reuseReceipt,{planId:bad.id})).receipt).toBeNull();
  });
  it("rechecks revocation before correction for a restored legacy plan without a reuse snapshot",async()=>{
    f=await fixture();f.transformOutput((input,text)=>input.operationId.endsWith(':cross_checking')?'invalid JSON':text);
    f.afterGenerate(()=>f.allowWrite(false));
    const {plan}=await f.plan(undefined,'market_space',f.idea,4);
    f.runtime.database.prepare('UPDATE research_plans SET reuse_json = NULL WHERE id = ?').run(plan.id);await f.restart();
    const result=await f.run(plan.id);
    expect(result.workspace.lenses.market_space.run!.errorCode).toBe('REUSE_ACCESS_DENIED');
    expect(f.requests.filter(r=>r.operationId.startsWith(plan.id))).toHaveLength(1);
    expect((await f.call(a.reuseReceipt,{planId:plan.id})).receipt).toBeNull();
  });

});
