import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActionError, bindActionClient, type ActionCallContext, type ActionSceneTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID, createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { functionContextActions, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { HOME_ACTION_PERMISSIONS } from "../apps/local-host/src/home-actions.js";
import { GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";

test("system configuration writes Home, Inbox and existing Feed rules through their original owners with concurrency checks", async () => {
  const home = await mkdtemp(join(tmpdir(), "native-scene-config-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "native-config-project" });
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: { async evaluate(_key, record) {
    return { primitive: record.primitive, choice: "inbox.done", noul: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model };
  } } };
  let unavailable = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions, actionAvailability: (_caller, action) => unavailable && action.action.kind === "judgment"
    ? { available: false, code: "fixture.disconnected", reason: "判断连接断开" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user",
    permissions: [...HOME_ACTION_PERMISSIONS, ...GOALS_ACTION_PERMISSIONS, "functions:manage", "functions:invoke", "feed:read", "feed:write", "inbox:read", "inbox:write"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const rule = (key: string) => withFunctionsService(home, service => service.list().find(row => row.function_key === key)!, functions);
  const configure = (id: string, target: ActionSceneTarget, enabled: boolean) => ({ id, scene_id: target.scene_id, scene_version: target.scene_version,
    provider_id: target.provider_id, binding_id: target.binding_id, expected_revision: target.revision, enabled });
  try {
    const runtime = await host.withProject(reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const feedRule = rule("system_admit_inbox");
    assert.equal((await actions.invoke(functionContextActions.targets, { id: feedRule.id })).targets.filter(row => row.scene_id === "feed.capture").length, 0,
      "querying a capture destination cannot invent a new Feed rule");
    const original = feed.createOutRule(reference.board_id, { name: "原来的项目规则", match: { contains: "真实材料" }, admission: "inbox" });
    for (const [sceneId, key] of [["home.dock", "system_pick_home_dock"], ["inbox.next", "system_pick_inbox_next"], ["feed.capture", "system_admit_inbox"]]) {
      const record = rule(key!);
      const readTarget = async () => (await actions.invoke(functionContextActions.targets, { id: record.id })).targets.find(row => row.scene_id === sceneId)!;
      let target = await readTarget();
      assert.ok(target, sceneId); assert.equal(target.availability.available, true, JSON.stringify(target.availability));
      assert.equal(target.binding, null);
      if (sceneId === "feed.capture") assert.equal(target.revision, original.revision);
      else assert.equal(target.revision, null, "Home/Inbox return their unbound singleton slot");
      const request = configure(record.id, target, true);
      if (sceneId === "feed.capture") {
        const noInbox = { ...caller, permissions: caller.permissions.filter(permission => permission !== "inbox:write") };
        const limited = await host.sceneClient(reference).targets(noInbox, { ...publishedFunctionAction(record), provider_id: "system.functions" });
        const position = limited.find(row => row.binding_id === target.binding_id)!;
        assert.equal(position.configuration_availability.available, true); assert.equal(position.availability.available, false);
        await assert.rejects(host.actionClient(reference).invoke(noInbox, functionContextActions.configure, request), { code: "actions.forbidden" });
      }
      await assert.rejects(host.actionClient(reference).invoke({ ...caller, permissions: ["functions:manage"] }, functionContextActions.configure, request));
      await assert.rejects(actions.invoke(functionContextActions.configure, { ...request, provider_id: "replacement" }), { code: "actions.binding_missing" });
      await actions.invoke(functionContextActions.configure, request);
      target = await readTarget();
      assert.equal(target.binding?.function.provider_id, "system.functions");
      assert.equal(target.binding?.function.capability_id, publishedFunctionAction(record).capability_id);
      await assert.rejects(actions.invoke(functionContextActions.configure, request), { code: "actions.binding_changed" });
      const originalBinding = target.binding!;
      if (sceneId === "feed.capture") assert.equal(feed.listOutRules(reference.board_id).find(row => row.rule_id === original.rule_id)!.judgment?.provider_id, "system.functions");
      else assert.equal(withFunctionsService(home, service => service.actionSceneBinding(sceneId!, reference.board_id), functions)?.function.provider_id, "system.functions");
      unavailable = true;
      target = await readTarget();
      assert.equal(target.availability.available, false); assert.equal(target.configuration_availability.available, true);
      await actions.invoke(functionContextActions.configure, configure(record.id, target, false));
      target = await readTarget(); assert.equal(target.binding?.enabled, false); assert.deepEqual(target.binding?.function, originalBinding.function);
      unavailable = false;
      await actions.invoke(functionContextActions.configure, configure(record.id, target, true));
      target = await readTarget();
      const revision = target.revision;
      // Revoke the management operation during asynchronous nested authorization; no disable may be persisted.
      let managementChecks = 0;
      await assert.rejects(host.actionClient(reference).invoke({ ...caller, validate_authority: action => {
        if (action.capability_id === functionContextActions.configure.capability_id && ++managementChecks > 1) throw new ActionError("fixture.revoked", "管理授权已撤销");
      } }, functionContextActions.configure, configure(record.id, target, false)), { code: "fixture.revoked" });
      assert.equal((await readTarget()).revision, revision); assert.equal((await readTarget()).binding?.enabled, true);
      // Race after target reads: the owner writes another revision before the shared service attempts its save.
      if (sceneId !== "feed.capture") {
        await assert.rejects(host.actionClient(reference).invoke({ ...caller, validate_authority: action => {
          if (action.capability_id === publishedFunctionAction(record).capability_id) withFunctionsService(home,
            service => service.saveActionSceneBinding(reference.board_id, { ...originalBinding, enabled: false }, record.function_key), functions);
        } }, functionContextActions.configure, configure(record.id, target, true)), { code: "functions.conflict" });
        assert.equal((await readTarget()).binding?.enabled, false);
      } else {
        await assert.rejects(host.actionClient(reference).invoke({ ...caller, validate_permissions: permissions => {
          assert.ok(permissions.includes("inbox:write"), "the automatic side effect participates in the final permission check");
          throw new ActionError("fixture.revoked", "自动入箱授权已撤销");
        } }, functionContextActions.configure, configure(record.id, target, true)), { code: "fixture.revoked" });
        assert.equal((await readTarget()).revision, revision);
      }
      target = await readTarget();
      if (!target.binding?.enabled) { await actions.invoke(functionContextActions.configure, configure(record.id, target, true)); target = await readTarget(); }
      const manager: ActionCallContext = { ...caller, permissions: ["functions:manage", sceneId === "home.dock" ? "home:write" : sceneId === "inbox.next" ? "inbox:write" : "feed:write"] };
      const manageable = (await bindActionClient(host.actionClient(reference), () => manager).invoke(functionContextActions.targets, { id: record.id })).targets.find(row => row.scene_id === sceneId)!;
      assert.ok(manageable); assert.equal(manageable.availability.available, false); assert.equal(manageable.configuration_availability.available, true);
      await host.actionClient(reference).invoke(manager, functionContextActions.configure, configure(record.id, manageable, false));
      assert.equal((await readTarget()).binding?.enabled, false, "configuration rights alone can pause the original rule without model or execution rights");
      await assert.rejects(host.actionClient(reference).invoke(manager, functionContextActions.configure, configure(record.id, await readTarget(), true)), { code: "actions.forbidden" });
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
