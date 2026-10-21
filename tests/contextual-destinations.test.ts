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
  // W4-1 (quick-create §6.1): without a judgment the rules recommend exactly one destination, the first by rule order, in the last slot.
  assert.deepEqual(plan.primary.filter(key => destinationKeys.has(key)), [[...destinationKeys][0]]);
  assert.equal(plan.primary.indexOf([...destinationKeys][0]!), 2);
  assert.equal(plan.emphasis, null);
  // A word is not a passage to put anywhere: with actions of its own, the rules give it no destination.
  const wordChoice = (id: string): FragmentOfferChoice => ({ ...fragment(id, "understand"), granularities: ["word"] });
  const wordOffers = [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], [wordChoice("w1"), wordChoice("w2"), wordChoice("w3")]).action }, "query"), view(pages, "pages.ai")];
  const word = planContextualLayout({ focus: hand({ granularity: "word" }), candidates: contextualCandidates([...wordOffers, ...many], hand({ granularity: "word" })) });
  assert.equal(word.primary.length, 3);
  assert.equal(word.primary.some(key => word.candidates.find(item => item.key === key)?.origin === "intake"), false, "a word keeps its slots for its own actions");
  // A judgment that likes two destinations puts them in the slots, and they are listed with them.
  const [first, second] = [...destinationKeys];
  const judged = planContextualLayout({ focus: hand(), candidates, judgment: { basis: "jev", next: { [first!]: 0.5, [second!]: 0.3 }, intent: {}, surface: "none", surface_probability: null, speak_up: null, confidence: 0.7, latency_ms: 1 } });
  assert.deepEqual(judged.primary.slice(0, 2), [first, second]);
  assert.deepEqual(judged.candidates.filter(item => item.origin === "intake").map(item => item.key).sort(), judged.primary.filter(key => destinationKeys.has(key)).sort());
});

test("W4-1 §6.1: the rules pick their one destination by directory order alone, and a judgment leaves the rule out", () => {
  const fragment = (id: string): FragmentOfferChoice => ({ offer_id: id, title: id, intent: "understand", apply: "result", hint: id, action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"] });
  const offers = [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], ["a", "b", "c", "d"].map(fragment)).action }, "query"), view(pages, "pages.ai")];
  const entries = Array.from({ length: 3 }, (_, index) => view(todo, `notes.make${index}`, { intake: intake(`n${index}`) }));
  const pick = (directory: readonly ActionView[]) => {
    const candidates = contextualCandidates(directory, hand()), plan = planContextualLayout({ focus: hand(), candidates });
    return plan.primary.map(key => candidates.find(item => item.key === key)!).filter(item => item.origin === "intake").map(item => item.action.capability_id);
  };
  // Nothing in the rules tells one entry from another: the first in the shared directory takes the slot, whichever it is.
  assert.deepEqual(pick([...offers, ...entries]), ["notes.make0"]);
  assert.deepEqual(pick([...offers, ...entries].reverse()), ["notes.make2"]);
  // With a judgment the rule does not apply: the slots are what the judgment ranks, as before W4-1.
  const candidates = contextualCandidates([...offers, ...entries], hand());
  const own = candidates.filter(item => item.origin !== "intake").map(item => item.key);
  const judged = planContextualLayout({ focus: hand(), candidates, judgment: { basis: "jev", next: { [own[0]!]: 0.6, [own[1]!]: 0.5, [own[2]!]: 0.4 }, intent: {}, surface: "none", surface_probability: null, speak_up: null, confidence: 0.7, latency_ms: 1 } });
  assert.deepEqual(judged.primary, own.slice(0, 3));
});

/** W4-2 (context-program §21.10, decision D-1): an entry that always needs a card is for the judgment to name, never the rules' pick. */
const ownFragments = (count: number) => {
  const fragment = (id: string): FragmentOfferChoice => ({ offer_id: id, title: id, intent: "understand", apply: "result", hint: id, action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"] });
  return [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], ["a", "b", "c", "d"].slice(0, count).map(fragment)).action }, "query"), view(pages, "pages.ai")];
};
const proposing = view(todo, "goals.tree.submit", { intake: intake("breakdown", { effect: "proposes" }) });
const batching = view(todo, "notes.extract", { intake: intake("extract", { multiple: true }) });
const plain = (id: string) => view(todo, `notes.${id}`, { intake: intake(id) });
const pickedBy = (directory: readonly ActionView[], judgment?: Parameters<typeof planContextualLayout>[0]["judgment"]) => {
  const candidates = contextualCandidates(directory, hand()), plan = planContextualLayout({ focus: hand(), candidates, ...(judgment ? { judgment } : {}) });
  return { candidates, plan, destinations: plan.primary.map(key => candidates.find(item => item.key === key)!).filter(item => item.origin === "intake").map(item => item.action.capability_id) };
};

test("W4-2-01: with rules only, proposal-type and batch entries are skipped for the next entry in the directory", () => {
  const offers = ownFragments(4);
  const { candidates, destinations } = pickedBy([...offers, proposing, batching, plain("one"), plain("two")]);
  assert.deepEqual(destinations, ["notes.one"], "the first entry that can be made at once, not the ones before it");
  assert.deepEqual(pickedBy([...offers, plain("two"), plain("one"), proposing, batching]).destinations, ["notes.two"], "and by directory order among those");
  // The declaration is what marks it: nothing names a plugin, and an ordinary entry carries no mark.
  const marked = new Map(candidates.filter(item => item.origin === "intake").map(item => [item.action.capability_id, item.always_card === true]));
  assert.deepEqual([...marked], [["goals.tree.submit", true], ["notes.extract", true], ["notes.one", false], ["notes.two", false]]);
  // The judgment is still asked about them: skipping is the rules' choice only.
  assert.deepEqual(judgedCandidates(candidates, hand()).filter(item => item.origin === "intake").map(item => item.action.capability_id), ["goals.tree.submit", "notes.extract", "notes.one", "notes.two"]);
});

test("W4-2-01: a judgment that names a proposal-type entry puts it in a slot, and the rules' skip does not apply", () => {
  const directory = [...ownFragments(4), proposing, plain("one")];
  const proposalKey = contextualCandidates(directory, hand()).find(item => item.action.capability_id === "goals.tree.submit")!.key;
  const judgment = { basis: "jev" as const, next: { [proposalKey]: 0.7 }, intent: {}, surface: "none" as const, surface_probability: null, speak_up: null, confidence: 0.8, latency_ms: 1 };
  const { plan, destinations } = pickedBy(directory, judgment);
  assert.equal(plan.basis, "judgment");
  assert.equal(plan.primary[0], proposalKey);
  assert.ok(destinations.includes("goals.tree.submit"));
});

test("W4-2-02: when the directory holds only proposal-type and batch entries, the rules push no destination", () => {
  for (const [why, directory] of [["only a proposal", [proposing]], ["only a batch", [batching]], ["both", [proposing, batching]]] as const) {
    for (const own of [4, 1]) {
      const { plan, destinations } = pickedBy([...ownFragments(own), ...directory]);
      assert.deepEqual(destinations, [], `${why}, ${own} actions of its own`);
      // D-4: with no slot they wait under 更多 (W4-2-09), so they are listed, but none of them is pushed.
      assert.ok(plan.candidates.filter(item => item.origin === "intake").every(item => item.always_card === true && !plan.primary.includes(item.key)), `${why}: listed for 更多, in no slot`);
      assert.equal(plan.primary.length, Math.min(3, own), `${why}: the slots stay with the actions on the thing itself`);
    }
  }
  // Nothing of its own to show: no slot is taken by a destination that only ever comes back as a card.
  assert.deepEqual(pickedBy([proposing, batching]).plan.primary, []);
});

/** Five actions on the thing itself under five intents, so each outranks any destination: the destination the rules push has to take the last slot. */
const spreadFragments = () => {
  const intents = ["understand", "question", "expand", "organize", "rewrite"] as const;
  const choice = (intent: FragmentOfferChoice["intent"]): FragmentOfferChoice => ({ offer_id: intent, title: intent, intent, apply: "result", hint: intent, action: { capability_id: "pages.ai", version: 1 }, granularities: ["block"] });
  return [view(pages, "pages.fragment.offers", { ...defineFragmentOffersAction("pages.fragment.offers", ["shelf_item"], "t", [], intents.map(choice)).action }, "query"), view(pages, "pages.ai")];
};

/** W4-2 (context-program §21.10, decision D-4): an entry that always needs a card and has no slot waits under 更多, with or without a judgment. */
const verdict = (next: Record<string, number>) => ({ basis: "jev" as const, next, intent: {}, surface: "none" as const, surface_probability: null, speak_up: null, confidence: 0.8, latency_ms: 1 });
const capabilityOf = (candidates: readonly ContextualCandidate[], capability_id: string) => candidates.find(item => item.action.capability_id === capability_id)!;
/** The creation entries under 更多, as [the group's intent, capability id] in the order shown. */
const waiting = (plan: ReturnType<typeof planContextualLayout>, candidates: readonly ContextualCandidate[]) =>
  plan.more.flatMap(group => group.keys.map(key => [group.intent, candidates.find(item => item.key === key)!] as const))
    .filter(([, item]) => item.origin === "intake").map(([intent, item]) => [intent, item.action.capability_id]);

test("W4-2-09: with rules only, for a passage an entry that always needs a card has no slot and waits under 更多 by its intent", () => {
  const directory = [...ownFragments(4), proposing, batching, plain("one")];
  for (const focus of (["range", "block", "blocks"] as const).map(granularity => hand({ granularity }))) {
    const candidates = contextualCandidates(directory, focus), plan = planContextualLayout({ focus, candidates });
    assert.deepEqual(waiting(plan, candidates), [["capture", "goals.tree.submit"], ["capture", "notes.extract"]], `${focus.granularity}: in directory order, under their intent`);
    assert.equal(plan.primary.some(key => candidates.find(item => item.key === key)!.always_card === true), false, `${focus.granularity}: the rules give them no slot`);
    const keys = plan.more.flatMap(group => group.keys);
    assert.ok(keys.every(key => plan.candidates.some(item => item.key === key)), `${focus.granularity}: what is under 更多 can be chosen from the plan`);
    assert.equal(keys.includes(capabilityOf(candidates, "notes.one").key), false, `${focus.granularity}: an entry that can be made at once is still never under 更多`);
  }
  // The rules' one destination is still the first that can be made at once: the entries under 更多 do not move it.
  const spread = spreadFragments();
  const candidates = contextualCandidates([...spread, proposing, batching, plain("one")], hand()), plan = planContextualLayout({ focus: hand(), candidates });
  assert.equal(plan.primary[2], capabilityOf(candidates, "notes.one").key);
});

test("W4-2-09: with a judgment, an entry it does not name waits under 更多, and one it names takes a slot and leaves 更多", () => {
  const directory = [...ownFragments(4), proposing, plain("one")];
  const candidates = contextualCandidates(directory, hand());
  const proposal = capabilityOf(candidates, "goals.tree.submit").key, one = capabilityOf(candidates, "notes.one").key;
  const own = candidates.filter(item => item.origin !== "intake").map(item => item.key);
  const unnamed = planContextualLayout({ focus: hand(), candidates, judgment: verdict({ [own[0]!]: 0.6, [own[1]!]: 0.5, [own[2]!]: 0.4 }) });
  assert.equal(unnamed.basis, "judgment");
  assert.equal(unnamed.primary.includes(proposal), false);
  assert.deepEqual(waiting(unnamed, candidates), [["capture", "goals.tree.submit"]]);
  assert.equal(unnamed.candidates.some(item => item.key === proposal), true, "listed, so the bar can run it");
  assert.equal(unnamed.candidates.some(item => item.key === one) || unnamed.more.flatMap(group => group.keys).includes(one), false, "a destination the judgment did not name is not shown");
  const named = planContextualLayout({ focus: hand(), candidates, judgment: verdict({ [proposal]: 0.7 }) });
  assert.equal(named.primary[0], proposal);
  assert.deepEqual(waiting(named, candidates), [], "named, it has its slot and is not under 更多 as well");
});

/** Decision D-6: 更多 holds such an entry for a passage only; a word or whole objects never list one the judgment did not name. */
test("W4-2-09: for a word or whole objects, an entry that always needs a card is not under 更多 and not listed, with rules only or with a judgment that does not name it", () => {
  const directory = [...ownFragments(4), proposing, batching, plain("one"), plain("two"), plain("three")];
  for (const granularity of ["word", "objects", "object"] as const) {
    const focus = hand({ granularity }), candidates = contextualCandidates(directory, focus);
    assert.deepEqual(candidates.filter(item => item.always_card === true).map(item => item.action.capability_id), ["goals.tree.submit", "notes.extract"], `${granularity}: they are candidates, so the judgment is asked about them`);
    const rules = planContextualLayout({ focus, candidates });
    assert.deepEqual(waiting(rules, candidates), [], `${granularity}: not under 更多`);
    assert.equal(rules.candidates.some(item => item.always_card === true), false, `${granularity}: not listed`);
    assert.equal(rules.primary.some(key => candidates.find(item => item.key === key)!.always_card === true), false, `${granularity}: no slot`);
    // A judgment fills the slots by rank, so it names three: what it leaves out has no slot, and then it is not under 更多 and not listed.
    const named = ["one", "two", "three"].map(id => capabilityOf(candidates, `notes.${id}`).key);
    const judged = planContextualLayout({ focus, candidates, judgment: verdict({ [named[0]!]: 0.7, [named[1]!]: 0.6, [named[2]!]: 0.5 }) });
    assert.equal(judged.basis, "judgment");
    assert.deepEqual(judged.primary, named, `${granularity}: the slots are the judgment's`);
    assert.deepEqual(waiting(judged, candidates), [], `${granularity}: a judgment that does not name them leaves 更多 without them`);
    assert.equal(judged.candidates.some(item => item.always_card === true), false, `${granularity}: and does not list them`);
  }
});

test("W4-2-09: for a word or whole objects, a judgment that names an entry that always needs a card gives it a slot, and it is listed", () => {
  const directory = [...ownFragments(4), proposing, plain("one")];
  for (const granularity of ["word", "objects", "object"] as const) {
    const focus = hand({ granularity }), candidates = contextualCandidates(directory, focus), proposal = capabilityOf(candidates, "goals.tree.submit").key;
    const named = planContextualLayout({ focus, candidates, judgment: verdict({ [proposal]: 0.7 }) });
    assert.equal(named.primary[0], proposal, `${granularity}: named, it takes its slot`);
    assert.equal(named.candidates.some(item => item.key === proposal), true, `${granularity}: and can be run`);
    assert.deepEqual(waiting(named, candidates), [], `${granularity}: not under 更多 as well`);
  }
});

test("W4-2-09: an entry that always needs a card but is unavailable is listed with its reason and is not under 更多", () => {
  const directory = [...ownFragments(4), view(todo, "goals.tree.submit", { intake: intake("breakdown", { effect: "proposes" }) }, "command", false), plain("one")];
  const candidates = contextualCandidates(directory, hand()), plan = planContextualLayout({ focus: hand(), candidates });
  const off = capabilityOf(candidates, "goals.tree.submit");
  assert.deepEqual([off.available, off.reason], [false, "Todo 已停用"]);
  assert.deepEqual(waiting(plan, candidates), []);
  assert.equal(plan.candidates.some(item => item.key === off.key), true);
});

/** W4-2 (context-program §21.10, decision D-5): the rules' one destination is another plugin's, so the plugin the passage is in does not offer itself. */
test("W4-2-10: with rules only, the one destination pushed for a passage is another plugin's when there is one", () => {
  const entry = view(pages, "pages.create", { intake: intake("page") }), other = view(todo, "todo.items.create", { intake: intake("todo") });
  const inPages = hand({ plugin_id: "io.molis.work.pages" });
  const pushed = (directory: readonly ActionView[], focus: SurfaceFocus) => {
    const candidates = contextualCandidates(directory, focus), plan = planContextualLayout({ focus, candidates });
    return plan.primary.map(key => candidates.find(item => item.key === key)!).filter(item => item.origin === "intake").map(item => item.action.capability_id);
  };
  // Each case twice: with actions of its own that fill the slots (the destination is pushed into the last one), and with few of them (it ranks into a slot by itself).
  for (const [why, fragments] of [["pushed", spreadFragments()], ["ranked in", ownFragments(4)]] as const) {
    assert.deepEqual(pushed([...fragments, entry, other], inPages), ["todo.items.create"], `${why}: the document's own entry is first in the directory and still not the one recommended`);
    assert.deepEqual(pushed([...fragments, other, entry], inPages), ["todo.items.create"], why);
    assert.deepEqual(pushed([...fragments, entry, other], hand()), ["pages.create"], `${why}: from a plugin with no entry of its own, directory order decides as before`);
    assert.deepEqual(pushed([...fragments, entry], inPages), ["pages.create"], `${why}: with no other plugin's entry, its own is recommended`);
    assert.deepEqual(pushed([...fragments, entry, proposing], inPages), ["pages.create"], `${why}: another plugin's entry that always needs a card does not stand in for it`);
  }
  const spread = contextualCandidates([...spreadFragments(), entry, other], inPages), pushedPlan = planContextualLayout({ focus: inPages, candidates: spread });
  assert.equal(pushedPlan.primary[2], capabilityOf(spread, "todo.items.create").key, "pushed into the last slot");
  assert.equal(pushedPlan.candidates.some(item => item.key === capabilityOf(spread, "pages.create").key), false, "and its own entry is not offered at all");
  // A word is not a passage: the rule is about what the rules push for a passage, so its slots are not touched.
  const wordFocus = hand({ plugin_id: "io.molis.work.pages", granularity: "word" });
  const wordCandidates = contextualCandidates([entry, other], wordFocus), word = planContextualLayout({ focus: wordFocus, candidates: wordCandidates });
  assert.deepEqual(word.primary.map(key => wordCandidates.find(item => item.key === key)!.action.capability_id), ["pages.create", "todo.items.create"]);
  // The mark is the declaration's owner against the plugin the passage is in, and it goes with the candidate.
  const candidates = contextualCandidates([...ownFragments(4), entry, other], inPages);
  assert.deepEqual(candidates.filter(item => item.origin === "intake").map(item => [item.action.capability_id, item.own === true]), [["pages.create", true], ["todo.items.create", false]]);
  // A judgment can still name it: the entry stays available (D-2), only the rules' pick prefers elsewhere.
  const plan = planContextualLayout({ focus: inPages, candidates, judgment: verdict({ [capabilityOf(candidates, "pages.create").key]: 0.7 }) });
  assert.equal(plan.primary[0], capabilityOf(candidates, "pages.create").key);
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
