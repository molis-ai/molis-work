import assert from "node:assert/strict";
import test from "node:test";
import { assistantAuthority } from "@molis-ai/molis-work-app-local-host";
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
