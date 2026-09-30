import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { lingguangActions } from "@molis-ai/molis-work-plugin-lingguang";
import { bindActionClient, type ActionCallContext, type ActionDefinition, type FragmentActionOffer, type FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates } from "@molis-ai/molis-work-kernel";
import { planSteps } from "../plugins/native/goals/src/fragment-offers.js";

/**
 * specs/contextual-interaction §10 P2: the platform-wide fragment offers of Goals and 灵光, through the real directory
 * and the real actions. What a provider prepares must be exactly what its own action accepts, and running it must do
 * what the card said (a proposal that creates nothing yet; progress on the right Goal; one spark per request).
 */
const fragment = (over: Partial<FragmentOffersInput["fragment"]>, request_id: string): FragmentOffersInput => ({ request_id, fragment: {
  object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, granularity: "range",
  targets: [{ kind: "text_range", role: "paragraph", text: "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈。" }], ...over } });

test("a plan becomes steps by clause; several selected parts become one step each", () => {
  assert.deepEqual(planSteps(fragment({}, "r")), ["下周三前完成新手引导改版", "周五发给二十个老用户试用并收集反馈"]);
  assert.deepEqual(planSteps(fragment({ granularity: "blocks", targets: [{ kind: "text_range", text: "1. 访谈五位用户" }, { kind: "text_range", text: "2. 整理结论；" }] }, "r")),
    ["访谈五位用户", "整理结论"]);
  assert.deepEqual(planSteps(fragment({ targets: [{ kind: "text_range", text: "2026 年完成迁移" }] }, "r")), ["2026 年完成迁移"]);
});

test("Goals and 灵光 fragment offers: prepared inputs run through the real actions and do what the card says", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "contextual-offers-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Offers", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "lingguang:read", "lingguang:write"] };
  const client = host.actionClient(ref);
  const bound = bindActionClient(client, () => caller);
  const invoke = <O>(reference: { capability_id: string; version: number; provider_id?: string }, input: unknown) => client.invoke(caller, reference, input) as Promise<O>;
  try {
    const parent = "GOAL-RETENTION";
    await bound.invoke(goalsActions.create, { goal_id: parent, title: "提升新用户留存", idempotency_key: "create-parent" });
    const directory = await client.discover(caller);
    const focus: SurfaceFocus = { context_id: "c1", plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
      object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, goal: { id: parent, title: "提升新用户留存" },
      targets: [{ kind: "text_range", role: "paragraph", text: "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈。" }] };
    const candidates = fragmentCandidates(directory, focus);
    const titles = candidates.filter(item => item.available).map(item => item.title);
    assert.ok(titles.includes("拆成目标步骤") && titles.includes("记下灵光"), titles.join(" / "));
    assert.ok(!titles.includes("记录进展"), "progress needs a ticked task");
    for (const item of candidates.filter(item => item.offer_id === "breakdown" || item.offer_id === "capture")) assert.equal(item.apply, "record", "both write: confirmed first");

    // 拆成目标步骤: a proposal under the document's Goal; nothing is created until the person approves it in Goals.
    const breakdown = candidates.find(item => item.offer_id === "breakdown")!;
    const offered = await invoke<{ offers: FragmentActionOffer[] }>(breakdown.source, fragment({ goal: { id: parent, title: "提升新用户留存" } }, "req-breakdown"));
    const plan = offered.offers.find(offer => offer.offer_id === "breakdown")!;
    assert.match(plan.summary!, /新建 2 个步骤，放在「提升新用户留存」下/);
    const before = await host.withProject(ref, runtime => runtime.store.snapshot(project.board_id));
    const submitted = await invoke<{ proposal: { proposal_id: string; items: unknown[]; root_goal_id: string | null }; replayed: boolean }>(plan.action, plan.input);
    assert.equal(submitted.proposal.root_goal_id, parent);
    assert.equal(submitted.proposal.items.length, 4, "two steps and their part_of relations");
    const again = await invoke<{ replayed: boolean }>(plan.action, plan.input);
    assert.equal(again.replayed, true, "the same request submits once");
    const after = await host.withProject(ref, runtime => runtime.store.snapshot(project.board_id));
    assert.equal(after.goals.length, before.goals.length, "a proposal creates no Goal before approval");

    // 记录进展: only for a ticked task in something that belongs to a Goal; it lands on that Goal at its current cursor.
    const task: SurfaceFocus = { ...focus, context_id: "c2", activity: "completed", granularity: "block", targets: [{ kind: "block", role: "task", text: "上线新手引导" }] };
    const progress = fragmentCandidates(directory, task).find(item => item.offer_id === "progress")!;
    assert.ok(progress?.available);
    assert.equal(fragmentCandidates(directory, { ...task, goal: undefined }).some(item => item.offer_id === "progress"), false, "no Goal known, not offered");
    const ready = await invoke<{ offers: FragmentActionOffer[] }>(progress.source, fragment({ granularity: "block", goal: { id: parent, title: "提升新用户留存" },
      targets: [{ kind: "block", role: "task", text: "上线新手引导" }] }, "req-progress"));
    const record = ready.offers.find(offer => offer.offer_id === "progress")!;
    await invoke(record.action, record.input);
    const state = await bound.invoke(goalsActions.state, { goal_id: parent });
    assert.equal(state.progress_summary?.summary, "完成：上线新手引导");

    // 记下灵光: one spark per request, the source named in its body.
    const capture = candidates.find(item => item.offer_id === "capture")!;
    const noted = await invoke<{ offers: FragmentActionOffer[] }>(capture.source, fragment({}, "req-spark"));
    const spark = noted.offers[0]!;
    await invoke(spark.action, spark.input);
    await invoke(spark.action, spark.input);
    const { sparks } = await bound.invoke(lingguangActions.list as ActionDefinition<Record<string, never>, { sparks: { body: string }[] }>, {});
    assert.equal(sparks.filter(item => item.body.includes("出自：留存计划")).length, 1);
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
