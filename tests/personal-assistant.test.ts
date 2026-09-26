import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistantFixture, assistantCaller as caller } from "./personal-assistant-fixture.js";

test("two source contexts correlate project evidence, confirm original action and persist editable result", async () => {
  const f = assistantFixture(); try {
    const assessment = await f.service.evaluate(caller, f.input);
    assert.equal(assessment.outcome, "suggested", assessment.message); assert.equal(f.writes, 0);
    assert.equal(f.captured!.materials.length, 3); assert.deepEqual(f.captured!.materials.map(m => m.source?.name ?? "project"), ["公开 RSS", "公开视频", "project"]);
    const suggestion = assessment.suggestions[0]!;
    const completed = await f.service.execute(caller, suggestion.id, suggestion.revision);
    assert.equal(completed.status, "completed"); assert.equal(f.writes, 1);
    assert.match(String(f.db.prepare("SELECT body FROM drafts").get()!.body), /新增 CSV/);
    f.db.prepare("UPDATE drafts SET body = ?").run("用户继续编辑的成果");
    assert.equal(f.db.prepare("SELECT body FROM drafts").get()!.body, "用户继续编辑的成果");
    await assert.rejects(f.service.execute(caller, suggestion.id, suggestion.revision)); assert.equal(f.writes, 1);
  } finally { f.close(); }
});

test("dismissal survives disk reopen, suppresses same event, never creates permanent preferences", async () => {
  const home = mkdtempSync(join(tmpdir(), "assistant-persist-")), path = join(home, "state.sqlite");
  let f = assistantFixture(path); try {
    const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!;
    f.service.feedback(caller, row.id, row.revision, "dismiss");
    f.close(); f = assistantFixture(path);
    assert.equal((await f.service.evaluate(caller, f.input)).outcome, "nothing_to_do"); assert.equal(f.generationCount, 0);
    assert.equal((await f.service.state(caller)).suggestions.length, 0); assert.deepEqual(f.store.preferences().disabled_categories, []);
    f.context.get("rss")!.revision = "rss-2";
    assert.equal((await f.service.evaluate(caller, f.input)).outcome, "suggested");
  } finally { f.close(); rmSync(home, { recursive: true, force: true }); }
});

test("snooze and visible preferences persist; stale preference updates cannot overwrite", async () => {
  const f = assistantFixture(); try {
    const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!;
    f.service.feedback(caller, row.id, row.revision, "snooze", "2026-09-26T06:00:00Z");
    assert.equal((await f.make().state(caller)).suggestions.length, 0);
    f.advance(3600001); assert.equal((await f.make().state(caller)).suggestions.length, 1);
    let pref = f.service.preferences(caller, 0, { ...f.store.preferences(), disabled_categories: ["requirement_change"], instructions: "先给证据" });
    assert.equal((await f.service.state(caller)).suggestions.length, 0);
    assert.throws(() => f.service.preferences(caller, 0, { ...pref, enabled: false }));
    pref = f.service.preferences(caller, pref.revision, { ...pref, disabled_categories: [] });
    assert.equal(pref.instructions, "先给证据"); assert.equal((await f.service.state(caller)).suggestions.length, 1);
    f.service.preferences(caller, pref.revision, { ...pref, quiet_until: "2026-09-26T08:00:00Z" });
    assert.equal((await f.service.evaluate(caller, f.input)).outcome, "quiet");
  } finally { f.close(); }
});

test("concurrent confirmations claim once; lost response recovers saved result without replay", async () => {
  const f = assistantFixture(); try {
    const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!; f.loseResponse();
    const outcomes = await Promise.allSettled([f.service.execute(caller, row.id, row.revision), f.make().execute(caller, row.id, row.revision)]);
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.writes, 1);
    assert.equal(f.store.get(row.id).status, "needs_check");
    assert.equal((await f.make().recover(caller, row.id)).status, "completed"); assert.equal(f.writes, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM drafts").get()!.n, 1);
  } finally { f.close(); }
});

test("source revocation and stale material block model consumption and confirmed effects", async () => {
  const f = assistantFixture(); try {
    const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!;
    f.disconnect(); await assert.rejects(f.service.execute(caller, row.id, row.revision)); assert.equal(f.writes, 0);
    assert.equal((await f.service.evaluate(caller, f.input)).outcome, "needs_review"); assert.equal(f.generationCount, 1);
    assert.equal((await f.service.state(caller)).suggestions.length, 0);
  } finally { f.close(); }
  const g = assistantFixture(); try {
    const row = (await g.service.evaluate(caller, g.input)).suggestions[0]!;
    g.context.get("goal")!.content += " 当前暂停发布。";
    await assert.rejects(g.service.execute(caller, row.id, row.revision), { code: "assistant.stale" }); assert.equal(g.writes, 0);
  } finally { g.close(); }
});

test("invalid evidence, unrelated material, unavailable model and revocation during inference remain manual", async () => {
  for (const mode of ["invalid", "unrelated", "timeout", "revoked"]) {
    const f = assistantFixture(); try {
      f.setAnalysis(async () => { if (mode === "timeout") throw new Error("timeout"); if (mode === "revoked") f.disconnect();
        return { runtime: "prologue", character_title: "Molis", text: JSON.stringify(mode === "unrelated" ? { outcome: "nothing_to_do" } : { outcome: "suggested", category: "risk", offer_key: "A1", title: "bad", reason: "bad", evidence: [{ material_key: "S1", quote: "不存在的引文" }, { material_key: "S3", quote: "项目" }] }) }; });
      assert.equal((await f.service.evaluate(caller, f.input)).outcome, mode === "unrelated" ? "nothing_to_do" : "needs_review"); assert.equal(f.store.list().length, 0); assert.equal(f.writes, 0);
    } finally { f.close(); }
  }
});

test("caller scope, permissions, expiry and changed preferences reject unauthorized execution", async () => {
  const f = assistantFixture(); try {
    await assert.rejects(f.service.state({ ...caller, actor_id: "other" }), { code: "assistant.scope" });
    await assert.rejects(f.service.evaluate({ ...caller, permissions: ["home:read", "home:write"] }, f.input), { code: "assistant.forbidden" });
    const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!;
    const result = await f.service.execute({ ...caller, permissions: caller.permissions.filter(p => p !== "draft:write") }, row.id, row.revision);
    assert.equal(result.status, "needs_check"); assert.equal(f.writes, 0);
  } finally { f.close(); }
  const g = assistantFixture(); try {
    const row = (await g.service.evaluate(caller, g.input)).suggestions[0]!; g.advance(86400001);
    await assert.rejects(g.service.execute(caller, row.id, row.revision)); assert.equal((await g.service.state(caller)).history[0]!.status, "expired");
  } finally { g.close(); }
});

test("revoked history contains no source body, prepared parameters or private result", async () => {
  const f=assistantFixture();try {
    const row=(await f.service.evaluate(caller,f.input)).suggestions[0]!;
    f.service.feedback(caller,row.id,row.revision,"dismiss");
    const state=await f.service.state({...caller,permissions:["home:read"]});
    const wire=JSON.stringify(state);
    assert.equal(state.history[0]!.title,"来源已不可访问");assert.ok(!wire.includes("CSV"));assert.ok(!wire.includes("evidence"));assert.ok(!wire.includes("materials"));assert.ok(!wire.includes("offer"));
  }finally{f.close();}
});

test("recovery accepts updated source revision; dispatch revalidates source and preference", async () => {
  const f=assistantFixture();try {
    const row=(await f.service.evaluate(caller,f.input)).suggestions[0]!;f.loseResponse();await f.service.execute(caller,row.id,row.revision);
    f.context.get("goal")!.revision="after-save";
    assert.equal((await f.service.recover(caller,row.id)).status,"completed");assert.equal(f.writes,1);
  }finally{f.close();}
  for(const mode of ["source","preferences"]){
    const g=assistantFixture();try {
      const row=(await g.service.evaluate(caller,g.input)).suggestions[0]!;
      const context={...caller,validate_authority:async(ref:{capability_id:string})=>{if(ref.capability_id!=="fixture.draft.save")return;
        if(mode==="source")g.disconnect();else g.service.preferences(caller,0,{...g.store.preferences(),enabled:false});}};
      assert.equal((await g.service.execute(context,row.id,row.revision)).status,"needs_check");assert.equal(g.writes,0);
    }finally{g.close();}
  }
});

test("no-op checks suppress repeated inference; unrelated arrival cannot resurface dismissed evidence", async () => {
  const f=assistantFixture();try {
    f.setAnalysis(async()=>({runtime:"prologue",character_title:"Molis",text:JSON.stringify({outcome:"nothing_to_do"})}));
    await f.service.evaluate(caller,f.input);await f.service.evaluate(caller,f.input);assert.equal(f.generationCount,1);
  }finally{f.close();}
  const g=assistantFixture();try {
    g.setAnalysis(async input=>({runtime:"prologue",character_title:"Molis",text:JSON.stringify({outcome:"suggested",category:"requirement_change",title:"CSV变更",reason:"原计划缺少新需求",offer_key:input.offers[0]!.key,
      evidence:input.materials.filter(m=>m.context.subject.id!=="youtube").map(m=>({material_key:m.key,quote:m.context.content}))})}));
    const row=(await g.service.evaluate(caller,g.input)).suggestions[0]!;g.service.feedback(caller,row.id,row.revision,"dismiss");
    g.context.get("youtube")!.revision="new unrelated video";
    assert.equal((await g.service.evaluate(caller,g.input)).outcome,"nothing_to_do");assert.equal(g.store.list().length,1);
  }finally{g.close();}
});

test("arrival consumer reads shared Home events and original reuse subjects; method withdrawal invalidates suggestion", async () => {
  const f=assistantFixture();try {
    f.context.set("method",{title:"先保留原稿的方法",content:"适用：需求变更。做法：先保存修改草稿再核对。反例：不要直接覆盖已发布正文。",revision:"2:active",kind:"alchemist-playbook"});
    f.ports.reuseSubjects=async()=>[{kind:"alchemist-playbook",id:"method"}];
    const result=await f.service.observe(caller,{from:"2026-09-26T00:00:00Z",to:"2026-09-27T00:00:00Z",now:"2026-09-26T05:00:00Z"},[{kind:"goal",id:"goal"}]);
    assert.equal(result.outcome,"suggested",result.message);assert.equal(f.captured!.materials.length,4);
    assert.equal(f.captured!.materials.at(-1)!.context.revision,"2:active");assert.equal(f.writes,0);
    f.context.get("method")!.revision="2:disabled";
    await assert.rejects(f.service.execute(caller,result.suggestions[0]!.id,1),{code:"assistant.stale"});assert.equal(f.writes,0);
  }finally{f.close();}
});

test("completed result is read from original owner with current authority, not cached Home history", async () => {
  const f=assistantFixture();try {
    const row=(await f.service.evaluate(caller,f.input)).suggestions[0]!;await f.service.execute(caller,row.id,1);
    const context={...caller,permissions:caller.permissions.filter(p=>p!=="draft:read")};
    const history=(await f.service.state(context)).history;
    assert.ok(!JSON.stringify(history).includes("保留 PDF"));
    await assert.rejects(f.service.recover(context,row.id));assert.equal(f.writes,1);
    assert.equal((await f.service.recover(caller,row.id)).status,"completed");
  }finally{f.close();}
});

test("recovery never exposes a revoked suggestion title while preserving independent result-read authority", async () => {
  for (const found of [true, false]) {
    const f = assistantFixture();
    try {
      const row = (await f.service.evaluate(caller, f.input)).suggestions[0]!;
      const privateTitle = "仅建议标题包含的私有标记-7391";
      const saved = f.store.update(row.id, row.revision, { title: privateTitle });
      await f.service.execute(caller, saved.id, saved.revision);
      f.disconnect();
      const revoked = { ...caller, permissions: caller.permissions.filter(permission => permission !== "material:read") };
      if (!found) f.db.prepare("DELETE FROM drafts WHERE request_id=?").run(row.request_id);
      assert.equal((await f.service.state(revoked)).history[0]!.title, "来源已不可访问");
      const result = await f.service.recover(revoked, row.id);
      assert.equal(result.status, found ? "completed" : "needs_check");
      assert.equal(result.title, found ? "整理修改稿" : "核对执行结果");
      assert.equal(!!result.result, found);
      assert.ok(!JSON.stringify(result).includes(privateTitle));
      assert.equal(f.writes, 1, "recovery may read the original result but must never replay the effect");
      assert.equal(f.store.get(row.id).title, privateTitle, "projection must not destroy the stored suggestion");
    } finally { f.close(); }
  }
});

test("mutation receipts never disclose revoked material or prepared action inputs", async () => {
  const f=assistantFixture();try {
    const row=(await f.service.evaluate(caller,f.input)).suggestions[0]!;
    const result=f.service.feedback({...caller,permissions:["home:write"]},row.id,1,"dismiss");
    assert.deepEqual(Object.keys(result).sort(),["id","issue","revision","status"]);
    assert.ok(!JSON.stringify(result).includes("CSV"));
  }finally{f.close();}
  const g=assistantFixture();try {
    const row=(await g.service.evaluate(caller,g.input)).suggestions[0]!;
    const result=await g.service.execute({...caller,validate_authority:async ref=>{if(ref.capability_id==="fixture.draft.save")g.disconnect();}},row.id,1);
    assert.deepEqual(Object.keys(result).sort(),["id","issue","revision","status"]);assert.equal(result.status,"needs_check");assert.equal(g.writes,0);
  }finally{g.close();}
});
