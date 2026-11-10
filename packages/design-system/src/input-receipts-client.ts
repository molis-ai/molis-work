/// <reference lib="dom" />
import type { AgentStepBoard, AgentStepOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputModelClaim, AgentInputQuestion, AgentInputTreatment, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { RECEIPT_WORDS, type ReceiptWords } from "@molis-ai/molis-work-contracts/platform/ui";
import { compactScript } from "./compact-script.js";

function receiptKeys<Code extends string>(group: string, labels: Record<Code, string>): Record<Code, string> {
  return Object.fromEntries(Object.keys(labels).map(code => [code, `common.input-receipts.${group}.${code}`])) as Record<Code, string>;
}

/** The browser receipt and the Host delivery note read the same fixed words for the same ledger values. */
export const RECEIPT_TEXT_KEYS = {
  FACT: receiptKeys("fact", RECEIPT_WORDS.FACT), TREATMENT: receiptKeys("treatment", RECEIPT_WORDS.TREATMENT),
  KIND: receiptKeys("kind", RECEIPT_WORDS.KIND), IMPACT: receiptKeys("impact", RECEIPT_WORDS.IMPACT),
  TARGET: receiptKeys("target", RECEIPT_WORDS.TARGET), QUESTION: receiptKeys("question", RECEIPT_WORDS.QUESTION),
  STEP: receiptKeys("step", RECEIPT_WORDS.STEP), MARK: receiptKeys("mark", RECEIPT_WORDS.MARK),
} satisfies ReceiptWords;

/** What the receipt reads of a run-view turn (`AgentTurnView`) and its round: the round's run id and the questions it waits on. */
export interface InputReceiptTurn { turn_id: string; kind: string; text: string; steer?: AgentTurnSteer }
export interface InputReceiptRound { run_id?: string; awaiting_input?: readonly unknown[]; step_board?: InputReceiptBoard }
/**
 * What the receipt reads of the round's step board (`AgentStepBoard`): the reports on each step that name an input, and the
 * steps added for one (`origins`) with their title, state, whether a person added them and who holds them. Absent: not read.
 */
export interface InputReceiptBoard { nodes: readonly { state: AgentStepState; title?: string; inserted?: boolean; owner?: Pick<AgentStepOwner, "kind">; origins?: readonly { input_id: string }[]; reports: readonly { note: string; inputs?: readonly { input_id: string }[] }[] }[] }
type AgentStepState = AgentStepBoard["nodes"][number]["state"];
/** What the tray reads of an input waiting in the session for the next round (`AgentQueuedInput`). */
export interface InputReceiptQueued { input_id: string; text: string }
/**
 * What the page that sent a supplement lets the person do from its receipt (stage 3b-2a). Each resolves to the words the
 * page says once (or nothing), or throws with them; the page reads its round again afterwards.
 */
export interface InputReceiptActions {
  /** Takes it back before the model saw it (`agent.inputs.withdraw`). */
  withdraw(inputId: string): Promise<string | void>;
  /** Sends the person's words as a new supplement naming this one (`about`); the same `key` and words count once. */
  correct(about: string, text: string, key: string): Promise<string | void>;
}
export interface InputReceipts {
  /**
   * The receipt under one of the person's supplements, or the Host's mark on a note it wrote for them; null for anything
   * else. `owner` is the surface that draws it (the Assistant's thread, Coding's conversation): each keeps its own, so two
   * showing the same round do not pull one element back and forth. On one surface the same turn always gets the same
   * element back, changed in place, so an open detail stays open across repaints, and so does a correction being written in
   * it. Without `act` it only shows.
   */
  line(owner: Element, turn: InputReceiptTurn, round?: InputReceiptRound, act?: InputReceiptActions): HTMLElement | null;
  /**
   * 「N 条还没处理完」 (stage 3b-2b): what waits in the session for the next round, and what the latest round's ledger
   * leaves open, drawn from the receipts `owner` has drawn; null when nothing is open. `owner` is the surface that draws it,
   * the same as its receipts': each keeps its own element across repaints, so an open tray stays open. `queued` undefined: the
   * session's queue was not read this time (a round is live), so the tray says nothing about it, not that it is empty.
   */
  tray(owner: Element, queued: readonly InputReceiptQueued[] | undefined, round?: InputReceiptRound, act?: Pick<InputReceiptActions, "withdraw">): HTMLElement | null;
  /**
   * 「关于补充「…」」 (stage 3d-2): a button that opens the receipt `owner` drew for the input, focus on its summary; null
   * when it drew none (an earlier round not shown), so no button does nothing. `first` runs before (a dialog closing).
   * `kind` identifies whether it is about the input or a step originated from it (stage 3d-3).
   */
  link(owner: Element, inputId: string, first?: () => void, kind?: "about" | "origin"): HTMLElement | null;
  /** The words for a plan step's state, the same everywhere a step is shown (the receipt, Coding's plan card; stage 3d-4). */
  step(state: AgentStepState): string;
  /**
   * 「AI 记下的约定」 (§9.2, stage 3e-1): of the receipts `owner` has drawn, the supplements the AI says it takes as a constraint,
   * goal or acceptance condition, in the order sent; null when there are none. It is the AI's word, marked so, never shown as
   * in force. Each opens its receipt, where it is corrected. `runs` are the rounds the surface shows now (a surface may have
   * drawn another work's before), all it looks at, and it says so.
   */
  agreements(owner: Element, runs: readonly string[]): HTMLElement | null;
}

/**
 * One receipt for every conversation that takes supplements: Coding's bubble and the Assistant's thread
 * (specs/ai-input-receipts §3.3, §4.2, §4.3; stage 3c).
 *
 * Two layers, never mixed. The fact line says what the runtime's ledger says (`steer.state`: sent, in the context, read,
 * not read by the end of the round, taken back) and never that the model followed it. The model's own statement
 * (`model_claim`) is a second line marked 「AI 说」 with a dashed rule, and its detail sits under 「AI 自己说的，Molis 没有核对」:
 * it is a claim, it moves nothing. Questions asked about the input get their own line while one waits.
 *
 * The receipt is a disclosure (`details`): the summary is the lines, the body answers what it can from the ledger today (how
 * the AI says it handles it, what it points at, what it says it changes, the questions, and the ids behind each line).
 * Observed changes come with stage 3d. One polite status region per page says each change once, naming the supplement, and
 * never moves focus; the first paint says nothing, and the receipts themselves are `aria-live=off` so a surrounding log does
 * not say it twice.
 *
 * With the page's actions (§4.6, stage 3b-2a), the detail takes a supplement back while its round says no model has seen
 * it yet (`received`), and offers a correction to any it has not taken back: a few phrases fill an editable
 * sentence, and what is sent is the person's own words with `about` naming this input. Nothing is kept in Molis: the
 * original's 「你改为」 and the correction's 「纠正：针对」 are read from the corrections' `about` on the ledger.
 *
 * The tray of what is still open is `createInputTray`, made from these receipts' own pieces.
 */
export function createInputReceipts(readText: InputReceiptParts["readText"], tray: (parts: InputReceiptParts) => InputReceipts["tray"], correction: <E extends CorrectionEntry>(parts: InputReceiptParts, again: (entry: E) => void) => (entry: E) => void, words: ReceiptWords, board: typeof readBoard, agreements: typeof createAgreements): InputReceipts {
  const { FACT, TREATMENT, KIND, IMPACT, TARGET, QUESTION, STEP, MARK } = words;
  type Surface = { shown: Map<string, Shown>; byInput: Map<string, Shown>; fixes: Map<string, string[]> };
  type Shown = { at: Surface; root: HTMLDetailsElement; said: string; turn: InputReceiptTurn; round?: InputReceiptRound; act?: InputReceiptActions; form?: HTMLFormElement; problem?: string; fix?: { key: string; text: string } };
  // What each surface drew: its receipts, which one is each input's latest, and the corrections it has seen of each input.
  const surfaces = new WeakMap<Element, Surface>();
  let live: HTMLElement | null = null, pending: string[] = [];
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const say = (words: string) => {
    if (!pending.length) queueMicrotask(() => {
      if (!live?.isConnected) { live = make("p", "mw-sr-only"); live.setAttribute("role", "status"); document.body.append(live); }
      live.textContent = pending.join("；"); pending = [];
    });
    pending.push(words);
  };
  const row = (list: HTMLElement, term: string | undefined, value: string) => { list.append(make("dt", "", term ? readText(term) : ""), make("dd", "", value)); };
  const quote = (text: string) => text.length > 12 ? text.slice(0, 12) + "…" : text;
  const of = (at: Surface, inputId: string) => at.byInput.get(inputId);
  /** Both ends of a correction, as drawn on the same surface: the input this one corrects, and the latest one correcting it. */
  const ends = ({ at, turn }: Shown) => [of(at, turn.steer!.about ?? ""), of(at, at.fixes.get(turn.steer!.id)?.at(-1) ?? "")] as const;
  const button = (cls: string, text: string, click: () => void) => {
    const node = make("button", "mw-btn mw-btn--sm " + cls, text); node.type = "button"; node.addEventListener("click", click); return node;
  };
  const reveal = (entry: Shown | undefined) => { if (!entry) return; entry.root.open = true; entry.root.scrollIntoView({ block: "nearest" }); entry.root.querySelector("summary")?.focus(); };
  const treatment = (claim: AgentInputModelClaim) => readText(TREATMENT[claim.treatment]);
  const impacts = (claim: AgentInputModelClaim) => claim.impacts.map(one => readText(IMPACT[one])).join(readText("common.list.separator"));
  const claimLine = (claim: AgentInputModelClaim) => treatment(claim) + (claim.impacts.length ? readText("common.input-receipts.affects") + impacts(claim) : "");
  const asking = (questions: readonly AgentInputQuestion[]) => {
    const open = questions.filter(one => one.state === "open").length;
    return open ? readText("common.input-receipts.question-about-waits-answer") : questions.some(one => one.state === "unresolved") ? readText("common.input-receipts.question-about-was-never-answered") : "";
  };
  const word = (state: AgentStepState, mine?: boolean) => readText(mine && MARK[state] || STEP[state]), { cites, added } = board(readText, word);
  const body = (steer: AgentTurnSteer, cited: string[][], steps: string[]) => {
    const part = make("div", "mw-receipt__body"), facts = make("dl", "mw-receipt__facts"), claim = steer.model_claim, beside = Boolean(claim || cited.length);
    // Side by side with what the AI says, the facts say whose they are.
    part.append(make("p", "mw-receipt__note", readText("common.input-receipts.read-does-not-mean-followed-does-not-undo")), ...beside ? [make("p", "mw-receipt__who", readText("common.input-receipts.records"))] : [], facts);
    row(facts, "common.input-receipts.run-record", readText(FACT[steer.state]) + readText("common.input-receipts.input") + steer.id);
    for (const [index, question] of (steer.questions ?? []).entries()) row(facts, index ? undefined : "common.input-receipts.questions-about", readText(QUESTION[question.state]) + readText("common.input-receipts.question") + question.pending_id);
    for (const [index, line] of steps.entries()) row(facts, index ? undefined : "common.input-receipts.step-added", line);
    if (!beside) return part;
    const group = make("div", "mw-receipt__claimed"), said = make("dl", "");
    group.append(make("p", "mw-receipt__who", readText("common.input-receipts.what-ai-says-itself-molis-has-not-checked")), said);
    if (claim) {
      row(said, "common.input-receipts.handling", (claim.kind ? readText(KIND[claim.kind]) + " · " : "") + treatment(claim));
      if (claim.targets.length) row(said, "common.input-receipts.points", claim.targets.map(target => readText(TARGET[target.kind]) + " " + target.id).join(readText("common.list.separator")));
      if (claim.impacts.length) row(said, "common.input-receipts.says-changes", impacts(claim));
      if (claim.note) row(said, "common.input-receipts.ai-s-words", "“" + claim.note + "”");
      row(said, "common.input-receipts.provenance", (claim.revisions > 1 ? readText("common.input-receipts.stated") + claim.revisions + readText("common.input-receipts.times-latest-stands") : readText("common.input-receipts.stated-once")) + (claim.tool_call_id ? readText("common.input-receipts.tool-call") + claim.tool_call_id : ""));
    }
    // A step's report is the AI's words about the step, quoted like its own note: it says nothing took effect (D21).
    for (const [index, [step, note]] of cited.entries()) row(said, index ? undefined : "common.input-receipts.step-reports-naming", step + " " + "“" + note + "”");
    part.append(group);
    return part;
  };
  const acts = (entry: Shown, part: HTMLElement) => {
    const steer = entry.turn.steer!, act = entry.act;
    const [about, latest] = ends(entry);
    const links = make("div", "mw-receipt__acts");
    if (about) links.append(button("mw-btn--link", readText("common.input-receipts.see-original"), () => reveal(about)));
    if (latest) links.append(button("mw-btn--link", readText("common.input-receipts.see-correction"), () => reveal(latest)));
    if (act && steer.state !== "withdrawn") {
      // Only a round under way can give one back from its receipt; one left waiting in the session is the session's to give back.
      if (steer.state === "received") links.append(button("mw-btn--secondary", readText("common.input-receipts.withdraw"), () => withdraw(entry)));
      else if (steer.state !== "unread") part.append(make("p", "mw-receipt__note", readText("common.input-receipts.ai-has-seen-so-can-t-be-withdrawn")));
      if (!entry.form) links.append(button("mw-btn--ghost", readText("common.input-receipts.correct"), () => correct(entry)));
    }
    if (entry.problem) part.append(make("p", "mw-receipt__problem", entry.problem));
    if (links.childElementCount) part.append(links);
  };
  /** A withdraw from a receipt or the tray: its words are said once; a refusal is kept on `holder` and said. */
  const attempt = async (holder: { problem?: string }, work: () => Promise<string | void>) => {
    holder.problem = undefined;
    try { const words = await work(); if (words) say(words); }
    catch (error) { holder.problem = (error as Error).message; say(holder.problem); }
  };
  /** Draws `summary` and `part` in place of what `root` showed, keeping `form`; focus on what was redrawn moves to its new copy. */
  const redraw = (root: HTMLElement, summary: HTMLElement, part: HTMLElement, form?: HTMLElement) => {
    const focused = document.activeElement, kept = focused && root.contains(focused) && !form?.contains(focused) ? focused.textContent : null;
    for (const child of [...root.children]) if (child !== form) child.remove();
    root.prepend(summary, part);
    if (kept !== null) ([...part.querySelectorAll("button")].find(node => node.textContent === kept) ?? summary).focus();
  };
  const withdraw = async (entry: Shown) => {
    // The receipt's own fact line says 「已撤回」 once the round's record does; the page adds words only where it will not.
    await attempt(entry, () => entry.act!.withdraw(entry.turn.steer!.id));
    draw(entry, true);
  };
  const draw = (entry: Shown, force = false) => {
    const { turn, round, root } = entry, steer = turn.steer!;
    const waits = (round?.awaiting_input ?? []).length > 0 && (steer.state === "received" || steer.state === "applied");
    const fact = readText(waits ? "common.input-receipts.added-turn-question-still-waits-answer" : FACT[steer.state]);
    const claim = steer.model_claim ? claimLine(steer.model_claim) : "", ask = asking(steer.questions ?? []);
    const [about, fixed] = ends(entry), cited = cites(steer, round?.step_board), steps = added(steer, round?.step_board);
    const link = steer.about ? readText("common.input-receipts.corrects") + (about ? "「" + quote(about.turn.text) + "」" : readText("common.input-receipts.earlier-one")) : fixed ? readText("common.input-receipts.changed") + quote(fixed.turn.text) + "」" : "";
    const key = JSON.stringify([fact, claim, ask, steer, link, Boolean(entry.act), cited, steps]), before = entry.said ? JSON.parse(entry.said) as string[] : null;
    if (!force && entry.said === key) return;
    const summary = make("summary", ""), head = make("span", "mw-receipt__fact", fact), part = body(steer, cited, steps);
    summary.append(head);
    if (claim) { const line = make("span", "mw-receipt__claim"); line.append(make("b", "", readText("common.input-receipts.ai-says")), claim); summary.append(line); }
    if (ask) summary.append(make("span", "mw-receipt__ask", ask));
    if (link) summary.append(make("span", "mw-receipt__link", link));
    acts(entry, part);
    root.dataset.state = waits ? "waiting" : steer.state; root.setAttribute("aria-live", "off");
    // A correction being written stays where it is, focus and words untouched: only what comes before it is drawn again,
    // and focus on what was redrawn moves to its new copy rather than falling back to the page.
    redraw(root, summary, part, entry.form);
    if (before) {
      const words = quote(turn.text);
      if (before[0] !== fact) say(readText("common.input-receipts.supplement") + words + "」：" + fact);
      if (claim && before[1] !== claim) say(readText("common.input-receipts.ai-says-supplement") + words + "」：" + claim);
      if (ask && before[2] !== ask) say(ask);
    }
    entry.said = key;
  };
  /** The latest drawing of each input on the surface `owner`, each with a way to open it (the tray's items). It opens the
   * latest drawing at the click: a list kept because it reads the same still opens a supplement carried into a later round. */
  const latest = (owner: Element) => {
    const at = surfaces.get(owner);
    return at ? [...at.byInput.values()].map(entry => ({ turn: entry.turn, round: entry.round, open: () => reveal(of(at, entry.turn.steer!.id)) })) : [];
  };
  // What the tray and the correction form share of the receipts.
  const parts = { readText, say, make, button, quote, latest, attempt, redraw, treatment }, correct = correction<Shown>(parts, entry => draw(entry, true));
  return {
    tray: tray(parts),
    agreements: agreements(parts, words),
    step: word,
    link(owner, inputId, first, kind = "about") {
      const at = surfaces.get(owner), entry = at && of(at, inputId);
      const key = kind === "origin" ? "common.input-receipts.link-origin" : "common.input-receipts.link-about";
      return entry ? button("mw-btn--link", readText(key, { text: quote(entry.turn.text) }), () => { first?.(); reveal(entry); }) : null;
    },
    line(owner, turn, round, act) {
      const steer = turn.steer;
      if (!steer) return null;
      if (turn.kind === "notice") return make("small", "mw-receipt mw-receipt--host", readText("common.input-receipts.note-molis-not-words"));
      if (turn.kind !== "user") return null;
      // Known by its round and input id: a turn id only counts within one round, the page draws every round, and a supplement
      // a round did not read is carried into the next under the same input id (decision D28).
      const at = surfaces.get(owner) ?? surfaces.set(owner, { shown: new Map(), byInput: new Map(), fixes: new Map() }).get(owner)!;
      const id = round?.run_id + " " + steer.id, entry = at.shown.get(id) ?? { at, root: make("details", "mw-receipt"), said: "", turn };
      Object.assign(entry, { turn, round, act }); at.shown.set(id, entry); at.byInput.set(steer.id, entry);
      const list = steer.about ? at.fixes.get(steer.about) ?? [] : [];
      // A correction seen for the first time changes its original's receipt too: each surface that draws it redraws its own copy.
      if (steer.about && !list.includes(steer.id)) { at.fixes.set(steer.about, [...list, steer.id]); const original = of(at, steer.about); draw(entry); if (original) draw(original); }
      else draw(entry);
      return entry.root;
    },
  };
}

/** The receipt a correction is written in: its element, its supplement and actions, the open form, the key of words sent. */
export interface CorrectionEntry { root: HTMLDetailsElement; turn: InputReceiptTurn; act?: InputReceiptActions; form?: HTMLFormElement; fix?: { key: string; text: string } }

/**
 * 「更正…」 (stage 3b-2a): a form in the receipt whose choices fill in a sentence the person can change; what is sent is
 * their words naming this supplement (`about`), under one key until it arrives. Esc or 取消 closes it, focus back on 「更正…」.
 */
export function createCorrection<E extends CorrectionEntry>({ readText, say, make, button, quote, treatment }: InputReceiptParts, again: (entry: E) => void): (entry: E) => void {
  return (entry: E) => {
    const steer = entry.turn.steer!, claim = steer.model_claim;
    const form = entry.form = make("form", "mw-receipt__body"), area = make("textarea", "mw-textarea"), status = make("p", "mw-receipt__note");
    const phrases = [claim ? readText("common.input-receipts.not") + treatment(claim) + readText("common.input-receipts.but") : readText("common.input-receipts.not-what-i-meant-instead"), readText("common.input-receipts.about"), readText("common.input-receipts.one-more-thing")];
    const choices = make("div", "mw-receipt__acts"), send = make("button", "mw-btn mw-btn--sm mw-btn--primary", readText("common.input-receipts.send-correction"));
    for (const phrase of phrases) choices.append(button("mw-btn--secondary", phrase, () => {
      area.value = !area.value.trim() || phrases.includes(area.value) ? phrase : area.value + "\n" + phrase; area.focus(); area.selectionStart = area.value.length;
    }));
    const close = () => { entry.form = undefined; form.remove(); again(entry); entry.root.querySelector<HTMLElement>(".mw-receipt__acts .mw-btn--ghost")?.focus(); };
    const done = make("div", "mw-receipt__acts");
    done.append(send, button("mw-btn--ghost", readText("common.control.cancel"), close));
    area.setAttribute("aria-label", readText("common.input-receipts.correct-2") + quote(entry.turn.text) + "」");
    status.setAttribute("role", "status"); status.hidden = true;
    form.append(make("p", "mw-receipt__note", readText("common.input-receipts.correction-goes-out-new-supplement-that-points-one")), choices, area, status, done);
    form.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const text = area.value.trim();
      const tell = (words: string, problem = false) => { status.textContent = words; status.hidden = false; status.className = problem ? "mw-receipt__problem" : "mw-receipt__note"; };
      if (!text || phrases.includes(area.value)) { tell(readText("common.input-receipts.write-what-should-change"), true); return; }
      // The same words sent again after a lost answer keep their key, so the runtime counts them once (§7).
      if (entry.fix?.text !== text) entry.fix = { key: crypto.randomUUID(), text };
      send.disabled = true; tell(readText("common.input-receipts.sending"));
      try { const words = await entry.act!.correct(steer.id, text, entry.fix.key); entry.fix = undefined; say(words || readText("common.input-receipts.correction-sent")); close(); }
      catch (error) { tell((error as Error).message, true); send.disabled = false; }
    });
    again(entry);
    entry.root.open = true; entry.root.append(form); area.focus();
  };
}

/** What the tray and the correction form borrow from the receipts: the same small helpers, and the latest drawing of each input with a way to open it. */
export interface InputReceiptParts {
  /** The page's translate; `vars` fill the sentence's `{name}` placeholders after it is translated. */
  readText(text: string, vars?: Record<string, string | number>): string;
  say(words: string): void;
  make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K];
  button(cls: string, text: string, click: () => void): HTMLButtonElement;
  quote(text: string): string;
  latest(owner: Element): Array<{ turn: InputReceiptTurn; round?: InputReceiptRound; open(): void }>;
  attempt(holder: { problem?: string }, work: () => Promise<string | void>): Promise<void>;
  redraw(root: HTMLElement, summary: HTMLElement, part: HTMLElement): void;
  treatment(claim: AgentInputModelClaim): string;
}

/**
 * 「N 条还没处理完」 (§4.4, D37, D38; stage 3b-2b), for Coding and the Assistant alike. It lists only what the ledger has:
 * what waits in the session for the next round, which can be taken back one by one before it starts; and from the latest
 * round, what the AI read with no word on how it handles it, what it says it does not adopt yet or needs you to clarify
 * (its own words, marked so), and what a question asked about it still waits on. Each item opens its receipt; its count is
 * said once when it changes, never on the first paint.
 */
export function createInputTray({ readText, say, make, button, quote, latest, attempt, redraw }: InputReceiptParts): InputReceipts["tray"] {
  const GROUPS = ["common.input-receipts.waiting-next-turn-takes-them", "common.input-receipts.read-ai-no-word-how-handles-them", "common.input-receipts.ai-says-does-not-adopt-them-yet-needs", "common.input-receipts.question-about-them-still-waits-answer"];
  // One tray per surface that draws it, so a Coding page and the Assistant beside it showing the same round each keep their own.
  type Tray = { root: HTMLDetailsElement; said: string; run?: string; count?: number; problem?: string };
  const trays = new WeakMap<Element, Tray>();
  const open = (owner: Element, queued: readonly InputReceiptQueued[], round?: InputReceiptRound) => {
    const drawn = latest(owner), groups: { text: string; id: string; open?: () => void; queued?: boolean }[][] = GROUPS.map(() => []);
    for (const one of queued) groups[0]!.push({ text: one.text, id: one.input_id, open: drawn.find(item => item.turn.steer!.id === one.input_id)?.open, queued: true });
    for (const { turn, round: of, open: show } of drawn) {
      const steer = turn.steer!, claim = steer.model_claim;
      // Only the latest round; one waiting in the session is listed with the queue.
      if (of?.run_id !== round?.run_id || queued.some(one => one.input_id === steer.id)) continue;
      const at = (steer.questions ?? []).some(one => one.state === "open" || one.state === "unresolved") ? 3
        : claim && (claim.treatment === "not-adopted" || claim.treatment === "needs-clarification") ? 2 : steer.state === "read" && !claim ? 1 : -1;
      if (at >= 0) groups[at]!.push({ text: turn.text, id: steer.id, open: show });
    }
    return groups;
  };
  const take = async (tray: Tray, inputId: string, act: Pick<InputReceiptActions, "withdraw">) => {
    await attempt(tray, async () => (await act.withdraw(inputId)) || readText("common.input-receipts.withdrawn"));
    tray.said = "";
  };
  return (owner, queued, round, act) => {
    let tray = trays.get(owner);
    // A new round starts afresh (the same element), so its first count is not a change in the last one's.
    if (!tray || tray.run !== round?.run_id) trays.set(owner, tray = { root: tray?.root ?? make("details", "mw-receipt mw-tray"), said: "", run: round?.run_id });
    const { root } = tray;
    const groups = open(owner, queued ?? [], round), total = groups.flat().length;
    // With the queue unread, none open in the round is not none open at all.
    if (tray.count !== undefined && tray.count !== total && (total || queued)) say(total ? total + readText("common.input-receipts.still-open") : readText("common.input-receipts.nothing-still-open"));
    tray.count = total;
    if (!total) { tray.said = ""; return null; }
    const key = JSON.stringify([groups.map(group => group.map(item => [item.id, item.text, Boolean(item.open)])), tray.problem, Boolean(act)]);
    if (tray.said === key) return root;
    const summary = make("summary", ""), part = make("div", "mw-receipt__body");
    summary.append(make("span", "mw-receipt__fact", total + readText("common.input-receipts.still-open")));
    for (const [index, group] of groups.entries()) {
      if (!group.length) continue;
      const list = make("ul", "mw-tray__list");
      list.setAttribute("aria-label", readText(GROUPS[index]!));
      for (const item of group) {
        const li = make("li", "mw-receipt__acts");
        // An item with a receipt opens it; one that only waits in the session has nothing to open, so taking it back is its button.
        li.append(item.open ? button("mw-btn--link", quote(item.text), item.open) : make("span", "", quote(item.text)));
        if (item.queued && act) li.append(button("mw-btn--secondary", readText("common.input-receipts.withdraw"), () => void take(tray, item.id, act)));
        list.append(li);
      }
      part.append(make("p", "mw-receipt__who", readText(GROUPS[index]!)), list);
    }
    if (groups[2]!.length) part.append(make("p", "mw-receipt__note", readText("common.input-receipts.what-ai-says-itself-molis-has-not-checked")));
    if (tray.problem) part.append(make("p", "mw-receipt__problem", tray.problem));
    redraw(root, summary, part);
    tray.said = key;
    return root;
  };
}

/**
 * 「AI 记下的约定」 (§9.2, stage 3e-1, for the Assistant first): what the AI says it took as a constraint (by its kind or what it
 * says it changes), a goal or an acceptance condition, from each input's latest receipt on the surface, unless the input was
 * taken back or the AI says it does not adopt it, answered it, or needs it clarified. Nothing here is checked: the line is
 * the dashed 「AI 说」 of the receipt, with no mark of taking effect. A later supplement naming it (`about`, the person's
 * own link on the ledger) is said beside it. Changing one is a correction from its receipt; the list keeps nothing.
 */
export function createAgreements({ readText, make, button, latest }: InputReceiptParts, { IMPACT }: ReceiptWords): InputReceipts["agreements"] {
  const KEPT = ["constraint", "objective", "acceptance"] as const, OUT: readonly AgentInputTreatment[] = ["not-adopted", "answered", "needs-clarification"];
  return (owner, runs) => {
    const drawn = latest(owner).filter(one => runs.includes(one.round?.run_id ?? "")), list = make("ul", "mw-tray__list");
    for (const { turn, open } of drawn) {
      const steer = turn.steer!, claim = steer.model_claim;
      if (!claim || steer.state === "withdrawn" || OUT.includes(claim.treatment)) continue;
      const as = KEPT.filter(one => claim.impacts.includes(one) || (one === "constraint" && claim.kind === "constraint"));
      if (!as.length) continue;
      const item = make("li", ""), said = make("p", "mw-receipt__claim");
      said.append(make("b", "", readText("common.input-receipts.ai-says")), readText("common.input-receipts.taken") + as.map(one => readText(IMPACT[one])).join(readText("common.list.separator")));
      item.append(button("mw-btn--link", turn.text, open), said);
      if (drawn.some(other => other.turn.steer!.about === steer.id)) item.append(make("p", "mw-receipt__link", readText("common.input-receipts.later-correction-points")));
      list.append(item);
    }
    if (!list.childElementCount) return null;
    const part = make("div", "mw-receipt mw-receipt__body");
    // Whole sentences, each translated as one: the count has its own for one round, which English does not say as 「rounds」.
    const seen = runs.length === 1 ? readText("common.input-receipts.only-latest-turn-was-read") : readText("common.input-receipts.only-latest-n-n-read", { n: runs.length });
    part.append(list, make("p", "mw-receipt__note", readText("common.input-receipts.what-ai-says-itself-molis-has-not-checked-2", { seen })));
    return part;
  };
}

/**
 * What a receipt reads of the round's step board, made in the page with the receipt's own translate and step words. Its
 * comments are `//` lines, which `compactScript` drops: a page that inlines the program unminified (the arrival chooser) would
 * carry a doc comment.
 */
function readBoard(readText: (text: string) => string, word: (state: AgentStepState, mine?: boolean) => string) {
  // Each step's key on the plan card (S1, S2…, 插入).
  const step = (node: InputReceiptBoard["nodes"][number], index: number) => node.inserted ? readText("common.input-receipts.inserted") : "S" + (index + 1);
  // The reports on the round's board that name this input, each under its step's key.
  const cites = (steer: AgentTurnSteer, board?: InputReceiptBoard) => (board?.nodes ?? []).flatMap((node, index) =>
    node.reports.filter(report => report.inputs?.some(one => one.input_id === steer.id)).map(report => [step(node, index), report.note]));
  // The steps the board says were added for this input (stage 3d-4, D21): only what the board records, its key and title,
  // that a person added it, and its state now, said as whoever holds it ended it. Not when it was added or at which version:
  // the board does not keep those.
  const added = (steer: AgentTurnSteer, board?: InputReceiptBoard) => (board?.nodes ?? []).flatMap((node, index) =>
    node.origins?.some(one => one.input_id === steer.id) ? [step(node, index) + (node.title ? "「" + node.title + "」" : "") + (node.inserted ? readText("common.input-receipts.added") : "") + readText("common.input-receipts.now") + word(node.state, node.owner?.kind === "person")] : []);
  return { cites, added };
}

/** The page program: `(translate) => InputReceipts`. The workbench makes one and hands it to the Assistant and every plugin (`host.receipts`). */
export const INPUT_RECEIPTS_CLIENT_SCRIPT = compactScript("(readText) => (" + createInputReceipts.toString() + ")(readText, " + createInputTray.toString() + ", " + createCorrection.toString() + ", " + JSON.stringify(RECEIPT_TEXT_KEYS) + ", " + readBoard.toString() + ", " + createAgreements.toString() + ")");

/** The receipt's words in English (served through the workbench catalog, `apps/workbench/src/i18n/en.ts`). */
