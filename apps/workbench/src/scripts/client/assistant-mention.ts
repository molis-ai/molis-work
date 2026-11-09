/**
 * “@” in the Assistant's input (specs/visual-ui-experience §composer-mentions, VUX-17): find something in this project or
 * the person's own content through the system search and bring it along. A hit is only a pointer: the Host checks it with
 * its owner and reads it before the round.
 *
 * What the list shows is always for the words typed now. While a newer search is on its way the hits already there are
 * dimmed and cannot be chosen (`aria-busy` on the list, a line saying what is being looked for), so a late answer for
 * older words never stands in for the new ones and an older hit is never put in by mistake; only the latest search's
 * answer is drawn. No words, no hits, still indexing and a failed search each say so. A chosen hit replaces exactly the
 * “@words” it was found for and the caret lands right after it, where the person goes on writing.
 */
export const ASSISTANT_MENTION_FACTORY_SCRIPT = String.raw`(input) => {
  const { readText, el, pop, field, search, pick } = input;
  let seq = 0, timer = null;
  const isOpen = () => pop && !pop.hidden && pop.dataset.mode === "mention";
  const at = () => {
    const before = String(field.value || "").slice(0, field.selectionStart ?? String(field.value || "").length);
    const match = /(^|\s)@([^\s@]{0,40})$/.exec(before);
    return match ? { query: match[2], start: before.length - match[2].length - 1 } : null;
  };
  const close = () => { clearTimeout(timer); seq++; if (pop && pop.dataset.mode === "mention") { delete pop.dataset.mode; pop.hidden = true; pop.removeAttribute("aria-busy"); } };
  const mentionNote = (text) => el("p", "assistant-material-origin", text);
  const open = (found) => {
    if (!pop) return;
    clearTimeout(timer);
    const fresh = pop.dataset.mode !== "mention";
    pop.dataset.mode = "mention";
    pop.hidden = false;
    const head = el("p", "assistant-popover-title", globalThis.t.text("workbench.assistant-mention.bring-content"));
    const mine = ++seq;
    if (!found.query) { pop.removeAttribute("aria-busy"); pop.replaceChildren(head, mentionNote(globalThis.t.text("workbench.assistant-mention.type-keyword-find-content-project-own"))); return; }
    pop.setAttribute("aria-busy", "true");
    const looking = mentionNote(globalThis.t.text("workbench.assistant-mention.looking-query", { query: found.query })); looking.dataset.mentionLooking = "";
    if (fresh) pop.replaceChildren(head, looking);
    else {
      pop.querySelectorAll(".assistant-mention").forEach((hit) => { hit.disabled = true; hit.classList.add("is-stale"); });
      pop.querySelectorAll(".assistant-material-origin").forEach((line) => line.remove());
      pop.append(looking);
    }
    timer = setTimeout(async () => {
      let res;
      try { res = await search(found.query); }
      catch (error) { if (mine === seq && isOpen()) { const line = mentionNote(""); molisWorkRequest.show(line, error); pop.removeAttribute("aria-busy"); pop.replaceChildren(head, line); } return; }
      if (mine !== seq || !isOpen()) return;
      pop.removeAttribute("aria-busy");
      pop.replaceChildren(head);
      (res.hits || []).forEach((hit) => {
        const row = el("button", "assistant-starter assistant-mention", ""); row.type = "button";
        row.append(el("span", "assistant-mention-title", hit.plugin_title + " · " + hit.title), el("span", "assistant-mention-snippet", hit.snippet || ""));
        row.setAttribute("aria-label", globalThis.t.text("workbench.assistant-mention.quote") + "：" + hit.plugin_title + " · " + hit.title);
        row.addEventListener("mousedown", (event) => event.preventDefault());
        row.addEventListener("click", () => {
          const where = at() || found, value = String(field.value || ""), put = "「" + hit.title + "」";
          field.value = value.slice(0, where.start) + put + value.slice(where.start + 1 + where.query.length);
          close(); pick(hit); field.focus();
          const caret = where.start + put.length; field.setSelectionRange(caret, caret);
        });
        pop.append(row);
      });
      if (!(res.hits || []).length) pop.append(mentionNote(res.status === "indexing" ? globalThis.t.text("workbench.assistant-mention.content-still-being-indexed-try-again-shortly") : globalThis.t.text("workbench.assistant-mention.nothing-found-try-other-words")));
    }, 180);
  };
  return { isOpen, at, close, open };
}`;
