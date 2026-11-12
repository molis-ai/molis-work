/** What deserves the person's attention: the notices, their count, the quiet rules, model readiness and plugin events. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_NOTICES_PART = String.raw`  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
  const noticeBtn = island.querySelector("[data-assistant-attention]");
  const attentionCount = island.querySelector("[data-assistant-attention-count]");
  const noticePop = island.querySelector("[data-assistant-notices]");
  const objectList = el("div", "assistant-attention-objects"), noticeList = el("div", "assistant-notice-list");
  objectList.dataset.attentionObjects = "";
  noticePop?.append(el("p", "assistant-popover-title", globalThis.t.text("workbench.assistant-notice.attention")), objectList, noticeList);
  const attentionRead = (body, signal) => host.positionRead("/api/host/surface-attention", body, signal);
  const attentionObjects = noticePop && host.positions?.mount(objectList, attentionRead, { source: () => ({}), onNavigate: () => setNotices(false) });
  let attentionObjectsCount = 0, canRestoreAttention = false, badgeRead = null, badgeAt = null;
  const readBadge = (cursor) => {
    if (!attentionObjects || document.hidden || cursor !== undefined && cursor === badgeAt) return;
    badgeAt = cursor; badgeRead?.abort();
    const pending = badgeRead = new AbortController();
    attentionRead({ count: true }, pending.signal).then(result => {
      if (!pending.signal.aborted && pending === badgeRead) { attentionObjectsCount = result.count; canRestoreAttention = result.can_restore === true; paintAttention(); }
    }, () => {
      if (!pending.signal.aborted && pending === badgeRead) { badgeAt = null; attentionObjectsCount = 0; canRestoreAttention = false; paintAttention(); }
    });
  };
  let notices = [];
  // Plugin notifications waiting for a decision in the market: counted by the attention read, and by the market's list,
  // which is newer than a read that started before it.
  let pluginWaiting = 0, pluginHeldSince = -1;
  const URGENT = new Set(["needs-decision", "failed", "reminder", "connection"]);
  // A connection's notice opens its settings: only a path of this origin under /settings/, handed to the settings' own listener, which
  // checks the address again and keeps only what that page reads (settings-address-params.ts, S-47). Any other value offers no way to open it.
  const settingsPathOf = (notice) => notice.kind === "connection" && typeof notice.settings_path === "string" && /^\/settings\/[a-z]/.test(notice.settings_path) ? notice.settings_path : "";
  let lastUrgent = 0;
  const paintNotices = (force) => {
    if (!noticePop) return;
    // Polling repaints only what changed, and keeps focus on the same button: a list rebuilt under the person's
    // finger or keyboard focus loses the tap or drops focus to the page.
    const signature = JSON.stringify([pluginWaiting, attentionObjectsCount, notices.map((notice) => [notice.notice_id, notice.text, notice.directory_origin, notice.additional_count, notice.held && notice.held.reason])]);
    if (!force && noticePop.dataset.signature === signature) return;
    noticePop.dataset.signature = signature;
    const focused = noticeList.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? [focused.dataset.noticeId, focused.dataset.noticeAction] : null;
    noticeList.replaceChildren();
    const open = notices.filter((notice) => !notice.held && URGENT.has(notice.kind)), news = notices.filter((notice) => !notice.held && !URGENT.has(notice.kind)), held = notices.filter((notice) => notice.held);
    const row = (notice) => {
      const item = el("div", "assistant-notice"), text = noticeText(notice);
      if (typeof notice.text.original === "string") {
        if (notice.text.label) item.append(el("p", "assistant-notice-text", globalThis.say.text(notice.text.label)));
        const original = el("p", "assistant-notice-text", notice.text.original);
        original.translate = false; original.style.whiteSpace = "pre-wrap";
        item.append(original);
      } else item.append(el("p", "assistant-notice-text", text));
      if (notice.held) item.append(el("p", "assistant-material-origin", globalThis.t.text("workbench.assistant-notice.held", { reason: notice.held.reason })));
      const actions = el("div", "assistant-notice-actions");
      const go = el("button", "mw-btn mw-btn--secondary", globalThis.t.text("workbench.assistant-notice.open")); go.type = "button";
      go.dataset.noticeId = notice.notice_id; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", globalThis.t.text("workbench.assistant-notice.open-named", { title: notice.work_title }));
      go.addEventListener("click", async () => {
        setNotices(false);
        if (settingsPathOf(notice)) {
          void settleNotice({ notice_id: notice.notice_id }, "seen");
          document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: new URL(settingsPathOf(notice), location.origin).href } }));
          return;
        }
        if (notice.open) {
          void settleNotice({ notice_id: notice.notice_id }, "seen");
          const where = notice.open.project_id || "personal", here = project ? project.id : "personal";
          if (where === here && host.openItem) { host.openItem(notice.open.surface, notice.open.id, notice.open.title); return; }
          openOnItsPage(notice.open, notice.open.title, where);
          return;
        }
        await switchTo(notice.work_id); setPanel(true); void settleNotice({ work_id: notice.work_id }, "seen");
      });
      if ((notice.kind === "reminder" || notice.kind === "directory-read") && !notice.open || notice.kind === "connection" && !settingsPathOf(notice)) go.hidden = true;
      const done = el("button", "mw-btn mw-btn--ghost", globalThis.t.text("workbench.assistant-notice.dismiss")); done.type = "button";
      done.dataset.noticeId = notice.notice_id; done.dataset.noticeAction = "dismiss";
      done.setAttribute("aria-label", globalThis.t.text("workbench.assistant-notice.dismiss-named", { title: notice.work_title }));
      done.addEventListener("click", () => settleNotice({ notice_id: notice.notice_id }, "dismissed"));
      actions.append(go, done);
      item.append(actions);
      return item;
    };
    if (pluginWaiting) {
      // Settled only in the market's review, so this row has no "知道了": it goes when the notifications are handled.
      const item = el("div", "assistant-notice");
      const text = globalThis.t.text("workbench.assistant-notice.plugin-review", { count: pluginWaiting });
      item.append(el("p", "assistant-notice-text", text));
      const actions = el("div", "assistant-notice-actions");
      const go = el("button", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("workbench.assistant-notice.review")); go.type = "button";
      go.dataset.noticeId = "plugin-events"; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", globalThis.t.text("workbench.assistant-notice.review-count", { count: pluginWaiting }));
      go.addEventListener("click", () => { setNotices(false); document.dispatchEvent(new CustomEvent("molis-work:plugin-events-open")); });
      actions.append(go); item.append(actions); noticeList.append(item);
    }
    open.forEach((notice) => noticeList.append(row(notice)));
    if (news.length) {
      const fresh = el("details", "assistant-notices-held");
      fresh.append(el("summary", "", globalThis.t.text("workbench.assistant-notice.results", { count: news.length })));
      news.forEach((notice) => fresh.append(row(notice)));
      noticeList.append(fresh);
    }
    if (held.length) {
      const quiet = el("details", "assistant-notices-held");
      quiet.append(el("summary", "", globalThis.t.text("workbench.assistant-notice.held-count", { count: held.length })));
      held.forEach((notice) => quiet.append(row(notice)));
      noticeList.append(quiet);
    }
    if (!notices.length && !pluginWaiting && !attentionObjectsCount) noticeList.append(el("p", "assistant-material-origin", globalThis.t.text("workbench.assistant-notice.none")));
    if (focusKey) (noticePop.querySelector('[data-notice-id="' + focusKey[0] + '"][data-notice-action="' + focusKey[1] + '"]') || noticePop.querySelector("button"))?.focus();
  };
  // Only what needs the person (a decision, a failure, a reminder that is due) shows before the input; news about a work
  // is a mark on that work's tab and in the list of works, gone once it is seen.
  const paintAttention = () => {
    const open = notices.filter((notice) => !notice.held);
    const urgent = open.filter((notice) => URGENT.has(notice.kind)).length + pluginWaiting + attentionObjectsCount;
    if (noticeBtn) {
      if (urgent > lastUrgent) { noticeBtn.removeAttribute("data-bump"); void noticeBtn.offsetWidth; noticeBtn.setAttribute("data-bump", ""); }
      lastUrgent = urgent;
      noticeBtn.hidden = !urgent && !canRestoreAttention;
      if (attentionCount) attentionCount.textContent = urgent ? globalThis.t.text("workbench.assistant-notice.waiting", { count: urgent }) : "";
      noticeBtn.setAttribute("aria-label", urgent ? globalThis.t.text("workbench.assistant-notice.attention-count", { count: urgent }) : globalThis.t.text("workbench.assistant-notice.attention"));
    }
    unreadWorks = new Set(open.filter((notice) => notice.work_id && !URGENT.has(notice.kind)).map((notice) => notice.work_id));
    urgentWorks = new Set(open.filter((notice) => notice.work_id && URGENT.has(notice.kind)).map((notice) => notice.work_id));
    drawTabs(); paintList();
    if (noticePop && !noticePop.hidden) paintNotices();
  };
  const setNotices = (open) => {
    if (!noticePop) return;
    noticePop.hidden = !open;
    noticeBtn?.setAttribute("aria-expanded", String(open));
    if (open) {
      paintNotices(true); noticePop.querySelector("button")?.focus();
      void attentionObjects?.update().then(() => {
        if (!noticePop.hidden && document.activeElement === noticeBtn) {
          const first = [...objectList.querySelectorAll("[data-home-row] [tabindex], [data-home-row] button, .surface-correction-default summary")]
            .find(node => node.closest("[data-home-row]") && node.checkVisibility() && !node.disabled);
          (first || objectList.querySelector(".surface-correction-default summary"))?.focus();
        }
      });
    }
    else attentionObjects?.clear();
  };
  // Notices come with the page's attention read (attention.ts).
  const loadNotices = () => document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
  document.addEventListener("molis-work:attention", (event) => {
    const detail = event.detail || {};
    readBadge(detail.board_cursor);
    if (typeof detail.plugin_events_pending === "number" && detail.started > pluginHeldSince) pluginWaiting = detail.plugin_events_pending;
    if (Array.isArray(detail.notices)) {
      notices = detail.notices;
      // A work the person has open in front of them is being seen: its notices need no badge.
      if (panel && !panel.hidden && curId && notices.some((notice) => notice.work_id === curId && !notice.held)) { void settleNotice({ work_id: curId }, "seen"); return; }
    }
    paintAttention();
  });
  const settleNotice = async (target, state) => {
    try { await api("/notices", "POST", Object.assign({ state }, target)); } catch { /* the next read shows it again */ }
    loadNotices();
  };
  noticeBtn?.addEventListener("click", () => setNotices(noticePop.hidden));
  document.addEventListener("molis-work:attention-refresh", () => readBadge());
  document.addEventListener("molis-work:model-ready", () => { if (problem && /模型/.test(problem.action || "")) { problem = null; render(); } });
  document.addEventListener("molis-work:plugin-events", (event) => { pluginHeldSince = performance.now(); pluginWaiting = Number(event.detail?.pending) || 0; paintAttention(); });`;
