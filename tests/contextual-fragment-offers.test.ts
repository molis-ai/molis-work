import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext, type FragmentActionOffer, type FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { planSteps, prepareGoalsFragmentOffers } from "../plugins/native/goals/dist/fragment-offers.js";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { boardSnapshot } from "./fixtures/goal-application.js";

/**
 * specs/archive/contextual-interaction §10 P2: the platform-wide fragment offers of Goals, through the real directory
 * and the real actions. What a provider prepares must be exactly what its own action accepts, and running it must do
 * what the card said (a proposal that creates nothing yet; progress on the right Goal).
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

test("W4-2-07: 拆成目标步骤 is declared by goals.tree.submit as a proposal; the fragment choices keep only progress, and the same query still prepares the proposal", () => {
  const { intake, undo, result_view } = goalsActions.treeSubmit.action;
  assert.deepEqual([intake?.intake_id, intake?.verb, intake?.effect, intake?.multiple, intake?.prepare, undo],
    ["breakdown", "拆成目标步骤", "proposes", undefined, { capability_id: "goals.fragment.offers", version: 1 }, undefined], "a proposal has no undo: withdrawing it is the approval decision");
  assert.deepEqual(result_view?.link, { label: "去 Goals 确认", href_template: "/projects/{project_id}/?openPlugin=goals#{/proposal/proposal_id}" });
  assert.match(result_view!.summary, /要在 Goals 里确认才生效/u);
  assert.deepEqual(goalsActions.fragmentOffers.action.fragment_offer_choices?.map(choice => choice.offer_id), ["progress"]);
  assert.deepEqual(inspectActionDeclarations([goalsActions.treeSubmit, goalsActions.fragmentOffers], undefined), []);
  // The query that stays as the entry's `prepare` still computes the proposal, from the offer id the entry is declared under.
  const offers = prepareGoalsFragmentOffers(fragment({}, "req-prepare"), { cursor: () => null });
  assert.deepEqual(offers.map(offer => [offer.offer_id, offer.action.capability_id]), [["breakdown", "goals.tree.submit"]]);
  assert.equal((offers[0]!.input as { idempotency_key: string }).idempotency_key, "req-prepare");
});

test("Goals fragment offers: prepared inputs run through the real actions and do what the card says", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "contextual-offers-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Offers", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "attention:write"] };
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
    // 记下灵光, 记成待办 (W4-1) and 拆成目标步骤 (W4-2-07) are creation entries: their offers queries only prepare, and tests/contextual-create.test.ts runs them.
    assert.ok(!titles.includes("拆成目标步骤") && !titles.includes("记录进展"), "the proposal is a creation entry, progress needs a ticked task: " + titles.join(" / "));
    assert.deepEqual(directory.find(item => item.capability_id === "goals.tree.submit")?.action.intake?.prepare, { capability_id: "goals.fragment.offers", version: 1 });

    // 拆成目标步骤: a proposal under the document's Goal; nothing is created until the person approves it in Goals.
    const breakdown = { source: { capability_id: "goals.fragment.offers", version: 1 } };
    const offered = await invoke<{ offers: FragmentActionOffer[] }>(breakdown.source, fragment({ goal: { id: parent, title: "提升新用户留存" } }, "req-breakdown"));
    const plan = offered.offers.find(offer => offer.offer_id === "breakdown")!;
    assert.match(plan.summary!, /新建 2 个步骤，放在「提升新用户留存」下/);
    const before = await host.withProject(ref, runtime => boardSnapshot(runtime.store, project.project_id));
    const submitted = await invoke<{ proposal: { proposal_id: string; items: unknown[]; root_goal_id: string | null }; replayed: boolean }>(plan.action, plan.input);
    assert.equal(submitted.proposal.root_goal_id, parent);
    assert.equal(submitted.proposal.items.length, 4, "two steps and their part_of relations");
    const again = await invoke<{ replayed: boolean }>(plan.action, plan.input);
    assert.equal(again.replayed, true, "the same request submits once");
    // Another plan in the same project is its own proposal: its items are named by its own request, not step-1 again.
    const other = (await invoke<{ offers: FragmentActionOffer[] }>(breakdown.source, fragment({ goal: { id: parent, title: "提升新用户留存" } }, "req-breakdown-2"))).offers.find(offer => offer.offer_id === "breakdown")!;
    const second = await invoke<{ proposal: { proposal_id: string }; replayed: boolean }>(other.action, other.input);
    assert.notEqual(second.proposal.proposal_id, submitted.proposal.proposal_id);
    const after = await host.withProject(ref, runtime => boardSnapshot(runtime.store, project.project_id));
    assert.equal(after.goals.length, before.goals.length, "proposals create no Goal before approval");

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

  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
