import assert from "node:assert/strict";
import test from "node:test";
import { assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

const knowledgeListKey = JSON.stringify(["knowledge.list", 1, "system.knowledge"]);

// BL-396 / PMAT-23：个人助理在项目里经能力目录找到并调用 knowledge.*，不需要另外授权；用户在助理的能力开关里
// 关掉某一项后，助理拿不到它——目录里不再出现，调用在发出前被拒（不是「调用了才发现没权限」）。
test("BL-396 PMAT-23: project knowledge is in the Assistant's capability directory, and switching it off takes it away", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("PMAT-23 项目资料");
  const work = { work_id: "work-pmat-23", project_ref: project.reference } as Parameters<typeof assistantAuthority>[1];
  let disabled = new Set<string>();
  const authority = assistantAuthority(home.host, work, () => disabled);
  const actions = (await authority.actions!("prologue"))!;
  const find = async () => (await actions.discover()).find(row => row.capability_id === "knowledge.list" && row.provider.provider_id === "system.knowledge");

  // 1. 项目里，助理能从目录里找到项目资料的能力；调用不需要另外授权（这一轮给出的权限就够）。
  const view = await find();
  assert.ok(view, "项目资料的能力在助理的目录里");
  const listed = (await actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {})) as { pieces: unknown[] };
  assert.deepEqual(listed.pieces, [], "这个项目还没有资料，读到的是空列表而不是被拒");

  // 2. 关掉这一项后，它从目录里消失；按旧引用调用在发出前被拒，不会跑到资料主人那里再报错。
  disabled = new Set([knowledgeListKey]);
  assert.equal(await find(), undefined, "关掉后它不再出现在助理的目录里");
  await assert.rejects(actions.check({ capability_id: "knowledge.list", version: 1, provider_id: "system.knowledge" }, {}), { code: "assistant.action_revoked" });
  await assert.rejects(actions.invoke({ capability_id: "knowledge.list", version: 1, provider_id: "system.knowledge" }, {}), "关掉的旧引用调不动");
});

// RAC-2675 RAC-2676: an action the person switched off for the Assistant is refused as a refusal (kind `forbidden`), whether the dispatch-time
// re-check finds it off or the input check does; at the Host's HTTP exits that is 403, with the code and message it had (it was 400).
// The third way it is raised, the card rules' refusal (assistant-offers.ts), is asserted in tests/assistant-business-gateway.test.ts.
test("RAC-2675 RAC-2676 an action switched off for the Assistant is refused with assistant.action_revoked of kind forbidden, at dispatch and at the input check", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("RAC-2675 助理关掉的能力");
  const work = { work_id: "work-rac-2675", project_ref: project.reference } as Parameters<typeof assistantAuthority>[1];
  let disabled = new Set<string>(), offAtDispatch = false;
  const authority = assistantAuthority(home.host, work, () => disabled);
  // `validate` is the first thing the dispatch-time re-check runs, after this round's grants were worked out: switching the action off
  // there is the person switching it off while the call was on its way.
  const actions = (await authority.actions!("prologue", () => { if (offAtDispatch) disabled = new Set([knowledgeListKey]); }))!;
  const knowledgeList = { capability_id: "knowledge.list", version: 1, provider_id: "system.knowledge" };
  offAtDispatch = true;
  let atDispatch: unknown;
  try { await actions.invoke(knowledgeList, {}); } catch (error) { atDispatch = error; }
  assert.ok(atDispatch instanceof ActionError, "switched off on its way, it does not run");
  assert.deepEqual([atDispatch.code, atDispatch.kind, atDispatch.message], ["assistant.action_revoked", "forbidden", "这项能力已对助理关闭或不再可用，未执行"]);
  await assert.rejects(actions.check(knowledgeList, {}), { code: "assistant.action_revoked", kind: "forbidden", message: "这项能力已对助理关闭或不再可用" });
  const { status, body } = actionErrorResponse(atDispatch);
  assert.equal(status, 403, "the status comes from the kind, by the one table in the plugin SDK");
  assert.deepEqual(body, { error: "这项能力已对助理关闭或不再可用，未执行", code: "assistant.action_revoked" }, "the body is what it was");
});
