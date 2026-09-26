import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Proposal UI preserves user input on failed confirmation, retries atomically, and rejects without creating Goals", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate, reloadPage } = browser;
  const coordinator = new GoalProjectApplication(store);
  function propose(id: string) {
    coordinator.goalEvents.createIntent({
      board_id: DEMO_BOARD_ID, actor_id: "browser-planner", actor_kind: "runtime",
      goal_id: id + "-root", title: "用户决定以后才创建子目标 " + id,
      outcome: "保留用户明确选择的子目标", idempotency_key: id + "-start",
    });
    return coordinator.goalTreeSubmission.submitGoalTreeProposal({
      board_id: DEMO_BOARD_ID, actor_id: "browser-planner",
      root_goal_id: id + "-root", summary: "保留用户明确选择的子目标", idempotency_key: id + "-proposal",
      items: [{
        item_id: id + "-child", kind: "goal", operation: "create",
        payload: { goal_id: id + "-child", title: '待确认的子目标 <安全> "' + id, outcome: "用户确认后再创建" },
        source_refs: ["conversation://browser-proposal"], reason: "先让用户决定", confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: id + "-child" }],
      }, {
        item_id: id + "-relation", kind: "relation", operation: "create",
        payload: { from_goal_id: id + "-child", to_goal_id: id + "-root", type: "part_of", reason: "同一结果的子工作" },
        source_refs: ["conversation://browser-proposal"], reason: "确认后再建立归属", confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: id + "-root" }],
      }],
    }).proposal;
  }
  const adopted = propose("browser-adopt"), rejected = propose("browser-reject");
  const before = store.snapshot(DEMO_BOARD_ID);
  const form = (id: string) => '[data-goal-tree-proposal-id="' + id + '"]';
  const dom = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  const adoptForm = form(adopted.proposal_id), rejectForm = form(rejected.proposal_id);
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const openGoal = async (goalId: string, formSelector: string) => {
    await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(goalId) }, sessionId));
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.querySelector('[data-goal-view=" + JSON.stringify(goalId) + "]')");
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
    await waitFor(dom(formSelector) + "?.getBoundingClientRect().width > 0");
  };
  await openGoal("browser-adopt-root", adoptForm);
  assert.equal(await evaluate("document.querySelectorAll('[data-feed-entry-id^=\"decision:\"]').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('[data-feed-detail^=\"decision:\"]').length"), 0);
  await click(adoptForm + ' button[value="confirm"]');
  await waitFor("document.activeElement === " + dom(adoptForm + ' textarea[name="reason"]'));
  assert.equal(await evaluate(dom(adoptForm + ' textarea[name="reason"]') + ".getAttribute('aria-invalid')"), "true");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  await command("Input.insertText", { text: "确认这两个变化，断网后也保留这段意见。" }, sessionId);
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goal-tree-proposals/" + adopted.proposal_id + "/decision"] }, sessionId);
  await click(adoptForm + ' button[value="confirm"]');
  await waitFor("!" + dom(adoptForm + " [data-decision-error]") + ".hidden && !" + dom(adoptForm + ' button[value="confirm"]') + ".disabled");
  assert.equal(await evaluate(dom(adoptForm + ' textarea[name="reason"]') + ".value"), "确认这两个变化，断网后也保留这段意见。");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).relations, before.relations);
  assert.equal(store.snapshot(DEMO_BOARD_ID).goal_tree_proposals.find((p) => p.proposal_id === adopted.proposal_id)!.state, "pending");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click(adoptForm + ' button[value="confirm"]');
  await waitFor("!" + dom(adoptForm) + " && " + dom("[data-decision-receipt]"));
  const afterAdopt = store.snapshot(DEMO_BOARD_ID);
  assert.equal(afterAdopt.goals.filter((g) => g.goal_id === "browser-adopt-child").length, 1);
  assert.equal(coordinator.goalEvents.isEventStateOwner(DEMO_BOARD_ID, "browser-adopt-child"), true);
  assert.equal(coordinator.goalEvents.readState(DEMO_BOARD_ID, "browser-adopt-child").work_status, "open");
  assert.equal(afterAdopt.relations.filter((r) => r.from_goal_id === "browser-adopt-child" && r.to_goal_id === "browser-adopt-root" && r.state === "active").length, 1);
  assert.equal(afterAdopt.goal_tree_proposals.find((p) => p.proposal_id === adopted.proposal_id)!.state, "approved");
  assert.ok(afterAdopt.goal_tree_proposals.find((p) => p.proposal_id === adopted.proposal_id)!.items.every((item) => item.state === "applied"));
  assert.equal(await evaluate("document.activeElement.matches('[data-decision-receipt]')"), true);
  await reloadPage();
  await waitFor("document.readyState === 'complete' && !" + dom(adoptForm));
  assert.equal(await evaluate("Boolean(" + dom(adoptForm) + ")"), false);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, afterAdopt.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).relations, afterAdopt.relations);
  await openGoal("browser-reject-root", rejectForm);
  await click(rejectForm + ' button[value="reject"]');
  await waitFor("document.activeElement === " + dom(rejectForm + ' textarea[name="reason"]'));
  await command("Input.insertText", { text: "暂不需要这个分支，保留原目标树。" }, sessionId);
  await click(rejectForm + ' button[value="reject"]');
  await waitFor("!" + dom(rejectForm) + " && (" + dom("[data-decision-receipt]") + " || /已退回/.test(document.querySelector('[data-toast]')?.textContent || ''))");
  const afterReject = store.snapshot(DEMO_BOARD_ID);
  assert.equal(afterReject.goal_tree_proposals.find((p) => p.proposal_id === rejected.proposal_id)!.state, "rejected");
  assert.deepEqual(afterReject.goals, afterAdopt.goals);
  assert.deepEqual(afterReject.relations, afterAdopt.relations);
  await reloadPage();
  assert.equal(await evaluate("Boolean(" + dom(rejectForm) + ")"), false);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, afterReject.goals);
});
