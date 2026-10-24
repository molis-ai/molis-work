/**
 * What the Assistant knows about an object and its works, and where a card prepared on the page goes
 * (specs/context-program §21.2 item 5, W3-A3a; 统筹 10-17).
 *
 * - A work's objects are the Assistant's facts: its relation rows, read with the work (`view.objects`) or for one object
 *   (`GET /api/assistant/related`). What the current work holds is those, plus what the person added to its strip with +.
 * - A write chosen on the page asks where its card goes with `molis:assistant-card-target` (context-card-target.ts asks;
 *   dispatching is synchronous, so the answer is there when it returns). The Assistant answers with the current work when its panel is
 *   open, the work is its own (not a plugin's) and holds the object. No answer (no Assistant here, panel closed, an object the
 *   work does not hold): the page starts a new work, as before. The answer is a pointer only: the Host still refuses a work
 *   that is not the person's own, archived, a plugin's or in another project (`offerFromPage`).
 * - A result the work made can be picked up (§21.2 item 6, W3-A3b): `pickable(card, object, title)`. A click on the card
 *   (not on its title, which opens the object, nor on its buttons), Enter or Space picks it; Esc, or a press anywhere but
 *   the card and the bar, puts it down. A click that ends a text selection in the card is reading, not picking. Picked, the
 *   card reports the whole object as what is in hand (`molis:surface-focus`, granularity `object`, its rect for the bar) as
 *   the Assistant's surface (`plugin_id: "assistant"`, as a reply's passage is; the object's kind names its owner); the
 *   workbench marks it `place: "assistant"`, so the bar beside it offers what can be done with it, putting it on the left
 *   included. Only a result still where it was can be picked. A card rebuilt under the bar is off screen, and the bar lets
 *   it go as it does any surface that went away.
 */

/** Made once in the island's factory, with read-only views of its state: the panel, the current work's view, the strip's joined keys. */
export const ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT = String.raw`({ api, joined, open, current, repaint, L }) => {
    const objectKey = (object) => object.kind + ":" + object.id;
    const belongsToWork = (object) => { const view = current(); return Boolean(view && (view.objects || []).some((item) => item.subject.kind === object.kind && item.subject.id === object.id)); };
    const holds = (object) => belongsToWork(object) || joined.has(objectKey(object));
    // The works an object belongs to, kept for ten seconds; a change to the object forgets them.
    const relatedCache = new Map();
    const relatedWorks = (object) => {
      const key = objectKey(object), held = relatedCache.get(key);
      if (held && Date.now() - held.at < 10000) return held.works;
      relatedCache.set(key, { at: Date.now(), works: held ? held.works : [] });
      api("/related?kind=" + encodeURIComponent(object.kind) + "&id=" + encodeURIComponent(object.id))
        .then((res) => { relatedCache.set(key, { at: Date.now(), works: res.works || [] }); repaint(); }).catch(() => {});
      return held ? held.works : [];
    };
    document.addEventListener("molis:assistant-card-target", (event) => {
      const detail = event.detail, object = detail && detail.object, view = current();
      if (!detail || typeof detail.reply !== "function" || !object || typeof object.kind !== "string" || typeof object.id !== "string") return;
      if (open() && view && view.work.executor?.kind !== "plugin" && holds(object)) detail.reply(view.work.work_id);
    });
    let picked = null;
    const say = (node, focus) => node.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: focus }));
    const drop = () => { if (picked) { picked.removeAttribute("aria-current"); say(picked, null); picked = null; } };
    // Picking the card already in hand offers it again (the bar may have been put away): a new context, the same thing.
    const pick = (node, object, title) => {
      if (picked !== node) { drop(); picked = node; node.setAttribute("aria-current", "true"); }
      const ref = { ...object.subject, title };
      say(node, { context_id: "pick:" + crypto.randomUUID(), plugin_id: "assistant", activity: "selecting", granularity: "object", object: ref,
        targets: [{ kind: "object", role: "object", ref, text: title }], screen: { rect: node.getBoundingClientRect().toJSON(), placement: "below" } });
    };
    document.addEventListener("pointerdown", (event) => { if (picked && !picked.contains(event.target) && !event.target.closest(".mw-ctx, .mw-ctx-menu, .mw-ctx-panel")) drop(); });
    const pickable = (node, object, title) => {
      if (object.state !== "current" && object.state !== "changed") return node;
      // A group, not a button: the card holds its own buttons. Picked, it is the current one.
      node.tabIndex = 0; node.setAttribute("role", "group"); node.setAttribute("aria-label", L("拿起") + "：" + title);
      node.addEventListener("click", (event) => {
        const selection = getSelection();
        if (event.target.closest("button, a") || (selection && !selection.isCollapsed && node.contains(selection.anchorNode))) return;
        pick(node, object, title);
      });
      node.addEventListener("keydown", (event) => {
        if (event.target !== node) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(node, object, title); }
        else if (event.key === "Escape" && picked === node) { event.preventDefault(); event.stopPropagation(); drop(); }
      });
      return node;
    };
    return { objectKey, belongsToWork, holds, relatedWorks, pickable, forgetRelated: (object) => relatedCache.delete(objectKey(object)) };
  }`;
