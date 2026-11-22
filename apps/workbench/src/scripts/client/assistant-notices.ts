import { AUTOMATION_OFFER_INTERVAL_MS } from "@molis-ai/molis-work-contracts/services/automation-recommender";

/** What deserves the person's attention: the notices, their count, the quiet rules, model readiness and plugin events. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_NOTICES_PART = String.raw`  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
  const noticeBtn = island.querySelector("[data-assistant-attention]");
  const attentionCount = island.querySelector("[data-assistant-attention-count]");
  const noticePop = island.querySelector("[data-assistant-notices]");
  const objectList = el("div", "assistant-attention-objects"), noticeList = el("div", "assistant-notice-list");
  objectList.dataset.attentionObjects = "";
  // One popover, two things (方案第九节「等你的有哪几种」; 用户 2026-11-17 第 19 条): the objects that want a look open from their card
  // in the stack; the notices (a connection lost, a model not ready, plugin deliveries, news of a work) from the account bar's key.
  const noticeTitle = el("p", "assistant-popover-title", "");
  noticePop?.append(noticeTitle, objectList, noticeList);
  const attentionRead = (body, signal) => host.positionRead("/api/host/surface-attention", body, signal);
  const attentionObjects = noticePop && host.positions?.mount(objectList, attentionRead, { source: () => ({}), onNavigate: () => setNotices(false) });
  let attentionObjectsCount = 0, attentionSubjects = [], canRestoreAttention = false, badgeRead = null, badgeAt = null;
  const readBadge = (cursor) => {
    if (!attentionObjects || document.hidden || cursor !== undefined && cursor === badgeAt) return;
    badgeAt = cursor; badgeRead?.abort();
    const pending = badgeRead = new AbortController();
    attentionRead({ count: true }, pending.signal).then(result => {
      if (!pending.signal.aborted && pending === badgeRead) { attentionObjectsCount = result.count; attentionSubjects = Array.isArray(result.subjects) ? result.subjects : []; canRestoreAttention = result.can_restore === true; paintAttention(); }
    }, () => {
      if (!pending.signal.aborted && pending === badgeRead) { badgeAt = null; attentionObjectsCount = 0; attentionSubjects = []; canRestoreAttention = false; paintAttention(); }
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
    if (!notices.length && !pluginWaiting) noticeList.append(el("p", "assistant-material-origin", globalThis.t.text("workbench.assistant-notice.none")));
    if (focusKey) (noticePop.querySelector('[data-notice-id="' + focusKey[0] + '"][data-notice-action="' + focusKey[1] + '"]') || noticePop.querySelector("button"))?.focus();
  };
  // Only what needs the person (a decision, a failure, a reminder that is due) shows before the input; news about a work
  // is a mark on that work's tab and in the list of works, gone once it is seen.
  // On a project page the first place in the top strip says how much waits on the person, and this count is that same number
  // (WLN-39): the list behind it is still the notices and the plugins' items. It says it as an attribute; a change repaints here.
  // A standalone workbench bar (such as the Assistant specimen frame, without the top strip) still owns the bar, so the bell
  // reads 0 from [data-work-bar] instead of counting the notice list on its own.
  // Where there is an account bar (every project page), its 通知 key is the way to the notices and says how many want a hand; the
  // objects that want a look are a card of the stack (the foot leaves out the ones it already shows). Under 960px the account bar
  // is not drawn: the bell beside the input comes back for the notices alone. A frame with only the Assistant (no account bar,
  // no stack) keeps the bell beside the input for both, as before.
  const barNotices = document.querySelector("[data-bar-notices]"), barCount = barNotices?.querySelector("[data-bar-notices-count]"), barLabel = barNotices?.getAttribute("aria-label") || "";
  const barShown = () => Boolean(barNotices && barNotices.getClientRects().length);
  const paintAttention = () => {
    const open = notices.filter((notice) => !notice.held);
    const wanted = open.filter((notice) => URGENT.has(notice.kind)).length + pluginWaiting, listed = wanted + (barNotices ? 0 : attentionObjectsCount);
    if (barNotices) {
      if (barCount) { barCount.hidden = !wanted; barCount.textContent = String(wanted); }
      barNotices.setAttribute("aria-label", wanted ? globalThis.t.text("workbench.assistant-notice.attention-count", { count: wanted }) : barLabel);
    }
    if (noticeBtn) {
      if (listed > lastUrgent) { noticeBtn.removeAttribute("data-bump"); void noticeBtn.offsetWidth; noticeBtn.setAttribute("data-bump", ""); }
      lastUrgent = listed;
      // With nothing that wants a hand, what the list holds (news, held ones) keeps the bell in reach, without a number of its own.
      noticeBtn.hidden = barShown() || !listed && !notices.length && !canRestoreAttention;
      if (attentionCount) attentionCount.textContent = listed ? globalThis.t.text("workbench.assistant-notice.waiting", { count: listed }) : "";
      noticeBtn.setAttribute("aria-label", listed ? globalThis.t.text("workbench.assistant-notice.attention-count", { count: listed }) : globalThis.t.text("workbench.assistant-notice.attention"));
    }
    unreadWorks = new Set(open.filter((notice) => notice.work_id && !URGENT.has(notice.kind)).map((notice) => notice.work_id));
    urgentWorks = new Set(open.filter((notice) => notice.work_id && URGENT.has(notice.kind)).map((notice) => notice.work_id));
    drawHead(); paintList(); host.lineAttention?.();
    if (noticePop && !noticePop.hidden) paintNotices();
  };
  // \`what\`: "objects" (from the stack's card) or "notices" (from the account bar's key); the bell beside the input shows both.
  let noticeTrigger = null, noticeWhat = "both", lookOnly = null;
  // Opened from the stack's card, the list is what that card counted: an object that already has a card there is not said twice.
  const paintLook = () => {
    for (const row of objectList.querySelectorAll("[data-home-row]")) row.hidden = noticeWhat === "objects" && lookOnly !== null && !lookOnly.has(row.dataset.homeSubjectKind + ":" + row.dataset.homeSubjectId);
    for (const group of objectList.querySelectorAll("[data-home-group]")) group.hidden = [...group.querySelectorAll("[data-home-row]")].length > 0 && ![...group.querySelectorAll("[data-home-row]")].some(row => !row.hidden);
  };
  new MutationObserver(paintLook).observe(objectList, { childList: true, subtree: true });
  const setNotices = (open, what, trigger) => {
    if (!noticePop) return;
    if (open) {
      noticeWhat = what || (barNotices ? "notices" : "both"); if (noticeWhat !== "objects") lookOnly = null;
      noticeTrigger = trigger || (noticeWhat === "notices" && barShown() ? barNotices : noticeBtn);
      // With nothing that wants a look, the way to bring back what was put away stays with the notices.
      const objects = noticeWhat !== "notices" || !attentionObjectsCount && canRestoreAttention;
      noticePop.dataset.what = noticeWhat; objectList.hidden = !objects; noticeList.hidden = noticeWhat === "objects";
      noticeTitle.textContent = globalThis.t.text(noticeWhat === "objects" ? "workbench.assistant-notice.to-look-at" : noticeWhat === "notices" ? "workbench.account-bar.notices" : "workbench.assistant-notice.attention");
      // It opens over the key that opened it: the account bar's at the left, the stack's card at the right.
      const at = noticeTrigger && noticeTrigger !== noticeBtn && noticeTrigger.isConnected ? noticeTrigger.getBoundingClientRect() : null, frame = (noticePop.offsetParent || island).getBoundingClientRect();
      noticePop.style.left = at && noticeWhat === "notices" ? Math.round(Math.max(8 - frame.left, at.left - frame.left)) + "px" : "";
      noticePop.style.right = at && noticeWhat === "notices" ? "auto" : at ? Math.round(Math.max(8 - (innerWidth - frame.right), frame.right - at.right)) + "px" : "";
    }
    noticePop.hidden = !open;
    noticeBtn?.setAttribute("aria-expanded", String(open && noticeTrigger === noticeBtn));
    barNotices?.setAttribute("aria-expanded", String(open && noticeTrigger === barNotices));
    if (open) {
      paintNotices(true); (noticeList.hidden ? null : noticeList.querySelector("button"))?.focus();
      if (!objectList.hidden) void attentionObjects?.update().then(() => {
        if (!noticePop.hidden && (document.activeElement === noticeTrigger || document.activeElement === document.body || noticeList.hidden)) {
          const first = [...objectList.querySelectorAll("[data-home-row] [tabindex], [data-home-row] button, .surface-correction-default summary")]
            .find(node => node.closest("[data-home-row]") && node.checkVisibility() && !node.disabled);
          (first || objectList.querySelector(".surface-correction-default summary"))?.focus();
        }
      });
      else attentionObjects?.clear();
    }
    else attentionObjects?.clear();
  };
  barNotices?.addEventListener("click", () => { const shut = noticePop.hidden || noticeTrigger !== barNotices; setNotices(shut, "notices", barNotices); });
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
  if (project) {
    let looking = false;
    const look = async () => {
      if (looking || document.hidden || !island.isConnected) return;
      looking = true;
      try {
        const result = await molisWorkRequest(host.route("/api/automation/recommendations/offer"), { method: "POST", body: {} });
        if (result?.offered) loadNotices();
      } catch { /* The next look can retry without interrupting the project. */ }
      finally { looking = false; }
    };
    setTimeout(look, 1500);
    const interval = setInterval(() => { if (island.isConnected) void look(); else clearInterval(interval); }, ${AUTOMATION_OFFER_INTERVAL_MS});
    document.addEventListener("visibilitychange", look);
  }
  noticeBtn?.addEventListener("click", () => setNotices(noticePop.hidden || noticeTrigger !== noticeBtn, undefined, noticeBtn));
  if (barNotices) matchMedia("(max-width:959px)").addEventListener("change", () => { setNotices(false); paintAttention(); });
  document.addEventListener("molis-work:attention-refresh", () => readBadge());
  document.addEventListener("molis-work:model-ready", () => { if (problem && problem.action_kind === "open_model_settings") { problem = null; render(); } });
  document.addEventListener("molis-work:plugin-events", (event) => { pluginHeldSince = performance.now(); pluginWaiting = Number(event.detail?.pending) || 0; paintAttention(); });`;
