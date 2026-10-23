/**
 * Putting several things on the Shelf at once: files dropped or picked together, clips joined as a group. Every item is tried, so one
 * refusal does not hide the ones after it; what stopped part-way says how many went in and which did not (with the reason), and a
 * button asks again for just the files that did not (VUX-12: partial success is said, and recoverable).
 */
export const SHELF_ADMIT_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const { lifetime, workbench: bench, api, post, L, bufferToBase64, applySnapshot, current, afterJoin, clearHint, showError } = ports;
  // The files that did not go in, with the words they were reported with (the button shows only while those words are on the bar).
  let retry = null;
  const hintDefault = bench.querySelector("[data-shelf-bar-hint]")?.textContent || "";
  const admitFiles = async (files) => {
    let lastId = "", added = 0, next = current();
    const refused = [];
    try {
      for (const file of files) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const payload = await post(api + "/items", { filename: file.name, mime: file.type, bytes_base64: bufferToBase64(bytes) });
          lastId = payload.item?.item_id || lastId;
          next = payload.snapshot;
          added += 1;
        } catch (error) {
          if (!lifetime.alive || files.length === 1) throw error;
          refused.push({ file, reason: error.message });
        }
      }
    } finally { if (lastId) applySnapshot(next, lastId); }
    if (!refused.length) return;
    const failure = new Error(L("已加入 {done} 个，{count} 个没加进去：{list}", { done: added, count: refused.length, list: refused.map((entry) => entry.file.name + "（" + entry.reason + "）").join("；") }));
    failure.retryFiles = refused.map((entry) => entry.file);
    throw failure;
  };
  // A group that stops part-way keeps what went in, instead of dropping the finished ones from view.
  const joinClips = async (ids) => {
    let lastId = "", done = 0, next = current();
    try {
      for (const id of ids) {
        const payload = await post(api + "/clipboard/" + encodeURIComponent(id) + "/material");
        lastId = payload.item?.item_id || lastId;
        next = payload.snapshot;
        done += 1;
      }
    } catch (error) {
      if (done) error.message = L("已加入 {done} 条，其余没加进去：{reason}", { done, reason: error.message });
      throw error;
    } finally { if (done) afterJoin(next, lastId); }
  };
  /** The bar's hint: the words, or the standing help when there are none; with a retry button while the words are a partial add's. */
  const paintHint = (hint, text) => {
    hint.textContent = text || hintDefault;
    if (!text || !retry || retry.hint !== text) return;
    const again = document.createElement("button");
    again.type = "button"; again.className = "mw-btn mw-btn--link mw-btn--sm"; again.dataset.shelfRetryAdmit = ""; again.textContent = L("重试没加上的");
    hint.append(" ", again);
  };
  lifetime.listen(bench, "click", (event) => {
    if (!event.target.closest("[data-shelf-retry-admit]") || !retry) return;
    const files = retry.files;
    retry = null; clearHint();
    admitFiles(files).catch((error) => { if (lifetime.alive) showError(error); });
  });
  return { admitFiles, joinClips, paintHint, remember: (error) => { retry = error.retryFiles ? { files: error.retryFiles, hint: error.message } : null; } };
}`;
