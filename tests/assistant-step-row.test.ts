// SLOT-02 (specs/context-program §21.9): a step in the Assistant's row only leads to a record already in the conversation
// and presses that record's own control, as the person would. The shipped row script runs here on a bare stand-in for the
// conversation: a record is keyed by `data-ix-record` (or a card's `data-card`), a control it lets a step press carries
// `data-ix-press`, and anything else only brings the record into view. SLOT-03: the row binds each such record with the
// island's `bindText` once per drawing, so its result buttons open as a reply's do. Public entries only (pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { CARD_RESULT_OPEN, cardOutcomeSteps } from "@molis-ai/molis-work-app-local-host";

interface Node_ { dataset: Record<string, string>; children: Node_[]; disabled: boolean; pressed: number; ixBase?: string; ix?: { read(): unknown };
  readonly firstChild: Node_ | null; click(): void; querySelector(selector: string): Node_ | null; querySelectorAll(selector: string): Node_[] }

/** `[data-<name>]`, `[data-<name>="<escaped value>"]` or `[type=submit]`, or a list of them: what the row's script asks. */
const matches = (node: Node_, selector: string): boolean => {
  if (!selector.includes('"') && selector.includes(",")) return selector.split(",").some((one) => matches(node, one));
  if (selector === "[type=submit]") return node.dataset.type === "submit";
  const match = selector.match(/^\[data-([a-z-]+)(?:="((?:\\.|[^"\\])*)")?\]$/);
  assert.ok(match, `a selector the stand-in reads: ${selector}`);
  const value = node.dataset[match[1]!.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase())];
  return match[2] === undefined ? value !== undefined : value === match[2].replace(/\\(.)/g, "$1");
};

/** An element of the conversation, found among its descendants as a browser would. */
const node = (dataset: Record<string, string>, children: Node_[] = [], extra: { disabled?: boolean; draft?: { base: unknown; now: unknown } } = {}): Node_ => {
  const all = (from: Node_): Node_[] => from.children.flatMap(child => [child, ...all(child)]);
  return { dataset, children, disabled: Boolean(extra.disabled), pressed: 0,
    ...(extra.draft ? { ixBase: JSON.stringify(extra.draft.base), ix: { read: () => extra.draft?.now } } : {}),
    get firstChild() { return this.children[0] ?? null; },
    click() { this.pressed += 1; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    querySelectorAll(selector) { return all(this).filter(one => matches(one, selector)); } };
};

/** The row as the island makes it: every step press goes to its id; what the row did comes back in `jumped`, `other`, `bound`. */
const row = (records: Node_[]) => {
  const jumped: Node_[] = [], other: string[] = [], bound: Node_[] = [];
  let onStep: ((index: number, button: { dataset: { ixStepId: string } }) => void) | null = null;
  const context = vm.createContext({ CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") } });
  const factory = vm.runInContext(`(${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})`, context) as (input: unknown) => { paint(): void };
  const made = factory({
    row: { hidden: false, querySelector: () => null, addEventListener: () => {} },
    thread: node({}, records),
    L: (text: string) => text, el: () => ({}),
    drawn: (_row: unknown, _html: string, handlers: { onStep: typeof onStep }) => { onStep = handlers.onStep; },
    jumpTo: (record: Node_) => { jumped.push(record); }, bindText: (record: Node_) => { bound.push(record); },
    view: () => ({ work: { work_id: "w1" }, next_html: "<steps>", next_all_html: "<steps>" }), open: () => true,
    take: () => {}, other: (id: string) => { other.push(id); },
  });
  made.paint();
  const go = (id: string) => { assert.ok(onStep, "the row draws its steps"); onStep(0, { dataset: { ixStepId: id } }); };
  return { go, jumped, other, bound, paint: () => made.paint() };
};

test("SLOT-02: a record's key alone only brings it into view; key and a name press the control it carries by that name", () => {
  const open = node({ ixPress: "open" }), copy = node({ ixPress: "copy" });
  const note = node({ ixRecord: "delivery:w1" }, [open, copy]);
  const { go, jumped } = row([note]);
  go("delivery:w1");
  assert.deepEqual([open.pressed, copy.pressed, jumped.length], [0, 0, 1], "the record itself: brought into view, nothing pressed");
  go("delivery:w1:open");
  assert.deepEqual([open.pressed, copy.pressed, jumped.length], [1, 0, 2], "its 「打开」, and the record is brought into view with it");
});

test("SLOT-02: a disabled control, unsent edits, or a name the record does not carry only bring the record into view", () => {
  const off = node({ ixPress: "undo" }, [], { disabled: true });
  const shown = row([node({ ixRecord: "delivery:w1" }, [off])]);
  shown.go("delivery:w1:undo");
  assert.deepEqual([off.pressed, shown.jumped.length], [0, 1], "disabled: the record says why on its own control");
  const undo = node({ ixPress: "undo" });
  const edited = row([node({ card: "c1" }, [undo], { draft: { base: { a: "1" }, now: { a: "2" } } })]);
  edited.go("card:c1:undo");
  assert.deepEqual([undo.pressed, edited.jumped.length], [0, 1], "a card with edits the person has not sent is never pressed for them");
  const unknown = row([node({ ixRecord: "delivery:w1" }, [node({ ixPress: "open" })])]);
  unknown.go("delivery:w1:delete");
  assert.deepEqual([unknown.jumped.length, unknown.other], [1, []], "a name the record does not carry");
});

test("SLOT-02: a card's result is keyed by the card; its run step still presses the card's run button", () => {
  const run = node({ ixAction: "run" }), undo = node({ ixPress: "undo" });
  const card = node({ card: "c1" }, [run, undo], { draft: { base: {}, now: {} } });
  const { go, jumped } = row([card]);
  go("card:c1:undo");
  assert.deepEqual([undo.pressed, run.pressed], [1, 0], "the result's own 撤销");
  go("card:c1:run");
  assert.deepEqual([undo.pressed, run.pressed, jumped.length], [1, 1, 2]);
});

test("AC-06-4: the step the Host gives for a card's result presses that result's own 「打开」, never the card's run", () => {
  const open = node({ ixPress: CARD_RESULT_OPEN }), run = node({ ixAction: "run" });
  const { go, jumped } = row([node({ card: "c1" }, [run, open], { draft: { base: {}, now: {} } })]);
  const [step] = cardOutcomeSteps([{ card_id: "c1", title: "新建待办", status: "done", missing: [], updated_at: "2026-10-13T01:05:00.000Z",
    presentation: { link: { label: "继续接入" } } }], "", text => text);
  assert.ok(step, "a card that ran and can be opened is a step");
  go(step.id);
  assert.deepEqual([open.pressed, run.pressed, jumped.length], [1, 0, 1], "pressed as the person would, the card brought into view");
});

test("SLOT-02: only a card's run step presses the run button; any other record's run presses the control named run", () => {
  const action = node({ ixAction: "run" }), named = node({ ixPress: "run" });
  const { go, jumped } = row([node({ ixRecord: "delivery:w1" }, [action, named])]);
  go("delivery:w1:run");
  assert.deepEqual([named.pressed, action.pressed, jumped.length], [1, 0, 1], "the record's own 「run」, not a card's run button");
});

test("SLOT-02: an option of a question is picked, then the question's own submit is pressed", () => {
  const other = node({ ixOption: "1" }), option = node({ ixOption: "1" }), submit = node({ type: "submit" });
  const { go } = row([node({ question: "p1" }, [node({ ixField: "q1" }, [other]), node({ ixField: "q0" }, [option]), submit])]);
  go("question:p1:q0:1");
  assert.deepEqual([option.pressed, other.pressed, submit.pressed], [1, 0, 1], "the option of that field, not the same value in another");
});

test("SLOT-02: a key never matches a longer one, a step with no record here goes to the island, and a name is escaped", () => {
  const open = node({ ixPress: "open" }), quoted = node({ ixPress: 'say "hi"' });
  const { go, jumped, other } = row([node({ ixRecord: "delivery:w1" }, [open, quoted])]);
  go("delivery:w10:open");
  go("open:page:a");
  assert.deepEqual([open.pressed, jumped.length, other], [0, 0, ["delivery:w10:open", "open:page:a"]]);
  go('delivery:w1:say "hi"');
  assert.deepEqual([quoted.pressed, jumped.length], [1, 1], "a name is matched as written, quotes and all");
});

test("SLOT-03: the row binds an outcome's record once per drawing and never binds a card", () => {
  const note = node({ ixRecord: "delivery:w1" }, [node({ assistantObject: "0", ixPress: "open:page:a" })]);
  const empty = node({ ixRecord: "delivery:w2" }), card = node({ card: "c1" }, [node({ ixPress: "undo" })]);
  const { paint, bound } = row([note, empty, card]);
  assert.deepEqual(bound, [note, empty], "drawn: each record bound once, the card not at all");
  paint(); paint();
  assert.deepEqual(bound, [note, empty], "a paint (a poll, a resize) does not bind the same drawing again");
  note.children = [node({ assistantObject: "1", ixPress: "open:page:b" })];
  paint();
  assert.deepEqual(bound, [note, empty, note], "redrawn whole by its owner: its new buttons are bound");
});
