/** Original Work review mounting, shared by the main conversation and its trusted subtask float. */
export const ASSISTANT_REVIEW_PART = String.raw`  const setReviewWord = (node, words) => {
    if (!node || node.textContent === words) return;
    const text = node.firstChild;
    if (text?.nodeType === Node.TEXT_NODE && !text.nextSibling) text.data = words;
    else node.textContent = words;
  };
  const retitleReviewText = (card) => {
    for (const node of card.querySelectorAll('[data-assistant-review-copy]')) setReviewWord(node, globalThis.say.text(JSON.parse(node.dataset.assistantReviewCopy)));
    for (const figure of card.querySelectorAll('.assistant-code')) {
      const n = Number(figure.dataset.lines), copy = figure.querySelector('.assistant-code-copy');
      setReviewWord(figure.querySelector('.assistant-code-lines'), globalThis.t.text('workbench.assistant-code-grow.lines', { n }));
      setReviewWord(figure.querySelector('.assistant-code-more'), figure.hasAttribute('data-folded')
        ? globalThis.t.text('workbench.assistant-code-grow.show-all-n-n', { n }) : globalThis.t.text('workbench.assistant-code-grow.collapse'));
      setReviewWord(copy?.querySelector('[data-copy-face=idle]') || copy, globalThis.t.text('common.control.copy'));
      for (const [state, key] of [['done', 'workbench.assistant-conversation.copied'], ['failed', 'workbench.assistant-conversation.could-not-copy']]) {
        const face = copy?.querySelector('[data-copy-face=' + state + ']');
        if (face) { face.dataset.label = globalThis.t.text(key); setReviewWord(face, face.dataset.label); }
      }
    }
  };
  const mountWorkReview = (card, review, control) => {
    let alive = true;
    const current = () => alive && card.isConnected && control.current();
    card.innerHTML = review.html;
    card.querySelectorAll("[data-assistant-review-glyph]").forEach((node) => node.replaceWith(glyph(node.dataset.assistantReviewGlyph)));
    retitleReviewText(card);
    bindReviewCode(card);
    const row = card.querySelector(".assistant-card-actions");
    const buttons = row.querySelectorAll("[data-assistant-decision]");
    const decide = async (decision) => {
      if (!current() || row.ariaBusy === "true") return;
      row.ariaBusy = "true";
      buttons.forEach((button) => { button.ariaDisabled = "true"; });
      try {
        const next = await control.decide(decision);
        if (current()) control.refresh(next);
      } catch (error) {
        if (!current()) return;
        row.removeAttribute("aria-busy");
        buttons.forEach((button) => button.removeAttribute("aria-disabled"));
        control.error(error);
      }
    };
    buttons.forEach((button) => button.addEventListener("click", event => { if (event.isTrusted) void decide(button.dataset.assistantDecision); }));
    return { destroy() { alive = false; } };
  };
`;
