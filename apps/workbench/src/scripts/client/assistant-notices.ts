/** What deserves the person's attention: the notices, their count, the quiet rules, model readiness and plugin events. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_NOTICES_PART = String.raw`  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
  const noticeBtn = island.querySelector("[data-assistant-attention]");
  const attentionCount = island.querySelector("[data-assistant-attention-count]");
  const noticePop = island.querySelector("[data-assistant-notices]");
  let notices = [];
  // Plugin notifications waiting for a decision in the market: counted by the attention read, and by the market's list,
  // which is newer than a read that started before it.
  let pluginWaiting = 0, pluginHeldSince = -1;
  const URGENT = new Set(["needs-decision", "failed", "reminder"]);
  let lastUrgent = 0;
  const paintNotices = (force) => {
    if (!noticePop) return;
    // Polling repaints only what changed, and keeps focus on the same button: a list rebuilt under the person's
    // finger or keyboard focus loses the tap or drops focus to the page.
    const signature = JSON.stringify([pluginWaiting, notices.map((notice) => [notice.notice_id, noticeText(notice), notice.held && notice.held.reason])]);
    if (!force && noticePop.dataset.signature === signature) return;
    noticePop.dataset.signature = signature;
    const focused = noticePop.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? [focused.dataset.noticeId, focused.dataset.noticeAction] : null;
    noticePop.replaceChildren(el("p", "assistant-popover-title", L("等你处理")));
    const open = notices.filter((notice) => !notice.held && URGENT.has(notice.kind)), news = notices.filter((notice) => !notice.held && !URGENT.has(notice.kind)), held = notices.filter((notice) => notice.held);
    const row = (notice) => {
      const item = el("div", "assistant-notice"), text = noticeText(notice);
      item.append(el("p", "assistant-notice-text", text));
      if (notice.held) item.append(el("p", "assistant-material-origin", L("按你的规则暂不提醒") + "：" + notice.held.reason));
      const actions = el("div", "assistant-notice-actions");
      const go = el("button", "mw-btn mw-btn--secondary", L("打开")); go.type = "button";
      go.dataset.noticeId = notice.notice_id; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", L("打开") + "：" + text);
      go.addEventListener("click", async () => {
        setNotices(false);
        if (notice.open) {
          void settleNotice({ notice_id: notice.notice_id }, "seen");
          const where = notice.open.project_id || "personal", here = project ? project.id : "personal";
          if (where === here && host.openItem) { host.openItem(notice.open.surface, notice.open.id, notice.open.title); return; }
          openOnItsPage(notice.open, notice.open.title, where);
          return;
        }
        await switchTo(notice.work_id); setPanel(true); void settleNotice({ work_id: notice.work_id }, "seen");
      });
      if ((notice.kind === "reminder" || notice.kind === "directory-read") && !notice.open) go.hidden = true;
      const done = el("button", "mw-btn mw-btn--ghost", L("知道了")); done.type = "button";
      done.dataset.noticeId = notice.notice_id; done.dataset.noticeAction = "dismiss";
      done.setAttribute("aria-label", L("知道了") + "：" + text);
      done.addEventListener("click", () => settleNotice({ notice_id: notice.notice_id }, "dismissed"));
      actions.append(go, done);
      item.append(actions);
      return item;
    };
    if (pluginWaiting) {
      // Settled only in the market's review, so this row has no "知道了": it goes when the notifications are handled.
      const item = el("div", "assistant-notice");
      const text = L("插件通知：{count} 条待核对").replace("{count}", String(pluginWaiting));
      item.append(el("p", "assistant-notice-text", text));
      const actions = el("div", "assistant-notice-actions");
      const go = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("去核对")); go.type = "button";
      go.dataset.noticeId = "plugin-events"; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", L("去核对") + "：" + text);
      go.addEventListener("click", () => { setNotices(false); document.dispatchEvent(new CustomEvent("molis-work:plugin-events-open")); });
      actions.append(go); item.append(actions); noticePop.append(item);
    }
    open.forEach((notice) => noticePop.append(row(notice)));
    if (news.length) {
      const fresh = el("details", "assistant-notices-held");
      fresh.append(el("summary", "", L("有新结果") + " · " + news.length));
      news.forEach((notice) => fresh.append(row(notice)));
      noticePop.append(fresh);
    }
    if (held.length) {
      const quiet = el("details", "assistant-notices-held");
      quiet.append(el("summary", "", L("按你的规则暂不提醒") + " · " + held.length));
      held.forEach((notice) => quiet.append(row(notice)));
      noticePop.append(quiet);
    }
    if (!notices.length && !pluginWaiting) noticePop.append(el("p", "assistant-material-origin", L("现在没有需要你看的事")));
    if (focusKey) (noticePop.querySelector('[data-notice-id="' + focusKey[0] + '"][data-notice-action="' + focusKey[1] + '"]') || noticePop.querySelector("button"))?.focus();
  };
  // Only what needs the person (a decision, a failure, a reminder that is due) shows before the input; news about a work
  // is a mark on that work's tab and in the list of works, gone once it is seen.
  const paintAttention = () => {
    const open = notices.filter((notice) => !notice.held);
    const urgent = open.filter((notice) => URGENT.has(notice.kind)).length + pluginWaiting;
    if (noticeBtn) {
      if (urgent > lastUrgent) { noticeBtn.removeAttribute("data-bump"); void noticeBtn.offsetWidth; noticeBtn.setAttribute("data-bump", ""); }
      lastUrgent = urgent;
      noticeBtn.hidden = !urgent;
      if (attentionCount) attentionCount.textContent = urgent ? L("等你") + " " + urgent : "";
      noticeBtn.setAttribute("aria-label", L("等你处理") + " · " + urgent);
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
    if (open) { paintNotices(true); noticePop.querySelector("button")?.focus(); }
  };
  // Notices come with the page's attention read (attention.ts).
  const loadNotices = () => document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
  document.addEventListener("molis-work:attention", (event) => {
    const detail = event.detail || {};
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
  document.addEventListener("molis-work:model-ready", () => { if (problem && /模型/.test(problem.action || "")) { problem = null; render(); } });
  document.addEventListener("molis-work:plugin-events", (event) => { pluginHeldSince = performance.now(); pluginWaiting = Number(event.detail?.pending) || 0; paintAttention(); });`;
