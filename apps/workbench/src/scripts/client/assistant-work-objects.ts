/**
 * What the Assistant knows about an object and its works, and where a card prepared on the page goes
 * (specs/context-program §21.2 item 5, W3-A3a; 统筹 10-17).
 *
 * - A work's objects are the Assistant's facts: its relation rows, read with the work (`view.objects`) or for one object
 *   (`GET /api/assistant/related`). What the current work holds is those, plus what the person added to its strip with +.
 * - A write chosen on the page asks where its card goes with `molis:assistant-card-target` (context-card-target.ts asks;
 *   dispatching is synchronous, so the answer is there when it returns). The Assistant answers with the current work when its panel is
 *   open, the work is its own (not Coding's) and holds the object. No answer (no Assistant here, panel closed, an object the
 *   work does not hold): the page starts a new work, as before. The answer is a pointer only: the Host still refuses a work
 *   that is not the person's own, archived, Coding's or in another project (`offerFromPage`).
 */

/** Made once in the island's factory, with read-only views of its state: the panel, the current work's view, the strip's joined keys. */
export const ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT = String.raw`({ api, joined, open, current, repaint }) => {
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
      if (open() && view && view.work.executor?.kind !== "coding" && holds(object)) detail.reply(view.work.work_id);
    });
    return { objectKey, belongsToWork, holds, relatedWorks, forgetRelated: (object) => relatedCache.delete(objectKey(object)) };
  }`;
