/**
 * The Assistant's next steps, in one row just above its input (specs/context-program §21.2, FLOW-01…05). The Host
 * derives and draws them (`next_html`, `next_all_html`); this row only places them and, when one is pressed, presses the
 * record's own control in the conversation: a card's run button, an option and the submit of a question, or it brings
 * the record into view. So there is no second way to run anything. A card with edits the person has not sent, an option
 * the card no longer offers, or a control that is disabled is only brought into view (FLOW-03).
 *
 * A page's suggestion (`molis:assistant-message`, purpose `suggest`, or a hand-over the page did not start from a press)
 * is one more step here: pressing it puts its words and materials in the input, nothing is sent. With the panel closed it
 * is the only step shown, since the rest point into the conversation.
 */
export const ASSISTANT_STEP_ROW_FACTORY_SCRIPT = String.raw`(input) => {
  const { row, thread, L, el } = input;
  let offer = null, unfolded = false, shownWork = null;
  const press = (node, control) => { input.jumpTo(node); if (control && !control.disabled) control.click(); };
  // A step's id names the record it leads to (review:, question:, card:), as the conversation keys it.
  const go = (id) => {
    for (const node of thread.querySelectorAll("[data-review], [data-question], [data-card]")) {
      const { review, question, card } = node.dataset, key = review ? "review:" + review : question ? "question:" + question : "card:" + card;
      if (id !== key && !id.startsWith(key + ":")) continue;
      const rest = id.slice(key.length + 1), cut = rest.indexOf(":");
      const option = cut > 0 && [...node.querySelectorAll("[data-ix-option]")].find((one) => one.dataset.ixOption === rest.slice(cut + 1) && one.closest("[data-ix-field]").dataset.ixField === rest.slice(0, cut));
      // As the person would: the option first (the card's client keeps the draft), then the card's own submit.
      if (option && !option.disabled) { option.click(); press(node, node.querySelector("[type=submit]")); }
      else if (card && rest === "run" && node.ixBase === JSON.stringify(node.ix?.read())) press(node, node.querySelector('[data-ix-action="run"]'));
      else input.jumpTo(node);
      return;
    }
    input.other(id);
  };
  const offerStep = () => {
    const step = el("button", "mw-ix-step"); step.type = "button"; step.dataset.stepOffer = ""; step.dataset.secondary = "";
    step.title = offer.message.text + (offer.unconfirmed ? "\n" + L("没有确认是你刚才在那里发起的：放进输入框后，请你确认再发送。") : "");
    step.append(el("span", "", (offer.unconfirmed ? L("{source}想交给助理") : L("{source}的建议")).replace("{source}", offer.message.source.title)));
    step.addEventListener("click", () => { const taken = offer.message; offer = null; paint(); input.take(taken); });
    return step;
  };
  const paint = () => {
    const view = input.view(), open = input.open(), work = view ? view.work.work_id : null;
    if (work !== shownWork) { shownWork = work; unfolded = false; }
    input.drawn(row, open && view ? (unfolded ? view.next_all_html : view.next_html) || "" : "", { onStep: (_index, button) => go(button.dataset.ixStepId) });
    row.querySelector("[data-step-offer]")?.remove();
    if (offer) {
      let group = row.querySelector(".mw-ix-steps");
      if (!group) { group = el("div", "mw-ix-steps"); group.setAttribute("role", "group"); group.setAttribute("aria-label", L("下一步")); row.append(group); }
      group.append(offerStep());
    }
    row.hidden = !row.querySelector(".mw-ix-step");
  };
  row.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-ix-steps-more]")) return;
    unfolded = true; paint();
    row.querySelector('[data-ix-step="3"]')?.focus();
  });
  return { paint, offer(message, unconfirmed) { offer = { message, unconfirmed }; paint(); } };
}`;
