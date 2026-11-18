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
  const mountWorkReview = (card, initial, control) => {
    let review = initial;
    let alive = true;
    const current = () => alive && card.isConnected && control.current();
    const paint = next => {
      review = next;
      const decisions = JSON.stringify([review.decisions, review.permission_available]);
      const sameVersion = card.dataset.reviewVersion === review.version;
      if (card.dataset.painted && sameVersion && card.dataset.reviewDecisions === decisions) return;
      card.dataset.reviewDecisions = decisions; card.dataset.reviewVersion = review.version;
      if (card.dataset.painted && sameVersion) {
        const row = card.querySelector('.assistant-card-actions'), active = row.contains(document.activeElement) ? document.activeElement : null;
        const focused = active?.dataset.assistantDecision, permissionFocused = active?.hasAttribute('data-assistant-permission-open');
        const updated = document.createElement('template'); updated.innerHTML = review.html;
        row.innerHTML = updated.content.querySelector('.assistant-card-actions').innerHTML;
        card.querySelector('.assistant-card-hint').replaceWith(updated.content.querySelector('.assistant-card-hint'));
        if (row.ariaBusy === 'true') row.querySelectorAll('[data-assistant-decision]').forEach(button => { button.ariaDisabled = 'true'; });
        retitleReviewText(card);
        if (active) { let next = permissionFocused ? row.querySelector('[data-assistant-permission-open]') : focused ? row.querySelector('[data-assistant-decision="' + focused + '"]') : null; if (!next) { next = card.querySelector('.assistant-card-title'); next.tabIndex = -1; } next.focus({ preventScroll: true }); }
        return;
      }
      card.dataset.painted = '1';
    card.innerHTML = review.html;
    card.querySelectorAll("[data-assistant-review-glyph]").forEach((node) => node.replaceWith(glyph(node.dataset.assistantReviewGlyph)));
    retitleReviewText(card);
    bindReviewCode(card);
    const row = card.querySelector(".assistant-card-actions");
    const buttons = () => row.querySelectorAll("[data-assistant-decision]");
    const decide = async (decision) => {
      if (!current() || row.ariaBusy === "true") return;
      row.ariaBusy = "true";
      buttons().forEach((button) => { button.ariaDisabled = "true"; });
      try {
        const next = await control.decide(decision, review.version);
        if (current()) control.refresh(next);
      } catch (error) {
        if (!current()) return;
        row.removeAttribute("aria-busy");
        buttons().forEach((button) => button.removeAttribute("aria-disabled"));
        control.error(error);
      }
    };
    row.addEventListener("click", event => {
      if (!event.isTrusted || !current()) return;
      const button = event.target.closest('[data-assistant-decision]');
      if (button && button.ariaDisabled !== "true") void decide(button.dataset.assistantDecision);
      const permission = event.target.closest('[data-assistant-permission-open]');
      if (permission) control.permission?.(permission, review.review_id, review.version);
    });
    };
    paint(initial);
    return { update: paint, destroy() { alive = false; } };
  };
`;
