// SLOT-02 (specs/context-program §21.9): a step in the Assistant's row only leads to a record already in the conversation
// and presses that record's own control, as the person would. The shipped row script runs here on a bare stand-in for the
// conversation: a record is keyed by `data-ix-record` (or a card's `data-card`), a control it lets a step press carries
// `data-ix-press`, and anything else only brings the record into view. Public entries only (pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";

interface Control { dataset: Record<string, string>; disabled: boolean; pressed: number; click(): void; closest(selector: string): unknown }
interface Entry { dataset: Record<string, string>; controls: Control[]; ixBase?: string; ix?: { read(): unknown }; querySelectorAll(selector: string): Control[]; querySelector(selector: string): Control | null }

const control = (dataset: Record<string, string>, extra: { disabled?: boolean; field?: string } = {}): Control => ({
  dataset, disabled: Boolean(extra.disabled), pressed: 0, click() { this.pressed += 1; },
  closest: (selector: string) => (selector === "[data-ix-field]" && extra.field ? { dataset: { ixField: extra.field } } : null),
});

/** A record in the conversation: matching is by the one attribute each selector names, as the row's script asks. */
const record = (dataset: Record<string, string>, controls: Control[], draft?: { base: unknown; now: unknown }): Entry => {
  const has = (one: Control, selector: string) => {
    if (selector === "[type=submit]") return one.dataset.type === "submit";
    const match = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
    const key = match?.[1]?.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase()) ?? "";
    return key in one.dataset && (match?.[2] === undefined || one.dataset[key] === match[2]);
  };
  return { dataset, controls,
    ...(draft ? { ixBase: JSON.stringify(draft.base), ix: { read: () => draft.now } } : {}),
    querySelectorAll: selector => controls.filter(one => has(one, selector)),
    querySelector: selector => controls.find(one => has(one, selector)) ?? null };
};

/** The row as the island makes it: every step press goes to its id; what the row did comes back in `jumped` and `other`. */
const row = (records: Entry[]) => {
  const jumped: Entry[] = [], other: string[] = [];
  let onStep: ((index: number, button: { dataset: { ixStepId: string } }) => void) | null = null;
  const context = vm.createContext({});
  const factory = vm.runInContext(`(${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})`, context) as (input: unknown) => { paint(): void };
  const made = factory({
    row: { hidden: false, querySelector: () => null, addEventListener: () => {} },
    thread: { querySelectorAll: () => records },
    L: (text: string) => text, el: () => ({}),
    drawn: (_row: unknown, _html: string, handlers: { onStep: typeof onStep }) => { onStep = handlers.onStep; },
    jumpTo: (node: Entry) => { jumped.push(node); },
    view: () => ({ work: { work_id: "w1" }, next_html: "<steps>", next_all_html: "<steps>" }), open: () => true,
    take: () => {}, other: (id: string) => { other.push(id); },
  });
  made.paint();
  const go = (id: string) => { assert.ok(onStep, "the row draws its steps"); onStep(0, { dataset: { ixStepId: id } }); };
  return { go, jumped, other };
};

test("SLOT-02: a record's key alone only brings it into view; key and a name press the control it carries by that name", () => {
  const open = control({ ixPress: "open" }), copy = control({ ixPress: "copy" });
  const note = record({ ixRecord: "delivery:w1" }, [open, copy]);
  const { go, jumped } = row([note]);
  go("delivery:w1");
  assert.deepEqual([open.pressed, copy.pressed, jumped.length], [0, 0, 1], "the record itself: brought into view, nothing pressed");
  go("delivery:w1:open");
  assert.deepEqual([open.pressed, copy.pressed, jumped.length], [1, 0, 2], "its 「打开」, and the record is brought into view with it");
});

test("SLOT-02: a disabled control, unsent edits, or a name the record does not carry only bring the record into view", () => {
  const off = control({ ixPress: "undo" }, { disabled: true });
  const shown = row([record({ ixRecord: "delivery:w1" }, [off])]);
  shown.go("delivery:w1:undo");
  assert.deepEqual([off.pressed, shown.jumped.length], [0, 1], "disabled: the record says why on its own control");
  const undo = control({ ixPress: "undo" });
  const edited = row([record({ card: "c1" }, [undo], { base: { a: "1" }, now: { a: "2" } })]);
  edited.go("card:c1:undo");
  assert.deepEqual([undo.pressed, edited.jumped.length], [0, 1], "a card with edits the person has not sent is never pressed for them");
  const unknown = row([record({ ixRecord: "delivery:w1" }, [control({ ixPress: "open" })])]);
  unknown.go("delivery:w1:delete");
  assert.deepEqual([unknown.jumped.length, unknown.other], [1, []], "a name the record does not carry");
});

test("SLOT-02: a card's result is keyed by the card; its run step still presses the card's run button", () => {
  const run = control({ ixAction: "run" }), undo = control({ ixPress: "undo" });
  const card = record({ card: "c1" }, [run, undo], { base: {}, now: {} });
  const { go, jumped } = row([card]);
  go("card:c1:undo");
  assert.deepEqual([undo.pressed, run.pressed], [1, 0], "the result's own 撤销");
  go("card:c1:run");
  assert.deepEqual([undo.pressed, run.pressed, jumped.length], [1, 1, 2]);
});

test("SLOT-02: an option of a question is picked, then the question's own submit is pressed", () => {
  const option = control({ ixOption: "1" }, { field: "q0" }), submit = control({ type: "submit" });
  const { go } = row([record({ question: "p1" }, [option, submit])]);
  go("question:p1:q0:1");
  assert.deepEqual([option.pressed, submit.pressed], [1, 1]);
});

test("SLOT-02: a key never matches a longer one, and a step with no record here goes to the island", () => {
  const open = control({ ixPress: "open" });
  const { go, jumped, other } = row([record({ ixRecord: "delivery:w1" }, [open])]);
  go("delivery:w10:open");
  go("open:page:a");
  assert.deepEqual([open.pressed, jumped.length, other], [0, 0, ["delivery:w10:open", "open:page:a"]]);
});
