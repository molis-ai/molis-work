import { ASSISTANT_STAGE_FACTORY, ASSISTANT_ELEMENT_SCRIPT, ASSISTANT_PLACER_SCRIPT } from "./assistant-stage.js";
import { codeLanguage, codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { assistantCodeColours, createAssistantCodeGrow } from "./assistant-code-grow.js";
import { ASSISTANT_SEND_CLIENT_SCRIPT, ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "./assistant-send.js";
import { ASSISTANT_FOLLOW_FACTORY_SCRIPT } from "./assistant-follow.js";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "./assistant-step-row.js";
import { ASSISTANT_PROCESS_FACTORY_SCRIPT, ASSISTANT_RETRY_FACTORY_SCRIPT } from "./assistant-process.js";
import { ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT } from "./assistant-context-strip.js";
import { ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT } from "./assistant-attachments.js";
import { ASSISTANT_MENTION_FACTORY_SCRIPT } from "./assistant-mention.js";
import { ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT } from "./assistant-work-objects.js";
import { ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT, ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT, ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT } from "./assistant-side-context.js";
import type { AssistantPendingReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_REPLY_KIND } from "@molis-ai/molis-work-contracts/services/contextual";
import { ARTIFACT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { renderAssistantTextHtml, renderAssistantReviewHtml, renderAssistantNoticeText } from "../../assistant-text-html.js";
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
  const execBtn = island.querySelector("[data-assistant-executor]");
  const executorLabel = island.querySelector("[data-assistant-executor-label]");
  const execsPop = island.querySelector("[data-assistant-executors]");
  let executors = [];
  const executorOffer = (id) => executors.find((one) => one.plugin_id === id && !one.problem) || null;
  const executorsHere = () => Boolean(project && executors.some((one) => !one.problem));
  const executorChoices = () => [{ id: "assistant", label: "助理", hint: "个人工作助理，使用你已授权的能力" }].concat(executors.filter((one) => !one.problem)
    .map((one) => ({ id: one.plugin_id, label: one.title, hint: "在这个项目里由它自己的 Agent 执行，补充和回答照常在这里发" })));
  const modeButton = island.querySelector("[data-assistant-mode]");
  const modeLabel = island.querySelector("[data-assistant-mode-label]");
  const modesPop = island.querySelector("[data-assistant-modes]");
  const modeOffer = () => { const work = getWork(); return executorOffer(work ? work.executor.kind === "plugin" ? work.executor.plugin_id : "" : nextExec); };
  const modeRows = (offer) => offer.modes.map((mode) => ({ id: mode.id, label: L(mode.title) }));
  const setModes = (open) => {
    if (!modesPop) return;
    modesPop.hidden = !open;
    modeButton?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = getWork();
    const offer = modeOffer(); if (!offer) { modesPop.hidden = true; return; }
    const chosen = work ? work.executor && work.executor.mode || offer.default_mode : nextMode || offer.default_mode;
    modesPop.replaceChildren(el("p", "assistant-popover-title", L(work ? "下一轮的方式（与插件自己的页面同一设置）" : "第一轮的方式")));
    modeRows(offer).forEach((mode) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (chosen === mode.id) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", mode.label));
      item.addEventListener("click", async () => { setModes(false); await applyMode(mode.id); input.focus(); });
      modesPop.append(item);
    });
    (modesPop.querySelector("[aria-current]") || modesPop.querySelector("button"))?.focus();
  };
  /** A new plugin work's first round, or an open work's next one: the session's own setting, the same one its page shows. */
  async function applyMode(id) {
    const work = getWork();
    if (!work) { nextMode = id; paintAim(); paintSum(); return; }
    try {
      view = await api("/works/" + encodeURIComponent(work.work_id) + "/mode", "POST", { mode: id }); render();
      const offer = modeOffer(); if (offer) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: offer.capability_ids["session.update"], session_id: view.work.executor.session_id } }));
    }
    catch (error) { showError(error); }
  }
  // The choice is made against what is saved now, not what this panel last read.
  modeButton?.addEventListener("click", async () => { if (!modesPop.hidden) { setModes(false); return; } if (curId) await reload().catch(() => {}); setModes(true); });
  // Which Character carries the next round: the work's own choice, or one made here that the next Send brings along.
  // Only the Assistant's own project work has Characters (they are published per project); a plugin work picks its own.
  const charBtn = island.querySelector("[data-assistant-character]");
  const characterLabel = island.querySelector("[data-assistant-character-label]");
  const charsPop = island.querySelector("[data-assistant-characters]");
  let nextChar = null, pendingChar;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork();
    return work ? work.executor.kind !== "plugin" && work.scope.kind === "project" : nextExec === "assistant" && nextScope === "project" && Boolean(project); };
  const setChars = async (open) => {
    if (!charsPop) return;
    charsPop.hidden = !open;
    charBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = getWork(), chosen = chosenCharacter();
    charsPop.replaceChildren(el("p", "assistant-popover-title", L("由哪个角色负责（从下一轮开始）")));
    let choices = [];
    try { choices = (await api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : ""))).characters; }
    catch (error) { const note=el("p","assistant-material-origin");molisWorkRequest.show(note,error);charsPop.append(note); }
    const pick = (value) => { setChars(false); if (work) pendingChar = value; else nextChar = value; paintAim(); input.focus(); };
    const own = el("button", "assistant-starter"); own.type = "button";
    if (!chosen) own.setAttribute("aria-current", "true");
    own.append(el("strong", "", L("助理自己")), el("span", "assistant-material-origin", " " + L("不指定角色")));
    own.addEventListener("click", () => pick(null));
    charsPop.append(own);
    choices.forEach((choice) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      const same = chosen && chosen.artifact_id === choice.reference.artifact_id && chosen.version === choice.reference.version;
      if (same) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", choice.title), el("span", "assistant-material-origin", " v" + choice.reference.version + (choice.available ? "" : " · " + (choice.reason || L("当前不可用")))));
      // An unavailable version is shown with why, and cannot be chosen: nothing runs under a name it is not.
      if (!choice.available) item.disabled = true;
      else item.addEventListener("click", () => pick({ artifact_id: choice.reference.artifact_id, version: choice.reference.version, title: choice.title }));
      charsPop.append(item);
    });
    if (!choices.length) charsPop.append(el("p", "assistant-material-origin", L("这个项目里还没有你发布的 Character；在 Characters 里新建并发布后就能选择。")));
    (charsPop.querySelector("[aria-current]") || charsPop.querySelector("button:not([disabled])"))?.focus();
  };
  charBtn?.addEventListener("click", async () => { if (!charsPop.hidden) { setChars(false); return; } if (curId) await reload().catch(() => {}); await setChars(true); });
  // The side pane lists the same Characters; read once a minute per work (or for a new one), repainting when they arrive.
  const characterCache = new Map();
  const characterChoices = () => {
    const work = getWork(), key = work ? work.work_id : "new", held = characterCache.get(key);
    if (held && Date.now() - held.at < 60000) return held.choices;
    characterCache.set(key, { at: Date.now(), choices: held ? held.choices : null });
    api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : "")).then((res) => {
      characterCache.set(key, { at: Date.now(), choices: res.characters || [] }); paintSum();
    }).catch(() => { characterCache.set(key, { at: Date.now(), choices: [] }); });
    return held ? held.choices : null;
  };
  // The side panel's browser: the person took it over, or handed it back to the work whose session drives it.
  const browserHeld = new Set();
  const holderOf = (session) => typeof session === "string" && session
    ? works.find((work) => work.session_id === session || (work.executor && work.executor.session_id === session)) : null;
  document.addEventListener("molis:side-browser-control", (event) => {
    const detail = event.detail || {}, holder = holderOf(detail.session_id);
    if (!holder) return;
    if (detail.action === "takeover") { browserHeld.add(holder.work_id); paintSum(); return; }
    if (detail.action !== "handback") return;
    browserHeld.delete(holder.work_id); paintSum();
    void (async () => {
      // The note goes to a running round as a steer, or starts the next one. A round waiting on an answer would take it
      // as that answer, and one waiting on a check refuses it: then the panel only says the browser is back.
      let latest = null;
      try {
        const seen = view && view.work.work_id === holder.work_id ? view : await api("/works/" + encodeURIComponent(holder.work_id));
        latest = seen.rounds[seen.rounds.length - 1] || null;
      } catch { host.showToast?.(L("浏览器已交还；告诉助理接着做时，它会重新观察页面")); return; }
      if (latest && (latest.phase === "awaiting-input" || (latest.awaiting_input && latest.awaiting_input.length))) { host.showToast?.(L("浏览器已交还；助理还在等你回答上面的问题")); return; }
      if (holder.state === "needs-check" || (latest && latest.phase === "reconcile-required")) { host.showToast?.(L("浏览器已交还；先核对上一步的结果，助理再接着做")); return; }
      try {
        await api("/send", "POST", { work_id: holder.work_id, request_id: crypto.randomUUID(), written_by: "page", text: L("我把浏览器交还给你了，先重新观察页面再继续") });
        await reload(); poll();
      } catch (error) { host.showToast?.(error); }
    })();
  });
  // A surface says the person changed something there that this work may show: read the work again.
  window.addEventListener("molis:assistant-surface-changed", (event) => {
    const detail = event.detail || {}, work = getWork();
    const id = detail.object && detail.object.id;
    if (!work || !id || !(work.executor && work.executor.session_id === id)) return;
    void reload().then(poll).catch(() => {});
  });
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
  const setExecs = (open) => {
    if (!execsPop) return;
    execsPop.hidden = !open;
    execBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    execsPop.replaceChildren(el("p", "assistant-popover-title", L("由谁来做")));
    void loadExecutors();
    executorChoices().forEach((one) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (one.id === nextExec) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(one.label)), el("span", "assistant-material-origin", " " + L(one.hint)));
      item.addEventListener("click", () => { nextExec = one.id; nextMode = ""; setExecs(false); paintAim(); paintSum(); input.focus(); });
      execsPop.append(item);
    });
    (execsPop.querySelector("[aria-current]") || execsPop.querySelector("button"))?.focus();
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
  // A narrow panel shows the side pane as a drawer over the conversation; a wide one beside it, as the person left it.
  const SIDE_KEY = "molis.assistant.side";
  const wide = window.matchMedia ? window.matchMedia("(min-width: 1240px)") : { matches: true, addEventListener() {} };
  let drawerOpen = false;
  // The platform side panel takes the window's right edge (body[data-side-open], --side-panel-width): what is left decides.
  const sideWidth = () => document.body.dataset.sideOpen === "true" ? parseFloat(getComputedStyle(document.body).getPropertyValue("--side-panel-width")) || 0 : 0;
  const sideInset = () => parseFloat(getComputedStyle(document.body).getPropertyValue("--sheet-inset")) || 14;
  const spacious = () => wide.matches && window.innerWidth - sideWidth() >= 1240;
  const sideOpen = () => spacious() ? store.get(SIDE_KEY) !== "closed" : drawerOpen;
  const paintLayout = () => {
    if (!panel) return;
    panel.dataset.layout = spacious() ? "split" : "drawer";
    panel.dataset.side = sideOpen() ? "open" : "closed";
    sideToggle?.setAttribute("aria-expanded", String(sideOpen()));
    island.toggleAttribute("data-side-shown", !panel.hidden && sideOpen());
    paintStrip();
    const anchor = !panel.hidden && sideWidth() ? panel.offsetParent : null;
    if (anchor) panel.style.setProperty("--assistant-room", Math.round(window.innerWidth - sideWidth() - sideInset() - 4 - anchor.getBoundingClientRect().right) + "px");
    else panel.style.removeProperty("--assistant-room");
  };
  sideToggle?.addEventListener("click", () => {
    if (spacious()) store.set(SIDE_KEY, sideOpen() ? "closed" : null); else drawerOpen = !drawerOpen;
    paintLayout();
    if (sideOpen()) side?.querySelector("button, select, summary")?.focus();
  });
  wide.addEventListener?.("change", () => { drawerOpen = false; paintLayout(); });
  island.querySelector(".assistant-main")?.addEventListener("pointerdown", () => { if (!spacious() && drawerOpen) { drawerOpen = false; paintLayout(); } });
  let spaciousBefore = spacious();
  const sideChanged = () => { const now = spacious(); if (now !== spaciousBefore) { spaciousBefore = now; drawerOpen = false; } paintLayout(); };
  if ("MutationObserver" in window) new MutationObserver(sideChanged).observe(document.body, { attributes: true, attributeFilter: ["data-side-open", "style"] });
  window.addEventListener("resize", () => { if (sideWidth()) sideChanged(); });

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

  /* ─── Showing a thing: the side panel previews it when it is there, otherwise it opens where it lives ─── */
  // The side panel claims the request (preventDefault); unclaimed, the object opens in its own surface as before.
  const sidePanelHere = () => document.body.hasAttribute("data-side-open");
  const sidePreview = (target) => !document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "files", target, focus: false }, cancelable: true }));
  // Where it cannot open in place (the project chooser has no tabs), an item opens on its project's page.
  const openOnItsPage = (open, title, where) => { const url = new URL("/projects/" + encodeURIComponent(where) + "/", location.origin), desktop = new URLSearchParams(location.search).get("desktop");
    url.searchParams.set("openPlugin", open.surface); url.searchParams.set("openItem", open.id); url.searchParams.set("openTitle", title); if (desktop) url.searchParams.set("desktop", desktop); location.assign(url.pathname + url.search); };
  const showObject = (object) => {
    if (sidePreview({ subject: object.subject, title: object.title, open: object.open })) return;
    if (object.open && host.openItem) host.openItem(object.open.surface, object.open.id, object.title); else if (object.open) openOnItsPage(object.open, object.title, (view && view.work.scope.project_id) || "personal");
  };

  /* The Host draws text and code from raw words; only reading interactions live here. A copy answers on its button through
     the design system's one copy feedback; a refusal also says how to copy by hand. */
  const copyFrom = (button, text) => window.molisCopy?.(button, text, { done: L("已复制"), failed: L("复制失败") }).then((copied) => { if (!copied) host.showToast?.(L("没能复制，请手动选中文字")); });
  const { bindMore, growCode, paint: paintCode } = (${createAssistantCodeGrow.toString()})(L);
  const bindText = (root) => {
    root.querySelectorAll(".assistant-code:not([data-bound])").forEach((figure) => {
      figure.dataset.bound = ""; const copy = figure.querySelector(".assistant-code-copy");
      copy.addEventListener("click", () => copyFrom(copy, () => figure.dataset.code));
      bindMore(figure); if (figure.dataset.paint) paintCode(figure);
    });
    root.querySelectorAll("[data-assistant-object]:not([data-bound])").forEach((button) => {
      button.dataset.bound = ""; const object = view.objects[Number(button.dataset.assistantObject)];
      if (!object || !host.openItem) { button.replaceWith(document.createTextNode("「" + button.textContent + "」")); return; }
      button.prepend(glyph(objectGlyph(object)));
      button.addEventListener("click", () => showObject(object));
    });
  };

  /* ─── Rendering, updated in place so reading and focus are never disturbed ─ */
  let follow = null; const scrollOwner = () => follow ||= window.molisFollow?.(thread, { onChange: () => paintJump() }), nearBottom = () => scrollOwner()?.state !== "detached";
  const keyed = (parent, attribute, key, create) => {
    let node = [...parent.children].find((child) => child.getAttribute(attribute) === key);
    if (!node) { node = create(); node.setAttribute(attribute, key); parent.append(node); }
    return node;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  /* Questions, action cards and next steps come drawn by the Host (in the person's language); the page binds them with the
     shared client. A node is redrawn only when its key changes, so what the person is typing stays put. */
  const ixClient = host.interaction, fills = new Map(); // fills: words from the composer into a card's draft (R4, assistant-send.ts)
  const drawn = (node, html, handlers, key = html) => {
    if (node.ixKey === key) return node.ix;
    node.ix?.destroy(); node.innerHTML = html || ""; node.ixKey = key;
    node.ix = ixClient(node, handlers); node.ixBase = JSON.stringify(node.ix.read());
    return node.ix;
  };
  const renderQuestion = (card, work, round, question) => {
    const path = "/works/" + encodeURIComponent(work.work_id), held = () => ({ pending_id: question.pending_id, values: client.read() }); let saving = 0;
    const client = drawn(card, question.html, {
      onAction: () => reaskQuestion(work, round, question),
      // A half-written answer is kept with the work, so a reload or another tab finds it.
      onChange: () => { clearTimeout(saving); saving = setTimeout(() => api(path + "/question-draft", "POST", held()).catch(() => undefined), 600); },
      onSubmit: async () => {
        const button = card.querySelector("[type=submit]"); if (!button || button.dataset.loading !== undefined) return;
        clearTimeout(saving); button.disabled = true; button.dataset.loading = ""; button.prepend(Object.assign(el("span", "mw-spinner"), { ariaHidden: "true" }));
        try { view = await api(path + "/answer", "POST", { ...held(), run_id: round.run_id, pending_revision: question.pending_revision }); render(); poll(); }
        catch (error) { if (error.body?.details?.errors) client.showErrors(error.body.details.errors, { focus: true }); else showError(error); }
        finally { button.disabled = false; delete button.dataset.loading; button.querySelector(".mw-spinner")?.remove(); }
      },
    }, question.pending_id + question.pending_revision + question.answerable);
    fills.set(question.pending_id, (field, text) => { const now = client.read()[field]; client.write({ [field]: now ? now + " " + text : text }); clearTimeout(saving); return api(path + "/question-draft", "POST", held()); });
  };
  const renderReview = (card, work, review) => {
    card.innerHTML = review.html;
    card.querySelectorAll("[data-assistant-review-glyph]").forEach((node) => node.replaceWith(glyph(node.dataset.assistantReviewGlyph)));
    bindText(card);
    const row = card.querySelector(".assistant-card-actions");
    const decide = async (decision) => {
      row.querySelectorAll("button").forEach((one) => { one.disabled = true; });
      try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/reviews/" + encodeURIComponent(review.review_id), "POST", { decision }); render(); poll(); }
      catch (error) { showError(error); row.querySelectorAll("button").forEach((one) => { one.disabled = false; }); }
    };
    row.querySelectorAll("[data-assistant-decision]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.assistantDecision)));
  };
  const renderCard = (node, work, card) => {
    node.dataset.status = card.status;
    const client = drawn(node, card.html, { onAction: async (id, button) => {
      // Keyboard use keeps its place: after the card redraws, focus lands on it rather than the page.
      const hadFocus = node.contains(document.activeElement), neighbour = node.nextElementSibling || node.previousElementSibling;
      const lock = (on) => node.querySelectorAll("[data-ix-action]").forEach((one) => { one.disabled = on; });
      lock(true);
      try {
        // "redo" only asks: the Assistant re-reads and offers a fresh card; nothing runs in this one's place.
        const next = await api("/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/" + id, "POST", id === "run" ? { revision: card.revision, values: client.read() } : {});
        if (id === "redo") { await reload(); poll(); return; }
        if (view && view.work.work_id === work.work_id) view.cards = view.cards.map((one) => one.card_id === next.card_id ? next : one);
        if (next.status === "done") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: next.capability_id } }));
        // The next steps are the Host's: read the work again so a card that ran is no longer offered (FLOW-04).
        render(); void reload();
        // A card set aside leaves the list: focus moves to the next card, or back to the input when none is left.
        if (hadFocus) (node.isConnected ? node.querySelector("[data-ix-action], [data-ix-operation]") : (neighbour && neighbour.isConnected && neighbour.querySelector("button")) || input)?.focus();
      } catch (error) { showError(error); lock(false); if (hadFocus) button.focus(); }
    } });
  };
  const placer = ${ASSISTANT_PLACER_SCRIPT};
  /** A card no round proposed: a page put it in (it names the page in from), or its round is not one of this work's. */
  const pageCard = (card) => Boolean(card.from) || !card.run_id || !(view && view.rounds.some((round) => round.run_id === card.run_id));
  // Both round cards and page cards use the same Host-drawn view without deleting chronological siblings.
  const placeCard = (parent, work, card, put) => {
    const node = keyed(parent, "data-card", card.card_id, () => el("div"));
    renderCard(node, work, card);
    (put || ((one) => parent.append(one)))(node);
  };
  const renderCards = (parent, work, cards, put) => {
    const shown = cards.filter((card) => card.status !== "dismissed");
    [...parent.children].forEach((child) => { if (child.dataset.card && !shown.some((card) => card.card_id === child.dataset.card)) child.remove(); });
    shown.forEach((card) => placeCard(parent, work, card, put));
  };
  const FILE_GLYPH = [[/\.(png|jpe?g|gif|webp|heic|svg)$/i, "image"], [/\.(csv|tsv|xlsx?)$/i, "database"], [/\.(md|markdown|txt|log)$/i, "note"],
    [/\.(js|mjs|ts|tsx|py|json|ya?ml|html?|css|sh|go|rs|java|c|cpp|sql)$/i, "code"]];
  /**
   * Words the work keeps but the view leaves out (a page handed over from the side panel's browser, a pasted text, a
   * selection): read back when clicked and shown in the side panel as they were given, with the page they came from.
   */
  const readBack = (material, title) => {
    const workId = view && view.work && view.work.work_id;
    if (!workId || !material.material_id || !sidePanelHere() || !["text", "file", "selection"].includes(material.kind)) return null;
    return async () => {
      try {
        const { material: full } = await api("/works/" + encodeURIComponent(workId) + "/materials/" + encodeURIComponent(material.material_id));
        if (typeof full.text !== "string") { host.showToast?.(L("这份材料没有可以预览的正文")); return; }
        sidePreview({ preview: { title, media_type: "text/plain", text: full.text, truncated: Boolean(full.truncated), ...(full.url ? { source_url: full.url } : {}) } });
      } catch (error) { host.showToast?.(error, true); }
    };
  };
  /** A picture the work carried, shown in the side panel; one the app no longer holds (it restarted) is marked, not offered. */
  const readImage = (material, title) => {
    const workId = view && view.work && view.work.work_id;
    if (!workId || material.kind !== "image" || !material.material_id || material.expired || !sidePanelHere()) return null;
    return async () => {
      try {
        const { image } = await api("/works/" + encodeURIComponent(workId) + "/materials/" + encodeURIComponent(material.material_id) + "/image");
        sidePreview({ preview: { title, media_type: image.media_type, url: "data:" + image.media_type + ";base64," + image.data } });
      } catch (error) { host.showToast?.(error, true); }
    };
  };
  const EXPIRED_IMAGE = "应用重启后图片不再保留；需要时请重新添加这张图片";
  /** One thing a message carried: its kind at a glance, its name; an object opens where it lives. */
  const attachmentChip = (material) => {
    const title = String(material.title || "").replace(/^(图片|方法|用|引用)：/, "");
    const icon = material.kind === "image" ? "image" : material.kind === "method" || material.kind === "capability" ? "zap" : material.kind === "selection" || material.kind === "text" ? "text"
      : material.object ? kindGlyph(material.object.kind + " " + (material.source ? material.source.surface : "")) : (FILE_GLYPH.find(([pattern]) => pattern.test(title.replace(/（\d+ 页）$/, ""))) || [null, "file"])[1];
    const surf = material.source && material.source.surface && material.source.surface !== "page" ? material.source.surface : "";
    const named = material.object && surf ? { subject: { kind: material.object.kind, id: material.object.id }, title: material.object.title || title, open: { surface:surf, id: material.object.id } } : null;
    // A file's or a page's own words can only be previewed in the side panel; there is nowhere else to open them.
    const open = named ? () => showObject(named)
      : material.kind === "file" && material.text && sidePanelHere() ? () => { sidePreview({ preview: { title, media_type: "text/plain", text: material.text } }); }
      : readBack(material, title) || readImage(material, title);
    const chip = el(open ? "button" : "span", "assistant-attachment" + (material.draft ? " is-draft" : ""));
    if (open) { chip.type = "button"; chip.addEventListener("click", open); chip.setAttribute("aria-label", L("打开") + "：" + title); }
    chip.append(glyph(icon), el("span", "assistant-attachment-name", title + (material.draft ? L("（草稿）") : "") + (material.expired ? L("（已失效）") : "")));
    if (MATERIAL_KIND[material.kind]) chip.title = L(MATERIAL_KIND[material.kind]);
    if (material.expired) { chip.classList.add("is-expired"); chip.title = L(EXPIRED_IMAGE); }
    return chip;
  };
  const renderRound = (work, round) => {
    const node = keyed(thread, "data-round", round.run_id, () => el("section", "assistant-round"));
    const put = placer(node);
    // A later round begins with when it began, so a long work reads as a sequence of sittings.
    if (view && view.rounds.indexOf(round) > 0) {
      const stamp = keyed(node, "data-entry", "time", () => el("p", "assistant-round-time"));
      setText(stamp, when(round.started_at));
      put(stamp);
    }
    const entries = [];
    round.turns.forEach((turn, index) => entries.push({ key: "t:" + turn.turn_id, order: turn.sequence ?? index, turn }));
    const stepsShown = Boolean(round.steps && round.steps.length);
    round.activity.forEach((item, index) => { if (!(stepsShown && item.verb === "todo")) entries.push({ key: "a:" + item.call_id, order: item.sequence ?? (1000 + index), item }); });
    entries.sort((a, b) => a.order - b.order);
    // Which Agent ran this round, when the work changed hands.
    if (round.executor === "plugin") { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); const carrier = getWork(); setText(tag, carrier && carrier.executor.kind === "plugin" ? L("由 {name} 执行", { name: carrier.executor.title }) : L("由执行方插件执行")); put(tag); }
    else if (round.character) { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); setText(tag, L("由角色负责") + "：" + round.character.title + " v" + round.character.version); put(tag); }
    // What this round carried reads as a line under the person's own message; the side pane keeps the full list.
    let carried = null;
    if (round.materials && round.materials.length) {
      carried = keyed(node, "data-entry", "materials", () => el("div", "assistant-attachments"));
      const signature = JSON.stringify(round.materials.map((material) => [material.material_id, material.title, material.draft]));
      if (carried.dataset.signature !== signature) { carried.dataset.signature = signature; carried.replaceChildren(...round.materials.map(attachmentChip)); }
    }
    if (!round.turns.some((turn) => turn.kind === "user")) {
      const own = keyed(node, "data-entry", "task", () => el("div", "assistant-msg assistant-msg--user"));
      setText(own, round.text);
      put(own);
      if (carried) { put(carried); carried = null; }
    } else node.querySelector(':scope > [data-entry="task"]')?.remove();
    // The steps between two messages read as one quiet line that opens to each step (assistant-process.ts). A single step stays a line of its own.
    let run = [], anchor = "start";
    const flush = () => { if (run.length) proc.place(node, run, put, anchor); run = []; };
    entries.forEach((entry) => {
      if (entry.turn) {
        flush(); anchor = entry.key;
        const turn = entry.turn;
        // Words the Host wrote (a timed round, a work going on when its sub-tasks came back) are not shown as the person's; a supplement is the person's, whoever wrote the round.
        const kind = turn.kind === "user" ? (round.written_by === "host" && !turn.steer ? "host" : "user") : turn.kind === "assistant" ? "assistant" : "note";
        const bubble = keyed(node, "data-entry", entry.key, () => el("div", "assistant-msg assistant-msg--" + kind));
        // A reply is the Assistant's own object: what the person selects in it is in hand, named by the work it belongs to.
        const reply = kind === "assistant" && JSON.stringify({ plugin_id: "assistant", object: { kind: ${JSON.stringify(ASSISTANT_REPLY_KIND)}, id: work.work_id + ":" + round.run_id + ":" + turn.turn_id, title: work.title } });
        if (reply && bubble.getAttribute("data-assistant-context") !== reply) bubble.setAttribute("data-assistant-context", reply);
        if (bubble.dataset.text !== turn.text) {
          const had = bubble.dataset.text !== undefined; bubble.dataset.text = turn.text; // Only a reply still being written, seen arriving, shows its new words come in: never a reopen, a hidden page or the last update.
          if (kind === "assistant") { if (window.molisStreamText) window.molisStreamText(bubble, turn.html, { reveal: had && work.state === "running" && !document.hidden, grow: growCode }); else bubble.innerHTML = turn.html; bindText(bubble); } else bubble.textContent = turn.text;
        }
        put(bubble); receipts.line(thread, node, put, turn, round);
        if (kind === "assistant") {
          const copy = keyed(node, "data-entry", "copy:" + turn.turn_id, () => {
            const btnEl = el("button", "assistant-copy", L("复制")); btnEl.type = "button";
            btnEl.addEventListener("click", () => copyFrom(btnEl, () => bubble.dataset.text || ""));
            return btnEl;
          });
          put(copy);
        }
        // A long message of the person's folds after a few lines; the whole of it is one click away.
        if (kind === "user" && (turn.text.length > 240 || turn.text.split("\n").length > 6)) {
          if (!bubble.hasAttribute("data-unfolded")) bubble.setAttribute("data-folded", "");
          const more = keyed(node, "data-entry", "fold:" + turn.turn_id, () => {
            const btnEl = el("button", "assistant-msg-more"); btnEl.type = "button";
            btnEl.addEventListener("click", () => {
              const folded = bubble.hasAttribute("data-folded");
              bubble.toggleAttribute("data-folded", !folded); bubble.toggleAttribute("data-unfolded", folded);
              btnEl.textContent = folded ? L("收起") : L("展开全文");
            });
            return btnEl;
          });
          if (!more.textContent) more.textContent = bubble.hasAttribute("data-folded") ? L("展开全文") : L("收起");
          put(more);
        }
        if ((kind === "user" || kind === "host") && carried) { put(carried); carried = null; }
      } else run.push(entry.item);
    });
    flush(); proc.sweep(node);
    if (carried) put(carried);
    proc.memory(node, round.memories_used, put);
    const status = keyed(node, "data-entry", "status", () => el("p", "assistant-round-status")), phase = round.phase;
    status.dataset.phase = phase; status.dataset.mwState = ({starting:'starting',running:'running',compacting:'running',failed:'failed',stopped:'stopped',cancelled:'cancelled',paused:'paused','reconcile-required':'verify',unknown:'verify'})[phase] || 'idle';
    const ownStop = round.stop_reason && round.stop_reason !== "已停止" ? round.stop_reason : "";
    const retry = (phase === "running" || phase === "starting") && round.retry_wait ? round.retry_wait : null; retries.mark(status, retry);
    setText(status, retry ? retries.line(status) : phase === "running" || phase === "starting" || phase === "compacting" ? L("正在处理…")
      : phase === "failed" ? L("这一轮没有完成") + (round.stop_reason ? "：" + round.stop_reason : "")
      : phase === "stopped" || phase === "cancelled" ? (ownStop || L("这一轮已停止，已经发生的操作不会被撤回"))
      : phase === "paused" ? L("已暂停，点“继续”接着做")
      : phase === "reconcile-required" ? L("有操作的结果还没确认，请先核对")
      : phase === "unknown" ? L("这一轮的执行记录读不到，结果需要核对") : "");
    status.hidden = !status.textContent;
    put(status);
    const questions = round.awaiting_input || [];
    [...node.children].forEach((card) => { if (card.dataset.question && !questions.some((q) => q.pending_id === card.dataset.question)) card.remove(); });
    questions.forEach((question) => {
      const card = keyed(node, "data-question", question.pending_id, () => el("div"));
      renderQuestion(card, work, round, question);
      put(card);
    });
    renderCards(node, work, ((view && view.cards) || []).filter((card) => card.run_id === round.run_id && !pageCard(card)), put);
    return node;
  };
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
  // Short on the card; the versions behind it are in its title.
  const objectState = (object) => object.state === "changed" ? L("之后被改过") : object.state === "missing" ? L("已不存在") : object.state === "unavailable" ? L("暂时读不到")
    : object.state === "moved" ? (object.moved_to ? L("已移到") + "「" + object.moved_to.title + "」" : L("在别的项目里")) : "";
  const objectDetail = (object) => object.state === "changed" ? L("这项工作记下版本") + " " + object.recorded_revision + " · " + L("现为版本") + " " + object.current_revision
    : object.current_revision ? L("版本") + " " + object.current_revision : "";
  /* The side pane speaks in the page's own glyphs, rendered once into a template, so every kind of thing has a face. */
  const glyphs = island.querySelector("[data-assistant-glyphs]");
  const glyph = (name) => {
    const holder = el("span", "assistant-glyph-icon"); holder.setAttribute("aria-hidden", "true");
    const found = glyphs && glyphs.content && glyphs.content.querySelector('[data-glyph="' + name + '"]');
    if (found && found.firstElementChild) holder.append(found.firstElementChild.cloneNode(true));
    return holder;
  };
  const spinner = (state = "running") => { const mark = el("span", "assistant-state-ring"); mark.dataset.mwState = state; mark.setAttribute("aria-hidden", "true"); return mark; };
  const proc = (${ASSISTANT_PROCESS_FACTORY_SCRIPT})({ L, el, keyed, setText, placer, glyph, spinner }), activityLine = proc.activityLine, retries = (${ASSISTANT_RETRY_FACTORY_SCRIPT})({ L, root: island, setText });
  /** What an object is, read from its kind or the surface it opens in. */
  const KIND_GLYPH = [[/todo/, "check"], [/image|photo/, "image"], [/coding|code/, "code"], [/goal/, "target"], [/lingguang|idea/, "idea"],
    [/feed|inbox|mail/, "inbox"], [/workflow|schedule/, "workflow"], [/dataset|database/, "database"], [/artifact|package/, "package"], [/page|doc|note|form|ppt/, "note"]];
  const kindGlyph = (text) => { const key = String(text || "").toLowerCase(); const hit = KIND_GLYPH.find(([pattern]) => pattern.test(key)); return hit ? hit[1] : "file"; };
  const objectGlyph = (object) => kindGlyph((object.subject ? object.subject.kind : "") + " " + (object.open ? object.open.surface : ""));
  /** The plugin's own name for where an object lives: the catalog's name for it (the host asks the tab workspace, which holds
   *  the catalog and the plugins installed at run time), never what one list in the page happens to show. */
  const surfaceName = (surf) => surf ? L((host.pluginTitle && host.pluginTitle(surf)) || surf) : "";
  /** A glyph on a small tinted square; its tone says waiting on you, done, a suggestion, or not there. */
  const tile = (name, tone) => { const box = el("span", "assistant-glyph" + (tone ? " is-" + tone : "")); box.append(typeof name === "string" ? glyph(name) : name); return box; };
  /** An action. Primary and secondary ones look like buttons; a quiet one (stop, take back, cancel) shows on hover or focus. */
  const sideAct = (label, name, run, quiet, variant, icon) => {
    const btnEl = el("button", "assistant-side-action" + (quiet ? " is-quiet" : "") + (variant ? " is-" + variant : "")); btnEl.type = "button";
    if (icon) btnEl.append(glyph(icon));
    btnEl.append(document.createTextNode(label));
    btnEl.setAttribute("aria-label", label + "：" + name);
    btnEl.addEventListener("click", async (event) => {
      event.stopPropagation();
      btnEl.disabled = true; btnEl.setAttribute("aria-busy", "true");
      try { await run(); } catch (error) { host.showToast?.(error); } finally { if (btnEl.isConnected) { btnEl.disabled = false; btnEl.removeAttribute("aria-busy"); } }
    });
    return btnEl;
  };
  /** A card: its glyph, a title and one line under it, then what can be done to it. The title opens it, and the whole card is its target. */
  const card = ({ icon, tone, title, sub, subTone, open, openLabel, actions, done, ask, detail }) => {
    const node = el("div", "assistant-item" + (ask ? " assistant-item--ask" : "") + (done ? " is-done" : "") + (open ? " is-openable" : ""));
    node.append(tile(icon, tone));
    const text = el("div", "assistant-item-text");
    if (open) {
      const name = el("button", "assistant-item-title", title); name.type = "button";
      name.setAttribute("aria-label", (openLabel || L("打开")) + "：" + title);
      name.addEventListener("click", () => { void open(); });
      text.append(name);
    } else text.append(el("span", "assistant-item-title", title));
    if (sub) text.append(el("span", "assistant-item-sub" + (subTone ? " is-" + subTone : ""), sub));
    node.append(text);
    if (actions && actions.length) { const row = el("div", "assistant-item-actions"); actions.forEach((action) => row.append(action)); node.append(row); }
    if (detail) node.title = detail;
    return node;
  };
  const openObject = (object) => object.open ? async () => showObject(object) : null;
  // A thing that is gone may come back named only by its id: the person never saw that id, so it reads as “this item”.
  const objectTitle = (object) => object.title && object.title !== object.subject.id ? object.title : L("这项内容");
  const objectCard = (object, tone, openLabel) => {
    const state = objectState(object);
    return card({ icon: objectGlyph(object), tone: object.state === "missing" || object.state === "unavailable" ? "blocked" : object.state !== "current" ? "attention" : tone,
      title: objectTitle(object), sub: [surfaceName(object.open && object.open.surface), state].filter(Boolean).join(" · "), subTone: state ? "attention" : "",
      open: openObject(object), openLabel, detail: objectDetail(object) });
  };
  /** Rebuilding a block under the person's focus would drop it: the same control gets it back. */
  const keepFocus = (node, build) => {
    const active = node.contains(document.activeElement) ? document.activeElement : null;
    const key = active ? (active.getAttribute("aria-label") || active.textContent) : null;
    build();
    if (key) [...node.querySelectorAll("button, select, input, summary")].find((one) => (one.getAttribute("aria-label") || one.textContent) === key)?.focus();
  };
  /** A block: a heading with its glyph and the summary that still says what matters folded (folding is remembered per viewer), then its content; with no content it is not shown. */
  const BLOCKS_KEY = "molis.assistant.blocks";
  const folded = (() => { try { const saved = JSON.parse(store.get(BLOCKS_KEY) || "{}"); return saved && typeof saved === "object" ? saved : {}; } catch { return {}; } })();
  const paintBlock = (node, title, icon, content, badge, attention, fixed) => {
    node.hidden = !content;
    if (!content) { node.replaceChildren(); return; }
    const key = node.dataset.assistantBlock;
    const head = el(fixed ? "p" : "button", "assistant-block-head" + (fixed ? " is-fixed" : ""));
    if (!fixed) { head.type = "button"; head.setAttribute("aria-expanded", String(!folded[key])); head.setAttribute("aria-controls", "assistant-block-" + key); head.append(el("span", "assistant-block-chevron")); }
    head.append(glyph(icon), el("span", "assistant-block-title", title));
    if (badge) head.append(el("span", "assistant-block-badge" + (attention ? " is-attention" : ""), badge));
    if (!fixed) head.addEventListener("click", () => {
      folded[key] = !folded[key]; if (!folded[key]) delete folded[key];
      store.set(BLOCKS_KEY, Object.keys(folded).length ? JSON.stringify(folded) : null);
      node.toggleAttribute("data-folded", Boolean(folded[key])); head.setAttribute("aria-expanded", String(!folded[key]));
    });
    node.toggleAttribute("data-folded", !fixed && Boolean(folded[key]));
    const body = el("div", "assistant-block-body"); body.id = "assistant-block-" + key; body.append(content);
    node.replaceChildren(head, body);
  };
  const group = (label, ...children) => { const box = el("div", "assistant-group"); if (label) box.append(el("p", "assistant-block-sub", label)); box.append(...children); return box; };
  const stack = (cards, key) => { const box = el("div", "assistant-stack"); cards.forEach((one) => box.append(one)); if (key) window.molisShowMore?.(box, { key, label: L("再显示 {n} 项"), keep: ":has(> .is-blocked)" }); return box; };
  const progress = (done, total, label) => {
    const meter = el("span", "assistant-progress"); const fill = el("span"); fill.style.width = Math.round(total ? done / total * 100 : 0) + "%"; meter.append(fill);
    meter.setAttribute("role", "img"); meter.setAttribute("aria-label", label + " " + done + "/" + total);
    return meter;
  };
  /** The step list the latest round keeps as it goes (the runtime's update-todo): what it means to do, not proof of what happened. */
  const latestSteps = (work) => { const round = work && view && view.work.work_id === work.work_id ? [...view.rounds].reverse().find((one) => one.steps && one.steps.length) : null; return round ? round.steps : []; };

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

  /* 路径: a line from who asked and where it started, through the session and the sub-tasks, to what comes later. */
  const renderPath = (work) => {
    const node = blocks.path;
    if (!node) return;
    const objects = work && view.objects ? view.objects : [];
    const parent = work && work.delegated_by ? work.delegated_by : null;
    const children = work && view.delegated ? view.delegated : [];
    const scheduled = work && view.scheduled ? view.scheduled : [];
    const signature = JSON.stringify([work && work.work_id, work && work.executor, work && work.origin, parent, children,
      objects.filter((o) => o.relation === "origin" || o.relation === "session").map((o) => [o.relation, o.subject.id, o.state, o.title, o.current_revision]),
      scheduled.map((f) => [f.followup_id, f.next_at, f.enabled, f.last && f.last.outcome]), work && view.schedule_survives_close, latestSteps(work), waitsOn(work)]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const line = el("ol", "assistant-timeline");
      const step = (marker, tone, label, ...content) => {
        const item = el("li", "assistant-step");
        const dot = el("span", "assistant-step-marker" + (tone ? " is-" + tone : ""));
        // A marker is a glyph, or a count such as “1/2”.
        dot.append(/^\d+\/\d+$/.test(marker) ? document.createTextNode(marker) : glyph(marker));
        item.append(dot, el("p", "assistant-step-label", label), ...content);
        line.append(item);
      };
      if (parent) step("flag", "", L("受托于"), card({ icon: "workflow", title: parent.title, sub: L("验收") + "：" + parent.acceptance, open: () => switchTo(parent.work_id) }));
      objects.filter((o) => o.relation === "origin").forEach((o) => step("flag", "", L("起点"), objectCard(o)));
      if (work && !objects.some((o) => o.relation === "origin") && work.origin && (work.origin.title || work.origin.surface)) {
        // The page is named as it names itself; its id is never shown, and the same name is not said twice.
        const name = surfaceName(work.origin.surface), title = work.origin.title || name;
        step("flag", "", L("起点"), card({ icon: kindGlyph(work.origin.surface), title, sub: name !== title && name !== work.origin.surface ? name : "" }));
      }
      objects.filter((o) => o.relation === "session").forEach((o) => step("code", "", L("专业会话"), objectCard(o, "", L("在执行方打开"))));
      const steps = latestSteps(work);
      if (steps.length) {
        // The step in hand either runs, or waits on the person: then it says what to do and takes them to it.
        const next = waitsOn(work);
        const doneSteps = steps.filter((item) => item.state === "done").length;
        const rows = steps.map((item) => {
          const cur = item.state === "in-progress", waiting = cur && next;
          const row = el("div", "assistant-subtask assistant-step-item" + (waiting ? " is-attention" : cur ? " is-current" : "") + (item.state === "abandoned" ? " is-abandoned" : ""));
          const mark = el("span", "assistant-subtask-mark" + (item.state === "done" ? " is-done" : waiting ? " is-attention" : ""));
          mark.append(spinner(item.state === "done" ? "done" : waiting ? (work.state === "needs-check" ? "verify" : work.state === "waiting-review" ? "approval" : "answer") : cur ? (work.state === "running" ? "running" : work.state === "paused" ? "paused" : "doing") : item.state === "abandoned" ? "cancelled" : "idle"));
          if (waiting) {
            const name = el("button", "assistant-subtask-name", item.text); name.type = "button"; name.setAttribute("aria-label", next.label + "：" + item.text);
            name.addEventListener("click", () => next.run());
            row.append(mark, name, el("span", "assistant-subtask-state", next.label));
          } else row.append(mark, el("span", "assistant-subtask-name", item.text), el("span", "assistant-subtask-state", cur ? L("正在做") : item.state === "abandoned" ? L("已放弃") : ""));
          return row;
        });
        step(doneSteps + "/" + steps.length, steps.some((item) => item.state === "in-progress") && next ? "attention" : doneSteps === steps.length ? "done" : "", L("步骤"), progress(doneSteps, steps.length, L("步骤")), ...rows);
      }
      if (children.length) {
        const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
        const waiting = children.some((child) => WAITING.has(child.state) && !child.taken_back);
        const meter = progress(done, children.length, L("子任务"));
        const rows = children.map((child) => {
          const row = el("div", "assistant-subtask" + (WAITING.has(child.state) && !child.taken_back ? " is-attention" : ""));
          const tone = child.taken_back ? "" : child.state === "completed" ? "done" : WAITING.has(child.state) ? "attention" : child.state === "failed" ? "blocked" : "";
          const mark = el("span", "assistant-subtask-mark" + (tone ? " is-" + tone : ""));
          mark.append(spinner(ringState(child.state)));
          const name = el("button", "assistant-subtask-name", child.title); name.type = "button"; name.setAttribute("aria-label", L("打开") + "：" + child.title);
          name.addEventListener("click", () => switchTo(child.work_id));
          row.append(mark, name, el("span", "assistant-subtask-state", (child.taken_back ? L("已收回") : stateLabel(child.state)) + (child.follow_ups ? " · " + L("补改") + " " + child.follow_ups : "")));
          /* Stop one sub-task from here, without opening it; what it already did stays. */
          if (!child.taken_back && isLive(child.state)) row.append(sideAct(L("停止"), child.title, async () => { await api("/works/" + encodeURIComponent(child.work_id) + "/control", "POST", { kind: "stop" }); await reload(); }, true));
          /* Take the part back: it stops, what it made stays, and this work finishes that part itself. */
          if (!child.taken_back) {
            const takeBack = sideAct(L("收回"), child.title, async () => { view = await api("/works/" + encodeURIComponent(child.work_id) + "/take-back", "POST", {}); render(); }, true);
            takeBack.title = L("停下这个子任务，由这项工作自己接着做这一部分；它已产出的保留");
            row.append(takeBack);
          }
          return row;
        });
        step(done + "/" + children.length, waiting ? "attention" : done === children.length ? "done" : "", L("分出去的子任务"), meter, ...rows);
      }
      const REPEAT = { none: "一次", daily: "每天", weekly: "每周" }, OUTCOME = { started: "已开始", missed: "错过（当时没在运行）", skipped: "跳过（上一轮未结束）", failed: "没有完成" };
      if (scheduled.length) step("clock", "later", L("之后"), ...scheduled.map((followUp) => card({ icon: "clock", title: followUp.label,
        sub: L(REPEAT[followUp.repeat] || followUp.repeat) + " · " + (followUp.enabled && followUp.next_at ? L("下一次") + " " + when(followUp.next_at) : L("已结束")),
        detail: (followUp.last ? L("上次") + L(OUTCOME[followUp.last.outcome] || followUp.last.outcome) + " · " : "") + (followUp.enabled ? L(view.schedule_survives_close ? "关闭窗口后仍会执行" : "需要 Molis Work 在运行") : ""),
        actions: followUp.enabled ? [sideAct(L("取消"), followUp.label, async () => { await api("/followups/remove", "POST", { followup_id: followUp.followup_id }); await reload(); }, true)] : [] })));
      const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
      const stepsDone = steps.filter((item) => item.state === "done").length;
      paintBlock(node, L("路径"), "workflow", line.children.length ? line : null,
        steps.length ? L("步骤") + " " + stepsDone + "/" + steps.length : children.length ? L("子任务") + " " + done + "/" + children.length : "",
        children.some((child) => WAITING.has(child.state) && !child.taken_back) || (steps.some((item) => item.state === "in-progress") && waitsOn(work)));
    });
  };

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

  /* 概况: the work's state and what it is doing now, where it belongs, who carries it, and what can be done to it now. */
  const nowLine = (work) => {
    if (!work) return L("发出第一句就开始。先在下面选谁来做、放在哪里，也可以不选。");
    if (browserHeld.has(work.work_id)) return L("浏览器在你手上；在侧栏点“交还助理”后，助理会重新观察页面再继续");
    const rounds = view && view.work.work_id === work.work_id ? view.rounds : [];
    const last = rounds[rounds.length - 1];
    const reviews = view && view.work.work_id === work.work_id ? view.reviews : [];
    // The state above already says it waits on the person; this line says on what.
    if (reviews.length) return reviews[0].summary + (reviews.length > 1 ? " · +" + (reviews.length - 1) : "");
    if (last && last.awaiting_input && last.awaiting_input.length) return clip(String(last.awaiting_input[0].prompt || ""), 80);
    if (work.state === "running") { const live = last && [...last.activity].reverse().find((item) => item.state === "started"); return live ? activityLine(live) : L("正在处理…"); }
    const ready = (view && view.cards ? view.cards : []).filter((card) => card.status === "ready" || card.status === "needs-input").length;
    if (ready) return ready + " " + L("个操作等你点");
    if (work.state === "paused") return L("已暂停，点“继续”接着做");
    if (work.state === "needs-check") return L("有操作的结果还没确认，请先核对");
    if ((work.state === "failed" || work.state === "stopped") && last && last.stop_reason && last.stop_reason !== "已停止") return last.stop_reason;
    if (work.state === "completed" && last && last.ended_at) return L("完成于") + " " + when(last.ended_at);
    return "";
  };
  /** A small row of choices, the current one pressed; used for who carries a new work, a plugin's mode and where it lives. */
  const segmented = (label, options, chosen, pick) => {
    const group = el("div", "assistant-segmented"); group.setAttribute("role", "group"); group.setAttribute("aria-label", label);
    options.forEach((option) => {
      const btnEl = el("button", "assistant-segment", option.label); btnEl.type = "button";
      btnEl.setAttribute("aria-pressed", String(option.id === chosen));
      if (option.hint) btnEl.title = option.hint;
      if (option.disabled) { btnEl.disabled = true; btnEl.title = option.hint || ""; }
      btnEl.addEventListener("click", () => pick(option.id));
      group.append(btnEl);
    });
    return group;
  };
  /** Scrolls the conversation to what waits on the person and marks it for a moment; a drawer steps aside first. */
  const jumpTo = (target) => {
    const node = typeof target === "string" ? thread.querySelector(target) : target;
    if (!node) return;
    if (!spacious() && drawerOpen) { drawerOpen = false; paintLayout(); }
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollOwner()?.release(); thread.scrollTo({ top: node.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 16, behavior: still ? "auto" : "smooth" });
    node.removeAttribute("data-flash"); void node.offsetWidth; node.setAttribute("data-flash", "");
    setTimeout(() => node.removeAttribute("data-flash"), 700);
    // The card's own decision first (允许执行, 回答, the action), not a copy button inside the code it shows.
    (node.querySelector('.assistant-card-actions button:not([disabled]), [data-ix-action]:not([disabled]), [data-ix-focus]')
      || node.querySelector("button:not([disabled]):not(.assistant-code-copy):not(.assistant-code-more), input, select, textarea"))?.focus({ preventScroll: true });
  };
  // Something in this work waits on the person; what to press is in the row above the input.
  const waitsOn = (work) => Boolean(work && view && view.work.work_id === work.work_id && view.next_html && (WAITING.has(work.state) || view.next_html.includes("data-waiting")));
  const strip = island.querySelector("[data-assistant-strip]");
  /* With the side pane out of sight (a narrow panel's closed drawer, or folded away), the conversation's top line
     carries what the summary would when there is something to do: the state, the one next step, pause, resume or stop. */
  function paintStrip() {
    if (!strip || !panel) return;
    const work = view && view.work.work_id === curId ? view.work : getWork();
    stepRow?.paint();
    const state = work ? work.state : "idle", next = waitsOn(work);
    const liveChildren = work && view && view.delegated ? view.delegated.filter((child) => isLive(child.state)).length : 0;
    strip.hidden = !work || panel.hidden || sideOpen() || !(next || state === "running" || state === "paused" || liveChildren);
    if (strip.hidden) return;
    strip.dataset.tone = WAITING.has(state) ? "waiting" : state === "running" ? "running" : "";
    const stateNode = strip.querySelector("[data-assistant-strip-state]"), nowNode = strip.querySelector("[data-assistant-strip-now]");
    stateNode.textContent = stateLabel(state); stateNode.dataset.state = state; stateNode.dataset.mwState = ringState(state);
    nowNode.textContent = nowLine(work); nowNode.title = nowNode.textContent;
  }
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

  /* ─── Tabs ─────────────────────────────────────────────────────────────── */
  // A tab's mark says at a glance which work waits on the person, which runs, and which has news not yet seen.
  const markOf = (work) => !work ? "" : WAITING.has(work.state) || urgentWorks.has(work.work_id) ? "waiting" : work.state === "running" ? "running"
    : unreadWorks.has(work.work_id) ? "unread" : work.state === "failed" ? "failed" : "";
  const MARK_LABEL = { waiting: "等你", running: "进行中", unread: "有新结果", failed: "没有完成" }; const tabMark = (mark, work) => { const node = el("span", "assistant-tab-mark"); if (mark) node.dataset.mwState = mark === "waiting" ? (work && WAITING.has(work.state) ? ringState(work.state) : "answer") : mark; node.setAttribute("aria-hidden", "true"); return node; };
  const workById = (id) => works.find((work) => work.work_id === id) || (view && view.work.work_id === id ? view.work : null);
  function drawTabs() {
    if (!tabsEl) return;
    const focused = tabsEl.contains(document.activeElement) ? document.activeElement.closest("[data-tab]")?.dataset.tab : null;
    const ids = tabs.slice();
    tabsEl.replaceChildren();
    const tab = (id, title, mark, closable) => {
      const wrap = el("div", "assistant-tab"); wrap.dataset.tab = id;
      if (mark) wrap.dataset.mark = mark;
      const cur = id === (curId || "new");
      if (cur) wrap.setAttribute("data-current", "");
      const main = el("button", "assistant-tab-main"); main.type = "button"; main.setAttribute("role", "tab");
      main.setAttribute("aria-selected", String(cur)); main.tabIndex = cur ? 0 : -1;
      main.setAttribute("aria-controls", "assistant-side");
      main.append(tabMark(mark, workById(id)), el("span", "assistant-tab-title", title));
      main.title = title + (mark ? " · " + L(MARK_LABEL[mark]) : "");
      main.addEventListener("click", () => { if (id === "new") void switchTo(null); else void switchTo(id); });
      wrap.append(main);
      if (id !== "new") wrap.addEventListener("auxclick", (event) => { if (event.button !== 1) return; event.preventDefault(); closeTab(id); });
      if (closable) {
        const close = el("button", "assistant-tab-close", "×"); close.type = "button"; close.tabIndex = -1;
        close.setAttribute("aria-label", L("关闭标签") + "：" + title);
        close.title = L("关闭标签（工作仍在“全部工作”里）");
        close.addEventListener("click", (event) => { event.stopPropagation(); if (id === "new") void switchTo(tabs[tabs.length - 1] || null); else closeTab(id); });
        wrap.append(close);
      }
      tabsEl.append(wrap);
    };
    ids.forEach((id) => { const work = workById(id); tab(id, work ? work.title : L("正在读取…"), markOf(work), true); });
    if (!curId) tab("new", L("新工作"), "", ids.length > 0);
    const cur = tabsEl.querySelector("[data-current]");
    if (cur) {
      const left = cur.offsetLeft, right = left + cur.offsetWidth;
      if (left < tabsEl.scrollLeft) tabsEl.scrollLeft = left; else if (right > tabsEl.scrollLeft + tabsEl.clientWidth) tabsEl.scrollLeft = right - tabsEl.clientWidth;
    }
    if (focused) tabsEl.querySelector('[data-tab="' + focused + '"] .assistant-tab-main')?.focus();
  }
  // Left and right move between tabs, as in any tab list; Delete closes the focused one.
  tabsEl?.addEventListener("keydown", (event) => {
    const items = [...tabsEl.querySelectorAll(".assistant-tab-main")];
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); items[(at + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length].focus(); }
    if (event.key === "Delete") { const id = items[at].closest("[data-tab]")?.dataset.tab; if (id && id !== "new") { event.preventDefault(); closeTab(id); } }
  });

  /* A pill at the foot of the conversation: news that arrived while reading above. What waits is in the row above the input. */
  const jump = island.querySelector("[data-assistant-jump]");
  let unseen = false;
  const paintJump = () => {
    if (!jump) return;
    if (unseen && !nearBottom()) {
      jump.textContent = "↓ " + L("新消息");
      jump.onclick = () => { unseen = false; scrollOwner()?.toLatest(); paintJump(); }; jump.hidden = false; return;
    }
    unseen = false; jump.hidden = true;
  };
  thread.addEventListener("scroll", () => { if (nearBottom()) unseen = false; paintJump(); }, { passive: true });
  /* A new work's conversation is where to begin: this page's starting points and the works to go back to. */
  const emptyList = island.querySelector("[data-assistant-empty-list]");
  function paintEmpty() {
    if (!emptyList || curId) return;
    const starters = startersFor();
    const recent = works.filter((work) => !work.archived && !work.delegated_by).slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 3);
    const signature = JSON.stringify([starters.map((one) => [one.label, one.key || "", one.kind || ""]), recent.map((work) => [work.work_id, work.title, work.state, markOf(work)])]);
    if (emptyList.dataset.signature === signature) return;
    emptyList.dataset.signature = signature;
    const parts = [];
    if (starters.length) {
      parts.push(el("p", "assistant-empty-title", L("从这一页开始")));
      starters.forEach((starter) => {
        const btnEl = el("button", "assistant-start"); btnEl.type = "button";
        btnEl.append(el("span", "assistant-start-title", starter.label));
        if (starter.kind) btnEl.append(el("span", "assistant-start-state", starter.kind));
        if (starter.hint) btnEl.title = starter.hint;
        btnEl.addEventListener("click", () => { if (useStarter(starter)) input.focus(); });
        parts.push(btnEl);
      });
    }
    if (recent.length) {
      parts.push(el("p", "assistant-empty-title", L("继续最近的工作")));
      recent.forEach((work) => {
        const btnEl = el("button", "assistant-start assistant-start--work"); btnEl.type = "button";
        const mark = markOf(work); if (mark) btnEl.dataset.mark = mark;
        btnEl.append(el("span", "assistant-tab-mark"), el("span", "assistant-start-title", work.title), el("span", "assistant-start-state", stateLabel(work.state)));
        btnEl.addEventListener("click", () => { void switchTo(work.work_id); });
        parts.push(btnEl);
      });
    }
    parts.push(el("p", "assistant-empty-hint", L("输入 @ 引用项目里的内容，/ 用一个能力或方法；文件和图片可以直接拖进输入框。")));
    emptyList.replaceChildren(...parts);
  }
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

  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
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
  document.addEventListener("molis-work:plugin-events", (event) => { pluginHeldSince = performance.now(); pluginWaiting = Number(event.detail?.pending) || 0; paintAttention(); });

  /* ─── Sending ──────────────────────────────────────────────────────────── */
  /* ─── What the person is looking at, and what goes with this Send ──────── */
  let contextStrip = null;
  const startPop = island.querySelector("[data-assistant-starters]");
  const attach = island.querySelector("[data-assistant-attach]");
  const fileInput = island.querySelector("[data-assistant-file]");
  let lastSurface = null;
  let sel = null;
  let files = [];
  const removed = new Set();
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
  const noteSurface = (target) => {
    if (target?.nodeType !== 1 || island.contains(target)) return;
    const surf = target.closest("[data-assistant-context]");
    if (surf) lastSurface = surf;
  };
  document.addEventListener("focusin", (event) => noteSurface(event.target), true);
  document.addEventListener("pointerdown", (event) => noteSurface(event.target), true);
  document.addEventListener("selectionchange", () => {
    const cur = getSelection();
    const node = cur && cur.anchorNode;
    const nodeEl = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!nodeEl || island.contains(nodeEl)) return;
    const text = cur.isCollapsed ? "" : cur.toString().trim();
    if (!text) { sel = null; paintMats(); return; }
    sel = { text: text.slice(0, 8000), truncated: text.length > 8000, surface: nodeEl.closest("[data-assistant-context]") };
    removed.delete("selection");
    paintMats();
  });
  /** Official surfaces whose tab item is an object with a shared context reader; a plugin that declares its own context wins. */
  const TAB_KINDS = { pages: "pages_document", coding: "coding_session", inbox: "inbox_entry", feed: "feed_item", goals: "goal", artifacts: "artifact" };
  // What plugins declare for their searchable objects (kind and the surface it opens in) extends and corrects the list.
  const declaredKinds = {};
  api("/surface-kinds").then((res) => Object.assign(declaredKinds, res.kinds || {})).catch(() => undefined);
  // The last background a plugin page sent (purpose "background"), used while that plugin is the one on show.
  let background = null;
  const pageCtx = () => {
    const surf = visible(lastSurface) ? lastSurface : [...document.querySelectorAll("[data-assistant-context]")].find((node) => visible(node) && !island.contains(node));
    if (surf) {
      try { return JSON.parse(surf.getAttribute("data-assistant-context") || "null"); } catch { return null; }
    }
    const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    if (background && background.object && shown && shown.dataset.pluginId === background.source.surface) {
      return { plugin_id: background.source.surface, surface_title: background.source.title, object: background.object };
    }
    // No declaration: the open tab still says which object the person is on.
    const tab = document.querySelector(".tab-item[aria-current='page'][data-item-id]");
    if (!tab) return null;
    const kind = declaredKinds[tab.dataset.plugin] || TAB_KINDS[tab.dataset.plugin];
    const title = tab.getAttribute("title") || "";
    return { plugin_id: tab.dataset.plugin, surface_title: title, ...(kind ? { object: { kind, id: tab.dataset.itemId, title } } : {}) };
  };
  /* What the person looks at is not what they work on. A page object goes with a Send only when it already belongs to
     the current work (opened from it, produced by it) or the person adds it with +; then the model sees it and the work
     is linked under it, otherwise neither (spec §21.5). What a page hands over brings its object along. */
  const joined = new Set();
  const { objectKey, belongsToWork, holds, relatedWorks, pickable, forgetRelated } = (${ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT})({ api, joined, open: () => Boolean(panel && !panel.hidden),
    current: () => (view && view.work.work_id === curId ? view : null), repaint: () => paintMats(), L });
  /** The page's session of the plugin a new work aims at, which it continues instead of starting another. */
  const executorSession = (id) => { const offer = id === "assistant" ? null : executorOffer(id), ctx = pageCtx(); return offer && ctx && ctx.object && ctx.object.kind === offer.session_kind ? ctx.object.id : null; };
  const pageObject = () => {
    const ctx = pageCtx();
    if (!ctx || !ctx.object || removed.has("object")) return null;
    const object = ctx.object;
    return { object, context:ctx, related: belongsToWork(object), included: holds(object) };
  };
  const clip = (text, size) => text.length > size ? text.slice(0, size - 1) + "…" : text;
  /** The materials this Send would carry, each named and removable; page items are marked as coming from the page. */
  const materialsNow = () => {
    const ctx = pageCtx();
    const items = [];
    const page = pageObject();
    // The page's object is named once; the sentence around it is the translation's own, so it keeps its own colon.
    // Not added, it is offered — unless something handed over from it already brings it along.
    const name = page && (page.object.title || page.object.id), label = page && L("正在看：{title}", { title: name });
    if (page && page.included) items.push({ key: "object", label, object: page.object, auto: !joined.has(objectKey(page.object)), note: page.related ? L("这项工作的对象") : "" });
    else if (page && !files.some((file) => file.object && objectKey(file.object) === objectKey(page.object))) items.push({ key: "object", label, optional: true });
    if (page && page.included && ctx.unsaved && ctx.draft_text && !removed.has("draft")) items.push({ key: "draft", label: L("未保存的修改"), auto: true });
    if (page) relatedWorks(page.object).filter((row) => row.work_id !== curId).slice(0, 2)
      .forEach((row) => items.push({ key: "work:" + row.work_id, label: L("这个对象属于工作") + "「" + row.title + "」", optional: true, work: row }));
    if (sel && !removed.has("selection")) items.push({ key: "selection", label: L("选中的内容") + "：" + clip(sel.text.replace(/\s+/g, " "), 28), auto: true });
    files.forEach((file) => items.push({ key: "file:" + (file.chip || file.material_id), label: (file.kind === "image" ? L("图片") + "：" : file.reference ? L("引用") + "：" : "") + file.title, auto: false, put: true, thumb: file.preview }));
    return items.concat(attachments ? attachments.items() : []);
  };
  /** Leaves an item out of this Send: a page object the person added goes back to optional; the rest are removed. */
  function dropMaterial(item) {
    const page = item.key === "object" ? pageObject() : null;
    if (page && joined.has(objectKey(page.object))) joined.delete(objectKey(page.object));
    else if (item.key.startsWith("file:")) { if (!attachments.drop(item.key)) files = files.filter((file) => "file:" + (file.chip || file.material_id) !== item.key); } else removed.add(item.key);
  }
  const stripNode = island.querySelector("[data-assistant-context-strip]");
  attachments = (${ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT})({ L, api, toast: (text) => host.showToast?.(text), files: () => files, take: (file) => files.push(file), paint: () => paintMats() });
  const sideContext = (${ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT})({ L, el, kinds: MATERIAL_KIND, tile, glyph, group, sideAct, paintBlock, keepFocus, sidePanelHere, sidePreview, readBack, readImage, openObject, objectState, objectTitle, objectDetail, objectGlyph, surfaceName, addFiles,
    current: () => (view && view.work.work_id === curId ? view : null), pickFile: () => fileInput?.click(), expired: EXPIRED_IMAGE, block: () => blocks.materials,
    pending: () => materialsNow().filter((item) => !item.optional && !item.state).map((item) => ({ kind: item.key === "draft" ? "text" : item.key === "selection" ? "selection" : item.key.startsWith("file:") ? (files.find((file) => "file:" + (file.chip || file.material_id) === item.key) || {}).kind || "file" : "object", title: item.label })) });
  const surroundings = (${ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT})({ L, el, card, group, stack, paintBlock, keepFocus, api, environmentBlock: () => blocks.environment, toolsBlock: () => blocks.tools });
  const usagePane = (${ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT})({ L, el, progress, api, toast: (error) => host.showToast?.(error), box: () => usageBox, current: () => (view && view.work.work_id === curId ? view : null), adopt: (next) => { view = next; render(); } });
  contextStrip = stripNode && (${ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT})({ strip: stripNode, L, el, items: materialsNow, open: () => Boolean(panel && !panel.hidden), focused: () => document.activeElement === input,
    add: () => { const page = pageObject(); if (page) joined.add(objectKey(page.object)); paintMats(); },
    drop: (item) => { dropMaterial(item); paintMats(); }, retry: (item) => attachments.retry(item.key),
    go: (work) => { void switchTo(work.work_id); input.focus(); } });
  function paintMats() { sideContext.paint(); paintEmpty(); contextStrip?.paint(); syncSend(); }
  island.addEventListener("focusin", () => contextStrip?.paint());
  island.addEventListener("focusout", () => setTimeout(() => contextStrip?.paint(), 0));
  /* Starting points for what is open (specs/archive/contextual-interaction §6.4.2): what the action directory offers for it,
     through the context row's controller — the row's own plan while something is in hand. Choosing one of those runs
     it as a click on the row would. With nothing offered, three plain questions that only fill the input. Pages do not
     list their own. */
  const plainStarters = () => [
    { label: L("总结这一页"), prompt: L("总结这一页的要点") },
    { label: L("列出这一页的要点"), prompt: L("把这一页的要点逐条列出来") },
    { label: L("下一步可以做什么"), prompt: L("根据这一页，下一步可以做什么？") },
  ];
  const offered = {
    signature: "", request: "", answer: null, timer: 0,
    // Nothing (undefined) while the answer is on its way (briefly: rules only), then the items, possibly none.
    read(ctx) {
      const inHand = Boolean(sel && !removed.has("selection"));
      const signature = JSON.stringify([ctx.plugin_id, ctx.object || null, inHand]);
      // What is in hand changes with every selection: ask each time (the row answers from the plan it shows).
      // Kept while the same thing stays open, but asked again after a while: a plugin switched off drops out.
      const fresh = this.answer && Date.now() - this.answer.at < 15000;
      if (signature === this.signature && !inHand && (fresh || !this.answer)) return this.answer ? this.answer.items : undefined;
      if (signature !== this.signature) { this.signature = signature; this.answer = null; }
      const req = this.request = crypto.randomUUID();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (this.request === req && !this.answer) this.settle(req, "", []); }, 2000);
      document.dispatchEvent(new CustomEvent("molis:assistant-starters-request", { detail: { context:ctx, request_id: req } }));
      return this.answer ? this.answer.items : undefined;
    },
    settle(req, objectKey, items) {
      if (req !== this.request) return;
      const changed = !this.answer || JSON.stringify([this.answer.object_key, this.answer.items]) !== JSON.stringify([objectKey, items]);
      this.answer = { object_key: objectKey, items, at: Date.now() };
      if (!changed) return;
      // Answered while being read (the row's plan is at hand): the reader shows it; otherwise repaint the empty work.
      queueMicrotask(paintEmpty);
    },
  };
  document.addEventListener("molis:assistant-starters", (event) => {
    const detail = event.detail || {};
    const items = Array.isArray(detail.items) ? detail.items.filter((item) => item && typeof item.key === "string" && typeof item.label === "string") : [];
    offered.settle(detail.request_id, typeof detail.object_key === "string" ? detail.object_key : "", items);
  });
  const startersFor = () => {
    const ctx = pageCtx();
    if (!ctx) return [];
    const items = offered.read(ctx);
    if (items === undefined) return [];
    if (!items.length) return plainStarters();
    const objectKey = offered.answer.object_key;
    return items.map((item) => ({ label: item.label, hint: item.hint, kind: item.kind, key: item.key, object_key: objectKey }));
  };
  // A plain question fills the input; an offered action runs through the row, and nothing is typed for it.
  const useStarter = (starter) => {
    if (starter.key) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starter-choose", { detail: { object_key: starter.object_key, key: starter.key } }));
      return false;
    }
    input.value = starter.prompt; typed = true; syncSend(); saveDraft(false);
    return true;
  };
  const starterLabel = (starter) => starter.label + (starter.kind ? " · " + starter.kind : "");
  /* “/”: pick a capability this work may really use now (or one of this page's starters); nothing runs by picking. */
  let capabilityRows = null;
  const loadCapabilityRows = async () => {
    if (capabilityRows) return capabilityRows;
    try { capabilityRows = ((await api("/capabilities")).capabilities || []).filter((row) => row.enabled); } catch { capabilityRows = []; }
    return capabilityRows;
  };
  let methodRows = null, slashSeq = 0;
  const loadMethodRows = async () => {
    if (methodRows) return methodRows;
    try { methodRows = (await api("/methods")).methods || []; } catch { methodRows = []; }
    return methodRows;
  };
  const slashOpen = () => startPop && !startPop.hidden && startPop.dataset.mode === "slash";
  async function setSlash(query) {
    if (!startPop) return;
    const q = String(query || "").trim().toLowerCase(), mine = ++slashSeq;
    const starters = startersFor().filter((starter) => !q || starter.label.toLowerCase().includes(q));
    const rows = (await loadCapabilityRows()).filter((row) => !q || [row.title, row.provider, row.description].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 8);
    const methods = (await loadMethodRows()).filter((row) => !q || [row.name, row.plugin_title, row.summary].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 5);
    if (mine !== slashSeq || !String(input.value || "").startsWith("/")) return;
    startPop.dataset.mode = "slash";
    startPop.hidden = false;
    startPop.replaceChildren(el("p", "assistant-popover-title", L("用一个方法或能力，或这样开始")));
    starters.forEach((starter) => {
      const btnEl = el("button", "assistant-starter", starterLabel(starter)); btnEl.type = "button";
      if (starter.hint) btnEl.title = starter.hint;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (starter.key) { input.value = slashDraft || ""; slashDraft = null; syncSend(); saveDraft(false); }
        closeSlash();
        if (useStarter(starter)) input.focus();
      });
      startPop.append(btnEl);
    });
    // A method (how to do it) or a capability (what to use), chosen here, goes with this round only, once.
    const pick = (label, hint, prefix, same, material) => {
      const btnEl = el("button", "assistant-starter", label); btnEl.type = "button";
      btnEl.title = hint;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (!files.some((file) => file.kind === material.kind && same(file))) files.push({ material_id: prefix + crypto.randomUUID(), explicit: true, ...material });
        input.value = slashDraft || ""; slashDraft = null; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMats(); input.focus();
      });
      startPop.append(btnEl);
    };
    methods.forEach((row) => pick(L("方法") + "：" + row.name + " · " + row.plugin_title, row.summary || row.name, "method-",
      (file) => file.method.method_id === row.method_id, { kind: "method", title: L("方法") + "：" + row.name, method: { method_id: row.method_id } }));
    rows.forEach((row) => {
      const title = row.provider + " · " + row.title;
      pick(L("用") + "：" + title, row.description || title, "cap-", (file) => file.capability.capability_id === row.capability_id,
        { kind: "capability", title: L("用") + "：" + title, capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } });
    });
    if (!starters.length && !rows.length && !methods.length) startPop.append(el("p", "assistant-material-origin", L("没有匹配的能力；换个词，或直接说要做什么")));
  }
  function closeSlash() { if (startPop && startPop.dataset.mode === "slash") { delete startPop.dataset.mode; startPop.hidden = true; } }
  /* “@”: the system search's hits, brought along as references (assistant-mention.ts). */
  const mention = (${ASSISTANT_MENTION_FACTORY_SCRIPT})({ L, el, pop: startPop, field: input,
    search: (query) => molisWorkRequest(host.route("/api/search/query"), { body: { query, scope: "all", limit: 8 }, fallback: L("搜索暂时不可用，请稍后重试") }),
    pick: (hit) => {
      if (!files.some((file) => file.reference && file.object && file.object.kind === hit.subject.kind && file.object.id === hit.subject.id)) {
        files.push({ material_id: "ref-" + crypto.randomUUID(), kind: "object", title: hit.title, explicit: true, reference: { hit_id: hit.hit_id },
          object: { kind: hit.subject.kind, id: hit.subject.id, title: hit.title }, source: { surface: (hit.open && hit.open.surface) || hit.plugin_id, plugin_id: hit.plugin_id, title: hit.plugin_title },
          text: hit.snippet || "" });
      }
      typed = true; syncSend(); saveDraft(false); paintMats();
    } });
  const mentionOpen = mention.isOpen, mentionAt = mention.at;
  function closeMention() { mention.close(); }
  function setMention(found) { mention.open(found); }
  function closeStarts() { if (startPop) { delete startPop.dataset.mode; startPop.hidden = true; } }
  input.addEventListener("blur", () => setTimeout(() => { if (!island.contains(document.activeElement) || document.activeElement === input) return; closeStarts(); }, 0));
  // What opens from the island, and the button focus returns to.
  const popovers = () => [[workNav, setWorks, worksToggle], [morePop, setMore, attach], [execsPop, setExecs, execBtn], [modesPop, setModes, modeButton], [charsPop, setChars, charBtn], [noticePop, setNotices, noticeBtn]];
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.nodeType !== 1 || island.contains(event.target)) return;
    closeStarts(); for (const [pop, close] of popovers()) if (pop && !pop.hidden) close(false);
  });
  island.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const stop = () => { event.preventDefault(); event.stopPropagation(); }, put = ([pop, close, btnEl]) => pop && !pop.hidden && (stop(), close(false), (visible(btnEl) ? btnEl : attach)?.focus(), true);
    const [worksOpen, moreOpen, ...choosers] = popovers();
    if (put(worksOpen)) return;
    if (panel && !panel.hidden && !spacious() && drawerOpen) { stop(); drawerOpen = false; paintLayout(); sideToggle?.focus(); return; }
    if (put(moreOpen)) return;
    if (startPop && !startPop.hidden) { stop(); closeStarts(); }
    choosers.forEach(put);
  }, true);
  /* Files the person adds, picked, pasted or dropped: one path (assistant-attachments.ts). */
  function addFiles(chosen) { return attachments.add(chosen); }
  const morePop = island.querySelector("[data-assistant-more]");
  const moreItem = (label, value, run) => {
    const row = el("button", "assistant-more-item"); row.type = "button";
    row.append(el("span", "assistant-more-label", label));
    if (value) row.append(el("span", "assistant-more-value", value));
    row.addEventListener("click", run);
    return row;
  };
  /** Starts “@” or “/” in the input as if typed; words already there wait aside while “/” picks, and come back after. */
  let slashDraft = null;
  const insertTrigger = (mark) => {
    const value = String(input.value || "");
    if (mark === "/") { if (value.trim() && !value.startsWith("/")) slashDraft = value; input.value = "/"; }
    else input.value = value + (value && !/\s$/.test(value) ? " " : "") + mark;
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const paintMore = () => {
    if (!morePop) return;
    const rows = [...(compose.dataset.crowded === "chips" ? [noticeBtn] : []).filter((btnEl) => btnEl && !btnEl.hidden).map((btnEl) => moreItem(btnEl.title, btnEl.textContent.trim(), () => { setMore(false); btnEl.click(); })),
      moreItem(L("添加文件或图片…"), L("也可以拖入、粘贴"), () => { setMore(false); fileInput?.click(); }), ...(project && document.documentElement.dataset.knowledgePicker === "1" ? [moreItem(L("选择项目资料…"), L("可多选，读原文给助理"), () => { setMore(false); document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "assistant:" + crypto.randomUUID(), max: 10 } })); })] : []),
      moreItem(L("引用项目里的内容"), "@", () => { setMore(false); insertTrigger("@"); }),
      moreItem(L("用一个能力或方法"), "/", () => { setMore(false); insertTrigger("/"); })];
    morePop.replaceChildren(...rows);
  };
  function setMore(open) {
    if (!morePop) return;
    morePop.hidden = !open;
    attach?.setAttribute("aria-expanded", String(open));
    if (open) { closeStarts(); paintMore(); morePop.querySelector("button")?.focus(); }
  }
  attach?.addEventListener("click", () => setMore(Boolean(morePop && morePop.hidden)));
  fileInput?.addEventListener("change", () => {
    const chosen = [...(fileInput.files || [])];
    fileInput.value = "";
    void addFiles(chosen);
  });
  // A picture pasted or dropped on the composer is added the same way; pasted text stays text.
  const pastedName = (file) => file.name && file.name !== "image.png" ? file
    : new File([file], L("粘贴的图片") + "." + ((file.type.split("/")[1] || "png").replace("jpeg", "jpg")), { type: file.type });
  input.addEventListener("paste", (event) => {
    const pasted = [...(event.clipboardData?.files || [])];
    if (!pasted.length) return;
    event.preventDefault();
    void addFiles(pasted.map(pastedName));
  });
  compose?.addEventListener("dragover", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
  if (compose) window.molisDropZone?.(compose, (on) => { if (on) compose.dataset.dropping = "true"; else delete compose.dataset.dropping; });
  compose?.addEventListener("drop", (event) => {
    const dropped = [...(event.dataTransfer?.files || [])];
    if (!dropped.length) return;
    event.preventDefault();
    void addFiles(dropped);
  });
  const pageContext = () => {
    const ctx = pageCtx();
    const cur = document.querySelector("[data-plugin-picker-current]");
    const active = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    const surf = (ctx && ctx.plugin_id) || (active && active.dataset.pluginId) || "home";
    const named = cur ? cur.querySelector(".plugin-picker-chip.is-focused") || cur.querySelector(".plugin-picker-chip") || cur : null;
    const title = (ctx && ctx.surface_title) || (named ? named.textContent.trim() : "");
    const res = { source: Object.assign({ surface:surf }, ctx && ctx.plugin_id ? { plugin_id: ctx.plugin_id } : {}, title ? { title } : {}), captured_at: new Date().toISOString() };
    const page = pageObject();
    if (page && page.included) res.object = page.object;
    if (ctx && ctx.unsaved && page && page.included) res.unsaved = true;
    if (sel && !removed.has("selection")) res.selection = { text: sel.text, truncated: sel.truncated };
    return Object.assign(res, contextStrip ? contextStrip.carried() : {});
  };
  const sendMaterials = () => {
    const ctx = pageCtx();
    const list = files.map(({ preview: _preview, chip: _chip, ...file }) => file);
    const page = pageObject();
    if (page && curId && joined.has(objectKey(page.object))) {
      list.push({ material_id: "object", kind: "object", title: page.object.title || page.object.id, explicit: true, object: page.object,
        source: { surface: ctx.plugin_id || "page", ...(ctx.plugin_id ? { plugin_id: ctx.plugin_id } : {}) } });
    }
    if (page && page.included && ctx.unsaved && ctx.draft_text && !removed.has("draft")) {
      list.unshift({ material_id: "draft", kind: "text", title: L("未保存的修改") + "：" + ((ctx.object && ctx.object.title) || ""), text: ctx.draft_text,
        explicit: false, draft: true, source: { surface: ctx.plugin_id, plugin_id: ctx.plugin_id }, object: ctx.object });
    }
    return list;
  };
  const takeMaterials = (sent) => {
    files = files.filter(file => !sent.files.includes(file));
    if (sel === sent.selection) sel = null;
    sent.removed.forEach(key => removed.delete(key)); sent.joined.forEach(key => joined.delete(key)); paintMats();
  };

  /* ─── What plugin pages tell the Assistant (spec 8.3): by purpose, never by wording ───────────────────────── */
  const heard = new Set();
  let requestOverride = null, pageText = null;
  const tidyMessage = (raw) => {
    if (!raw || typeof raw !== "object" || typeof raw.message_id !== "string" || !raw.message_id || raw.message_id.length > 120) return null;
    if (!["background", "change", "suggest", "delegate", "reply"].includes(raw.purpose)) return null;
    if (!raw.source || typeof raw.source.surface !== "string" || !raw.source.surface) return null;
    const source = { surface: raw.source.surface.slice(0, 80), title: typeof raw.source.title === "string" && raw.source.title ? raw.source.title.slice(0, 80) : raw.source.surface.slice(0, 80) };
    const object = raw.object && typeof raw.object.kind === "string" && typeof raw.object.id === "string" && raw.object.kind && raw.object.id
      ? Object.assign({ kind: raw.object.kind.slice(0, 80), id: raw.object.id.slice(0, 200) }, typeof raw.object.title === "string" ? { title: raw.object.title.slice(0, 200) } : {},
        typeof raw.object.version === "number" || typeof raw.object.version === "string" ? { version: raw.object.version } : {}) : null;
    const mats = Array.isArray(raw.materials) ? raw.materials.filter((item) => item && typeof item.title === "string" && typeof item.text === "string" && item.text)
      .slice(0, 4).map((item) => ({ title: item.title.slice(0, 200), text: item.text.slice(0, 20000) })) : [];
    return { message_id: raw.message_id, purpose: raw.purpose, source, object, text: typeof raw.text === "string" ? raw.text.trim().slice(0, 8000) : "", materials:mats,
      work_id: typeof raw.work_id === "string" && raw.work_id ? raw.work_id : null, executor: typeof raw.executor === "string" && raw.executor ? raw.executor.slice(0, 200) : null };
  };
  const bring = (message) => {
    (message.materials.length || !message.object ? message.materials : [{ kind: "object", title: message.object.title || message.object.id }]).forEach((item, index) => files.some((file) => file.title === item.title && file.text === item.text) || files.push(Object.assign({ material_id: "msg-" + message.message_id.slice(0, 40) + "-" + index, kind: item.kind || "text", title: item.title, text: item.text,
      explicit: true, source: { surface: message.source.surface, title: message.source.title } }, message.object ? { object: message.object } : {})));
    if (message.text) input.value = message.text;
    syncSend(); paintMats();
  };
  const showOffer = (message, unconfirmed) => stepRow?.offer(message, unconfirmed);
  const delegate = async (message) => {
    if (busy) { showOffer(message, false); return; }
    if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id);
    else if (message.work_id || curId) await switchTo(null);
    await executorsLoaded;
    if (!message.work_id && message.executor && executorOffer(message.executor)) { nextExec = message.executor; nextMode = ""; paintAim(); paintSum(); } // e.g. the 成果库's 「交给 Coding」
    bring(message);
    if (!String(input.value || "").trim()) { setPanel(true); input.focus(); return; }
    requestOverride = "msg-" + message.message_id; pageText = message.text && input.value.trim();
    compose.requestSubmit(send);
  };
  document.addEventListener("molis:assistant-open", async (event) => {
    const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
    const named = typeof detail.work_id === "string" && detail.work_id ? detail.work_id : "";
    if (named && !works.some((work) => work.work_id === named)) await loadWorks();
    // The work on show reads itself again, so a card just placed in it shows now.
    if (named && works.some((work) => work.work_id === named)) await (named === curId ? reload().then(poll) : switchTo(named));
    else if (detail.new === true || named) await switchTo(null);
    const source = detail.source && typeof detail.source.surface === "string" && detail.source.surface
      ? { surface: detail.source.surface.slice(0, 80), title: typeof detail.source.title === "string" && detail.source.title ? detail.source.title.slice(0, 80) : detail.source.surface.slice(0, 80) } : null;
    // What was in hand goes in the strip with the object it came from, so the work is linked under it; no words are
    // written for the person (spec §21.2 point 4). It stands for the page's selection, which is not carried twice.
    const object = tidyMessage({ message_id: "open", purpose: "delegate", source: { surface: "page" }, object: detail.object })?.object;
    const brought = Array.isArray(detail.materials) ? detail.materials.filter((item) => item && typeof item.title === "string" && (typeof item.text === "string" && item.text || item.subject && !files.some((file) => file.reference?.subject?.kind === item.subject.kind && file.reference.subject.id === item.subject.id))).slice(0, 10) : [];
    brought.forEach((item, index) => files.push(item.subject ? { material_id: "kn-" + crypto.randomUUID(), kind: "object", title: item.title.slice(0, 200), explicit: true, reference: { subject: { kind: item.subject.kind, id: item.subject.id } }, object: { kind: item.subject.kind, id: item.subject.id, title: item.title.slice(0, 200) }, ...(source ? { source } : {}) } : Object.assign({ material_id: "open-" + Date.now().toString(36) + "-" + index, kind: "text", title: item.title.slice(0, 200),
      text: item.text.slice(0, 20000), explicit: true }, source ? { source } : {}, object ? { object } : {})));
    if (brought.length) sel = null;
    syncSend(); paintMats(); setPanel(true); input.focus();
  });
  window.addEventListener("molis:assistant-message", (event) => {
    const message = tidyMessage(event.detail);
    if (!message || heard.has(message.message_id)) return;
    heard.add(message.message_id);
    if (message.purpose === "background") {
      background = message; paintMats(); return;
    }
    if (message.purpose === "change") {
      if (!message.object) return;
      forgetRelated(message.object);
      if (view && belongsToWork(message.object)) void reload().then(poll).catch(() => {});
      return;
    }
    if (message.purpose === "suggest") { showOffer(message, false); return; }
    if (message.purpose === "delegate") {
      const asked = Boolean(navigator.userActivation && navigator.userActivation.isActive);
      if (asked) void delegate(message); else showOffer(message, true);
      return;
    }
    if (message.purpose === "reply") {
      if (!message.work_id || !message.object) return;
      void api("/works/" + encodeURIComponent(message.work_id) + "/results", "POST", { object: message.object, source: message.source })
        .then((res) => { if (curId === message.work_id) { view = res; render(); } })
        .catch((error) => showError(error));
    }
  });
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
    take: async (message) => { if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id); bring(message); setPanel(true); input.focus(); },
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
