/**
 * The Assistant's next steps, in one row just above its input (specs/context-program §21.2, FLOW-01…05). The Host
 * derives and draws them (`next_html`, `next_all_html`); this row only places them and, when one is pressed, presses the
 * record's own control in the conversation: a card's run button, an option and the submit of a question, a control an
 * outcome record names, or it brings the record into view. So there is no second way to run anything. A record with edits
 * the person has not sent, an option the card no longer offers, a control it does not carry or one that is disabled is
 * only brought into view (FLOW-03, SLOT-02).
 *
 * The outcome slot (§21.9): a delivery note or a result in the conversation is keyed by its own `data-ix-record`
 * (`<kind>:<id>`) or, for a card's result, by the card; a control in it that a step may press carries
 * `data-ix-press="<name>"` (a result's 「打开」, a delivery note's link), and the step's id is `<key>:<name>`. Its result
 * buttons are written as a reply's (`data-assistant-object`), and the row hands each record to the island's `bindText`
 * once per drawing, so they open as a reply's do and one that cannot open reads as text (SLOT-03).
 *
 * A page's suggestion (`molis:assistant-message`, purpose `suggest`, or a hand-over the page did not start from a press)
 * is one more step here: pressing it puts its words and materials in the input, nothing is sent. With the panel closed it
 * is the only step shown, since the rest point into the conversation.
 */
export const ASSISTANT_STEP_ROW_FACTORY_SCRIPT = String.raw`(input) => {
  const { row, thread, L, el } = input;
  let offer, offerNode, unfolded = false, shownWork;
  const press = (node, control) => { input.jumpTo(node); if (control && !control.disabled) control.click(); };
  // A step's id names the record it leads to (review:, question:, card:, or an outcome's own key), as the conversation keys it.
  const at = (node, name, value) => node?.querySelector("[data-" + name + '="' + CSS.escape(value) + '"]');
  const go = (id) => {
    for (const node of thread.querySelectorAll("[data-review],[data-question],[data-card],[data-ix-record]")) {
      const { review, question, card, ixRecord } = node.dataset, key = review ? "review:" + review : question ? "question:" + question : card ? "card:" + card : ixRecord;
      if (id !== key && !id.startsWith(key + ":")) continue;
      const rest = id.slice(key.length + 1), cut = rest.indexOf(":");
      const option = cut > 0 && at(at(node, "ix-field", rest.slice(0, cut)), "ix-option", rest.slice(cut + 1));
      // As the person would: the option first (the card's client keeps the draft), then the card's own submit; otherwise
      // the record's own control, and only while it holds no edits the person has not sent.
      if (option && !option.disabled) { option.click(); press(node, node.querySelector("[type=submit]")); }
      else press(node, node.ixBase === JSON.stringify(node.ix?.read()) && (card && rest === "run" ? at(node, "ix-action", "run") : at(node, "ix-press", rest)));
      return;
    }
    input.other(id);
  };
  const offerStep = () => {
    const step = el("button", "mw-ix-step"); step.type = "button"; step.dataset.stepOffer = ""; step.dataset.secondary = "";
    step.title = offer.message.text + (offer.unconfirmed ? "\n" + L("没有确认是你刚才在那里发起的：放进输入框后，请你确认再发送。") : "");
    step.append(el("span", "", (offer.unconfirmed ? L("{source}想交给助理") : L("{source}的建议")).replace("{source}", offer.message.source.title)));
    step.addEventListener("click", () => { const taken = offer.message; offer = offerNode = null; step.remove(); paint(); input.take(taken); });
    return step;
  };
  const paint = () => {
    const view = input.view(), open = input.open(), work = view?.work.work_id;
    // An outcome's record is drawn whole by its owner; its result buttons open as a reply's do, bound once per drawing.
    for (const node of thread.querySelectorAll("[data-ix-record]")) if (node.ixBound !== node.firstChild) { input.bindText(node); node.ixBound = node.firstChild; }
    if (work !== shownWork) { shownWork = work; unfolded = false; }
    input.drawn(row, open && view ? (unfolded ? view.next_all_html : view.next_html) || "" : "", { onStep: (_, button) => go(button.dataset.ixStepId) });
    // The suggestion keeps its one button while it stands: a new button on every paint (a resize, a poll) would play its entrance again.
    if (offer) {
      let group = row.querySelector(".mw-ix-steps");
      if (!group) { group = el("div", "mw-ix-steps"); group.role = "group"; group.ariaLabel = L("下一步"); row.append(group); }
      if (offerNode?.parentNode !== group) group.append(offerNode ||= offerStep());
    }
    row.hidden = !row.querySelector(".mw-ix-step");
  };
  row.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-ix-steps-more]")) return;
    unfolded = true; paint();
    row.querySelector('[data-ix-step="3"]')?.focus();
  });
  return { paint, offer(message, unconfirmed) { offerNode = offerNode?.remove(); offer = { message, unconfirmed }; paint(); } };
}`;
