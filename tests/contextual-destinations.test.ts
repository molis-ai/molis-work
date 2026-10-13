import assert from "node:assert/strict";
import test from "node:test";
import { defineFragmentOffersAction, defineSubjectContextAction, defineSubjectOffersAction, type ActionView, type FragmentOfferChoice } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualCandidate, SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import {
  contextualCandidates, judgedCandidates, judgmentState, MAX_JUDGED_DESTINATIONS, planContextualLayout, privateObjectKinds,
} from "@molis-ai/molis-work-kernel/contextual";
import { createContextualJudgmentService } from "@molis-ai/molis-work-app-local-host";

/** W1-5 (context-program §18): destinations are candidates derived from declarations, and only ever take a recommended slot. */
const provider = (id: string, title: string, plugin_id = id) => ({ provider_id: id, title, plugin_id }) as ActionView["provider"];
const todo = provider("io.molis.work.todo", "Todo"), pages = provider("io.molis.work.pages", "Pages"), shelf = provider("io.molis.work.shelf", "Shelf");
const view = (p: ActionView["provider"], capability_id: string, action: Partial<ActionView["action"]> = {}, operation: ActionView["operation"] = "command", available = true): ActionView => ({
  capability_id, version: 1, provider_id: p.provider_id, operation, provider: p,
  availability: available ? { available: true } : { available: false, code: "actions.disabled", reason: `${p.title} 已停用` },
  action: { title: capability_id, description: capability_id, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user"], permissions: [],
    subject_kinds: [], input_schema: { type: "object", properties: { text: {}, expected_version: {} } }, ...action },
} as ActionView);
const intake = (id: string, over: Record<string, unknown> = {}) => ({ intake_id: id, item_kind: `${id}_item`, title: id, verb: `记成${id}`, describe: `${id} 装什么`, examples: ["一句话"], ...over });
const attach = (id: string, over: Record<string, unknown> = {}) => ({ attach_id: id, item_kind: "pages_document", title: id, verb: `放进${id}`, describe: `${id} 描述`, positions: ["cursor", "end"], ...over });
const directory = (extra: ActionView[] = []): ActionView[] => [
  view(todo, "todo.items.create", { intake: intake("todo"), subject_kinds: ["todo_item"] }),
  view(pages, "pages.create", { intake: intake("page", { effect: "creates" }), subject_kinds: ["pages_document"] }),
  view(pages, "pages.insert", { attach: attach("insert"), subject_kinds: ["pages_document"] }),
  view(pages, "pages.replace", { attach: attach("replace", { positions: ["selection"], verb: "替换选中的文字" }), subject_kinds: ["pages_document"] }),
  view(pages, "pages.link", { attach: attach("link", { positions: undefined, verb: "作为引用附上" }), subject_kinds: ["pages_document"] }),
  ...extra,
];
const hand = (over: Partial<SurfaceFocus> = {}): SurfaceFocus => ({
  context_id: "ctx-1", plugin_id: "shelf", activity: "selecting", granularity: "block", object: { kind: "shelf_item", id: "i1", title: "访谈" },
  targets: [{ kind: "block", role: "paragraph", text: "8 位受访者停在了导入数据这一步。" }], place: "side", ...over,
});
const landing = (over: Partial<SurfaceLanding> = {}): SurfaceLanding => ({
  pane_id: "main", plugin_id: "io.molis.work.pages", object: { kind: "pages_document", id: "d1", title: "计划" }, position: "cursor", version: 7,
  targets: [{ kind: "text_range", text: "", anchor: 42, head: 42 }], ...over,
});
const titles = (candidates: readonly ContextualCandidate[], origin?: string) => candidates.filter(item => !origin || item.origin === origin).map(item => item.title);

test("W1-05: a creation entry is a destination for what is in hand, whatever is selected, except the bare page", () => {
  const found = contextualCandidates(directory(), hand());
  assert.deepEqual(titles(found, "intake"), ["记成todo", "记成page"]);
  const first = found.find(item => item.origin === "intake")!;
  assert.match(first.key, /^intake\.[0-9a-f]{57}$/u);
  assert.ok(first.key.length <= 64);
  assert.deepEqual([first.apply, first.intent, first.offer_id, first.action.capability_id, first.provider_title], ["record", "capture", "todo", "todo.items.create", "Todo"]);
  for (const granularity of ["word", "range", "block", "blocks", "objects", "object"] as const) assert.equal(titles(contextualCandidates(directory(), hand({ granularity }), landing()), "intake").length, 2, granularity);
  assert.deepEqual(contextualCandidates(directory(), hand({ granularity: "page" }), landing()), []);
  assert.equal(new Set(found.map(item => item.key)).size, found.length, "keys are unique");
  assert.equal(found.find(item => item.origin === "intake")!.key, contextualCandidates(directory(), hand({ context_id: "another" })).find(item => item.origin === "intake")!.key, "the key is the declaration's, not the context's");
});

test("W1-05: an append needs the thing to be on the right or in the Assistant, and a landing of the provider's own kind at an accepted position", () => {
  assert.deepEqual(titles(contextualCandidates(directory(), hand(), landing()), "attach"), ["放进insert"], "a cursor takes the cursor append");
  assert.deepEqual(titles(contextualCandidates(directory(), hand(), landing({ position: "end", targets: [{ kind: "text_range", text: "", anchor: 90, head: 90 }] })), "attach"), ["放进insert"]);
  assert.deepEqual(titles(contextualCandidates(directory(), hand(), landing({ position: "selection", targets: [{ kind: "text_range", text: "旧", anchor: 1, head: 2 }] })), "attach"), ["替换选中的文字"]);
  assert.deepEqual(titles(contextualCandidates(directory(), hand(), landing({ position: "object", targets: undefined })), "attach"), ["作为引用附上"], "no positions means the object itself");
  assert.deepEqual(titles(contextualCandidates(directory(), hand({ place: "assistant" }), landing()), "attach"), ["放进insert"]);
  for (const [why, found] of [
    ["no landing", contextualCandidates(directory(), hand())],
    ["nothing to land: the thing is on the left itself", contextualCandidates(directory(), hand({ place: "main" }), landing())],
    ["no place claimed means the left", contextualCandidates(directory(), hand({ place: undefined }), landing())],
    ["another plugin's document", contextualCandidates(directory(), hand(), landing({ plugin_id: "io.molis.work.goals" }))],
    ["another kind", contextualCandidates(directory(), hand(), landing({ object: { kind: "goal", id: "g1" } }))],
  ] as const) assert.deepEqual(titles(found, "attach"), [], why);
  const attached = contextualCandidates(directory(), hand(), landing()).find(item => item.origin === "attach")!;
  assert.equal(attached.position, "cursor");
  assert.match(attached.key, /^attach\.[0-9a-f]{57}$/u);
  assert.equal(attached.key, contextualCandidates(directory(), hand(), landing({ position: "end" })).find(item => item.origin === "attach")!.key, "the same declaration is the same key at another position");
});

test("W1-05: places narrow where something is offered, for destinations and for the actions on the thing itself", () => {
  const only = (places: string[]) => [view(todo, "todo.only", { intake: intake("only", { places }) })];
  assert.deepEqual(titles(contextualCandidates(only(["main"]), hand({ place: "side" })), "intake"), []);
  assert.deepEqual(titles(contextualCandidates(only(["side", "assistant"]), hand({ place: "side" })), "intake"), ["记成only"]);
  assert.deepEqual(titles(contextualCandidates(only(["main"]), hand({ place: undefined })), "intake"), ["记成only"], "no claim is the work area");
  const fragments = (places?: string[]) => [
    view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], [
      { offer_id: "explain", title: "解释", intent: "understand", apply: "result", hint: "h", action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"], ...(places ? { places } : {}) } as FragmentOfferChoice]).action }, "query"),
    view(pages, "pages.ai"),
  ];
  assert.deepEqual(titles(contextualCandidates(fragments(), hand())), ["解释"]);
  assert.deepEqual(titles(contextualCandidates(fragments(["main"]), hand({ place: "side" }))), []);
  assert.deepEqual(titles(contextualCandidates(fragments(["main"]), hand({ place: "main" }))), ["解释"]);
  const offers = (places?: string[]) => [
    view(todo, "todo.offers", { ...defineSubjectOffersAction("todo.offers", ["todo_item"], "t", [], [{ offer_id: "done", title: "完成", action: { capability_id: "todo.finish", version: 1 }, ...(places ? { places } : {}) }]).action }, "query"),
    view(todo, "todo.finish", { subject_kinds: ["todo_item"] }),
  ];
  const object = (place?: SurfaceFocus["place"]) => hand({ granularity: "object", object: { kind: "todo_item", id: "t1" }, ...(place ? { place } : {}) });
  assert.deepEqual(titles(contextualCandidates(offers(), object("side"))), ["完成"]);
  assert.deepEqual(titles(contextualCandidates(offers(["main"]), object("side"))), []);
  assert.deepEqual(titles(contextualCandidates(offers(["side"]), object("side"))), ["完成"]);
});

test("W1-05: a disabled provider's destination is unavailable, and an irreversible command is never offered", () => {
  const found = contextualCandidates([view(todo, "todo.items.create", { intake: intake("todo") }, "command", false), view(todo, "todo.items.delete", { intake: intake("gone") })], hand());
  assert.deepEqual(found.map(item => [item.title, item.available, item.reason]), [["记成todo", false, "Todo 已停用"], ["记成gone", false, "不可撤回的动作不在情境推荐里提供"]]);
});

test("W1-05: destinations only take recommended slots: never in more, and listed in the plan only when they hold one", () => {
  const many = Array.from({ length: 6 }, (_, index) => view(todo, `todo.make${index}`, { intake: intake(`d${index}`) }));
  const fragment = (id: string, intent: FragmentOfferChoice["intent"]): FragmentOfferChoice => ({ offer_id: id, title: id, intent, apply: "result", hint: id, action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"] });
  const offers = [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], [fragment("a", "understand"), fragment("b", "question"), fragment("c", "expand"), fragment("d", "organize")]).action }, "query"), view(pages, "pages.ai")];
  const candidates = contextualCandidates([...offers, ...many], hand());
  const plan = planContextualLayout({ focus: hand(), candidates });
  assert.equal(plan.primary.length, 3);
  const destinationKeys = new Set(candidates.filter(item => item.origin === "intake").map(item => item.key));
  assert.equal(plan.more.flatMap(group => group.keys).some(key => destinationKeys.has(key)), false, "not one destination under 更多");
  assert.ok(plan.candidates.every(item => item.origin !== "intake" || plan.primary.includes(item.key)), "全部操作 lists no destination that is not recommended");
  assert.ok(plan.candidates.filter(item => item.origin !== "intake").length >= 4, "the actions on the thing itself are all there");
  // A judgment that likes two destinations puts them in the slots, and they are listed with them.
  const [first, second] = [...destinationKeys];
  const judged = planContextualLayout({ focus: hand(), candidates, judgment: { basis: "jev", next: { [first!]: 0.5, [second!]: 0.3 }, intent: {}, surface: "none", surface_probability: null, speak_up: null, confidence: 0.7, latency_ms: 1 } });
  assert.deepEqual(judged.primary.slice(0, 2), [first, second]);
  assert.deepEqual(judged.candidates.filter(item => item.origin === "intake").map(item => item.key).sort(), judged.primary.filter(key => destinationKeys.has(key)).sort());
});

test("W1-05: at most eight destinations go to the judgment; the actions on the thing keep the rest of the budget", () => {
  const many = Array.from({ length: 12 }, (_, index) => view(todo, `todo.make${index}`, { intake: intake(`d${index}`) }));
  const fragment = (id: string): FragmentOfferChoice => ({ offer_id: id, title: id, intent: "question", apply: "result", hint: id, action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"] });
  const offers = [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], ["a", "b", "c"].map(fragment)).action }, "query"), view(pages, "pages.ai")];
  const asked = judgedCandidates(contextualCandidates([...offers, ...many], hand()), hand());
  assert.equal(asked.filter(item => item.origin === "intake").length, MAX_JUDGED_DESTINATIONS);
  assert.equal(asked.filter(item => item.origin !== "intake").length, 3);
  assert.deepEqual(asked.filter(item => item.origin === "intake").map(item => item.offer_id), Array.from({ length: MAX_JUDGED_DESTINATIONS }, (_, index) => `d${index}`), "the first eight, in declared order");
});

const reader = (p: ActionView["provider"], kind: string, scope: "home" | "project") => view(p, `${p.title.toLowerCase()}.read`, { ...defineSubjectContextAction(`${p.title.toLowerCase()}.read`, kind, "读", [], scope).action }, "query");

test("W1-05: a kind read at Home scope is a person's own space, found from the directory and not from a name", () => {
  const found = privateObjectKinds([reader(shelf, "shelf_item", "home"), reader(pages, "pages_document", "project"), reader(todo, "todo_item", "project")]);
  assert.deepEqual([...found], ["shelf_item"]);
  assert.equal(privateObjectKinds([]).size, 0);
});

test("W1-05 AC-P05: what is in a person's own space reaches the judgment as shape and kind only", () => {
  const secret = "合同里写着 SECRET-WORDS 与 SECRET-TITLE";
  const mine = hand({ object: { kind: "shelf_item", id: "i1", title: "SECRET-TITLE" }, targets: [{ kind: "block", role: "paragraph", text: secret }],
    surroundings: { heading_path: ["SECRET-HEADING"], before: "SECRET-BEFORE", after: "SECRET-AFTER" }, goal: { id: "g", title: "SECRET-GOAL" } });
  const text = judgmentState(mine, { personal: true, landing: landing({ surroundings: { heading_path: ["计划"], before: "左边的前文" } }) }).text;
  assert.equal(text.includes("SECRET"), false, text);
  assert.ok(text.includes("【对象】shelf_item · （仅本人可见，不进判断）") && text.includes("【选中内容 1（paragraph）】（仅本人可见，不进判断）"));
  assert.ok(text.includes("【落点前文】左边的前文"), "the open document on the left is the project's own and is still material");
  assert.ok(judgmentState(mine).text.includes("SECRET-WORDS"), "and anything else is read as before");
});

test("W1-05 AC-P05: the service keeps a person's own space out of the model and out of recall, and says so in the receipt", async () => {
  const dir = [reader(shelf, "shelf_item", "home"), view(shelf, "shelf.fragment.offers", { ...defineFragmentOffersAction("shelf.fragment.offers", ["shelf_item"], "t", [], [
    { offer_id: "explain", title: "解释", intent: "understand", apply: "result", hint: "h", action: { capability_id: "shelf.ai", version: 1 }, granularities: ["block"] }]).action }, "query"), view(shelf, "shelf.ai")];
  const states: string[] = []; let recalls = 0;
  const key = contextualCandidates(dir, hand())[0]!.key;
  const service = createContextualJudgmentService<string>({
    directory: async () => dir,
    recall: async () => { recalls += 1; return { state: "ok", items: [] }; },
    evaluate: async ({ state }) => { states.push(state); return { basis: "jev", body: { answers: { next: { choice: key, probabilities: { [key]: 0.6 }, confidence: 0.7 }, intent: { choice: "understand", probabilities: { understand: 0.7 } }, surface: { choice: "none" }, speak_up: { noul: 0.1 } } } }; },
  });
  const secretFocus = hand({ object: { kind: "shelf_item", id: "i1", title: "SECRET-TITLE" }, targets: [{ kind: "block", role: "paragraph", text: "SECRET-WORDS" }] });
  const out = await service.judge({ pane_id: "p", focus: secretFocus }, "me");
  assert.equal(states.length, 1); assert.equal(states[0]!.includes("SECRET"), false);
  assert.equal(recalls, 0, "recall would send the words as its query");
  assert.ok(out.receipt.screened.includes("仅本人可见：内容不进判断，只按形状和种类"));
  assert.equal(out.plan.basis, "judgment", "the shape alone is enough to rank");
});

test("W1-05: the service derives destinations for the landing it is given and counts everything it derived", async () => {
  const dir = directory();
  const service = createContextualJudgmentService<string>({ directory: async () => dir });
  const without = await service.candidates({ pane_id: "p", focus: hand() }, "me");
  assert.deepEqual(without.plan.candidates.filter(item => item.origin === "attach"), [], "no landing, no append");
  const placed = await service.candidates({ pane_id: "p", focus: hand(), landing: landing() }, "me");
  assert.ok(placed.plan.candidates.every(item => item.origin !== "attach" || placed.plan.primary.includes(item.key)));
  assert.equal(placed.receipt.candidate_count, contextualCandidates(dir, hand(), landing()).filter(item => item.available).length);
  assert.ok(placed.receipt.candidate_count > without.receipt.candidate_count, "the landing made more things possible");
});
