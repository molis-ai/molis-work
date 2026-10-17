/// <reference lib="dom" />
import type { AgentInputImpact, AgentInputKind, AgentInputModelClaim, AgentInputQuestion, AgentInputTarget, AgentInputTreatment, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { compactScript } from "./compact-script.js";

/** What the receipt reads of a run-view turn (`AgentTurnView`) and its round: the round's run id and the questions it waits on. */
export interface InputReceiptTurn { turn_id: string; kind: string; text: string; steer?: AgentTurnSteer }
export interface InputReceiptRound { run_id?: string; awaiting_input?: readonly unknown[] }
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
   * else. The same turn always gets the same element back, changed in place, so an open detail stays open across repaints,
   * and so does a correction being written in it. Without `act` it only shows.
   */
  line(turn: InputReceiptTurn, round?: InputReceiptRound, act?: InputReceiptActions): HTMLElement | null;
  /**
   * 「N 条还没处理完」 (stage 3b-2b): what waits in the session for the next round, and what the latest round's ledger
   * leaves open, drawn from the receipts the page has drawn; null when nothing is open. The same element comes back
   * across repaints, so an open tray stays open. `queued` undefined: the session's queue was not read this time (a round
   * is live), so the tray says nothing about it, not that it is empty.
   */
  tray(queued: readonly InputReceiptQueued[] | undefined, round?: InputReceiptRound, act?: Pick<InputReceiptActions, "withdraw">): HTMLElement | null;
}

/**
 * The words for the values on the ledger and in the model's statement, one table for every place that says them: the receipt
 * (handed to the page program with it) and Coding's report (BL-158). Each set is the contract's closed set, read as it is.
 */
export const RECEIPT_WORDS = {
  FACT: { received: "已送达", applied: "已放进上下文，等 AI 回应", read: "AI 已读到", unread: "这一轮结束时 AI 没读到，留给下一轮", withdrawn: "已撤回" },
  TREATMENT: { "apply-now": "立即影响当前这一步", "later-step": "留到后面某一步", "new-task": "作为新任务", "needs-clarification": "需要你澄清", "not-adopted": "暂不采纳", answered: "已在回复里回答", noted: "记下，不改变执行", merged: "与另一条一起处理" },
  KIND: { supplement: "补充", correction: "纠正", constraint: "约束", request: "新需求", question: "提问" },
  IMPACT: { objective: "目标", scope: "范围", priority: "优先级", approach: "实现方案", acceptance: "验收条件", outputs: "已有成果", constraint: "约束" },
  TARGET: { input: "另一条补充", "app-ref": "应用里的对象", todo: "这一轮的待办", pending: "一个问题", "board-node": "计划的一步" },
  QUESTION: { open: "等你回答", settled: "已回答", expired: "已过期", cancelled: "已取消", unresolved: "这一轮结束时还没回答" },
} satisfies {
  FACT: Record<AgentTurnSteer["state"], string>; TREATMENT: Record<AgentInputTreatment, string>; KIND: Record<AgentInputKind, string>;
  IMPACT: Record<AgentInputImpact, string>; TARGET: Record<AgentInputTarget["kind"], string>; QUESTION: Record<AgentInputQuestion["state"], string>;
};

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
export function createInputReceipts(L: (text: string) => string, tray: (parts: InputTrayParts) => InputReceipts["tray"], words: typeof RECEIPT_WORDS): InputReceipts {
  const { FACT, TREATMENT, KIND, IMPACT, TARGET, QUESTION } = words;
  type Shown = { root: HTMLDetailsElement; said: string; turn: InputReceiptTurn; round?: InputReceiptRound; act?: InputReceiptActions; form?: HTMLFormElement; problem?: string; fix?: { key: string; text: string } };
  const shown = new Map<string, Shown>(), byInput = new Map<string, string>(), fixes = new Map<string, string[]>();
  let live: HTMLElement | null = null, pending: string[] = [];
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const say = (words: string) => {
    if (!pending.length) queueMicrotask(() => {
      if (!live?.isConnected) { live = make("p", "mw-sr-only"); live.setAttribute("role", "status"); document.body.append(live); }
      live.textContent = pending.join(L("；")); pending = [];
    });
    pending.push(words);
  };
  const row = (list: HTMLElement, term: string, value: string) => { list.append(make("dt", "", L(term)), make("dd", "", value)); };
  const quote = (text: string) => text.length > 12 ? text.slice(0, 12) + "…" : text;
  const of = (inputId: string) => shown.get(byInput.get(inputId) ?? "");
  const button = (cls: string, text: string, click: () => void) => {
    const node = make("button", "mw-btn mw-btn--sm " + cls, text); node.type = "button"; node.addEventListener("click", click); return node;
  };
  const reveal = (entry: Shown | undefined) => { if (!entry) return; entry.root.open = true; entry.root.scrollIntoView({ block: "nearest" }); entry.root.querySelector("summary")?.focus(); };
  const treatment = (claim: AgentInputModelClaim) => L(TREATMENT[claim.treatment]);
  const impacts = (claim: AgentInputModelClaim) => claim.impacts.map(one => L(IMPACT[one])).join(L("、"));
  const claimLine = (claim: AgentInputModelClaim) => treatment(claim) + (claim.impacts.length ? L(" · 影响") + impacts(claim) : "");
  const asking = (questions: readonly AgentInputQuestion[]) => {
    const open = questions.filter(one => one.state === "open").length;
    return open ? L("为这条问了你问题，等你回答") : questions.some(one => one.state === "unresolved") ? L("为这条问的问题没等到回答") : "";
  };
  const body = (steer: AgentTurnSteer) => {
    const part = make("div", "mw-receipt__body"), facts = make("dl", "mw-receipt__facts");
    part.append(make("p", "mw-receipt__note", L("读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。")), facts);
    row(facts, "运行记录", L(FACT[steer.state]) + L(" · 输入 ") + steer.id);
    for (const [index, question] of (steer.questions ?? []).entries()) row(facts, index ? "" : "为它问的问题", L(QUESTION[question.state]) + L(" · 问题 ") + question.pending_id);
    const claim = steer.model_claim;
    if (!claim) return part;
    const group = make("div", "mw-receipt__claimed"), said = make("dl", "");
    group.append(make("p", "mw-receipt__who", L("AI 自己说的，Molis 没有核对")), said);
    row(said, "怎么处理", (claim.kind ? L(KIND[claim.kind]) + L(" · ") : "") + treatment(claim));
    if (claim.targets.length) row(said, "指向", claim.targets.map(target => L(TARGET[target.kind]) + " " + target.id).join(L("、")));
    if (claim.impacts.length) row(said, "说会改变", impacts(claim));
    if (claim.note) row(said, "AI 的原话", L("“") + claim.note + L("”"));
    row(said, "出处", (claim.revisions > 1 ? L("说明过 ") + claim.revisions + L(" 次，以最新一次为准") : L("说明过 1 次")) + (claim.tool_call_id ? L(" · 工具调用 ") + claim.tool_call_id : ""));
    part.append(group);
    return part;
  };
  const acts = (entry: Shown, part: HTMLElement) => {
    const steer = entry.turn.steer!, act = entry.act;
    const about = steer.about ? of(steer.about) : undefined, latest = of((fixes.get(steer.id) ?? []).at(-1) ?? "");
    const links = make("div", "mw-receipt__acts");
    if (about) links.append(button("mw-btn--link", L("看原来那条"), () => reveal(about)));
    if (latest) links.append(button("mw-btn--link", L("看更正"), () => reveal(latest)));
    if (act && steer.state !== "withdrawn") {
      // Only a round under way can give one back from its receipt; one left waiting in the session is the session's to give back.
      if (steer.state === "received") links.append(button("mw-btn--secondary", L("撤回"), () => withdraw(entry)));
      else if (steer.state !== "unread") part.append(make("p", "mw-receipt__note", L("AI 已看到，不能撤回；要改口就发更正。")));
      if (!entry.form) links.append(button("mw-btn--ghost", L("更正…"), () => correct(entry)));
    }
    if (entry.problem) part.append(make("p", "mw-receipt__problem", entry.problem));
    if (links.childElementCount) part.append(links);
  };
  const withdraw = async (entry: Shown) => {
    entry.problem = undefined;
    // The receipt's own fact line says 「已撤回」 once the round's record does; the page adds words only where it will not.
    try { const words = await entry.act!.withdraw(entry.turn.steer!.id); if (words) say(words); }
    catch (error) { entry.problem = (error as Error).message; say(entry.problem); }
    draw(entry, true);
  };
  const correct = (entry: Shown) => {
    const steer = entry.turn.steer!, claim = steer.model_claim;
    const form = entry.form = make("form", "mw-receipt__body"), area = make("textarea", "mw-textarea"), status = make("p", "mw-receipt__note");
    const phrases = [claim ? L("不是「") + treatment(claim) + L("」，而是：") : L("不是这个意思，而是："), L("这条针对的是："), L("补充一句：")];
    const choices = make("div", "mw-receipt__acts"), send = make("button", "mw-btn mw-btn--sm mw-btn--primary", L("发送更正"));
    for (const phrase of phrases) choices.append(button("mw-btn--secondary", phrase, () => {
      area.value = !area.value.trim() || phrases.includes(area.value) ? phrase : area.value + "\n" + phrase; area.focus(); area.selectionStart = area.value.length;
    }));
    const close = () => { entry.form = undefined; form.remove(); draw(entry, true); entry.root.querySelector<HTMLElement>(".mw-receipt__acts .mw-btn--ghost")?.focus(); };
    const done = make("div", "mw-receipt__acts");
    done.append(send, button("mw-btn--ghost", L("取消"), close));
    area.setAttribute("aria-label", L("更正「") + quote(entry.turn.text) + L("」"));
    status.setAttribute("role", "status"); status.hidden = true;
    form.append(make("p", "mw-receipt__note", L("更正会作为一条新补充发出，指向这条。")), choices, area, status, done);
    form.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const text = area.value.trim();
      const tell = (words: string, problem = false) => { status.textContent = words; status.hidden = false; status.className = problem ? "mw-receipt__problem" : "mw-receipt__note"; };
      if (!text || phrases.includes(area.value)) { tell(L("写上要改成什么"), true); return; }
      // The same words sent again after a lost answer keep their key, so the runtime counts them once (§7).
      if (entry.fix?.text !== text) entry.fix = { key: crypto.randomUUID(), text };
      send.disabled = true; tell(L("发送中…"));
      try { const words = await entry.act!.correct(steer.id, text, entry.fix.key); entry.fix = undefined; say(words || L("更正已发出")); close(); }
      catch (error) { tell((error as Error).message, true); send.disabled = false; }
    });
    draw(entry, true);
    entry.root.open = true; entry.root.append(form); area.focus();
  };
  const draw = (entry: Shown, force = false) => {
    const { turn, round, root } = entry, steer = turn.steer!;
    const waits = (round?.awaiting_input ?? []).length > 0 && (steer.state === "received" || steer.state === "applied");
    const fact = L(waits ? "已补充到这一轮；问题仍在等你回答" : FACT[steer.state]);
    const claim = steer.model_claim ? claimLine(steer.model_claim) : "", ask = asking(steer.questions ?? []);
    const about = steer.about ? of(steer.about) : undefined, fixed = of((fixes.get(steer.id) ?? []).at(-1) ?? "");
    const link = steer.about ? L("纠正：针对") + (about ? L("「") + quote(about.turn.text) + L("」") : L("更早的一条")) : fixed ? L("你改为：「") + quote(fixed.turn.text) + L("」") : "";
    const key = JSON.stringify([fact, claim, ask, steer, link, Boolean(entry.act)]), before = entry.said ? JSON.parse(entry.said) as string[] : null;
    if (!force && entry.said === key) return;
    const summary = make("summary", ""), head = make("span", "mw-receipt__fact", fact), part = body(steer);
    summary.append(head);
    if (claim) { const line = make("span", "mw-receipt__claim"); line.append(make("b", "", L("AI 说")), claim); summary.append(line); }
    if (ask) summary.append(make("span", "mw-receipt__ask", ask));
    if (link) summary.append(make("span", "mw-receipt__link", link));
    acts(entry, part);
    root.dataset.state = waits ? "waiting" : steer.state; root.setAttribute("aria-live", "off");
    // A correction being written stays where it is, focus and words untouched: only what comes before it is drawn again,
    // and focus on what was redrawn moves to its new copy rather than falling back to the page.
    const focused = document.activeElement, kept = focused && root.contains(focused) && !entry.form?.contains(focused) ? focused.textContent : null;
    for (const child of [...root.children]) if (child !== entry.form) child.remove();
    root.prepend(summary, part);
    if (kept !== null) ([...part.querySelectorAll("button")].find(node => node.textContent === kept) ?? summary).focus();
    if (before) {
      const words = quote(turn.text);
      if (before[0] !== fact) say(L("你的补充「") + words + L("」：") + fact);
      if (claim && before[1] !== claim) say(L("AI 说你的补充「") + words + L("」：") + claim);
      if (ask && before[2] !== ask) say(ask);
    }
    entry.said = key;
  };
  const latest = () => [...shown].filter(([id, entry]) => byInput.get(entry.turn.steer!.id) === id).map(([, entry]) => ({ turn: entry.turn, round: entry.round, open: () => reveal(entry) }));
  return {
    tray: tray({ L, say, make, button, quote, latest }),
    line(turn, round, act) {
      const steer = turn.steer;
      if (!steer) return null;
      if (turn.kind === "notice") return make("small", "mw-receipt mw-receipt--host", L("Molis 的说明，不是你发的话"));
      if (turn.kind !== "user") return null;
      // Known by its round and input id: a turn id only counts within one round, the page draws every round, and a supplement
      // a round did not read is carried into the next under the same input id (decision D28).
      const id = round?.run_id + " " + steer.id, entry = shown.get(id) ?? { root: make("details", "mw-receipt"), said: "", turn };
      Object.assign(entry, { turn, round, act }); shown.set(id, entry); byInput.set(steer.id, id);
      const list = steer.about ? fixes.get(steer.about) ?? [] : [];
      // A correction seen for the first time changes its original's receipt too, wherever the page drew that one.
      if (steer.about && !list.includes(steer.id)) { fixes.set(steer.about, [...list, steer.id]); const original = of(steer.about); draw(entry); if (original) draw(original); }
      else draw(entry);
      return entry.root;
    },
  };
}

/** What the tray borrows from the receipts: the same small helpers, and the latest drawing of each input with a way to open it. */
export interface InputTrayParts {
  L(text: string): string;
  say(words: string): void;
  make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K];
  button(cls: string, text: string, click: () => void): HTMLButtonElement;
  quote(text: string): string;
  latest(): Array<{ turn: InputReceiptTurn; round?: InputReceiptRound; open(): void }>;
}

/**
 * 「N 条还没处理完」 (§4.4, D37, D38; stage 3b-2b), for Coding and the Assistant alike. It lists only what the ledger has:
 * what waits in the session for the next round, which can be taken back one by one before it starts; and from the latest
 * round, what the AI read with no word on how it handles it, what it says it does not adopt yet or needs you to clarify
 * (its own words, marked so), and what a question asked about it still waits on. Each item opens its receipt; its count is
 * said once when it changes, never on the first paint.
 */
export function createInputTray({ L, say, make, button, quote, latest }: InputTrayParts): InputReceipts["tray"] {
  const GROUPS = ["排着，下一轮开始时带上", "AI 读到了，没说怎么处理", "AI 说暂不采纳或需要你澄清", "为它问的问题还没回答"];
  // One tray per round, so a Coding page and the Assistant beside it each keep their own; a new round starts a new one.
  type Tray = { root: HTMLDetailsElement; said: string; count?: number; problem?: string };
  const trays = new Map<string, Tray>();
  const open = (queued: readonly InputReceiptQueued[], round?: InputReceiptRound) => {
    const drawn = latest(), groups: { text: string; id: string; open?: () => void; queued?: boolean }[][] = GROUPS.map(() => []);
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
    tray.problem = undefined;
    try { say((await act.withdraw(inputId)) || L("已撤回")); }
    catch (error) { tray.problem = (error as Error).message; say(tray.problem); }
    tray.said = "";
  };
  return (queued, round, act) => {
    const id = round?.run_id ?? "", tray = trays.get(id) ?? { root: make("details", "mw-receipt mw-tray"), said: "" }, { root } = tray;
    trays.set(id, tray);
    const groups = open(queued ?? [], round), total = groups.flat().length;
    // With the queue unread, none open in the round is not none open at all.
    if (tray.count !== undefined && tray.count !== total && (total || queued)) say(total ? total + L(" 条还没处理完") : L("没有还没处理完的了"));
    tray.count = total;
    if (!total) { tray.said = ""; return null; }
    const key = JSON.stringify([groups.map(group => group.map(item => [item.id, item.text, Boolean(item.open)])), tray.problem, Boolean(act)]);
    if (tray.said === key) return root;
    const summary = make("summary", ""), part = make("div", "mw-receipt__body");
    summary.append(make("span", "mw-receipt__fact", total + L(" 条还没处理完")));
    for (const [index, group] of groups.entries()) {
      if (!group.length) continue;
      const list = make("ul", "mw-tray__list");
      list.setAttribute("aria-label", L(GROUPS[index]!));
      for (const item of group) {
        const li = make("li", "mw-receipt__acts");
        // An item with a receipt opens it; one that only waits in the session has nothing to open, so taking it back is its button.
        li.append(item.open ? button("mw-btn--link", quote(item.text), item.open) : make("span", "", quote(item.text)));
        if (item.queued && act) li.append(button("mw-btn--secondary", L("撤回"), () => void take(tray, item.id, act)));
        list.append(li);
      }
      part.append(make("p", "mw-receipt__who", L(GROUPS[index]!)), list);
    }
    if (groups[2]!.length) part.append(make("p", "mw-receipt__note", L("AI 自己说的，Molis 没有核对")));
    if (tray.problem) part.append(make("p", "mw-receipt__problem", tray.problem));
    const focused = document.activeElement, kept = focused && root.contains(focused) ? focused.textContent : null;
    root.replaceChildren(summary, part);
    if (kept !== null) ([...part.querySelectorAll("button")].find(node => node.textContent === kept) ?? summary).focus();
    tray.said = key;
    return root;
  };
}

/** The page program: `(translate) => InputReceipts`. The workbench makes one and hands it to the Assistant and every plugin (`host.receipts`). */
export const INPUT_RECEIPTS_CLIENT_SCRIPT = compactScript("(L) => (" + createInputReceipts.toString() + ")(L, " + createInputTray.toString() + ", " + JSON.stringify(RECEIPT_WORDS) + ")");

/** The receipt's words in English (served through the workbench catalog, `apps/workbench/src/i18n/en.ts`). */
export const INPUT_RECEIPTS_EN: Readonly<Record<string, string>> = {
  "已送达": "Delivered",
  "已放进上下文，等 AI 回应": "In the AI's context, awaiting its response",
  "AI 已读到": "Read by the AI",
  "这一轮结束时 AI 没读到，留给下一轮": "Not read by the end of this round; kept for the next",
  "已撤回": "Withdrawn",
  "已补充到这一轮；问题仍在等你回答": "Added to this round; the question still waits for your answer",
  "读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。": "Read does not mean followed, and it does not undo earlier steps. A supplement does not answer a question.",
  "Molis 的说明，不是你发的话": "A note from Molis, not your words",
  "立即影响当前这一步": "Changes the current step now",
  "留到后面某一步": "Kept for a later step",
  "作为新任务": "As a new task",
  "需要你澄清": "Needs you to clarify",
  "暂不采纳": "Not adopted for now",
  "已在回复里回答": "Answered in the reply",
  "记下，不改变执行": "Noted; the work does not change",
  "与另一条一起处理": "Handled with another input",
  "补充": "Supplement",
  "纠正": "Correction",
  "约束": "Constraint",
  "新需求": "New request",
  "提问": "Question",
  "实现方案": "Approach",
  "已有成果": "Existing outputs",
  "另一条补充": "another supplement",
  "应用里的对象": "an item in the app",
  "这一轮的待办": "this round's to-do",
  "一个问题": "a question",
  "计划的一步": "a step of the plan",
  "已回答": "answered",
  "这一轮结束时还没回答": "not answered by the end of the round",
  " · 影响": " · affects ",
  "为这条问了你问题，等你回答": "A question about this waits for your answer",
  "为这条问的问题没等到回答": "A question about this was never answered",
  "运行记录": "Run record",
  " · 输入 ": " · input ",
  "为它问的问题": "Questions about it",
  " · 问题 ": " · question ",
  "AI 自己说的，Molis 没有核对": "What the AI says itself; Molis has not checked it",
  "怎么处理": "Handling",
  "指向": "Points at",
  "说会改变": "Says it changes",
  "AI 的原话": "The AI's words",
  "说明过 ": "Stated ",
  " 次，以最新一次为准": " times; the latest stands",
  "说明过 1 次": "Stated once",
  " · 工具调用 ": " · tool call ",
  "AI 说": "AI says",
  "你的补充「": "Your supplement \"",
  "」：": "\": ",
  "AI 说你的补充「": "The AI says your supplement \"",
  "「": "\"",
  "」": "\"",
  "看原来那条": "See the original",
  "看更正": "See the correction",
  "撤回": "Withdraw",
  "AI 已看到，不能撤回；要改口就发更正。": "The AI has seen it, so it can't be withdrawn. To change course, send a correction.",
  "更正…": "Correct…",
  "不是「": "Not \"",
  "」，而是：": "\", but: ",
  "不是这个意思，而是：": "Not what I meant. Instead: ",
  "这条针对的是：": "This is about: ",
  "补充一句：": "One more thing: ",
  "发送更正": "Send correction",
  "取消": "Cancel",
  "更正「": "Correct \"",
  "更正会作为一条新补充发出，指向这条。": "The correction goes out as a new supplement that points to this one.",
  "写上要改成什么": "Write what should change",
  "发送中…": "Sending…",
  "更正已发出": "Correction sent",
  "纠正：针对": "Corrects ",
  "更早的一条": "an earlier one",
  "你改为：「": "You changed it to \"",
  " 条还没处理完": " still open",
  "没有还没处理完的了": "Nothing is still open",
  "排着，下一轮开始时带上": "Waiting; the next round takes them",
  "AI 读到了，没说怎么处理": "Read by the AI, with no word on how it handles them",
  "AI 说暂不采纳或需要你澄清": "The AI says it does not adopt them yet, or needs you to clarify",
  "为它问的问题还没回答": "A question about them still waits for an answer",
};
