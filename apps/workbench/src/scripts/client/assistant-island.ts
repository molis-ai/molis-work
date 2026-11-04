import { ASSISTANT_STAGE_FACTORY, ASSISTANT_ELEMENT_SCRIPT, ASSISTANT_PLACER_SCRIPT } from "./assistant-stage.js";
import { codeLanguage, codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { assistantCodeColours, createAssistantCodeGrow } from "./assistant-code-grow.js";
import { ASSISTANT_SEND_CLIENT_SCRIPT, ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "./assistant-send.js";
import { ASSISTANT_FOLLOW_FACTORY_SCRIPT } from "./assistant-follow.js";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "./assistant-step-row.js";
import type { AssistantPendingReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { ARTIFACT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { renderAssistantTextHtml, renderAssistantReviewHtml, renderAssistantNoticeText } from "../../assistant-text-html.js";
import { ASSISTANT_CHOOSERS_PART } from "./assistant-choosers.js";
import { ASSISTANT_BROWSER_HANDBACK_PART } from "./assistant-browser-handback.js";
import { ASSISTANT_LAYOUT_PART } from "./assistant-layout.js";
import { ASSISTANT_CONVERSATION_PART } from "./assistant-conversation.js";
import { ASSISTANT_SIDE_KIT_PART } from "./assistant-side-kit.js";
import { ASSISTANT_SIDE_PATH_PART } from "./assistant-side-path.js";
import { ASSISTANT_STRIP_PART } from "./assistant-strip.js";
import { ASSISTANT_TABS_PART } from "./assistant-tabs.js";
import { ASSISTANT_NOTICES_PART } from "./assistant-notices.js";
import { ASSISTANT_MATERIALS_PART } from "./assistant-materials.js";
import { ASSISTANT_COMPOSER_PART } from "./assistant-composer.js";
import { ASSISTANT_PAGE_MESSAGES_PART } from "./assistant-page-messages.js";
// The SDK's tokenizer is consumed here on the Host, never serialized into the Assistant's browser script.
const assistantGrownTokens = assistantCodeColours(growCodeTokens, codeTokens);
export const assistantTextHtml = (text: string, objects: AssistantWorkView["objects"], say: (text: string) => string): string =>
  renderAssistantTextHtml(text, { objects, say, language: codeLanguage, tokens: assistantGrownTokens });
export const assistantReviewHtml = (review: AssistantPendingReview, say: (text: string) => string): string =>
  renderAssistantReviewHtml(review, { objects: [], say, language: codeLanguage, tokens: codeTokens });

/**
 * The resident Assistant in the bottom bar: one assistant, many works.
 *
 * Every fact shown here comes from the Host (`/api/assistant`): a work's state is its real run's state, a question is
 * the run's own pending question, a confirmation is the Host's review of the exact effect. The page only decides where
 * the next Send goes, and never sends anything the person did not send.
 *
 * Notes kept out of the served script (a comment in it is bytes the browser downloads and never runs). `namedObject`: A name in 「…」 that this work knows (one of its objects) opens where it lives: the answer points at the thing itself. `list items`: A model sometimes drops the space after a list's dash on one line (“-30 分钟” among “- 60 分钟”): beside a real item, it is one too. `ownStop`: A round the runtime stopped on its own (a guard, a breaker) says why in its own words; one the person stopped says so. `notices`: What needs the person first; news about a work (done, a result, new material) folds below — it also shows on the work. `reminder open`: A reminder opens its item where it lives: here when it is this page's project, otherwise on its own project's page. `pane switcher`: Split into panes, the switcher names each one: the page being worked on is the focused pane, not all of them run together. `delegated Send`: A delegated Send reuses its message id, so the same message twice starts one work. Its words are the page's: pageText marks them. `retried Send`: A Send whose outcome is unknown (the connection dropped) is retried with the same id, so the Host starts nothing twice. `project`: The project the next new work belongs to. The project list changes it as the person looks from one project to another. `searchKey`: Search opens with ⌘K (Ctrl K elsewhere); a touch screen has no key to name. `answer busy`: While a question's answer is on its way its button shows the shared loading mark, and ⌘↵ (or a closed card with no button) sends nothing.
 */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = String.raw`(host) => {
  const L = host.translate, noticeText = (notice) => (${renderAssistantNoticeText.toString()})(notice, L);
  const island = document.querySelector("[data-assistant-island]");
  if (!island) return null;
  const panel = island.querySelector("[data-assistant-panel]");
  const compose = island.querySelector("[data-assistant-composer]");
  const input = island.querySelector("[data-assistant-input]");
  const send = island.querySelector("[data-assistant-send]");
  const thread = island.querySelector("[data-assistant-thread]");
  const empty = island.querySelector("[data-assistant-empty]");
  const workNav = island.querySelector("[data-assistant-works]");
  const worksToggle = island.querySelector("[data-assistant-works-toggle]");
  const titleEl = island.querySelector("[data-assistant-work-title]");
  const stateEl = island.querySelector("[data-assistant-work-state]");
  const nowEl = island.querySelector("[data-assistant-now]");
  const metaEl = island.querySelector("[data-assistant-meta]");
  const tabsEl = island.querySelector("[data-assistant-tabs]");
  const side = island.querySelector("[data-assistant-side]");
  const sideToggle = island.querySelector("[data-assistant-side-toggle]");
  const sideDot = island.querySelector("[data-assistant-side-dot]");
  const blocks = Object.fromEntries([...island.querySelectorAll("[data-assistant-block]")].map((node) => [node.dataset.assistantBlock, node]));
  const target = island.querySelector("[data-assistant-target]");
  const targetWrap = island.querySelector("[data-assistant-target-wrap]");
  const targetLabel = island.querySelector("[data-assistant-target-label]");
  const targetClear = island.querySelector("[data-assistant-target-clear]");
  const newButton = island.querySelector("[data-assistant-new]");
  if (!compose || !input || !send || !thread || !target) return null;
  let project = host.project && host.project.id ? host.project : null;
  const searchKey = () => !document.querySelector("[data-global-search-open], [data-global-search-dialog]") || (window.matchMedia && window.matchMedia("(hover: none)").matches) ? ""
    : /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  const STATE_LABELS = { idle: "尚未开始", running: "进行中", "waiting-input": "等你回答", "waiting-review": "等你确认", paused: "已暂停",
    completed: "已完成", failed: "没有完成", stopped: "已停止", "needs-check": "需要核对" };
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } },
  };
  const CURRENT_KEY = "molis.assistant.current";
  const NEW_DRAFT_KEY = "molis.assistant.new-draft";
  let works = [];
  let curId = store.get(CURRENT_KEY);
  let view = null;
  let busy = false;
  let problem = null;
  let nextScope = project ? "project" : "personal";
  let nextExec = "assistant";
  // The first round's mode for a new plugin work (empty: its default); after that the session keeps it.
  let nextMode = "";
${ASSISTANT_CHOOSERS_PART}
${ASSISTANT_BROWSER_HANDBACK_PART}
  let draftTimer = 0, draftWrite = Promise.resolve();
  let activeSend = null;

  const api=(path,method,body,route=host.route("/api/assistant"+path))=>molisWorkRequest(route,{method:method||"GET",body,fallback:L("助理暂时无法完成")});
  const loadExecutors = () => project ? api("/executors").then((res) => { executors = res.executors || []; if (nextExec !== "assistant" && !executorOffer(nextExec)) nextExec = "assistant"; paintAim(); paintSum(); }).catch(() => { executors = []; }) : Promise.resolve();
  const executorsLoaded = loadExecutors();
  const el = ${ASSISTANT_ELEMENT_SCRIPT}, receipts = (${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})({ L, shared: host.receipts, chip: island.querySelector("[data-assistant-answer]"), api, work: () => curId, reload: () => reload(),
    pact: (content, badge) => paintBlock(blocks.agreements, L("AI 记下的约定"), "list", content, badge) });
  const stateLabel = (state) => L(STATE_LABELS[state] || state || ""); const ringState = state => ({ "waiting-input": "answer", "waiting-review": "approval", "needs-check": "verify", completed: "round-ended" })[state] || state;
  const scopeLabel = (scope, title) => !scope ? "" : scope.kind === "personal" ? L("个人")
    : title || (project && scope.project_id === project.id ? (project.title || L("本项目")) : L("另一个项目"));
  const getWork = () => works.find((work) => work.work_id === curId) || (view && view.work.work_id === curId ? view.work : null);
  const isLive = (state) => state === "running" || state === "waiting-input" || state === "waiting-review" || state === "paused";
  let presentation, stepRow;
  const setPanel = (open) => { if (!presentation?.show(open) && panel) panel.hidden = !open; };
  let attachments = null;
  const syncSend = () => { send.disabled = busy || !!getWork()?.reply_target || !String(input.value || "").trim() || !!attachments?.reading(); };

  /* ─── Where the next Send goes ─────────────────────────────────────────── */
  const paintAim = () => {
    const work = getWork(); presentation?.syncWork(work); input.readOnly = !!work?.reply_target;
    if (work) {
      targetLabel.textContent = work.reply_target ? L("回复到原评论") + "：" + work.reply_target.title : (isLive(work.state) ? L("补充到") : L("继续")) + "：" + work.title;
      target.title = work.reply_target ? L("请回到原评论继续回复") : L("下一次发送进入这项工作；点 × 改为开始新工作");
      if (targetClear) targetClear.hidden = false;
      if (targetWrap) { targetWrap.dataset.mode = "work"; targetWrap.hidden = false; }
    } else {
      targetLabel.textContent = L("新工作") + " · " + (nextScope === "project" && project ? (project.title || L("本项目")) : L("个人"));
      target.title = project ? L("点击切换：新工作属于本项目，或属于你个人（不需要项目）") : L("新工作属于你个人");
      if (targetClear) targetClear.hidden = true;
      // A new work needs no chip: where it lives and who does it are in “+”; the input says the rest.
      if (targetWrap) { targetWrap.dataset.mode = "new"; targetWrap.hidden = true; }
    }
    // A page that knows what the person is looking at (the project list) may say so in the placeholder of a new work.
    const hint = !work && nextExec === "assistant" && host.placeholder ? host.placeholder(project) : "";
    input.placeholder = work?.reply_target ? L("请回到原评论继续回复") : work ? L("补充、回答或纠正…") : nextExec !== "assistant" && executorOffer(nextExec) ? L("让 {name} 做点什么…", { name: executorOffer(nextExec).title })
      : hint ? hint : searchKey() ? L("让助理做点什么，或按 {key} 搜索").replace("{key}", searchKey()) : L("让助理做点什么…");
    // A plugin work shows the mode its next round runs in — the session's own setting, the same one its page shows.
    if (modeButton) {
      // A new work that continues a session open on the page runs in that session's own mode, shown once it is the work's.
      const offer = modeOffer(), shown = Boolean(offer && offer.modes.length && (work || !executorSession(nextExec)));
      modeButton.hidden = !shown;
      if (shown && modeLabel) {
        const wanted = work ? work.executor.mode || offer.default_mode : nextMode || offer.default_mode;
        const name = L((offer.modes.find((one) => one.id === wanted) || { title: wanted }).title), [before, after = ""] = L("方式：{mode}", { mode: "\u0000" }).split("\u0000"), label = before + name + after;
        modeLabel.replaceChildren(el("span", "assistant-mode-word", before), name, el("span", "assistant-mode-word", after)); // a narrow bar shows the mode alone
        modeButton.setAttribute("aria-label", L(work ? "下一轮的方式" : "第一轮的方式") + " · " + label);
      }
    }
    if (charBtn) {
      const allowed = allowsCharacter(), chosen = chosenCharacter();
      // Shown only once changed from the Assistant itself; choosing is in “+”.
      charBtn.hidden = !allowed || !chosen;
      charBtn.toggleAttribute("data-chosen", Boolean(allowed && chosen));
      if (allowed && characterLabel) {
        characterLabel.textContent = L("角色") + "：" + (chosen ? chosen.title : L("助理"));
        charBtn.setAttribute("aria-label", L("由哪个角色负责") + " · " + (chosen ? chosen.title + " v" + chosen.version : L("助理自己")));
      }
    }
    // Who carries the next new work: chosen before sending; an existing work keeps its own.
    if (execBtn) {
      execBtn.hidden = Boolean(work) || !executorsHere() || nextExec === "assistant";
      if (!executorsHere() && nextExec !== "assistant") nextExec = "assistant";
      execBtn.toggleAttribute("data-chosen", nextExec !== "assistant");
      if (executorLabel) executorLabel.textContent = L((executorChoices().find((one) => one.id === nextExec) || executorChoices()[0]).label)
        + (nextExec !== "assistant" && executorSession(nextExec) ? " · " + L("当前会话") : "");
    }
  };
  execBtn?.addEventListener("click", () => setExecs(execsPop.hidden));
  const remember = () => store.set(CURRENT_KEY, curId);

  /* ─── Tabs: one per open work; which are open is this viewer's own convenience ─ */
  const TABS_KEY = "molis.assistant.tabs";
  const MAX_TABS = 6;
  let tabs = (() => { try { const saved = JSON.parse(store.get(TABS_KEY) || "[]"); return Array.isArray(saved) ? saved.filter((id) => typeof id === "string" && id).slice(0, MAX_TABS) : []; } catch { return []; } })();
  const seenAt = new Map();
  const saveTabs = () => store.set(TABS_KEY, tabs.length ? JSON.stringify(tabs) : null);
  // A tab keeps its place; when there are too many, the one looked at longest ago (never the current one) closes.
  const openTab = (id) => {
    if (!id) return;
    seenAt.set(id, Date.now());
    if (tabs.includes(id)) return;
    tabs.push(id);
    while (tabs.length > MAX_TABS) {
      const closable = tabs.filter((one) => one !== id && one !== curId);
      if (!closable.length) break;
      const oldest = closable.reduce((a, b) => (seenAt.get(a) || 0) <= (seenAt.get(b) || 0) ? a : b);
      tabs.splice(tabs.indexOf(oldest), 1);
    }
    saveTabs();
  };
  // Closing a tab only puts the work away: it stays in the list of works, and its notices still open it.
  const closeTab = (id) => {
    const at = tabs.indexOf(id);
    if (at < 0) return;
    tabs.splice(at, 1); saveTabs();
    if (id === curId) void switchTo(tabs[at] || tabs[at - 1] || null);
    else drawTabs();
  };
${ASSISTANT_LAYOUT_PART}

  /* Each work keeps its own unsent text. */
  const saveDraft = (immediate) => {
    clearTimeout(draftTimer);
    const id = curId, text = String(input.value || "");
    if (id && activeSend?.work === id) {
      const work = works.find((row) => row.work_id === id); if (work) work.draft = text;
      if (!immediate || text.trim() !== activeSend.body.text || activeSend.draft !== undefined) activeSend.draft = text;
      return;
    }
    const write = () => {
      if (!id) { store.set(NEW_DRAFT_KEY, text || null); return; }
      const work = works.find((row) => row.work_id === id);
      if (work && work.draft === text) return;
      if (work) work.draft = text;
      draftWrite = api("/works/" + encodeURIComponent(id) + "/draft", "POST", { draft: text }).catch(() => { /* kept on the page; the next edit retries */ });
    };
    if (immediate) write(); else draftTimer = setTimeout(write, 700);
  };
  const loadDraft = () => {
    const work = getWork();
    input.value = work ? (work.draft || "") : (store.get(NEW_DRAFT_KEY) || "");
    syncSend();
  };
  const switchTo = async (id) => {
    if (id === curId) return;
    saveDraft(true);
    curId = id; remember(); problem = null; view = null; pendingChar = undefined;
    openTab(id); if (!spacious()) drawerOpen = false;
    thread.querySelectorAll(":scope > [data-round], :scope > [data-review], :scope > .assistant-problem").forEach((node) => node.remove());
    loadDraft(); render(); paintLayout();
    if (panel) { panel.removeAttribute("data-arrive"); void panel.offsetWidth; panel.setAttribute("data-arrive", ""); }
    if (id) { await reload(); poll(); }
  };

  const { bindMore, growCode, paint: paintCode } = (${createAssistantCodeGrow.toString()})(L);
  const placer = ${ASSISTANT_PLACER_SCRIPT};
${ASSISTANT_CONVERSATION_PART}
  /* ─── The side pane: what this work is, how it got here, what it used and what it made ─ */
  const usageBox = island.querySelector("[data-assistant-usage]");
  const WAITING = new Set(["waiting-input", "waiting-review", "needs-check"]);
  // Works with news for the person (done, a result handed back, new material) and works waiting on them, from notices.
  let unreadWorks = new Set(), urgentWorks = new Set();
  const when = (iso) => { const at = new Date(iso); return Number.isFinite(at.getTime()) ? at.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };
  const showError = (next) => { problem = next; render(); };
  /* A change the Assistant made is announced once, so the surface that owns that data can show it (and not overwrite it). */
  const announced = new Set();
  let announcing = false;
  const announceEffects = (work, rounds) => {
    rounds.forEach((round) => round.activity.forEach((item) => {
      if (item.verb !== "change" || item.state !== "completed" || !item.capability_id || announced.has(item.call_id)) return;
      announced.add(item.call_id);
      if (announcing) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: item.capability_id } }));
    }));
  };
${ASSISTANT_SIDE_KIT_PART}

  /* 还等你处理: everything in this work that waits on the person besides the conversation's own cards, each with its button. */
  const renderAttention = (work) => {
    const node = blocks.attention;
    if (!node) return;
    const objects = work && view.objects ? view.objects.filter((o) => o.state !== "current") : [];
    const children = work && view.delegated ? view.delegated.filter((child) => WAITING.has(child.state) && !child.taken_back) : [];
    const suggestions = work && view.memory_candidates ? view.memory_candidates : [];
    const signature = JSON.stringify([work && work.work_id, objects.map((o) => [o.subject.id, o.state, o.title, o.current_revision]), children.map((c) => [c.work_id, c.state, c.title]), suggestions.map((c) => c.candidate_id)]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const cards = [];
      children.forEach((child) => cards.push(card({ icon: "workflow", tone: "attention", ask: true, title: child.title,
        sub: L("子任务") + " · " + stateLabel(child.state), actions: [sideAct(child.state === "waiting-input" ? L("去回答") : L("去看看"), child.title, async () => switchTo(child.work_id), false, "primary")] })));
      objects.forEach((object) => {
        const open = openObject(object);
        cards.push(card({ icon: "alert", tone: object.state === "missing" || object.state === "unavailable" ? "blocked" : "attention", ask: true, title: objectTitle(object),
          sub: object.state === "changed" ? L("用过之后被改过") + " · " + objectDetail(object) : objectState(object),
          actions: open ? [sideAct(L("打开看看"), object.title, open, false, "secondary")] : [] }));
      });
      suggestions.forEach((candidate) => {
        const settle = (path) => async () => { await api("/memory-candidates/" + encodeURIComponent(candidate.candidate_id) + path, "POST", {}); await reload(); };
        cards.push(card({ icon: "sparkles", tone: "suggest", ask: true, title: L(candidate.held ? "你刚才让我记住" : "要记住吗") + "：" + candidate.text, detail: candidate.held,
          sub: (candidate.held ? "" : candidate.why + " · ") + proc.memoryScope(candidate.scope),
          actions: [sideAct(L("记住"), candidate.text, settle("/accept"), false, "primary"), sideAct(L("不用"), candidate.text, settle("/discard"), false, "secondary")] }));
      });
      paintBlock(node, L("还等你处理"), "bell", cards.length ? stack(cards) : null, String(cards.length), true, true);
    });
  };

${ASSISTANT_SIDE_PATH_PART}

  /* 上下文, 工作环境, 连接与工具 are drawn in assistant-side-context.ts: what the next Send carries and what rounds used; where the work runs and what it can call. */
  const MATERIAL_KIND = { image: "图片", file: "文件", method: "方法", capability: "能力", text: "文字", selection: "选中的内容", object: "引用" };

  /* 产出: what it made, a fixed version kept in the 成果库 (固定成果) apart from objects their owners keep changing (工作文件); each card opens it or takes it back. */
  const renderResults = (work) => {
    const node = blocks.results;
    if (!node) return;
    const results = work && view.objects ? view.objects.filter((o) => o.relation === "result") : [];
    const undoable = work && view.undoable ? view.undoable : [];
    const jobs = work && view.jobs ? view.jobs : [];
    const unsettled = work && view.unsettled ? view.unsettled : [];
    const kept = work && view.memory_changes ? view.memory_changes : [];
    const signature = JSON.stringify([work && work.work_id, results.map((o) => [o.subject.id, o.state, o.title, o.current_revision]), undoable.map((u) => [u.undo_id, u.state, u.detail]),
      jobs.map((j) => [j.job_id, j.state]), unsettled.map((u) => [u.change_id, u.state, u.detail]), kept.map((m) => [m.change_id, m.state, m.undoable, m.text])]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node.parentNode, () => {
      const UNDO = { available: "可以撤销", undone: "已撤销", failed: "没能撤销" };
      const made = results.map((o) => pickable(objectCard(o, "done"), o, objectTitle(o))), fixed = made.filter((_, i) => results[i].subject.kind === ${JSON.stringify(ARTIFACT_SUBJECT_KIND)});
      const changes = undoable.slice().reverse().map((change) => card({ icon: change.state === "undone" ? "undo" : "edit", tone: change.state === "failed" ? "blocked" : "",
        title: change.title, sub: L(UNDO[change.state] || change.state) + (change.detail ? "：" + change.detail : ""), subTone: change.state === "failed" ? "blocked" : "", done: change.state === "undone",
        actions: change.state !== "undone" ? [sideAct(L("撤销"), change.title, async () => {
          view = await api("/works/" + encodeURIComponent(work.work_id) + "/undo/" + encodeURIComponent(change.undo_id), "POST", {});
          // Taken back: the owner's page rereads, as it did when the change was made.
          const taken = (view.undoable || []).find((one) => one.undo_id === change.undo_id);
          if (taken && taken.state === "undone" && taken.capability_id) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: taken.capability_id } }));
          render();
        }, false, "secondary", "undo")] : [] }));
      const JOB = { running: "进行中", completed: "已完成", failed: "没有完成", unknown: "不再跟进，请到原处查看" };
      const background = jobs.map((job) => card({ icon: spinner(job.state === "running" ? "running" : job.state === "completed" ? "round-ended" : job.state === "failed" ? "failed" : "verify"),
        tone: job.state === "completed" ? "done" : job.state === "failed" ? "blocked" : "", title: job.title, sub: L(JOB[job.state] || job.state) }));
      /* A change still with its owner when the round stopped: what it finally did, never re-sent. */
      const SETTLED = { pending: "还在等它的结果，不会重新提交", completed: "停止后已完成", failed: "停止后失败", "not-run": "停止时还没开始，没有执行" };
      const stopped = unsettled.map((change) => card({ icon: spinner(({pending:"waiting",completed:"done",failed:"failed","not-run":"stopped"})[change.state] || "verify"), title: change.title, sub: L(SETTLED[change.state] || change.state) + (change.detail ? "：" + change.detail : "") }));
      /* Memory the work kept (asked for, or kept on its own): the memory service owns it; this is where it can be taken back. */
      // The memory service names more kinds than these; one this panel does not know reads as plainly kept.
      const KEPT = { kept: "", auto_kept: "自动记住", replaced: "替换了旧的一条", auto_replaced: "自动替换了旧的一条", merged: "和旧的一条合并", edited: "改过",
        auto_disabled: "自动停用", disabled: "助理按你的要求停用" };
      // What undoing did depends on the kind: a memory kept on its own is deleted (its words go with it), a replacement
      // goes back to the earlier version, a memory switched off is on again. The last two keep the words they undid.
      const UNDONE = { auto_replaced: "已撤销（回到了原来那条）", auto_disabled: "已撤销（已重新启用）", disabled: "已撤销（已重新启用）" };
      const remembered = kept.map((change) => {
        const undone = change.state === "undone";
        const actions = [];
        if (change.undoable && !undone) actions.push(sideAct(L("撤销"), change.text, async () => {
          await molisWorkRequest(host.route("/api/memory/changes/"+encodeURIComponent(change.change_id)+"/undo"),{method:"POST",fallback:L("没能撤销")});
          await reload();
        }, false, "secondary", "undo"));
        if (!undone) actions.push(sideAct(L("去设置查看"), change.text, async () => {
          // The settings surface opens its memory section when it hears this; with nobody listening, go there.
          const handled = !window.dispatchEvent(new CustomEvent("molis-work:open-settings-section", { detail: { section: "memory" }, cancelable: true }));
          const scoped = change.scope === "project" ? change.project_id || (project && project.id) : "";
          if (!handled) location.assign(scoped ? "/projects/" + encodeURIComponent(scoped) + "/settings/memory" : "/settings/memory");
        }, true));
        const scope = proc.memoryScope(change.scope);
        if (undone && (!UNDONE[change.kind] || !change.text)) return card({ icon: "sparkles", title: L("已撤销（已从记忆里删掉）"), done: true, sub: scope, actions });
        return card({ icon: "sparkles", tone: undone ? "" : "suggest", title: change.text, done: undone,
          sub: [scope, undone ? L(UNDONE[change.kind]) : KEPT[change.kind] ? L(KEPT[change.kind]) : ""].filter(Boolean).join(" · "), actions });
      });
      // Three groups of one kind (VUX-08): what it made, what it changed and how each stands, what still runs elsewhere; a failure shows folded.
      const list = (block, ...parts) => { const box = el("div", "assistant-group-list"); parts.forEach(([label, cards]) => cards.length && box.append(group(label, stack(cards, work.work_id + ":" + block + ":" + label)))); return box.children.length ? box : null; };
      const failed = undoable.concat(unsettled).filter((one) => one.state === "failed").length, canUndo = undoable.filter((one) => one.state === "available").length, running = jobs.filter((job) => job.state === "running").length, missed = jobs.filter((job) => job.state === "failed").length;
      paintBlock(node, L("产出"), "package", list("results", [L("固定成果"), fixed], [L("工作文件"), made.filter((card) => !fixed.includes(card))]), String(made.length));
      paintBlock(blocks.changes, L("变更"), "edit", list("changes", ["", changes], [L("停止时仍在执行"), stopped], [L("记住的事"), remembered]), failed ? failed + " " + L("项失败") : canUndo ? canUndo + " " + L("项可撤销") : String(changes.length + stopped.length + remembered.length), failed > 0);
      paintBlock(blocks.background, L("后台任务"), "clock", list("background", ["", background]), missed ? missed + " " + L("项没有完成") : running ? running + " " + L("项进行中") : String(jobs.length), missed > 0);
    });
  };

  /* What this work used (its sub-tasks with it) and the cap the person gave it; a sub-task shows its delegating work's. */
  const renderUsage = (work) => usagePane.paint(work);
  // Raising a work's cap is done in its usage box: the side pane opens on it.
  const openUsage = () => {
    if (spacious()) store.set(SIDE_KEY, null); else drawerOpen = true;
    paintLayout();
    const details = usageBox?.querySelector("details");
    if (details) details.open = true;
    usageBox?.querySelector("input")?.focus();
  };

${ASSISTANT_STRIP_PART}
  const metaRow = (label, ...content) => { const term = el("dt", "", label), detail = el("dd"); detail.append(...content); return [term, detail]; };
  function paintSum() {
    const work = view && view.work.work_id === curId ? view.work : getWork();
    titleEl.textContent = work ? work.title : L("新工作");
    stateEl.textContent = work ? stateLabel(work.state) : "";
    stateEl.dataset.state = work ? work.state : ""; if (work) stateEl.dataset.mwState = ringState(work.state); else stateEl.removeAttribute("data-mw-state");
    const summary = island.querySelector(".assistant-summary");
    if (summary) summary.dataset.tone = !work ? "" : WAITING.has(work.state) ? "waiting" : work.state === "running" ? "running" : work.state === "failed" || work.state === "stopped" ? "failed" : "";
    const now = nowLine(work);
    if (nowEl) { nowEl.textContent = now; nowEl.hidden = !now; }
    const state = work ? work.state : "idle";
    // The same controls sit in the summary and in the conversation's top line: both follow the state.
    const controls = (kind) => island.querySelectorAll('[data-assistant-control="' + kind + '"]');
    controls("pause").forEach((btnEl) => { btnEl.hidden = state !== "running"; });
    controls("resume").forEach((btnEl) => { btnEl.hidden = state !== "paused"; });
    /* Stop also reaches the sub-tasks it handed out, so it stays offered while any of them still runs. */
    const liveChildren = work && view && view.delegated ? view.delegated.filter((child) => isLive(child.state)).length : 0;
    controls("stop").forEach((btnEl) => { btnEl.hidden = btnEl.hasAttribute("data-keep-connections") ? state !== "waiting-input" || work.executor.kind !== "assistant" : !isLive(state) && !liveChildren; });
    paintStrip();
    if (!metaEl) return;
    const characters = allowsCharacter() ? characterChoices() : null;
    // A chooser only when there is something to choose: a project's published Characters.
    const hasChoices = Boolean(characters && characters.length);
    const chosen = chosenCharacter();
    const signature = JSON.stringify([work && work.work_id, work && work.executor, work && work.scope, work && work.character, work && isLive(work.state), pendingChar,
      nextExec, nextScope, nextMode, nextChar, executors.map((one) => [one.plugin_id, one.title, one.problem, one.modes]), executorSession(nextExec), characters && characters.map((c) => [c.reference, c.available])]);
    if (metaEl.dataset.signature === signature) return;
    metaEl.dataset.signature = signature;
    keepFocus(metaEl, () => {
      const rows = [];
      const characterPicker = () => {
        // The design system's own select: it becomes the shared picker, sized down for the side pane.
        const select = el("select", "mw-select"); select.setAttribute("aria-label", L("由哪个角色负责（从下一轮开始）"));
        const own = el("option", "", L("助理自己")); own.value = ""; select.append(own);
        (characters || []).forEach((choice) => {
          const option = el("option", "", choice.title + " v" + choice.reference.version + (choice.available ? "" : " · " + (choice.reason || L("当前不可用"))));
          option.value = choice.reference.artifact_id + "@" + choice.reference.version; option.disabled = !choice.available;
          option.selected = Boolean(chosen && chosen.artifact_id === choice.reference.artifact_id && chosen.version === choice.reference.version);
          select.append(option);
        });
        select.addEventListener("change", () => {
          const choice = (characters || []).find((one) => one.reference.artifact_id + "@" + one.reference.version === select.value);
          const value = choice ? { artifact_id: choice.reference.artifact_id, version: choice.reference.version, title: choice.title } : null;
          if (getWork()) pendingChar = value; else nextChar = value;
          paintAim(); paintSum();
        });
        return select;
      };
      if (work) {
        rows.push(...metaRow(L("属于"), document.createTextNode(scopeLabel(work.scope, work.scope_title))));
        if (work.executor.kind === "plugin") {
          const offer = modeOffer();
          rows.push(...metaRow(L("谁来做"), document.createTextNode(work.executor.title)));
          if (offer && offer.modes.length) rows.push(...metaRow(L("方式"), segmented(L("下一轮的方式（与插件自己的页面同一设置）"), modeRows(offer), work.executor.mode || offer.default_mode, (id) => void applyMode(id))));
        } else if (allowsCharacter() && hasChoices) {
          rows.push(...metaRow(L("谁来做"), characterPicker()));
        } else rows.push(...metaRow(L("谁来做"), document.createTextNode(chosen ? L("角色") + "：" + chosen.title : L("助理"))));
        // The same work can change hands between rounds: to a plugin in its project, and back to the Assistant.
        const toPlugins = work.executor.kind === "assistant" && work.scope.kind === "project" ? executors.filter((one) => !one.problem) : [];
        if (!isLive(work.state) && (toPlugins.length || work.executor.kind === "plugin")) {
          const handOver = (label, to) => {
            const hand = el("button", "assistant-side-action", label); hand.type = "button";
            hand.addEventListener("click", async () => { hand.disabled = true;
              try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/handover", "POST", { to }); render(); input.focus(); }
              catch (error) { showError(error); } finally { if (hand.isConnected) hand.disabled = false; } });
            rows.push(...metaRow("", hand)); };
          toPlugins.forEach((one) => handOver(L("交给 {name} 继续", { name: one.title }), { kind: "plugin", plugin_id: one.plugin_id }));
          if (work.executor.kind === "plugin") handOver(L("回到助理"), { kind: "assistant" });
        }
      } else {
        // A new work: who carries it and where it lives are chosen here, before its first message.
        const who = executorChoices().map((one) => ({ id: one.id, label: L(one.label), hint: L(one.hint) }));
        rows.push(...metaRow(L("谁来做"), segmented(L("由谁来做"), who, nextExec, (id) => { nextExec = id; if (id !== "assistant") nextChar = null; paintAim(); paintSum(); })));
        if (nextExec === "assistant" && allowsCharacter() && hasChoices) rows.push(...metaRow(L("角色"), characterPicker()));
        if (nextExec !== "assistant" && modeOffer()) {
          const offer = modeOffer();
          if (executorSession(nextExec)) rows.push(...metaRow(L("方式"), document.createTextNode(L("接着当前打开的会话"))));
          else if (offer.modes.length) rows.push(...metaRow(L("方式"), segmented(L("第一轮的方式"), modeRows(offer), nextMode || offer.default_mode, (id) => void applyMode(id))));
        }
        if (nextExec === "assistant" && project) {
          rows.push(...metaRow(L("放在"), segmented(L("新工作放在"), [{ id: "project", label: project.title || L("本项目") }, { id: "personal", label: L("个人") }], nextScope,
            (id) => { nextScope = id; paintAim(); paintSum(); })));
        }
      }
      metaEl.replaceChildren(...rows);
    });
  }
  // Something in the side pane wants a look (an object changed or gone, a sub-task waiting, a suggestion, a cap reached).
  const paintSideDot = (work) => {
    if (!sideDot) return;
    const objects = work && view.objects ? view.objects : [];
    const children = work && view.delegated ? view.delegated : [];
    const usage = work && view.usage ? view.usage : null;
    const look = objects.some((o) => o.state !== "current") || children.some((child) => WAITING.has(child.state))
      || Boolean(work && view.memory_candidates && view.memory_candidates.length) || Boolean(usage && usage.budget_tokens !== null && usage.tokens >= usage.budget_tokens);
    sideDot.hidden = !look;
  };

${ASSISTANT_TABS_PART}
  const render = () => {
    const stick = nearBottom(), before = thread.scrollHeight;
    const work = view && view.work.work_id === curId ? view.work : null;
    if (work) {
      const index = works.findIndex((row) => row.work_id === work.work_id);
      if (index >= 0) works[index] = Object.assign({}, works[index], work, { draft: works[index].draft });
      else works.unshift(work);
    }
    renderAttention(work); renderPath(work); surroundings.paint(work); sideContext.paint(); renderResults(work); renderUsage(work);
    if (empty) empty.hidden = Boolean(curId);
    paintEmpty(); receipts.paint(work && view.rounds[view.rounds.length - 1]);
    const rounds = work ? view.rounds : [];
    if (work) announceEffects(work, rounds);
    [...thread.children].forEach((node) => { if (node.dataset.round && !rounds.some((round) => round.run_id === node.dataset.round)) node.remove(); });
    const put = placer(thread);
    if (empty) put(empty);
    const fromPages = work ? (view.cards || []).filter((card) => card.status !== "dismissed" && pageCard(card)) : [];
    [...thread.children].forEach((node) => { if (node.dataset.card && !fromPages.some((card) => card.card_id === node.dataset.card)) node.remove(); });
    let placed = 0;
    const putPageCards = (before) => {
      while (placed < fromPages.length && (before === null || fromPages[placed].created_at < before)) { placeCard(thread, work, fromPages[placed], put); placed += 1; }
    };
    rounds.forEach((round) => { putPageCards(round.started_at); put(renderRound(work, round)); });
    putPageCards(null);
    receipts.after(thread, put, work && view);
    const reviews = work ? view.reviews : [];
    [...thread.children].forEach((card) => { if (card.dataset.review && !reviews.some((r) => r.review_id === card.dataset.review)) card.remove(); });
    reviews.forEach((review) => {
      const card = keyed(thread, "data-review", review.review_id, () => el("div", "assistant-card assistant-card--review"));
      if (!card.dataset.painted) { card.dataset.painted = "1"; renderReview(card, work, review); }
      put(card);
    });
    thread.querySelector(":scope > .assistant-problem")?.remove();
    const shown = problem || (work && view.problem) || null;
    if (shown) {
      const box = el("div", "assistant-problem"); box.setAttribute("role", "alert");
      const kicker = el("span", "assistant-card-kicker is-blocked"); kicker.append(spinner("failed"), document.createTextNode(L("出了问题")));
      const message=el("p", "");molisWorkRequest.show(message,shown,shown.message);box.append(kicker,message);
      if (work && work.state === "needs-check") {
        // What the interrupted round really did, then an explicit close. Nothing is re-run.
        const check = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("查看实际发生了什么")); check.type = "button";
        check.addEventListener("click", async () => {
          check.disabled = true;
          try {
            const report = await api("/works/" + encodeURIComponent(work.work_id) + "/recovery");
            const OUTCOMES = { completed: "已发生", failed: "失败，没有发生", "not-dispatched": "没有执行", unknown: "结果未知，请到原处核对" };
            const list = el("ul", "assistant-recovery"), closes = [];
            report.rounds.forEach((round) => {
              round.operations.forEach((op) => { const item = el("li", "", op.summary + " — " + L(OUTCOMES[op.outcome] || op.outcome)); item.dataset.state = op.outcome; list.append(item); });
              if (!round.operations.length) list.append(el("li", "", L("这一轮没有记录到任何操作")));
              round.blockers.forEach((why) => list.append(el("li", "assistant-muted", why)));
              if (round.can_close) {
                const close = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("已核对，结束这一轮")); close.type = "button";
                close.addEventListener("click", async () => {
                  close.disabled = true;
                  try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/recovery", "POST", { run_id: round.run_id, version: round.version }); render(); }
                  catch (error) { showError(error); }
                });
                closes.push(close);
              }
            });
            check.replaceWith(list, ...closes);
          } catch (error) { showError(error); }
        });
        box.append(check);
      }
      if (shown.action) {
        if (/模型/.test(shown.action)) { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", L(shown.action)); link.href = "/settings/models"; link.addEventListener("click", (event) => { if (!event.metaKey && !event.ctrlKey) setPanel(false); }); box.append(link); }
        // A work's own cap is raised right here, in its usage box; the daily cap lives in the Assistant's settings.
        else if (/这项工作的上限/.test(shown.action) && usageBox) {
          const raise = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L(shown.action)); raise.type = "button";
          raise.addEventListener("click", openUsage);
          box.append(raise);
        }
        else if (shown.action === "打开设置") { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", L("打开助理设置")); link.href = "/settings/assistant"; box.append(link); }
        else box.append(el("p", "assistant-muted", L(shown.action)));
      }
      thread.append(box);
    }
    paintSum(); paintAim(); paintList(); drawTabs(); paintSideDot(work);
    if (stick) scrollOwner()?.pin(); else if (thread.scrollHeight > before + 4) unseen = true;
    paintJump();
  };

  /* ─── All works ────────────────────────────────────────────────────────── */
  const paintList = () => {
    if (!workNav || workNav.hidden) return;
    const focused = document.activeElement && workNav.contains(document.activeElement) ? document.activeElement.dataset.workId || "new" : null;
    workNav.replaceChildren();
    const fresh = el("button", "assistant-works-item assistant-works-new", L("＋ 新工作")); fresh.type = "button"; fresh.dataset.workId = "new";
    fresh.addEventListener("click", () => { setWorks(false); switchTo(null); input.focus(); });
    workNav.append(fresh);
    if (!works.length) workNav.append(el("p", "assistant-muted", L("还没有工作。发送一句话就会开始第一项。")));
    // Grouped the way the person looks for them: what waits on them, what is running, then the rest by recency.
    const groups = [["等你", (work) => markOf(work) === "waiting"], ["进行中", (work) => work.state === "running" || work.state === "paused"], ["最近", () => true]];
    const placed = new Set();
    groups.forEach(([label, fits]) => {
      const rows = works.filter((work) => !placed.has(work.work_id) && fits(work));
      if (!rows.length) return;
      workNav.append(el("p", "assistant-works-group", L(label)));
      rows.forEach((work) => {
        placed.add(work.work_id);
        const item = el("button", "assistant-works-item"); item.type = "button"; item.dataset.workId = work.work_id;
        const mark = markOf(work);
        if (mark) item.dataset.mark = mark;
        if (work.work_id === curId) item.setAttribute("aria-current", "true");
        const meta = el("span", "assistant-works-meta", stateLabel(work.state) + " · " + scopeLabel(work.scope, work.scope_title) + (tabs.includes(work.work_id) ? " · " + L("已打开") : ""));
        meta.dataset.state = work.state; meta.dataset.mwState = ringState(work.state);
        const head = el("span", "assistant-works-head");
        head.append(tabMark(mark, work), el("span", "assistant-works-title", work.title));
        item.append(head, meta);
        item.addEventListener("click", () => { setWorks(false); switchTo(work.work_id); });
        workNav.append(item);
      });
    });
    if (focused) [...workNav.querySelectorAll("button")].find((btnEl) => btnEl.dataset.workId === focused)?.focus();
  };
  const setWorks = (open) => {
    if (!workNav) return;
    workNav.hidden = !open;
    worksToggle?.setAttribute("aria-expanded", String(open));
    if (open) { paintList(); (workNav.querySelector("[aria-current]") || workNav.querySelector("button"))?.focus(); loadWorks(); }
  };
  const loadWorks = async () => {
    try {
      const res = await api("/works");
      const drafts = new Map(works.map((work) => [work.work_id, work.draft]));
      works = (res.works || []).map((work) => drafts.has(work.work_id) && (work.work_id === curId || work.work_id === activeSend?.work) ? Object.assign(work, { draft: drafts.get(work.work_id) }) : work);
      if (curId && !works.some((work) => work.work_id === curId)) { curId = null; remember(); view = null; }
      // A tab whose work is gone closes; the work in front always has one.
      const kept = tabs.filter((id) => works.some((work) => work.work_id === id));
      if (kept.length !== tabs.length) { tabs = kept; saveTabs(); }
      openTab(curId);
      paintList(); paintAim(); paintSum(); drawTabs();
    } catch { /* the list stays as it was; the next refresh retries */ }
  };

  /* ─── Keeping up with a running work ───────────────────────────────────── */
  const reload = async () => {
    if (!curId) return;
    const id = curId;
    try { const next = await api("/works/" + encodeURIComponent(id)); if (id === curId) { view = next; render(); } }
    catch (error) {
      if (id !== curId) return;
      if (error.code === "assistant.not_found") { curId = null; remember(); view = null; render(); return; }
      showError(error);
    }
  };
  // A work is followed while it, its last round (stopped, the work answers before the round has ended) or a sub-task it handed out is live.
  const followed = (seen) => isLive(seen.work.state) || /^(starting|running|compacting)$/.test(seen.rounds?.at(-1)?.phase || "") || (seen.delegated || []).some((child) => !child.taken_back && isLive(child.state));
  const follower = (${ASSISTANT_FOLLOW_FACTORY_SCRIPT})({ route: host.route, headers: host.headers, followed, current: () => curId, show: (next) => { view = next; render(); } });
  const poll = () => { if (curId && view && view.work.work_id === curId && followed(view)) follower.follow(curId); else follower.stop(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { reload().then(poll); loadWorks(); } });
  // Another window may have changed this work (a mode, a new round): coming back to this one reads it again.
  window.addEventListener("focus", () => { if (!document.hidden && curId) reload().then(poll); });
  const listTimer = setInterval(() => { if (!document.hidden && panel && !panel.hidden) loadWorks(); }, 15000);

${ASSISTANT_NOTICES_PART}

${ASSISTANT_MATERIALS_PART}
${ASSISTANT_COMPOSER_PART}

${ASSISTANT_PAGE_MESSAGES_PART}
  let typed = false, inputRev = 0;
  input.addEventListener("input", () => {
    typed = true; inputRev++; syncSend(); saveDraft(false);
    const value = String(input.value || "");
    if (value.startsWith("/")) { void setSlash(value.slice(1)); return; }
    closeSlash();
    const mention = mentionAt();
    if (mention) { setMention(mention); return; }
    closeMention();
  });
  input.addEventListener("keydown", (event) => {
    if (slashOpen() && event.key === "ArrowDown") { event.preventDefault(); startPop.querySelector("button")?.focus(); return; }
    if (slashOpen() && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSlash(); if (slashDraft !== null) { input.value = slashDraft; slashDraft = null; syncSend(); } return; }
    if (mentionOpen() && event.key === "ArrowDown") { event.preventDefault(); startPop.querySelector("button")?.focus(); return; }
    if (mentionOpen() && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMention(); return; }
    if (mentionOpen() && event.key === "Enter" && !event.isComposing && event.keyCode !== 229 && startPop.querySelector("button")) { event.preventDefault(); startPop.querySelector("button").click(); return; }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (String(input.value || "").startsWith("/")) { if (slashOpen()) startPop.querySelector("button")?.click(); return; }
    if (!String(input.value || "").trim()) { if (getWork()) { setPanel(true); reload().then(poll); } else if (works.length) { setPanel(true); setWorks(true); } return; }
    syncSend();
    if (!send.disabled) compose.requestSubmit(send);
  });
  ${ASSISTANT_SEND_CLIENT_SCRIPT}
  const nextRow = island.querySelector("[data-assistant-next-row]");
  stepRow = nextRow && (${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})({ row: nextRow, thread, L, el, drawn, jumpTo, bindText, view: () => (view?.work.work_id === curId ? view : null), open: () => Boolean(panel && !panel.hidden),
    // A page's words and materials go in the input, in the work it named; nothing is sent.
    reply: (message) => replyToThread(message), take: async (message) => { if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id); bring(message); setPanel(true); input.focus(); },
    other: (id) => {
      const object = view.objects.find((one) => "open:" + one.subject.kind + ":" + one.subject.id === id), last = view.rounds[view.rounds.length - 1];
      if (object) showObject(object);
      else if (id === "check") jumpTo(".assistant-problem");
      else if (id.startsWith("work:")) switchTo(id.slice(5));
      else if (id === "retry" && last) { input.value = last.text; typed = true; syncSend(); saveDraft(false); input.focus(); }
    } });
  presentation = (${ASSISTANT_STAGE_FACTORY})({island,panel,input,current:getWork,switchTo,showProblem:showError,L,el});
  /* ─── Head controls ────────────────────────────────────────────────────── */
  island.querySelector("[data-assistant-panel-close]")?.addEventListener("click", () => setPanel(false));
  island.querySelectorAll("[data-assistant-control]").forEach((btnEl) => btnEl.addEventListener("click", async () => {
    if (!curId) return;
    btnEl.disabled = true;
    try { view = await api("/works/" + encodeURIComponent(curId) + "/control", "POST", { kind: btnEl.dataset.assistantControl, ...(btnEl.hasAttribute("data-keep-connections") ? { keep_connections: true } : {}) }); render(); }
    catch (error) { showError(error); }
    finally { btnEl.disabled = false; poll(); }
  }));
  newButton?.addEventListener("click", () => { switchTo(null); input.focus(); });
  worksToggle?.addEventListener("click", () => setWorks(workNav.hidden));
  targetClear?.addEventListener("click", () => { switchTo(null); input.focus(); });
  target.addEventListener("click", () => {
    if (getWork()) { setPanel(true); reload().then(poll); return; }
    if (project) { nextScope = nextScope === "project" ? "personal" : "project"; paintAim(); paintSum(); }
  });
  workNav?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setWorks(false); worksToggle?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...workNav.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    event.preventDefault();
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  });

  // The input keeps room to type, but the chips come and go, so the composer measures itself, as the Dock does, with its chips on it (typing
  // hides them, the steps stay): quiet parts narrow, unchanged choosers fold, plugin and work chips narrow; with 44px targets, parts then leave a step at a time.
  const INPUT_ROOM = 120;
  let fitFrame = 0;
  const roomy = () => input.clientWidth >= INPUT_ROOM && compose.scrollWidth <= compose.clientWidth + 1;
  const fitInput = () => {
    fitFrame = 0;
    delete compose.dataset.fit; delete compose.dataset.crowded; compose.dataset.measuring = "";
    for (const level of ["tight", "folded", "narrow"]) {
      if (roomy()) break;
      compose.dataset.fit = level;
    }
    if (matchMedia("(max-width: 600px), (pointer: coarse)").matches) for (const step of ["choosers", "mark", "chips"]) { if (compose.scrollWidth <= compose.clientWidth + 1) break; compose.dataset.crowded = step; }
    delete compose.dataset.measuring;
  };
  const refit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(fitInput); };
  // The island's width is the bar's, never its chips'; the chips' own changes arrive as attributes and labels.
  const fitWatchers = [];
  if ("ResizeObserver" in window) { const watcher = new ResizeObserver(refit); watcher.observe(island); fitWatchers.push(watcher); }
  if ("MutationObserver" in window) {
    const watcher = new MutationObserver(refit);
    watcher.observe(compose, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "data-chosen"] });
    if (panel) watcher.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    fitWatchers.push(watcher);
  }

  // A finished work is where the next message goes only while it is fresh: once it has rested a while (and its panel is
  // closed, the input empty) a message starts a new work. It stays in the list, and its notices still open it.
  const RESTING_MS = 15 * 60 * 1000;
  const restIfStale = () => {
    const work = getWork();
    if (!work || isLive(work.state) || (panel && !panel.hidden) || String(input.value || "").trim()) return;
    const at = Date.parse(work.updated_at || "");
    if (Number.isFinite(at) && Date.now() - at > RESTING_MS) void switchTo(null);
  };
  // Opening the panel shows the conversation first; a narrow panel's drawer waits to be asked for.
  if (panel && "MutationObserver" in window) new MutationObserver(() => { if (!panel.hidden && !spacious()) drawerOpen = false; paintLayout(); if (panel.hidden) { setWorks(false); restIfStale(); } else { drawTabs(); paintJump(); } }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  // The list of works is a dropdown under the tabs: a click anywhere else in the panel puts it away.
  panel?.addEventListener("pointerdown", (event) => {
    if (workNav && !workNav.hidden && event.target?.nodeType === 1 && !workNav.contains(event.target) && !worksToggle?.contains(event.target)) setWorks(false);
  });

  // The pill names what the page on show would bring, so it follows the page: another object, another surface.
  let materialsFrame = 0;
  const repaintMaterials = () => { if (!materialsFrame) materialsFrame = requestAnimationFrame(() => { materialsFrame = 0; paintMats(); }); };
  if ("MutationObserver" in window) {
    const watcher = new MutationObserver((records) => { if (records.some((record) => !island.contains(record.target))) repaintMaterials(); });
    watcher.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-assistant-context", "hidden"] });
    fitWatchers.push(watcher);
  }

  openTab(curId); loadDraft(); render(); paintLayout(); refit(); repaintMaterials();
  // The work's own draft is known only once the list arrives; fill it then unless the person has already typed.
  // Changes already done before this page loaded are not news; only ones completing from now on are announced.
  loadWorks().then(() => { restIfStale(); if (!typed) loadDraft(); if (curId) return reload().then(poll); }).finally(() => { announcing = true; });
  return { isOpen: () => Boolean(panel && !panel.hidden),
    /** Where a new work goes, as the page changes what it is about: a project, or null for the person's own space. */
    setProject: (next) => { project = next && next.id ? next : null; if (!getWork()) nextScope = project ? "project" : "personal"; paintAim(); paintSum(); },
    dispose: () => { follower.stop(); retries.stop(); clearInterval(listTimer); cancelAnimationFrame(fitFrame); cancelAnimationFrame(materialsFrame); fitWatchers.forEach((watcher) => watcher.disconnect()); } };
}`;
