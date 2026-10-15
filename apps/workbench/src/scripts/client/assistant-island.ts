import { ASSISTANT_STAGE_FACTORY, ASSISTANT_ELEMENT_SCRIPT } from "./assistant-stage.js";
import { codeLanguage, codeTokens } from "@molis-ai/molis-work-plugin-coding";
import { ASSISTANT_SEND_CLIENT_SCRIPT } from "./assistant-send.js";
import { ASSISTANT_FOLLOW_FACTORY_SCRIPT } from "./assistant-follow.js";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "./assistant-step-row.js";
import type { AssistantPendingReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderAssistantTextHtml, renderAssistantReviewHtml } from "../../assistant-text-html.js";

// The existing Coding tokenizer is consumed here on the Host, never serialized into the Assistant's browser script.
export const assistantTextHtml = (text: string, objects: AssistantWorkView["objects"], say: (text: string) => string): string =>
  renderAssistantTextHtml(text, { objects, say, language: codeLanguage, tokens: codeTokens });
export const assistantReviewHtml = (review: AssistantPendingReview, say: (text: string) => string): string =>
  renderAssistantReviewHtml(review, { objects: [], say, language: codeLanguage, tokens: codeTokens });

/**
 * The resident Assistant in the bottom bar: one assistant, many works.
 *
 * Every fact shown here comes from the Host (`/api/assistant`): a work's state is its real run's state, a question is
 * the run's own pending question, a confirmation is the Host's review of the exact effect. The page only decides where
 * the next Send goes, and never sends anything the person did not send.
 *
 * Notes kept out of the served script (a comment in it is bytes the browser downloads and never runs). `namedObject`: A name in 「…」 that this work knows (one of its objects) opens where it lives: the answer points at the thing itself. `list items`: A model sometimes drops the space after a list's dash on one line (“-30 分钟” among “- 60 分钟”): beside a real item, it is one too. `ownStop`: A round the runtime stopped on its own (a guard, a breaker) says why in its own words; one the person stopped says so. `notices`: What needs the person first; news about a work (done, a result, new material) folds below — it also shows on the work. `reminder open`: A reminder opens its item where it lives: here when it is this page's project, otherwise on its own project's page. `pane switcher`: Split into panes, the switcher names each one: the page being worked on is the focused pane, not all of them run together. `delegated Send`: A delegated Send reuses its message id, so the same message twice starts one work. Its words are the page's: pageText marks them. `retried Send`: A Send whose outcome is unknown (the connection dropped) is retried with the same id, so the Host starts nothing twice. `project`: The project the next new work belongs to. The project list changes it as the person looks from one project to another. `searchKey`: Search opens with ⌘K (Ctrl K elsewhere); a touch screen has no key to name.
 */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = String.raw`(host) => {
  const L = host.translate;
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
  const blocks = { attention: island.querySelector('[data-assistant-block="attention"]'), path: island.querySelector('[data-assistant-block="path"]'), materials: island.querySelector('[data-assistant-block="materials"]'),
    results: island.querySelector('[data-assistant-block="results"]') };
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
  // The first round's mode for a new Coding work; after that the session keeps it.
  let nextMode = "execute";
  const execBtn = island.querySelector("[data-assistant-executor]");
  const executorLabel = island.querySelector("[data-assistant-executor-label]");
  const execsPop = island.querySelector("[data-assistant-executors]");
  const EXECUTORS = [{ id: "assistant", label: "助理", hint: "个人工作助理，使用你已授权的能力" }, { id: "coding", label: "Coding Agent", hint: "在项目的工作目录里写代码、运行命令，改动逐项请你确认" }];
  const modeButton = island.querySelector("[data-assistant-mode]");
  const modeLabel = island.querySelector("[data-assistant-mode-label]");
  const modesPop = island.querySelector("[data-assistant-modes]");
  const MODES = [{ id: "discuss", label: "讨论", hint: "只读，回答与建议，不改文件" }, { id: "plan", label: "规划", hint: "先出计划，确认后再执行" },
    { id: "edit", label: "修改", hint: "改文件，不运行命令" }, { id: "execute", label: "执行", hint: "改文件并运行命令，逐项请你确认" }, { id: "review", label: "评审", hint: "检查现有改动并给出意见" }];
  const setModes = (open) => {
    if (!modesPop) return;
    modesPop.hidden = !open;
    modeButton?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = getWork();
    const chosen = work ? work.executor && work.executor.mode : nextMode;
    modesPop.replaceChildren(el("p", "assistant-popover-title", L(work ? "下一轮的方式（与 Coding 页面同一设置）" : "第一轮的方式")));
    MODES.forEach((mode) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (chosen === mode.id) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(mode.label)), el("span", "assistant-material-origin", " " + L(mode.hint)));
      item.addEventListener("click", async () => { setModes(false); await applyMode(mode.id); input.focus(); });
      modesPop.append(item);
    });
    (modesPop.querySelector("[aria-current]") || modesPop.querySelector("button"))?.focus();
  };
  /** A new Coding work's first round, or an open work's next one: the session's own setting, the same one its page shows. */
  async function applyMode(id) {
    const work = getWork();
    if (!work) { nextMode = id; paintAim(); paintSum(); return; }
    try {
      view = await api("/works/" + encodeURIComponent(work.work_id) + "/mode", "POST", { mode: id }); render();
      window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: "coding.sessions.update", session_id: view.work.executor.session_id } }));
    }
    catch (error) { showError(error); }
  }
  // The choice is made against what is saved now, not what this panel last read.
  modeButton?.addEventListener("click", async () => { if (!modesPop.hidden) { setModes(false); return; } if (curId) await reload().catch(() => {}); setModes(true); });
  // Which Character carries the next round: the work's own choice, or one made here that the next Send brings along.
  // Only the Assistant's own project work has Characters (they are published per project); a Coding work picks its own.
  const charBtn = island.querySelector("[data-assistant-character]");
  const characterLabel = island.querySelector("[data-assistant-character-label]");
  const charsPop = island.querySelector("[data-assistant-characters]");
  let nextChar = null, pendingChar;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork();
    return work ? work.executor.kind !== "coding" && work.scope.kind === "project" : nextExec === "assistant" && nextScope === "project" && Boolean(project); };
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
  const codingHere = () => Boolean(project && document.querySelector('.plugin-rail-items [data-plugin-id="coding"]'));
  let draftTimer = 0, draftWrite = Promise.resolve();
  let activeSend = null;

  const api=(path,method,body,route=host.route("/api/assistant"+path))=>molisWorkRequest(route,{method:method||"GET",body,fallback:L("助理暂时无法完成")});
  const el = ${ASSISTANT_ELEMENT_SCRIPT};
  const stateLabel = (state) => L(STATE_LABELS[state] || state || ""); const ringState = state => ({ "waiting-input": "answer", "waiting-review": "approval", "needs-check": "verify", completed: "round-ended" })[state] || state;
  const scopeLabel = (scope, title) => !scope ? "" : scope.kind === "personal" ? L("个人")
    : title || (project && scope.project_id === project.id ? (project.title || L("本项目")) : L("另一个项目"));
  const getWork = () => works.find((work) => work.work_id === curId) || (view && view.work.work_id === curId ? view.work : null);
  const isLive = (state) => state === "running" || state === "waiting-input" || state === "waiting-review" || state === "paused";
  let presentation, stepRow;
  const setPanel = (open) => { if (!presentation?.show(open) && panel) panel.hidden = !open; };
  const syncSend = () => { send.disabled = busy || !!getWork()?.reply_target || !String(input.value || "").trim(); };

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
    input.placeholder = work?.reply_target ? L("请回到原评论继续回复") : work ? L("补充、回答或纠正…") : nextExec === "coding" ? L("让 Coding Agent 做点什么…")
      : hint ? hint : searchKey() ? L("让助理做点什么，或按 {key} 搜索").replace("{key}", searchKey()) : L("让助理做点什么…");
    // A Coding work shows the mode its next round runs in — the session's own setting, the same one its page shows.
    if (modeButton) {
      // A new work that continues an open Coding session runs in that session's own mode, shown once it is the work's.
      const coding = work ? work.executor && work.executor.kind === "coding" : nextExec === "coding" && codingHere() && !codingSession();
      modeButton.hidden = !coding;
      if (coding && modeLabel) {
        const label = L("方式") + "：" + L((MODES.find((one) => one.id === (work ? work.executor.mode : nextMode)) || { label: "执行" }).label);
        modeLabel.textContent = label;
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
      execBtn.hidden = Boolean(work) || !codingHere() || nextExec === "assistant";
      if (!codingHere() && nextExec !== "assistant") nextExec = "assistant";
      execBtn.toggleAttribute("data-chosen", nextExec !== "assistant");
      if (executorLabel) executorLabel.textContent = L((EXECUTORS.find((one) => one.id === nextExec) || EXECUTORS[0]).label)
        + (nextExec === "coding" && codingSession() ? " · " + L("当前会话") : "");
    }
  };
  const setExecs = (open) => {
    if (!execsPop) return;
    execsPop.hidden = !open;
    execBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    execsPop.replaceChildren(el("p", "assistant-popover-title", L("由谁来做")));
    EXECUTORS.filter((one) => one.id !== "coding" || codingHere()).forEach((one) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (one.id === nextExec) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(one.label)), el("span", "assistant-material-origin", " " + L(one.hint)));
      item.addEventListener("click", () => { nextExec = one.id; setExecs(false); paintAim(); paintSum(); input.focus(); });
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
  const showObject = (object) => {
    if (sidePreview({ subject: object.subject, title: object.title, open: object.open })) return;
    if (object.open && host.openItem) host.openItem(object.open.surface, object.open.id, object.title);
  };

  /* The Host draws text and code from raw words; only reading interactions live here. */
  const bindText = (root) => {
    root.querySelectorAll(".assistant-code").forEach((figure) => {
      const copy = figure.querySelector(".assistant-code-copy"), more = figure.querySelector(".assistant-code-more");
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(figure.querySelector("pre code").textContent); } catch { host.showToast?.(L("没能复制，请手动选中文字")); return; }
        copy.textContent = L("已复制"); copy.dataset.done = "";
        setTimeout(() => { copy.textContent = L("复制"); delete copy.dataset.done; }, 1400);
      });
      more?.addEventListener("click", () => {
        figure.toggleAttribute("data-folded");
        more.textContent = figure.hasAttribute("data-folded") ? L("展开全部 {n} 行").replace("{n}", figure.dataset.lines) : L("收起");
      });
    });
    root.querySelectorAll("[data-assistant-object]").forEach((button) => {
      const object = view.objects[Number(button.dataset.assistantObject)];
      if (!object || !host.openItem) { button.replaceWith(document.createTextNode("「" + button.textContent + "」")); return; }
      button.prepend(glyph(objectGlyph(object)));
      button.addEventListener("click", () => showObject(object));
    });
  };

  /* ─── Rendering, updated in place so reading and focus are never disturbed ─ */
  const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
  const keyed = (parent, attribute, key, create) => {
    let node = [...parent.children].find((child) => child.getAttribute(attribute) === key);
    if (!node) { node = create(); node.setAttribute(attribute, key); parent.append(node); }
    return node;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const VERBS = { lookup: "查找能力", read: "读取", change: "修改", suggest: "准备操作卡", ask: "向你提问", todo: "更新工作步骤", "lookup-tools": "查找工具",
    delegate: "委托子任务", "delegate-check": "查看子任务", "delegate-follow-up": "让子任务补改", "delegate-stop": "停止子任务",
    "memory-keep": "记下你的要求", "memory-list": "查看记住的事", "memory-forget": "删除一条记忆", "memory-suggest": "建议记住一条",
    "file-read": "读取文件", "file-list": "查看目录", "file-search": "搜索代码", "file-change": "修改文件", command: "运行命令", "command-output": "查看命令输出", "auto-continue": "自动续做", compact: "整理上下文",
    "browser-list": "找到侧栏浏览器", "browser-look": "查看网页", "browser-act": "操作网页", "computer-list": "查看可操作的应用", "computer-look": "查看应用窗口", "computer-act": "操作应用", "ended-on-promise": "收尾" };
  const REASONS = { "not-authorized": "未获授权，没有执行", declined: "你拒绝了，没有执行", interrupted: "这一轮停止了，没有执行", unavailable: "这项能力已关闭或不再可用，没有执行" };
  const VERB_GLYPH = { lookup: "search", "lookup-tools": "search", "file-search": "search", read: "note", "file-read": "file", "file-list": "list", change: "edit",
    "file-change": "code", command: "terminal", "command-output": "terminal", ask: "question", todo: "list", suggest: "zap", delegate: "workflow", "delegate-check": "workflow",
    "delegate-follow-up": "workflow", "delegate-stop": "workflow", "memory-keep": "sparkles", "memory-list": "sparkles", "memory-forget": "sparkles", "memory-suggest": "sparkles",
    "auto-continue": "refresh", compact: "refresh", "browser-list": "globe", "browser-look": "globe", "browser-act": "globe", "computer-list": "system", "computer-look": "system", "computer-act": "system", "ended-on-promise": "alert" };
  const verbGlyph = (item) => item.state === "started" ? spinner() : item.state === "failed" || item.state === "unknown" ? spinner(item.state === "failed" ? "failed" : "verify") : glyph(VERB_GLYPH[item.verb] || "circle");
  const activityLine = (item) => {
    const verb = L(VERBS[item.verb] || item.verb);
    const what = item.target ? (item.verb === "ask" ? "：" : " ") + item.target : "";
    if (item.state === "started") return L("正在") + verb + what;
    // An answered question keeps what the person said, so the conversation shows the choice, not just that one was made.
    if (item.state === "completed") return L("已") + verb + what + (item.verb === "ask" && item.answer ? " · " + L("你的回答") + "：" + item.answer : "");
    if (item.state === "failed") return verb + what + " — " + L(REASONS[item.reason] || "没有完成");
    return verb + what + " — " + L("结果未确认");
  };
  /** Every card in the conversation has one shape: what kind of moment it is (and what kind of act), what it is about,
      then what to do and a line on what happens when you do. */
  const cardHint = (text) => el("p", "assistant-card-hint", text);
  /* Questions, action cards and next steps come drawn by the Host (in the person's language); the page binds them with the
     shared client. A node is redrawn only when its key changes, so what the person is typing stays put. */
  const ixClient = host.interaction;
  const drawn = (node, html, handlers, key = html) => {
    if (node.ixKey === key) return node.ix;
    node.ix?.destroy(); node.innerHTML = html || ""; node.ixKey = key;
    node.ix = ixClient(node, handlers); node.ixBase = JSON.stringify(node.ix.read());
    return node.ix;
  };
  const renderQuestion = (card, work, round, question) => {
    const path = "/works/" + encodeURIComponent(work.work_id), held = () => ({ pending_id: question.pending_id, values: client.read() });
    let saving = 0;
    const client = drawn(card, question.html, {
      // A half-written answer is kept with the work, so a reload or another tab finds it.
      onChange: () => { clearTimeout(saving); saving = setTimeout(() => api(path + "/question-draft", "POST", held()).catch(() => undefined), 600); },
      onSubmit: async () => {
        clearTimeout(saving);
        const button = card.querySelector("[type=submit]");
        if (button) button.disabled = true;
        try { view = await api(path + "/answer", "POST", { ...held(), run_id: round.run_id, pending_revision: question.pending_revision }); render(); poll(); }
        catch (error) { if (error.body?.details?.errors) client.showErrors(error.body.details.errors, { focus: true }); else showError(error); if (button) button.disabled = false; }
      },
    }, question.pending_id + question.pending_revision + question.answerable);
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
  /* Puts children in order without moving any that already stand in place: moving a node drops the focus inside it
     (an answer being typed, a button reached by keyboard), and a running work repaints every few seconds. */
  const placer = (parent) => {
    let last = null;
    return (child) => {
      const want = last ? last.nextElementSibling : parent.firstElementChild;
      if (want !== child) parent.insertBefore(child, want);
      last = child;
      return child;
    };
  };
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
    const open = named && host.openItem ? () => showObject(named)
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
    if (round.executor === "coding") { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); setText(tag, L("由 Coding Agent 执行")); put(tag); }
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
    const placeLine = (item, into) => {
      const line = keyed(into ? into.box : node, "data-entry", "a:" + item.call_id, () => el("p", "assistant-activity"));
      line.dataset.state = item.state;
      const words = activityLine(item);
      if (line.dataset.text !== words || line.dataset.glyph !== item.state) { line.dataset.text = words; line.dataset.glyph = item.state; line.replaceChildren(verbGlyph(item), el("span", "", words)); }
      if (item.detail) line.title = item.detail; else line.removeAttribute("title");
      (into ? into.put : put)(line);
    };
    // The steps between two messages read as one quiet line — what it is doing now, or how many steps it took and any
    // that did not finish — and open to each step. A single step stays a line of its own.
    let run = [];
    const flush = () => {
      if (run.length === 1) placeLine(run[0]);
      else if (run.length > 1) {
        const first = "a:" + run[0].call_id;
        [...node.children].forEach((child) => { if (child.getAttribute("data-entry") === first) child.remove(); });
        const box = keyed(node, "data-entry", "g:" + run[0].call_id, () => { const box = el("details", "assistant-steps"); box.append(el("summary", "assistant-steps-summary")); return box; });
        const live = [...run].reverse().find((item) => item.state === "started");
        const unfinished = run.filter((item) => item.state === "failed" || item.state === "unknown").length;
        box.dataset.state = live ? "started" : unfinished ? "failed" : "completed";
        setText(box.firstElementChild, live ? activityLine(live) : L("过程") + " · " + run.length + " " + L("步") + (unfinished ? " · " + unfinished + " " + L("步没有完成") : ""));
        const inBox = { box, put: placer(box) };
        inBox.put(box.firstElementChild);
        run.forEach((item) => placeLine(item, inBox));
        put(box);
      }
      run = [];
    };
    entries.forEach((entry) => {
      if (entry.turn) {
        flush();
        const turn = entry.turn;
        // Words the Host wrote (a timed round, a work going on when its sub-tasks came back) are not shown as the person's.
        const kind = turn.kind === "user" ? (round.written_by === "host" ? "host" : "user") : turn.kind === "assistant" ? "assistant" : "note";
        const bubble = keyed(node, "data-entry", entry.key, () => el("div", "assistant-msg assistant-msg--" + kind));
        if (bubble.dataset.text !== turn.text) {
          bubble.dataset.text = turn.text;
          if (kind === "assistant") { bubble.innerHTML = turn.html; bindText(bubble); } else bubble.textContent = turn.text;
        }
        put(bubble);
        if (kind === "assistant") {
          const copy = keyed(node, "data-entry", "copy:" + turn.turn_id, () => {
            const btnEl = el("button", "assistant-copy", L("复制")); btnEl.type = "button";
            btnEl.addEventListener("click", async () => {
              try { await navigator.clipboard.writeText(bubble.dataset.text || ""); } catch { host.showToast?.(L("没能复制，请手动选中文字")); return; }
              btnEl.textContent = L("已复制"); btnEl.dataset.done = "";
              setTimeout(() => { btnEl.textContent = L("复制"); delete btnEl.dataset.done; }, 1400);
            });
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
    flush();
    if (carried) put(carried);
    const memories = round.memories_used;
    if (memories && ((memories.used || []).length || (memories.omitted || []).length)) {
      const used = memories.used || [], omitted = memories.omitted || [];
      const box = keyed(node, "data-entry", "memories", () => { const box = el("details", "assistant-steps assistant-memories"); box.append(el("summary", "assistant-steps-summary")); return box; });
      const signature = JSON.stringify([used.map((m) => m.memory_id), omitted.map((m) => m.memory_id)]);
      if (box.dataset.signature !== signature) {
        box.dataset.signature = signature;
        box.firstElementChild.textContent = L("用到 {n} 条记忆").replace("{n}", String(used.length)) + (omitted.length ? " · " + L("没带上 {n} 条").replace("{n}", String(omitted.length)) : "");
        [...box.children].slice(1).forEach((child) => child.remove());
        const line = (memory) => { const row = el("p", "assistant-activity assistant-memory"); row.append(el("span", "assistant-memory-scope", L(memory.scope === "personal" ? "个人" : memory.scope === "character" ? "角色" : "本项目")), document.createTextNode(memory.text)); if (memory.origin) row.title = memory.origin; return row; };
        used.forEach((memory) => box.append(line(memory)));
        // Left out for length (the budget) or for count (the limit): the memory service says which.
        if (omitted.length) { box.append(el("p", "assistant-memory-omitted", L(omitted.every((memory) => memory.reason === "budget") ? "因为篇幅没带上" : "因为篇幅或条数上限没带上"))); omitted.forEach((memory) => box.append(line(memory))); }
      }
      put(box);
    }
    const status = keyed(node, "data-entry", "status", () => el("p", "assistant-round-status"));
    const phase = round.phase;
    status.dataset.phase = phase; status.dataset.mwState = ({starting:'starting',running:'running',compacting:'running',failed:'failed',stopped:'stopped',cancelled:'cancelled',paused:'paused','reconcile-required':'verify',unknown:'verify'})[phase] || 'idle';
    const ownStop = round.stop_reason && round.stop_reason !== "已停止" ? round.stop_reason : "";
    setText(status, phase === "running" || phase === "starting" || phase === "compacting" ? L("正在处理…")
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
  const openObject = (object) => object.open && host.openItem ? async () => showObject(object) : null;
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
  /** A block: a heading with its glyph and a badge (folding it is remembered per viewer), then its content; with no content it is not shown. */
  const BLOCKS_KEY = "molis.assistant.blocks";
  const folded = (() => { try { const saved = JSON.parse(store.get(BLOCKS_KEY) || "{}"); return saved && typeof saved === "object" ? saved : {}; } catch { return {}; } })();
  const paintBlock = (node, title, icon, content, badge, attention, fixed) => {
    node.hidden = !content;
    if (!content) { node.replaceChildren(); return; }
    const key = node.dataset.assistantBlock;
    const head = el(fixed ? "p" : "button", "assistant-block-head" + (fixed ? " is-fixed" : ""));
    if (!fixed) { head.type = "button"; head.setAttribute("aria-expanded", String(!folded[key])); head.append(el("span", "assistant-block-chevron")); }
    head.append(glyph(icon), el("span", "assistant-block-title", title));
    if (badge) head.append(el("span", "assistant-block-badge" + (attention ? " is-attention" : ""), badge));
    if (!fixed) head.addEventListener("click", () => {
      folded[key] = !folded[key]; if (!folded[key]) delete folded[key];
      // Opening lets the content arrive once; folding is immediate.
      if (!folded[key]) { node.setAttribute("data-opening", ""); setTimeout(() => node.removeAttribute("data-opening"), 300); }
      store.set(BLOCKS_KEY, Object.keys(folded).length ? JSON.stringify(folded) : null);
      node.toggleAttribute("data-folded", Boolean(folded[key])); head.setAttribute("aria-expanded", String(!folded[key]));
    });
    node.toggleAttribute("data-folded", !fixed && Boolean(folded[key]));
    const body = el("div", "assistant-block-body"); body.append(content);
    node.replaceChildren(head, body);
  };
  const group = (label, ...children) => { const box = el("div", "assistant-group"); if (label) box.append(el("p", "assistant-block-sub", label)); box.append(...children); return box; };
  const stack = (cards) => { const box = el("div", "assistant-stack"); cards.forEach((one) => box.append(one)); return box; };
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
        cards.push(card({ icon: "sparkles", tone: "suggest", ask: true, title: L("要记住吗") + "：" + candidate.text,
          sub: candidate.why + " · " + L(candidate.scope === "personal" ? "个人" : candidate.scope === "character" ? "角色" : "本项目"),
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
      objects.filter((o) => o.relation === "session").forEach((o) => step("code", "", L("专业会话"), objectCard(o, "", L("在 Coding 打开"))));
      if (work && work.executor.kind === "coding" && work.executor.session_id && !objects.some((o) => o.relation === "session")) {
        step("code", "", L("专业会话"), card({ icon: "code", title: work.executor.title || "Coding", sub: "Coding",
          open: host.openItem ? async () => host.openItem("coding", work.executor.session_id, work.title) : null, openLabel: L("在 Coding 打开") }));
      }
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

  /* 材料: a place to drop what the next Send carries, then what this work has used, as tiles. */
  const MATERIAL_KIND = { image: "图片", file: "文件", method: "方法", capability: "能力", text: "文字", selection: "选中的内容", object: "引用" };
  const MATERIAL_GLYPH = { image: "image", file: "file", method: "zap", capability: "zap", text: "note", selection: "text", object: "file" };
  function renderMaterialsBlock() {
    const node = blocks.materials;
    if (!node) return;
    const work = view && view.work.work_id === curId ? view.work : null;
    const items = materialsNow();
    const objects = work && view.objects ? view.objects.filter((o) => o.relation === "material") : [];
    const used = [];
    (work ? view.rounds : []).forEach((round, index) => (round.materials || []).forEach((material) => {
      if (material.object) return;
      const key = material.kind + ":" + material.title;
      if (!used.some((one) => one.key === key)) used.push({ key, material, round: index + 1 });
    }));
    const signature = JSON.stringify([work && work.work_id, sidePanelHere(), items.map((item) => [item.key, item.label, item.optional, item.auto, item.note, Boolean(item.thumb)]),
      objects.map((o) => [o.subject.id, o.state, o.title, o.current_revision]), used.map((one) => one.key)]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      // The next Send's materials sit in a place things can be dropped on; each one is named and can be left out.
      const zone = el("div", "assistant-drop");
      zone.append(el("p", "assistant-drop-label", L("下次发送带上")));
      if (items.length) {
        const chips = el("div", "assistant-chips");
        items.forEach((item) => {
          const chip = el("span", "assistant-chip" + (item.optional ? " is-optional" : ""));
          const looked = item.thumb && sidePanelHere();
          const label = el(looked ? "button" : "span", "assistant-chip-label", item.label);
          if (looked) {
            label.type = "button"; label.setAttribute("aria-label", L("预览") + "：" + item.label);
            label.addEventListener("click", () => { sidePreview({ preview: { title: item.label, media_type: (/^data:([^;,]+)/.exec(item.thumb) || [])[1] || "image/png", url: item.thumb } }); });
          }
          chip.append(glyph(item.thumb ? "image" : item.key === "selection" ? "text" : item.key === "draft" ? "edit" : item.work ? "workflow" : "file"), label);
          if (item.work) chip.append(sideAct(L("切换过去"), item.label, async () => { await switchTo(item.work.work_id); input.focus(); }));
          // Browsing is not working on it: the person decides whether this round takes it.
          else if (item.optional) chip.append(sideAct(L("加入本轮"), item.label, async () => { const page = pageObject(); if (page) joined.add(objectKey(page.object)); paintMats(); }));
          else chip.append(sideAct("×", L("不带上") + " " + item.label, async () => { dropMaterial(item); paintMats(); }));
          chip.title = item.note || (item.optional ? L("与这项工作无关，不会带上") : item.auto ? L("来自当前页面") : L("你添加的"));
          chips.append(chip);
        });
        zone.append(chips);
      }
      const hint = el("div", "assistant-drop-hint");
      const pick = sideAct(L("添加文件"), L("下次发送带上"), async () => { fileInput?.click(); }, false, "secondary");
      hint.append(glyph("upload"), el("span", "", L("拖到这里，或 @ 引用、/ 用能力")), pick);
      zone.append(hint);
      zone.addEventListener("dragover", (event) => { if (![...(event.dataTransfer?.types || [])].includes("Files")) return; event.preventDefault(); zone.dataset.dropping = "true"; });
      zone.addEventListener("dragleave", (event) => { if (!zone.contains(event.relatedTarget)) delete zone.dataset.dropping; });
      zone.addEventListener("drop", (event) => { delete zone.dataset.dropping; const dropped = [...(event.dataTransfer?.files || [])]; if (!dropped.length) return; event.preventDefault(); void addFiles(dropped); });
      const tiles = el("div", "assistant-tiles");
      objects.forEach((object) => {
        const state = objectState(object), open = openObject(object);
        const box = el("div", "assistant-tile" + (open ? " is-openable" : "") + (state ? " is-attention" : ""));
        box.append(tile(objectGlyph(object), state ? "attention" : ""));
        if (open) { const name = el("button", "assistant-item-title", object.title); name.type = "button"; name.setAttribute("aria-label", L("打开") + "：" + object.title); name.addEventListener("click", () => { void open(); }); box.append(name); }
        else box.append(el("span", "assistant-item-title", objectTitle(object)));
        box.append(el("span", "assistant-item-sub" + (state ? " is-attention" : ""), state || surfaceName(object.open && object.open.surface) || L("材料")));
        box.title = objectDetail(object);
        tiles.append(box);
      });
      used.forEach((one) => {
        const box = el("div", "assistant-tile"), name = one.material.title.replace(/^(方法|用|图片|引用)：/, "");
        const readable = one.material.kind === "file" && one.material.text && sidePanelHere()
          ? () => { sidePreview({ preview: { title: name, media_type: "text/plain", text: one.material.text } }); } : readBack(one.material, name) || readImage(one.material, name);
        const title = el(readable ? "button" : "span", "assistant-item-title", name);
        if (readable) {
          title.type = "button"; title.setAttribute("aria-label", L("预览") + "：" + name); box.classList.add("is-openable");
          title.addEventListener("click", readable);
        }
        box.append(tile(MATERIAL_GLYPH[one.material.kind] || "file", ""), title,
          el("span", "assistant-item-sub", L(MATERIAL_KIND[one.material.kind] || "材料") + " · " + L("第 {n} 轮").replace("{n}", String(one.round))
            + (one.material.expired ? " · " + L("已失效") : "")));
        if (one.material.expired) box.title = L(EXPIRED_IMAGE);
        tiles.append(box);
      });
      const content = el("div", "assistant-group-list");
      content.append(zone);
      if (tiles.children.length) content.append(group(L("用过的"), tiles));
      const changed = objects.filter((o) => o.state !== "current").length;
      paintBlock(node, L("材料"), "paperclip", content, changed ? changed + " " + L("项有变化") : tiles.children.length ? String(tiles.children.length) : "", changed > 0);
    });
  }

  /* 产出 (not the 成果库's 成果): what it produced or changed, each a card that opens it or takes it back; work still running elsewhere after it. */
  const renderResults = (work) => {
    const node = blocks.results;
    if (!node) return;
    const results = work && view.objects ? view.objects.filter((o) => o.relation === "result") : [];
    const undoable = work && view.undoable ? view.undoable : [];
    const jobs = work && view.jobs ? view.jobs : [];
    const unsettled = work && view.unsettled ? view.unsettled : [];
    const kept = work && view.memory_changes ? view.memory_changes : [];
    const signature = JSON.stringify([work && work.work_id, results.map((o) => [o.subject.id, o.state, o.title, o.current_revision]), undoable.map((u) => [u.undo_id, u.state, u.detail]),
      jobs.map((j) => [j.job_id, j.state, j.last_state]), unsettled.map((u) => [u.change_id, u.state, u.detail]), kept.map((m) => [m.change_id, m.state, m.undoable, m.text])]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const UNDO = { available: "可以撤销", undone: "已撤销", failed: "没能撤销" };
      const made = results.map((o) => objectCard(o, "done"));
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
        tone: job.state === "completed" ? "done" : job.state === "failed" ? "blocked" : "", title: job.title, sub: L(JOB[job.state] || job.state) + (job.last_state ? " · " + job.last_state : "") }));
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
        const scope = L(change.scope === "personal" ? "个人" : change.scope === "character" ? "角色" : "本项目");
        if (undone && (!UNDONE[change.kind] || !change.text)) return card({ icon: "sparkles", title: L("已撤销（已从记忆里删掉）"), done: true, sub: scope, actions });
        return card({ icon: "sparkles", tone: undone ? "" : "suggest", title: change.text, done: undone,
          sub: [scope, undone ? L(UNDONE[change.kind]) : KEPT[change.kind] ? L(KEPT[change.kind]) : ""].filter(Boolean).join(" · "), actions });
      });
      const content = el("div", "assistant-group-list");
      if (made.length) content.append(group("", stack(made)));
      if (changes.length) content.append(group(L("改动"), stack(changes)));
      if (background.length) content.append(group(L("后台任务"), stack(background)));
      if (stopped.length) content.append(group(L("停止时仍在执行"), stack(stopped)));
      if (remembered.length) content.append(group(L("记住的事"), stack(remembered)));
      const canUndo = undoable.filter((change) => change.state === "available").length;
      paintBlock(node, L("产出"), "package", content.children.length ? content : null, canUndo ? canUndo + " " + L("项可撤销") : String(made.length + changes.length + background.length + stopped.length + remembered.length), false);
    });
  };

  /* What this work used (its sub-tasks with it) and the cap the person gave it; a sub-task shows its delegating work's. */
  const renderUsage = (work) => {
    if (!usageBox) return;
    const usage = work && view && view.usage ? view.usage : null;
    const signature = JSON.stringify([work && work.work_id, usage]);
    if (usageBox.dataset.signature === signature) return;
    const wasOpen = usageBox.querySelector("details")?.open;
    usageBox.dataset.signature = signature;
    const over = Boolean(usage && usage.budget_tokens !== null && usage.tokens >= usage.budget_tokens);
    usageBox.hidden = !usage;
    if (!usage) { usageBox.replaceChildren(); return; }
    const number = (value) => Number(value).toLocaleString("en-US");
    const details = el("details", "assistant-usage");
    details.open = wasOpen === undefined ? over : wasOpen || over;
    details.append(el("summary", "", L("用量") + " · " + number(usage.tokens) + " tokens" + (usage.budget_tokens !== null ? " / " + number(usage.budget_tokens) : "") + (over ? " · " + L("已到上限") : "")));
    if (usage.budget_of) {
      details.append(el("p", "assistant-material-origin", L("子任务按委托它的工作计算") + "：「" + usage.budget_of.title + "」"));
    } else {
      const form = el("form", "assistant-usage-form");
      const field = el("input", "assistant-usage-input"); field.type = "number"; field.min = "1000"; field.step = "1000"; field.inputMode = "numeric";
      field.placeholder = L("不单独设限"); field.value = usage.budget_tokens !== null ? String(usage.budget_tokens) : "";
      field.setAttribute("aria-label", L("这项工作的用量上限（tokens，含子任务）"));
      const save = el("button", "assistant-side-action", L("保存上限")); save.type = "submit";
      form.append(el("span", "assistant-material-origin", L("上限（tokens，含子任务）")), field, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true;
        try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/budget", "POST", { budget_tokens: field.value.trim() === "" ? null : Number(field.value) }); render(); }
        catch (error) { host.showToast?.(error); }
        finally { save.disabled = false; }
      });
      details.append(form);
    }
    usageBox.replaceChildren(details);
  };
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
  /** A small row of choices, the current one pressed; used for who carries a new work, the Coding mode and where it lives. */
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
    thread.scrollTo({ top: node.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 16, behavior: still ? "auto" : "smooth" });
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
    controls("stop").forEach((btnEl) => { btnEl.hidden = !isLive(state) && !liveChildren; });
    paintStrip();
    if (!metaEl) return;
    const characters = allowsCharacter() ? characterChoices() : null;
    // A chooser only when there is something to choose: a project's published Characters.
    const hasChoices = Boolean(characters && characters.length);
    const chosen = chosenCharacter();
    const signature = JSON.stringify([work && work.work_id, work && work.executor, work && work.scope, work && work.character, work && isLive(work.state), pendingChar,
      nextExec, nextScope, nextMode, nextChar, codingHere(), codingSession(), characters && characters.map((c) => [c.reference, c.available])]);
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
        if (work.executor.kind === "coding") {
          rows.push(...metaRow(L("谁来做"), document.createTextNode("Coding Agent")));
          rows.push(...metaRow(L("方式"), segmented(L("下一轮的方式（与 Coding 页面同一设置）"), MODES.map((mode) => ({ id: mode.id, label: L(mode.label), hint: L(mode.hint) })), work.executor.mode || "execute", (id) => void applyMode(id))));
        } else if (allowsCharacter() && hasChoices) {
          rows.push(...metaRow(L("谁来做"), characterPicker()));
        } else rows.push(...metaRow(L("谁来做"), document.createTextNode(chosen ? L("角色") + "：" + chosen.title : L("助理"))));
        // The same work can change hands between rounds: to Coding in its project, and back to the Assistant.
        const toCoding = work.executor.kind === "assistant" && work.scope.kind === "project" && codingHere();
        const toAssistant = work.executor.kind === "coding";
        if (!isLive(work.state) && (toCoding || toAssistant)) {
          const hand = el("button", "assistant-side-action", toCoding ? L("交给 Coding 继续") : L("回到助理")); hand.type = "button";
          hand.addEventListener("click", async () => {
            hand.disabled = true;
            try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/handover", "POST", { to: toCoding ? "coding" : "assistant" }); render(); input.focus(); }
            catch (error) { showError(error); }
            finally { if (hand.isConnected) hand.disabled = false; }
          });
          rows.push(...metaRow("", hand));
        }
      } else {
        // A new work: who carries it and where it lives are chosen here, before its first message.
        const who = [{ id: "assistant", label: L("助理"), hint: L("个人工作助理，使用你已授权的能力") }];
        if (codingHere()) who.push({ id: "coding", label: "Coding Agent", hint: L("在项目的工作目录里写代码、运行命令，改动逐项请你确认") });
        rows.push(...metaRow(L("谁来做"), segmented(L("由谁来做"), who, nextExec, (id) => { nextExec = id; if (id !== "assistant") nextChar = null; paintAim(); paintSum(); })));
        if (nextExec === "assistant" && allowsCharacter() && hasChoices) rows.push(...metaRow(L("角色"), characterPicker()));
        if (nextExec === "coding") {
          if (codingSession()) rows.push(...metaRow(L("方式"), document.createTextNode(L("接着当前打开的 Coding 会话"))));
          else rows.push(...metaRow(L("方式"), segmented(L("第一轮的方式"), MODES.map((mode) => ({ id: mode.id, label: L(mode.label), hint: L(mode.hint) })), nextMode, (id) => void applyMode(id))));
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
      jump.onclick = () => { unseen = false; thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" }); }; jump.hidden = false; return;
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
    const stick = nearBottom();
    const before = thread.scrollHeight;
    const work = view && view.work.work_id === curId ? view.work : null;
    if (work) {
      const index = works.findIndex((row) => row.work_id === work.work_id);
      if (index >= 0) works[index] = Object.assign({}, works[index], work, { draft: works[index].draft });
      else works.unshift(work);
    }
    renderAttention(work); renderPath(work); renderMaterialsBlock(); renderResults(work); renderUsage(work);
    if (empty) empty.hidden = Boolean(curId);
    paintEmpty();
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
            const list = el("ul", "assistant-recovery");
            report.rounds.forEach((round) => {
              round.operations.forEach((op) => list.append(el("li", "", op.summary + " — " + L(OUTCOMES[op.outcome] || op.outcome))));
              if (!round.operations.length) list.append(el("li", "", L("这一轮没有记录到任何操作")));
              round.blockers.forEach((why) => list.append(el("li", "assistant-muted", why)));
              if (round.can_close) {
                const close = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("已核对，结束这一轮")); close.type = "button";
                close.addEventListener("click", async () => {
                  close.disabled = true;
                  try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/recovery", "POST", { run_id: round.run_id, version: round.version }); render(); }
                  catch (error) { showError(error); }
                });
                list.append(close);
              }
            });
            check.replaceWith(list);
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
        // Coding's own choices (its model, its folder) are made on its page: the step is a button that goes there.
        else if (/Coding/.test(shown.action) && codingHere()) {
          const go = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("打开 Coding")); go.type = "button";
          go.addEventListener("click", () => { document.querySelector('.plugin-rail-items [data-plugin-id="coding"]')?.click(); setPanel(false); });
          box.append(el("p", "assistant-muted", L(shown.action)), go);
        }
        else box.append(el("p", "assistant-muted", L(shown.action)));
      }
      thread.append(box);
    }
    paintSum(); paintAim(); paintList(); drawTabs(); paintSideDot(work);
    if (stick) thread.scrollTop = thread.scrollHeight; else if (thread.scrollHeight > before + 4) unseen = true;
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
  // A work is followed while it or a sub-task it handed out is live: what they hand back may move it on by itself.
  const followed = (seen) => isLive(seen.work.state) || (seen.delegated || []).some((child) => !child.taken_back && isLive(child.state));
  const follower = (${ASSISTANT_FOLLOW_FACTORY_SCRIPT})({ route: host.route, headers: host.headers, followed, current: () => curId, show: (next) => { view = next; render(); } });
  const poll = () => { if (curId && view && view.work.work_id === curId && followed(view)) follower.follow(curId); else follower.stop(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { reload().then(poll); loadWorks(); } });
  // Another window may have changed this work (a Coding mode, a new round): coming back to this one reads it again.
  window.addEventListener("focus", () => { if (!document.hidden && curId) reload().then(poll); });
  const listTimer = setInterval(() => { if (!document.hidden && panel && !panel.hidden) loadWorks(); }, 15000);

  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
  const noticeBtn = island.querySelector("[data-assistant-attention]");
  const attentionCount = island.querySelector("[data-assistant-attention-count]");
  const noticePop = island.querySelector("[data-assistant-notices]");
  let notices = [];
  // Plugin notifications waiting for a decision in the market (plugin-notifications.ts reads them for this project).
  let pluginWaiting = Number(document.body.dataset.pluginEventsPending) || 0;
  const URGENT = new Set(["needs-decision", "failed", "reminder"]);
  let lastUrgent = 0;
  const shownSurface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  const paintNotices = (force) => {
    if (!noticePop) return;
    // Polling repaints only what changed, and keeps focus on the same button: a list rebuilt under the person's
    // finger or keyboard focus loses the tap or drops focus to the page.
    const signature = JSON.stringify([pluginWaiting, notices.map((notice) => [notice.notice_id, notice.text, notice.held && notice.held.reason])]);
    if (!force && noticePop.dataset.signature === signature) return;
    noticePop.dataset.signature = signature;
    const focused = noticePop.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? [focused.dataset.noticeId, focused.dataset.noticeAction] : null;
    noticePop.replaceChildren(el("p", "assistant-popover-title", L("等你处理")));
    const open = notices.filter((notice) => !notice.held && URGENT.has(notice.kind)), news = notices.filter((notice) => !notice.held && !URGENT.has(notice.kind)), held = notices.filter((notice) => notice.held);
    const row = (notice) => {
      const item = el("div", "assistant-notice");
      item.append(el("p", "assistant-notice-text", notice.text));
      if (notice.held) item.append(el("p", "assistant-material-origin", L("按你的规则暂不提醒") + "：" + notice.held.reason));
      const actions = el("div", "assistant-notice-actions");
      const go = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("打开")); go.type = "button";
      go.dataset.noticeId = notice.notice_id; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", L("打开") + "：" + notice.text);
      go.addEventListener("click", async () => {
        setNotices(false);
        if (notice.open) {
          void settleNotice({ notice_id: notice.notice_id }, "seen");
          const where = notice.open.project_id || "personal", here = project ? project.id : "personal";
          if (where === here && host.openItem) { host.openItem(notice.open.surface, notice.open.id, notice.open.title); return; }
          const url = new URL("/projects/" + encodeURIComponent(where) + "/", location.origin);
          url.searchParams.set("openPlugin", notice.open.surface); url.searchParams.set("openItem", notice.open.id); url.searchParams.set("openTitle", notice.open.title);
          const desktop = new URLSearchParams(location.search).get("desktop"); if (desktop) url.searchParams.set("desktop", desktop);
          location.assign(url.pathname + url.search);
          return;
        }
        await switchTo(notice.work_id); setPanel(true); void settleNotice({ work_id: notice.work_id }, "seen");
      });
      if (notice.kind === "reminder" && !notice.open) go.hidden = true;
      const done = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("知道了")); done.type = "button";
      done.dataset.noticeId = notice.notice_id; done.dataset.noticeAction = "dismiss";
      done.setAttribute("aria-label", L("知道了") + "：" + notice.text);
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
  const loadNotices = async () => {
    try { notices = (await api("/notices?surface=" + encodeURIComponent(shownSurface()))).notices || []; }
    catch { return; }
    // A work the person has open in front of them is being seen: its notices need no badge.
    if (panel && !panel.hidden && curId && notices.some((notice) => notice.work_id === curId && !notice.held)) { void settleNotice({ work_id: curId }, "seen"); return; }
    paintAttention();
  };
  const settleNotice = async (target, state) => {
    try { await api("/notices", "POST", Object.assign({ state }, target)); } catch { /* the next read shows it again */ }
    await loadNotices();
  };
  noticeBtn?.addEventListener("click", () => setNotices(noticePop.hidden));
  document.addEventListener("molis-work:model-ready", () => { if (problem && /模型/.test(problem.action || "")) { problem = null; render(); } });
  document.addEventListener("molis-work:plugin-events-waiting", (event) => { pluginWaiting = Number(event.detail?.pending) || 0; paintAttention(); });
  setInterval(() => { if (!document.hidden) void loadNotices(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void loadNotices(); });
  // The rules depend on where the person is: moving to another plugin reads them again.
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(() => void loadNotices(), 300));
  void loadNotices();

  /* ─── Sending ──────────────────────────────────────────────────────────── */
  /* ─── What the person is looking at, and what goes with this Send ──────── */
  const matsBtn = island.querySelector("[data-assistant-materials]");
  const materialsCount = island.querySelector("[data-assistant-materials-count]");
  const materialsLabel = island.querySelector("[data-assistant-materials-label]");
  const matsList = island.querySelector("[data-assistant-materials-list]");
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
  const TAB_KINDS = { pages: "pages_document", coding: "coding_session", inbox: "inbox_entry", feed: "feed_item", goals: "goal", sessions: "session", artifacts: "artifact" };
  // What plugins declare for their searchable objects (kind and the surface it opens in) extends and corrects the list.
  const declaredKinds = {};
  api("/surface-kinds").then((res) => Object.assign(declaredKinds, res.kinds || {})).catch(() => undefined);
  // The last background a plugin page sent (purpose "background"), used while that plugin is the one on show.
  let background = null;
  const pageCtx = () => {
    const surf = visible(lastSurface) ? lastSurface : [...document.querySelectorAll("[data-assistant-context]")].find(visible);
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
  /* What the person looks at is not what they work on. A page object joins the current work only when it already
     belongs to it (opened from it, produced by it) or when the person adds it; a new work starts from it. */
  const joined = new Set();
  const objectKey = (object) => object.kind + ":" + object.id;
  const belongsToWork = (object) => Boolean(view && view.work.work_id === curId && (view.objects || []).some((item) => item.subject.kind === object.kind && item.subject.id === object.id));
  /** The Coding session open on the page, which a new Coding work continues instead of starting another. */
  const codingSession = () => { const ctx = pageCtx(); return ctx && ctx.object && ctx.object.kind === "coding_session" ? ctx.object.id : null; };
  const relatedCache = new Map();
  const relatedWorks = (object) => {
    const key = objectKey(object), held = relatedCache.get(key);
    if (held && Date.now() - held.at < 10000) return held.works;
    relatedCache.set(key, { at: Date.now(), works: held ? held.works : [] });
    api("/related?kind=" + encodeURIComponent(object.kind) + "&id=" + encodeURIComponent(object.id))
      .then((res) => { relatedCache.set(key, { at: Date.now(), works: res.works || [] }); paintMats(); }).catch(() => {});
    return held ? held.works : [];
  };
  const pageObject = () => {
    const ctx = pageCtx();
    if (!ctx || !ctx.object || removed.has("object")) return null;
    const object = ctx.object;
    const related = !curId || belongsToWork(object);
    return { object, context:ctx, related, included: related || joined.has(objectKey(object)) };
  };
  const clip = (text, size) => text.length > size ? text.slice(0, size - 1) + "…" : text;
  /** The materials this Send would carry, each named and removable; page items are marked as coming from the page. */
  const materialsNow = () => {
    const ctx = pageCtx();
    const items = [];
    const page = pageObject();
    if (page) {
      // The page's object is named once; the sentence around it is the translation's own, so it keeps its own colon.
      const name = page.object.title || page.object.id, label = L("正在看：{title}", { title: name });
      if (page.included) items.push({ key: "object", label, name, auto: !joined.has(objectKey(page.object)), note: curId && page.related ? L("这项工作的对象") : "" });
      else items.push({ key: "object", label, name, optional: true });
    }
    if (page && page.included && ctx.unsaved && ctx.draft_text && !removed.has("draft")) items.push({ key: "draft", label: L("未保存的修改"), auto: true });
    if (page) relatedWorks(page.object).filter((row) => row.work_id !== curId).slice(0, 2)
      .forEach((row) => items.push({ key: "work:" + row.work_id, label: L("这个对象属于工作") + "「" + row.title + "」", optional: true, work: row }));
    if (sel && !removed.has("selection")) items.push({ key: "selection", label: L("选中的内容") + "：" + clip(sel.text.replace(/\s+/g, " "), 28), auto: true });
    files.forEach((file) => items.push({ key: "file:" + file.material_id, label: (file.kind === "image" ? L("图片") + "：" : file.reference ? L("引用") + "：" : "") + file.title, auto: false, thumb: file.preview }));
    return items;
  };
  /** Leaves an item out of this Send: a page object the person added goes back to optional; the rest are removed. */
  function dropMaterial(item) {
    const page = item.key === "object" ? pageObject() : null;
    if (page && joined.has(objectKey(page.object))) joined.delete(objectKey(page.object));
    else if (item.key.startsWith("file:")) files = files.filter((file) => "file:" + file.material_id !== item.key); else removed.add(item.key);
  }
  function paintMats() {
    renderMaterialsBlock(); paintEmpty();
    if (!matsBtn) return;
    const items = materialsNow();
    const carried = items.filter((item) => !item.optional);
    matsBtn.hidden = !items.length;
    // Named, not counted: the first thing this message carries (what the page shows), and how many more.
    const lead = carried[0] || items[0];
    if (materialsLabel) materialsLabel.textContent = lead ? clip(lead.name || lead.label, 16) : "";
    if (materialsCount) materialsCount.textContent = carried.length > 1 ? "+" + (carried.length - 1) : "";
    matsBtn.toggleAttribute("data-optional", !carried.length);
    matsBtn.setAttribute("aria-label", L("本次发送带上的材料") + "：" + (carried.length ? carried.map((item) => item.label).join("、") : L("无")) + (carried.length < items.length ? "；" + L("另有正在看的对象未加入") : ""));
    if (!matsList || matsList.hidden) return;
    matsList.replaceChildren(el("p", "assistant-popover-title", L("本次发送带上的材料")));
    if (!items.length) matsList.append(el("p", "assistant-muted", L("没有材料。可以在页面上选中内容，或添加文件。")));
    items.forEach((item) => {
      const row = el("div", "assistant-material" + (item.optional ? " assistant-material--optional" : ""));
      if (item.work) {
        // Another work already holds this object: continuing it there is one click, never automatic.
        row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", stateLabel(item.work.state)));
        const go = el("button", "assistant-material-add", L("切换过去")); go.type = "button";
        go.addEventListener("click", () => { setMats(false); switchTo(item.work.work_id); input.focus(); });
        row.append(go); matsList.append(row); return;
      }
      if (item.optional) {
        // Browsing is not working on it: the person decides whether this round takes it.
        row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", L("与这项工作无关，不会带上")));
        const add = el("button", "assistant-material-add", L("加入本轮")); add.type = "button";
        add.addEventListener("click", () => { const page = pageObject(); if (page) joined.add(objectKey(page.object)); paintMats(); matsList.querySelector("button")?.focus(); });
        row.append(add); matsList.append(row); return;
      }
      if (item.thumb) { row.classList.add("assistant-material--image"); const thumb = el("img", "assistant-material-thumb"); thumb.src = item.thumb; thumb.alt = ""; row.append(thumb); }
      row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", item.note || (item.auto ? L("来自当前页面") : L("你添加的"))));
      const drop = el("button", "assistant-material-remove", "×"); drop.type = "button";
      drop.setAttribute("aria-label", L("不带上") + "：" + item.label);
      drop.addEventListener("click", () => { dropMaterial(item); paintMats(); (matsList.querySelector("button") || matsBtn).focus(); });
      row.append(drop); matsList.append(row);
    });
  }
  const setMats = (open) => {
    if (!matsList) return;
    matsList.hidden = !open;
    matsBtn?.setAttribute("aria-expanded", String(open));
    if (open) { setStarts(false); paintMats(); matsList.querySelector("button")?.focus(); }
  };
  matsBtn?.addEventListener("click", () => setMats(matsList.hidden));
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
      // Answered while being read (the row's plan is at hand): the reader shows it; otherwise repaint what is open.
      queueMicrotask(() => {
        if (startPop && !startPop.hidden && !startPop.dataset.mode) setStarts(true);
        paintEmpty();
      });
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
  let methodRows = null;
  const loadMethodRows = async () => {
    if (methodRows) return methodRows;
    try { methodRows = (await api("/methods")).methods || []; } catch { methodRows = []; }
    return methodRows;
  };
  const slashOpen = () => startPop && !startPop.hidden && startPop.dataset.mode === "slash";
  async function setSlash(query) {
    if (!startPop) return;
    const q = String(query || "").trim().toLowerCase();
    const starters = startersFor().filter((starter) => !q || starter.label.toLowerCase().includes(q));
    const rows = (await loadCapabilityRows()).filter((row) => !q || [row.title, row.provider, row.description].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 8);
    const methods = (await loadMethodRows()).filter((row) => !q || [row.name, row.plugin_title, row.summary].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 5);
    if (!String(input.value || "").startsWith("/")) return;
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
    // A method is how to do it: chosen here, its steps go with this round only.
    methods.forEach((row) => {
      const btnEl = el("button", "assistant-starter", L("方法") + "：" + row.name + " · " + row.plugin_title); btnEl.type = "button";
      btnEl.title = row.summary || row.name;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (!files.some((file) => file.kind === "method" && file.method.method_id === row.method_id)) {
          files.push({ material_id: "method-" + crypto.randomUUID(), kind: "method", title: L("方法") + "：" + row.name, explicit: true, method: { method_id: row.method_id } });
        }
        input.value = slashDraft || ""; slashDraft = null; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMats(); input.focus();
      });
      startPop.append(btnEl);
    });
    rows.forEach((row) => {
      const title = row.provider + " · " + row.title;
      const btnEl = el("button", "assistant-starter", L("用") + "：" + title); btnEl.type = "button";
      btnEl.title = row.description || title;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (!files.some((file) => file.kind === "capability" && file.capability.capability_id === row.capability_id)) {
          files.push({ material_id: "cap-" + crypto.randomUUID(), kind: "capability", title: L("用") + "：" + title, explicit: true,
            capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } });
        }
        input.value = slashDraft || ""; slashDraft = null; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMats(); input.focus();
      });
      startPop.append(btnEl);
    });
    if (!starters.length && !rows.length && !methods.length) startPop.append(el("p", "assistant-material-origin", L("没有匹配的能力；换个词，或直接说要做什么")));
  }
  function closeSlash() { if (startPop && startPop.dataset.mode === "slash") { delete startPop.dataset.mode; startPop.hidden = true; } }
  /* “@”: find something in this project or the person's own content through the system search and bring it along.
     A hit is only a pointer: the Host checks it with its owner and reads it before the round. */
  const mentionOpen = () => startPop && !startPop.hidden && startPop.dataset.mode === "mention";
  const mentionAt = () => {
    const before = String(input.value || "").slice(0, input.selectionStart ?? String(input.value || "").length);
    const match = /(^|\s)@([^\s@]{0,40})$/.exec(before);
    return match ? { query: match[2], start: before.length - match[2].length - 1 } : null;
  };
  let mentionSeq = 0, mentionTimer = null;
  function closeMention() { clearTimeout(mentionTimer); if (startPop && startPop.dataset.mode === "mention") { delete startPop.dataset.mode; startPop.hidden = true; } }
  function setMention(found) {
    if (!startPop) return;
    clearTimeout(mentionTimer);
    startPop.dataset.mode = "mention";
    startPop.hidden = false;
    const head = el("p", "assistant-popover-title", L("引用内容"));
    if (!found.query) { startPop.replaceChildren(head, el("p", "assistant-material-origin", L("输入关键词，从本项目和你个人的内容里找"))); return; }
    const seq = ++mentionSeq;
    mentionTimer = setTimeout(async () => {
      let res;
      try {
        res=await molisWorkRequest(host.route("/api/search/query"),{body:{query:found.query,scope:"all",limit:8},fallback:L("搜索暂时不可用，请稍后重试")});
      } catch (error) { if (seq === mentionSeq && mentionOpen()) { const note=el("p","assistant-material-origin");molisWorkRequest.show(note,error);startPop.replaceChildren(head,note); } return; }
      if (seq !== mentionSeq || !mentionOpen()) return;
      startPop.replaceChildren(head);
      (res.hits || []).forEach((hit) => {
        const btnEl = el("button", "assistant-starter assistant-mention", ""); btnEl.type = "button";
        btnEl.append(el("span", "assistant-mention-title", hit.plugin_title + " · " + hit.title), el("span", "assistant-mention-snippet", hit.snippet || ""));
        btnEl.setAttribute("aria-label", L("引用") + "：" + hit.plugin_title + " · " + hit.title);
        btnEl.addEventListener("mousedown", (event) => event.preventDefault());
        btnEl.addEventListener("click", () => {
          const at = mentionAt() || found;
          const value = String(input.value || "");
          input.value = value.slice(0, at.start) + "「" + hit.title + "」" + value.slice(at.start + 1 + at.query.length);
          if (!files.some((file) => file.reference && file.object && file.object.kind === hit.subject.kind && file.object.id === hit.subject.id)) {
            files.push({ material_id: "ref-" + crypto.randomUUID(), kind: "object", title: hit.title, explicit: true, reference: { hit_id: hit.hit_id },
              object: { kind: hit.subject.kind, id: hit.subject.id, title: hit.title }, source: { surface: (hit.open && hit.open.surface) || hit.plugin_id, plugin_id: hit.plugin_id, title: hit.plugin_title },
              text: hit.snippet || "" });
          }
          typed = true; syncSend(); saveDraft(false); closeMention(); paintMats(); input.focus();
        });
        startPop.append(btnEl);
      });
      if (!(res.hits || []).length) startPop.append(el("p", "assistant-material-origin", res.status === "indexing" ? L("内容还在建立索引，稍后再试") : L("没有找到；换个词试试")));
    }, 180);
  }
  function setStarts(open) {
    if (!startPop) return;
    delete startPop.dataset.mode;
    const list = open ? startersFor() : [];
    // With no work chosen, the works done lately are one click away too: the way back to them from the input itself.
    const recent = open && !curId ? works.filter((work) => !work.archived && !work.delegated_by)
      .slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 3) : [];
    // A new work also says, at the foot, where the message goes and who carries it, with the way to change that.
    const target = open && !curId;
    startPop.hidden = !list.length && !recent.length && !target;
    if (startPop.hidden) return;
    startPop.replaceChildren();
    if (list.length) startPop.append(el("p", "assistant-popover-title", L("可以这样开始")));
    list.forEach((starter) => {
      const btnEl = el("button", "assistant-starter", starterLabel(starter)); btnEl.type = "button";
      if (starter.hint) btnEl.title = starter.hint;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => { setStarts(false); if (useStarter(starter)) input.focus(); });
      startPop.append(btnEl);
    });
    if (recent.length) startPop.append(el("p", "assistant-popover-title", L("继续最近的工作")));
    recent.forEach((work) => {
      const btnEl = el("button", "assistant-starter assistant-starter--work"); btnEl.type = "button";
      btnEl.append(el("span", "assistant-starter-title", work.title), el("span", "assistant-starter-state", stateLabel(work.state)));
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", async () => { setStarts(false); await switchTo(work.work_id); setPanel(true); reload().then(poll); input.focus(); });
      startPop.append(btnEl);
    });
    if (target) {
      const who = nextExec === "coding" ? "Coding Agent" : nextChar ? nextChar.title : L("助理");
      const where = nextExec === "coding" || !project ? "" : nextScope === "project" ? (project.title || L("本项目")) : L("个人");
      const row = el("button", "assistant-starter assistant-starter--target"); row.type = "button";
      row.append(el("span", "assistant-starter-title", L("发给") + "：" + [who, L("新工作"), where].filter(Boolean).join(" · ")), el("span", "assistant-starter-state", L("更改")));
      row.addEventListener("mousedown", (event) => event.preventDefault());
      row.addEventListener("click", openNewWorkChoices);
      startPop.append(row);
    }
  }
  input.addEventListener("focus", () => { paintMats(); if (!String(input.value || "").trim() && !busy) setStarts(true); });
  input.addEventListener("blur", () => setTimeout(() => { if (!island.contains(document.activeElement) || document.activeElement === input) return; setStarts(false); }, 0));
  // What opens from the island, and the button focus returns to.
  const popovers = () => [[workNav, setWorks, worksToggle], [morePop, setMore, attach], [matsList, setMats, matsBtn], [execsPop, setExecs, execBtn], [modesPop, setModes, modeButton], [charsPop, setChars, charBtn], [noticePop, setNotices, noticeBtn]];
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.nodeType !== 1 || island.contains(event.target)) return;
    setStarts(false); for (const [pop, close] of popovers()) if (pop && !pop.hidden) close(false);
  });
  island.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const stop = () => { event.preventDefault(); event.stopPropagation(); }, put = ([pop, close, btnEl]) => pop && !pop.hidden && (stop(), close(false), (visible(btnEl) ? btnEl : attach)?.focus(), true);
    const [worksOpen, moreOpen, materialsOpen, ...choosers] = popovers();
    if (put(worksOpen)) return;
    if (panel && !panel.hidden && !spacious() && drawerOpen) { stop(); drawerOpen = false; paintLayout(); sideToggle?.focus(); return; }
    if (put(moreOpen) || put(materialsOpen)) return;
    if (startPop && !startPop.hidden) { stop(); setStarts(false); }
    choosers.forEach(put);
  }, true);
  /* Files the person adds: text is read here and sent as their own material; what cannot be read is said plainly. */
  const readBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  async function addFiles(chosen) {
    for (const file of chosen) {
      if (files.length >= 5) { host.showToast?.(L("一次最多带 5 个文件")); break; }
      // A picture is taken in by the Agent runtime and shown to the model in the round it is sent with.
      if (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i.test(file.name)) {
        if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { host.showToast?.(L("只能带 PNG、JPEG、GIF 或 WebP 图片") + "：" + file.name); continue; }
        if (files.filter((item) => item.kind === "image").length >= 4) { host.showToast?.(L("一次最多带 4 张图片")); continue; }
        if (file.size > 5 * 1024 * 1024) { host.showToast?.(L("图片超过 5 MB，请压缩或截取需要的部分") + "：" + file.name); continue; }
        try {
          const data = await readBase64(file);
          const { material } = await api("/attachments", "POST", { name: file.name, data });
          // The preview is a data URL: the page's policy shows data images, not blob URLs.
          files.push({ material_id: material.material_id, kind: "image", title: material.title, image: material.image, explicit: true, preview: "data:" + file.type + ";base64," + data });
        } catch (error) { host.showToast?.({...error,name:"Error",message:file.name+"："+(error.message||String(error))}); }
        continue;
      }
      // A PDF is read by the Agent runtime's own parser (text layer only); what cannot be read says why.
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if (file.size > 8 * 1024 * 1024) { host.showToast?.(L("文件超过 8 MB，请只带需要的部分") + "：" + file.name); continue; }
        try {
          const { material } = await api("/attachments", "POST", { name: file.name, data: await readBase64(file) });
          files.push({ material_id: material.material_id, kind: "file", title: material.title, text: material.text, explicit: true });
        } catch (error) { host.showToast?.({...error,name:"Error",message:file.name+"："+(error.message||String(error))}); }
        continue;
      }
      // Only text is read here; other binary files would reach the model as noise.
      if (!/^text\//.test(file.type) && !/\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|js|mjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|sql|sh|log|ini|toml)$/i.test(file.name)) {
        host.showToast?.(L("暂时只能读取文本文件、PDF 和图片") + "：" + file.name); continue;
      }
      if (file.size > 400000) { host.showToast?.(L("文件太大，请只带需要的部分") + "：" + file.name); continue; }
      try { files.push({ material_id: "file-" + crypto.randomUUID(), kind: "file", title: file.name, text: await file.text(), explicit: true }); }
      catch { host.showToast?.(L("读不了这个文件") + "：" + file.name); }
    }
    paintMats();
  }
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
    const rows = [...(compose.dataset.crowded === "chips" ? [matsBtn, noticeBtn] : []).filter((btnEl) => btnEl && !btnEl.hidden).map((btnEl) => moreItem(btnEl.title, btnEl.textContent.trim(), () => { setMore(false); btnEl.click(); })),
      moreItem(L("添加文件或图片…"), L("也可以拖入、粘贴"), () => { setMore(false); fileInput?.click(); }),
      moreItem(L("引用项目里的内容"), "@", () => { setMore(false); insertTrigger("@"); }),
      moreItem(L("用一个能力或方法"), "/", () => { setMore(false); insertTrigger("/"); })];
    morePop.replaceChildren(...rows);
  };
  // Who carries a new work and where it lives are chosen in its tab's side pane: the old “+” rows point there.
  const openNewWorkChoices = () => {
    setStarts(false); setMore(false); setPanel(true);
    if (spacious()) store.set(SIDE_KEY, null); else drawerOpen = true;
    paintLayout(); paintSum();
    requestAnimationFrame(() => metaEl?.querySelector("button, select")?.focus());
  };
  function setMore(open) {
    if (!morePop) return;
    morePop.hidden = !open;
    attach?.setAttribute("aria-expanded", String(open));
    if (open) { setStarts(false); paintMore(); morePop.querySelector("button")?.focus(); }
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
  compose?.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault(); compose.dataset.dropping = "true";
  });
  compose?.addEventListener("dragleave", (event) => { if (!compose.contains(event.relatedTarget)) delete compose.dataset.dropping; });
  compose?.addEventListener("drop", (event) => {
    delete compose.dataset.dropping;
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
    return res;
  };
  const sendMaterials = () => {
    const ctx = pageCtx();
    const list = files.map(({ preview: _preview, ...file }) => file);
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
      work_id: typeof raw.work_id === "string" && raw.work_id ? raw.work_id : null, executor: raw.executor === "coding" ? "coding" : null };
  };
  const bring = (message) => {
    message.materials.forEach((item, index) => files.push(Object.assign({ material_id: "msg-" + message.message_id.slice(0, 40) + "-" + index, kind: "text", title: item.title, text: item.text,
      explicit: true, source: { surface: message.source.surface, title: message.source.title } }, message.object ? { object: message.object } : {})));
    if (message.text) input.value = message.text;
    syncSend(); paintMats();
  };
  const showOffer = (message, unconfirmed) => stepRow?.offer(message, unconfirmed);
  const delegate = async (message) => {
    if (busy) { showOffer(message, false); return; }
    if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id);
    else if (message.work_id || curId) await switchTo(null);
    if (!message.work_id && message.executor === "coding" && codingHere()) { nextExec = "coding"; paintAim(); paintSum(); } // e.g. the 成果库's 「交给 Coding」
    bring(message);
    if (!String(input.value || "").trim()) { setPanel(true); input.focus(); return; }
    requestOverride = "msg-" + message.message_id; pageText = message.text && input.value.trim();
    compose.requestSubmit(send);
  };
  document.addEventListener("molis:assistant-open", async (event) => {
    const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
    const named = typeof detail.work_id === "string" && detail.work_id ? detail.work_id : "";
    if (named && !works.some((work) => work.work_id === named)) await loadWorks();
    if (named && works.some((work) => work.work_id === named)) await switchTo(named);
    else if (detail.new === true || named) await switchTo(null);
    const source = detail.source && typeof detail.source.surface === "string" && detail.source.surface
      ? { surface: detail.source.surface.slice(0, 80), title: typeof detail.source.title === "string" && detail.source.title ? detail.source.title.slice(0, 80) : detail.source.surface.slice(0, 80) } : null;
    const brought = Array.isArray(detail.materials) ? detail.materials.filter((item) => item && typeof item.title === "string" && typeof item.text === "string" && item.text).slice(0, 4) : [];
    brought.forEach((item, index) => files.push(Object.assign({ material_id: "open-" + Date.now().toString(36) + "-" + index, kind: "text", title: item.title.slice(0, 200),
      text: item.text.slice(0, 20000), explicit: true }, source ? { source } : {})));
    if (typeof detail.text === "string" && detail.text.trim()) { input.value = detail.text.trim().slice(0, 8000); typed = true; saveDraft(false); }
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
      relatedCache.delete(objectKey(message.object));
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
    if (value.trim()) setStarts(false);
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
  stepRow = nextRow && (${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})({ row: nextRow, thread, L, el, drawn, jumpTo, view: () => (view && view.work.work_id === curId ? view : null), open: () => Boolean(panel && !panel.hidden),
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
    try { view = await api("/works/" + encodeURIComponent(curId) + "/control", "POST", { kind: btnEl.dataset.assistantControl }); render(); }
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
    dispose: () => { follower.stop(); clearInterval(listTimer); cancelAnimationFrame(fitFrame); cancelAnimationFrame(materialsFrame); fitWatchers.forEach((watcher) => watcher.disconnect()); } };
}`;
