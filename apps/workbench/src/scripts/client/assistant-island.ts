import { ASSISTANT_STAGE_FACTORY, ASSISTANT_ELEMENT_SCRIPT, ASSISTANT_PLACER_SCRIPT } from "./assistant-stage.js";
import { codeLanguage, codeTokens, growCodeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { say as uiSay } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantCodeColours, createAssistantCodeGrow } from "./assistant-code-grow.js";
import { ASSISTANT_SEND_CLIENT_SCRIPT, ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "./assistant-send.js";
import { ASSISTANT_FOLLOW_FACTORY_SCRIPT } from "./assistant-follow.js";
import { ASSISTANT_STEP_ROW_FACTORY_SCRIPT } from "./assistant-step-row.js";
import type { AssistantPendingReview, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { ARTIFACT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { renderAssistantTextHtml, renderAssistantNoticeText, renderAssistantSavedText } from "../../assistant-text-html.js";
import type { AssistantReviewDisplay } from "@molis-ai/molis-work-ui-host";
import { renderAssistantReviewHtml } from "../../assistant-review-html.js";
import type { AssistantTextPorts } from "../../assistant-text-parts.js";
import { ASSISTANT_CHOOSERS_PART } from "./assistant-choosers.js";
import { ASSISTANT_BROWSER_HANDBACK_PART } from "./assistant-browser-handback.js";
import { ASSISTANT_LAYOUT_PART } from "./assistant-layout.js";
import { ASSISTANT_CONVERSATION_PART } from "./assistant-conversation.js";
import { ASSISTANT_CONNECTION_PART } from "./assistant-connection.js";
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
export const assistantTextHtml = (text: string, objects: AssistantWorkView["objects"], say: AssistantTextPorts["say"]): string =>
  renderAssistantTextHtml(text, { objects, say, language: codeLanguage, tokens: assistantGrownTokens });
export const assistantReviewHtml = (review: AssistantPendingReview, say: AssistantTextPorts["say"], display?: AssistantReviewDisplay): string =>
  renderAssistantReviewHtml(review, { objects: [], say, language: codeLanguage, tokens: codeTokens }, uiSay.text, display);

/**
 * The resident Assistant in the bottom bar: one assistant, many works.
 *
 * Every fact shown here comes from the Host (`/api/assistant`): a work's state is its real run's state, a question is
 * the run's own pending question, a confirmation is the Host's review of the exact effect. The page only decides where
 * the next Send goes, and never sends anything the person did not send.
 *
 * Notes kept out of the served script (a comment in it is bytes the browser downloads and never runs). `namedObject`: A name in 「…」 that this work knows (one of its objects) opens where it lives: the answer points at the thing itself. `list items`: A model sometimes drops the space after a list's dash on one line (“-30 分钟” among “- 60 分钟”): beside a real item, it is one too. `ownStop`: A round the runtime stopped on its own (a guard, a breaker) says why in its own words; one the person stopped says so. `notices`: What needs the person first; news about a work (done, a result, new material) folds below — it also shows on the work. `reminder open`: A reminder opens its item where it lives: here when it is this page's project, otherwise on its own project's page. `pane switcher`: Split into panes, the switcher names each one: the page being worked on is the focused pane, not all of them run together. `delegated Send`: A delegated Send reuses its message id, so the same message twice starts one work. Its words are the page's: pageText marks them. `retried Send`: A Send whose outcome is unknown (the connection dropped) is retried with the same id, so the Host starts nothing twice. `project`: The project the next new work belongs to. The project list changes it as the person looks from one project to another. `searchKey`: Search opens with ⌘K (Ctrl K elsewhere); a touch screen or a phone's width has no key to name (there the bar's input rests as one row), and the placeholder follows when the window crosses it. `answer busy`: While a question's answer is on its way its button shows the shared loading mark, and ⌘↵ (or a closed card with no button) sends nothing.
 */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = String.raw`(host) => {
  const readText = host.translate, savedAssistantText = (${renderAssistantSavedText.toString()});
  const noticeText = (notice) => (${renderAssistantNoticeText.toString()})(notice, globalThis.say.text, savedAssistantText);
  const island = document.querySelector("[data-assistant-island]");
  if (!island) return null;
  const panel = island.querySelector("[data-assistant-panel]");
  // The composer's root and its text area (the first screen is the Dock's; the mount keeps that text area for good).
  const compose = island.querySelector("[data-assistant-composer]");
  const input = compose?.querySelector(".mw-composer__input");
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
  const newButton = island.querySelector("[data-assistant-new]");
  if (!compose || !input || !thread) return null;
  let project = host.project && host.project.id ? host.project : null;
  const keyless = window.matchMedia ? window.matchMedia("(hover: none), (max-width: 600px)") : null;
  const searchKey = () => !document.querySelector("[data-global-search-open], [data-global-search-dialog]") || keyless?.matches ? ""
    : /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  const STATE_LABELS = { idle: "workbench.assistant-island.not-started", running: "workbench.assistant-island.progress", "waiting-input": "workbench.assistant-island.needs-answer", "waiting-review": "workbench.assistant-island.needs-approval", paused: "workbench.assistant-island.paused",
    completed: "workbench.assistant-island.done", failed: "workbench.assistant-island.not-finished", stopped: "workbench.assistant-island.stopped", "needs-check": "workbench.assistant-island.needs-checking" };
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } },
  };
  // What this viewer has in front of them is remembered per project (proactive-assistant §12.1): another project starts from its own.
  const scoped = (name) => "molis.assistant." + name + (project ? ":" + project.id : "");
  let works = [];
  let curId = store.get(scoped("current"));
  let view = null;
  let problem = null;
  let nextScope = project ? "project" : "personal";
  let nextExec = "assistant";
  // The first round's mode for a new plugin work (empty: its default); after that the session keeps it.
  let nextMode = "";
${ASSISTANT_CHOOSERS_PART}
${ASSISTANT_BROWSER_HANDBACK_PART}

  const api=(path,method,body,route=host.route("/api/assistant"+path))=>molisWorkRequest(route,{method:method||"GET",body,fallback:readText("workbench.assistant-island.assistant-could-not-finish-right-now")});
  let executorRequest = 0;
  const loadExecutors = async () => {
    if (!project) return;
    const request = ++executorRequest, result = await api("/executors").catch(() => null);
    if (!result || request !== executorRequest) return;
    executors = result.executors || [];
    if (nextExec !== "assistant" && !executorOffer(nextExec)) nextExec = "assistant";
    paintAim(); paintSum();
  };
  const executorsLoaded = loadExecutors();
  const el = ${ASSISTANT_ELEMENT_SCRIPT}, receipts = (${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})({ readText, shared: host.receipts, chip: compose.querySelector("[data-assistant-answer]"), api, work: () => curId, reload: () => reload(),
    pact: (content, badge) => paintBlock(blocks.agreements, readText("workbench.assistant-island.what-ai-noted-agreed"), "list", content, badge) });
  const stateLabel = (state) => STATE_LABELS[state] ? readText(STATE_LABELS[state]) : state || ""; const ringState = state => ({ "waiting-input": "answer", "waiting-review": "approval", "needs-check": "verify", completed: "round-ended" })[state] || state;
  const scopeLabel = (scope, title) => !scope ? "" : scope.kind === "personal" ? readText("workbench.assistant-island.personal")
    : title || (project && scope.project_id === project.id ? (project.title || readText("workbench.assistant-island.project")) : readText("workbench.assistant-island.another-project"));
  const getWork = () => works.find((work) => work.work_id === curId) || (view && view.work.work_id === curId ? view.work : null);

  const isLive = (state) => state === "running" || state === "waiting-input" || state === "waiting-review" || state === "paused";
  let presentation, stepRow;
  const setPanel = (open) => { if (!presentation?.show(open) && panel) panel.hidden = !open; };

  /* ─── Where the next Send goes: the composer's receiver tag, its controls and the placeholder ─── */
  // \`sync\` false: only the words, for the composer about to be mounted on the Assistant again.
  const paintAim = (sync = true) => {
    const work = getWork(); presentation?.syncWork(work);
    // A page in front takes the bar's input (O2): its words and placeholder are its own until the Assistant has the bar again.
    if (island.dataset.receiver === "page") { if (sync) syncComposer(); return; }
    input.readOnly = !!work?.reply_target;
    if (!executorsHere() && nextExec !== "assistant") nextExec = "assistant";
    // A page that knows what the person is looking at (the project list) may say so in the placeholder of a new work.
    const hint = !work && nextExec === "assistant" && host.placeholder ? host.placeholder(project) : "";
    input.placeholder = work?.reply_target ? readText("workbench.assistant-island.return-original-comment-continue") : work ? readText("workbench.assistant-island.add-answer-correct") : nextExec !== "assistant" && executorOffer(nextExec) ? readText("workbench.assistant-island.ask-name-do-something", { name: executorOffer(nextExec).title })
      : hint ? hint : searchKey() ? readText("workbench.assistant-island.ask-assistant-press-key-search", { key: searchKey() }) : readText("workbench.assistant-island.ask-assistant-do-something");
    if (sync) syncComposer();
  };
  keyless?.addEventListener?.("change", () => paintAim());
  const remember = () => store.set(scoped("current"), curId);

  /* ─── Tabs: one per open work; which are open is this viewer's own convenience ─ */
  const MAX_TABS = 6;
  const savedTabs = () => { try { const saved = JSON.parse(store.get(scoped("tabs")) || "[]"); return Array.isArray(saved) ? saved.filter((id) => typeof id === "string" && id).slice(0, MAX_TABS) : []; } catch { return []; } };
  let tabs = savedTabs();
  const seenAt = new Map();
  const saveTabs = () => store.set(scoped("tabs"), tabs.length ? JSON.stringify(tabs) : null);
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

  const switchTo = async (id) => { if (id !== curId) await showWork(id); };
  const showWork = async (id) => {
    curId = id; remember(); problem = null; view = null; pendingChar = undefined;
    openTab(id); if (!spacious()) drawerOpen = false;
    thread.querySelectorAll(":scope > [data-round], :scope > .assistant-problem").forEach((node) => node.remove());
    thread.querySelectorAll(":scope > [data-review]").forEach(removeReview);
    render(); paintLayout();
    if (panel) { panel.removeAttribute("data-arrive"); void panel.offsetWidth; panel.setAttribute("data-arrive", ""); }
    if (id) { await reload(); poll(); }
  };

  const { bindMore, growCode, paint: paintCode } = (${createAssistantCodeGrow.toString()})(globalThis.t.text);
  const placer = ${ASSISTANT_PLACER_SCRIPT};
${ASSISTANT_CONNECTION_PART}
${ASSISTANT_CONVERSATION_PART}
  /* ─── The side pane: what this work is, how it got here, what it used and what it made ─ */
  const usageBox = island.querySelector("[data-assistant-usage]");
  const WAITING = new Set(["waiting-input", "waiting-review", "needs-check"]);
  // Works with news for the person (done, a result handed back, new material) and works waiting on them, from notices.
  let unreadWorks = new Set(), urgentWorks = new Set();
  const when = (iso) => { const at = new Date(iso); return Number.isFinite(at.getTime()) ? readText("common.generated.formatted", { value: { kind: "date", at: at.toISOString(), style: "datetime" } }) : ""; };
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
        sub: readText("workbench.assistant-island.sub-task") + " · " + stateLabel(child.state), actions: [sideAct(child.state === "waiting-input" ? readText("workbench.assistant-island.answer") : readText("workbench.assistant-island.take-look"), child.title, async () => switchTo(child.work_id), false, "primary")] })));
      objects.forEach((object) => {
        const open = openObject(object);
        cards.push(card({ icon: "alert", tone: object.state === "missing" || object.state === "unavailable" ? "blocked" : "attention", ask: true, title: objectTitle(object),
          sub: object.state === "changed" ? readText("workbench.assistant-island.changed-since-was-used") + " · " + objectDetail(object) : objectState(object),
          actions: open ? [sideAct(readText("workbench.assistant-island.open"), object.title, open, false, "secondary")] : [] }));
      });
      suggestions.forEach((candidate) => {
        const settle = (path) => async () => { await api("/memory-candidates/" + encodeURIComponent(candidate.candidate_id) + path, "POST", { expected_version: candidate.version }); await reload(); };
        cards.push(card({ icon: "sparkles", tone: "suggest", ask: true, title: readText(candidate.held ? "workbench.assistant-island.asked-me-remember" : "workbench.assistant-island.remember") + "：" + candidate.text, detail: candidate.held,
          sub: (candidate.held ? "" : candidate.why + " · ") + proc.memoryScope(candidate.scope),
          actions: [sideAct(readText("workbench.assistant-island.keep"), candidate.text, settle("/accept"), false, "primary"), sideAct(readText("workbench.assistant-island.no-thanks"), candidate.text, settle("/discard"), false, "secondary")] }));
      });
      paintBlock(node, readText("workbench.assistant-island.still-waiting"), "bell", cards.length ? stack(cards) : null, String(cards.length), true, true);
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
      const UNDO = { available: "workbench.assistant-island.can-be-undone", undone: "workbench.assistant-island.undone", failed: "workbench.assistant-island.could-not-undo" };
      const made = results.map((o) => pickable(objectCard(o, "done"), o, objectTitle(o))), fixed = made.filter((_, i) => results[i].subject.kind === ${JSON.stringify(ARTIFACT_SUBJECT_KIND)});
      const changes = undoable.slice().reverse().map((change) => card({ icon: change.state === "undone" ? "undo" : "edit", tone: change.state === "failed" ? "blocked" : "",
        title: change.title, sub: readText(UNDO[change.state] || change.state) + (change.detail ? "：" + change.detail : ""), subTone: change.state === "failed" ? "blocked" : "", done: change.state === "undone",
        actions: change.state !== "undone" ? [sideAct(readText("workbench.assistant-island.undo"), change.title, async () => {
          view = await api("/works/" + encodeURIComponent(work.work_id) + "/undo/" + encodeURIComponent(change.undo_id), "POST", {});
          // Taken back: the owner's page rereads, as it did when the change was made.
          const taken = (view.undoable || []).find((one) => one.undo_id === change.undo_id);
          if (taken && taken.state === "undone" && taken.capability_id) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: taken.capability_id } }));
          render();
        }, false, "secondary", "undo")] : [] }));
      const JOB = { running: "workbench.assistant-island.progress", completed: "workbench.assistant-island.done", failed: "workbench.assistant-island.not-finished", unknown: "workbench.assistant-island.no-longer-followed-check-where-runs" };
      const background = jobs.map((job) => card({ icon: spinner(job.state === "running" ? "running" : job.state === "completed" ? "round-ended" : job.state === "failed" ? "failed" : "verify"),
        tone: job.state === "completed" ? "done" : job.state === "failed" ? "blocked" : "", title: job.title, sub: readText(JOB[job.state] || job.state) }));
      /* A change still with its owner when the round stopped: what it finally did, never re-sent. */
      const SETTLED = { pending: "workbench.assistant-island.waiting-its-result-will-not-be-sent-again", completed: "workbench.assistant-island.finished-after-stop", failed: "workbench.assistant-island.failed-after-stop", "not-run": "workbench.assistant-island.had-not-started-nothing-done" };
      const stopped = unsettled.map((change) => card({ icon: spinner(({pending:"waiting",completed:"done",failed:"failed","not-run":"stopped"})[change.state] || "verify"), title: change.title, sub: readText(SETTLED[change.state] || change.state) + (change.detail ? "：" + change.detail : "") }));
      /* Memory the work kept (asked for, or kept on its own): the memory service owns it; this is where it can be taken back. */
      // The memory service names more kinds than these; one this panel does not know reads as plainly kept.
      const KEPT = { kept: "", auto_kept: "workbench.assistant-island.kept-its-own", replaced: "workbench.assistant-island.replaced-older-one", auto_replaced: "workbench.assistant-island.replaced-older-one-its-own", merged: "workbench.assistant-island.merged-older-one", edited: "workbench.assistant-island.edited",
        auto_disabled: "workbench.assistant-island.switched-off-its-own", disabled: "workbench.assistant-island.switched-off-assistant-asked" };
      // What undoing did depends on the kind: a memory kept on its own is deleted (its words go with it), a replacement
      // goes back to the earlier version, a memory switched off is on again. The last two keep the words they undid.
      const UNDONE = { auto_replaced: "workbench.assistant-island.undone-back-earlier-one", auto_disabled: "workbench.assistant-island.undone-switched-again", disabled: "workbench.assistant-island.undone-switched-again" };
      const remembered = kept.map((change) => {
        const undone = change.state === "undone";
        const actions = [];
        if (change.undoable && !undone) actions.push(sideAct(readText("workbench.assistant-island.undo"), change.text, async () => {
          await molisWorkRequest(host.route("/api/memory/changes/"+encodeURIComponent(change.change_id)+"/undo"),{method:"POST",fallback:readText("workbench.assistant-island.could-not-undo")});
          await reload();
        }, false, "secondary", "undo"));
        if (!undone) actions.push(sideAct(readText("workbench.assistant-island.see-settings"), change.text, async () => {
          // The settings surface opens its memory section when it hears this; with nobody listening, go there.
          const handled = !window.dispatchEvent(new CustomEvent("molis-work:open-settings-section", { detail: { section: "memory" }, cancelable: true }));
          const scoped = change.scope === "project" ? change.project_id || (project && project.id) : "";
          if (!handled) location.assign(scoped ? "/projects/" + encodeURIComponent(scoped) + "/settings/memory" : "/settings/memory");
        }, true));
        const scope = proc.memoryScope(change.scope);
        if (undone && (!UNDONE[change.kind] || !change.text)) return card({ icon: "sparkles", title: readText("workbench.assistant-island.undone-deleted-memory"), done: true, sub: scope, actions });
        return card({ icon: "sparkles", tone: undone ? "" : "suggest", title: change.text, done: undone,
          sub: [scope, undone ? readText(UNDONE[change.kind]) : KEPT[change.kind] ? readText(KEPT[change.kind]) : ""].filter(Boolean).join(" · "), actions });
      });
      // Three groups of one kind (VUX-08): what it made, what it changed and how each stands, what still runs elsewhere; a failure shows folded.
      const list = (block, ...parts) => { const box = el("div", "assistant-group-list"); parts.forEach(([label, cards]) => cards.length && box.append(group(label, stack(cards, work.work_id + ":" + block + ":" + label)))); return box.children.length ? box : null; };
      const failed = undoable.concat(unsettled).filter((one) => one.state === "failed").length, canUndo = undoable.filter((one) => one.state === "available").length, running = jobs.filter((job) => job.state === "running").length, missed = jobs.filter((job) => job.state === "failed").length;
      paintBlock(node, readText("workbench.assistant-island.output"), "package", list("results", [readText("workbench.assistant-island.saved-versions"), fixed], [readText("workbench.assistant-island.working-files"), made.filter((card) => !fixed.includes(card))]), String(made.length));
      paintBlock(blocks.changes, readText("workbench.assistant-island.changes"), "edit", list("changes", ["", changes], [readText("workbench.assistant-island.still-running-when-stopped"), stopped], [readText("workbench.assistant-island.kept-memory"), remembered]), failed ? failed + " " + readText("workbench.assistant-island.failed") : canUndo ? canUndo + " " + readText("workbench.assistant-island.can-be-undone-2") : String(changes.length + stopped.length + remembered.length), failed > 0);
      paintBlock(blocks.background, readText("workbench.side-panel-tab.background-tasks"), "clock", list("background", ["", background]), missed ? missed + " " + readText("workbench.assistant-island.did-not-finish") : running ? running + " " + readText("workbench.assistant-island.running") : String(jobs.length), missed > 0);
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
    titleEl.textContent = work ? work.title : readText("workbench.assistant-island.new-work");
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
        const select = el("select", "mw-select"); select.setAttribute("aria-label", readText("workbench.assistant-island.which-character-carries-next-turn"));
        const own = el("option", "", readText("workbench.assistant-island.assistant-itself")); own.value = ""; select.append(own);
        (characters || []).forEach((choice) => {
          const option = el("option", "", choice.title + " v" + choice.reference.version + (choice.available ? "" : " · " + (choice.reason || readText("workbench.assistant-island.unavailable-now"))));
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
        rows.push(...metaRow(readText("workbench.assistant-island.part"), document.createTextNode(scopeLabel(work.scope, work.scope_title))));
        if (work.executor.kind === "plugin") {
          const offer = modeOffer();
          rows.push(...metaRow(readText("workbench.assistant-island.who-will-do"), document.createTextNode(work.executor.title)));
          if (offer && offer.modes.length) rows.push(...metaRow(readText("workbench.assistant-island.mode"), segmented(readText("workbench.assistant-island.mode-next-turn-same-setting-plugin-s-own"), modeRows(offer), work.executor.mode || offer.default_mode, (id) => void applyMode(id))));
        } else if (allowsCharacter() && hasChoices) {
          rows.push(...metaRow(readText("workbench.assistant-island.who-will-do"), characterPicker()));
        } else rows.push(...metaRow(readText("workbench.assistant-island.who-will-do"), document.createTextNode(chosen ? readText("workbench.assistant-island.role") + "：" + chosen.title : readText("workbench.assistant-island.assistant"))));
        // The same work can change hands between rounds: to a plugin in its project, and back to the Assistant.
        const toPlugins = work.executor.kind === "assistant" && work.scope.kind === "project" ? executors.filter((one) => !one.problem) : [];
        if (!isLive(work.state) && (toPlugins.length || work.executor.kind === "plugin")) {
          const handOver = (label, to) => {
            const hand = el("button", "assistant-side-action", label); hand.type = "button";
            hand.addEventListener("click", async () => { hand.disabled = true;
              try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/handover", "POST", { to }); render(); input.focus(); }
              catch (error) { showError(error); } finally { if (hand.isConnected) hand.disabled = false; } });
            rows.push(...metaRow("", hand)); };
          toPlugins.forEach((one) => handOver(readText("workbench.assistant-island.hand-name", { name: one.title }), { kind: "plugin", plugin_id: one.plugin_id }));
          if (work.executor.kind === "plugin") handOver(readText("workbench.assistant-island.back-assistant"), { kind: "assistant" });
        }
      } else {
        // A new work: who carries it and where it lives are chosen here, before its first message.
        const who = executorChoices().map((one) => ({ id: one.id, label: one.label, hint: one.hint }));
        rows.push(...metaRow(readText("workbench.assistant-island.who-will-do"), segmented(readText("workbench.assistant-island.who-does"), who, nextExec, (id) => { nextExec = id; if (id !== "assistant") nextChar = null; paintAim(); paintSum(); })));
        if (nextExec === "assistant" && allowsCharacter() && hasChoices) rows.push(...metaRow(readText("workbench.assistant-island.role"), characterPicker()));
        if (nextExec !== "assistant" && modeOffer()) {
          const offer = modeOffer();
          if (executorSession(nextExec)) rows.push(...metaRow(readText("workbench.assistant-island.mode"), document.createTextNode(readText("workbench.assistant-island.continues-session-that-open"))));
          else if (offer.modes.length) rows.push(...metaRow(readText("workbench.assistant-island.mode"), segmented(readText("workbench.assistant-island.mode-first-turn"), modeRows(offer), nextMode || offer.default_mode, (id) => void applyMode(id))));
        }
        if (nextExec === "assistant" && project) {
          rows.push(...metaRow(readText("workbench.assistant-island.put"), segmented(readText("workbench.assistant-island.new-work-goes"), [{ id: "project", label: project.title || readText("workbench.assistant-island.project") }, { id: "personal", label: readText("workbench.assistant-island.personal") }], nextScope,
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
      if (index >= 0) works[index] = Object.assign({}, works[index], work, { draft: works[index].draft, draft_revision: works[index].draft_revision });
      else works.unshift(work);
    }
    const memoryButton = island.querySelector("[data-assistant-memory]");
    if (memoryButton) {
      memoryButton.hidden = !work;
      if (work) memoryButton.href = (work.scope.kind === "project" ? "/projects/" + encodeURIComponent(work.scope.project_id) : "")
        + "/settings/memory?memory_session_kind=assistant&memory_session_id=" + encodeURIComponent(work.work_id);
      else memoryButton.removeAttribute("href");
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
    [...thread.children].forEach((card) => { if (card.dataset.review && !reviews.some((r) => r.review_id === card.dataset.review)) removeReview(card); });
    reviews.forEach((review) => {
      const card = keyed(thread, "data-review", review.review_id, () => el("div", "assistant-card assistant-card--review"));
      if (!card.dataset.painted) { card.dataset.painted = "1"; renderReview(card, work, review); }
      put(card);
    });
    thread.querySelector(":scope > .assistant-problem")?.remove();
    const shown = problem || (work && view.problem) || null;
    if (shown) {
      const box = el("div", "assistant-problem"); box.setAttribute("role", "alert");
      const kicker = el("span", "assistant-card-kicker is-blocked"); kicker.append(spinner("failed"), document.createTextNode(readText("workbench.assistant-island.something-went-wrong")));
      const message=el("p", "");molisWorkRequest.show(message,shown,shown.message);box.append(kicker,message);
      if (work && work.state === "needs-check") {
        // What the interrupted round really did, then an explicit close. Nothing is re-run.
        const check = el("button", "mw-btn mw-btn--secondary mw-btn--sm", readText("workbench.assistant-island.see-what-actually-happened")); check.type = "button";
        check.addEventListener("click", async () => {
          check.disabled = true;
          try {
            const report = await api("/works/" + encodeURIComponent(work.work_id) + "/recovery");
            const OUTCOMES = { completed: "workbench.assistant-island.happened", failed: "workbench.assistant-island.failed-did-not-happen", "not-dispatched": "workbench.assistant-island.not-executed", unknown: "workbench.assistant-island.outcome-unknown-check-where-would-have-happened" };
            const list = el("ul", "assistant-recovery"), closes = [];
            report.rounds.forEach((round) => {
              round.operations.forEach((op) => { const item = el("li", "", op.summary + " — " + readText(OUTCOMES[op.outcome] || op.outcome)); item.dataset.state = op.outcome; list.append(item); });
              if (!round.operations.length) list.append(el("li", "", readText("workbench.assistant-island.turn-recorded-no-operations")));
              round.blockers.forEach((why) => list.append(el("li", "assistant-muted", why)));
              if (round.can_close) {
                const close = el("button", "mw-btn mw-btn--primary mw-btn--sm", readText("workbench.assistant-island.checked-close-turn")); close.type = "button";
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
        if (/模型/.test(shown.action)) { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", shown.action); link.href = "/settings/models"; link.addEventListener("click", (event) => { if (!event.metaKey && !event.ctrlKey) setPanel(false); }); box.append(link); }
        // A work's own cap is raised right here, in its usage box; the daily cap lives in the Assistant's settings.
        else if (/这项工作的上限/.test(shown.action) && usageBox) {
          const raise = el("button", "mw-btn mw-btn--secondary mw-btn--sm", shown.action); raise.type = "button";
          raise.addEventListener("click", openUsage);
          box.append(raise);
        }
        else if (shown.action === "打开设置") { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", readText("workbench.assistant-island.open-assistant-settings")); link.href = "/settings/assistant"; box.append(link); }
        else box.append(el("p", "assistant-muted", shown.action));
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
    const fresh = el("button", "assistant-works-item assistant-works-new", readText("workbench.assistant-island.new-work-2")); fresh.type = "button"; fresh.dataset.workId = "new";
    fresh.addEventListener("click", () => { setWorks(false); switchTo(null); input.focus(); });
    workNav.append(fresh);
    if (!works.length) workNav.append(el("p", "assistant-muted", readText("workbench.assistant-island.no-work-yet-send-message-start-first-one")));
    // Grouped the way the person looks for them: what waits on them, what is running, then the rest by recency.
    const groups = [["等你", (work) => markOf(work) === "waiting"], ["进行中", (work) => work.state === "running" || work.state === "paused"], ["最近", () => true]];
    const placed = new Set();
    groups.forEach(([label, fits]) => {
      const rows = works.filter((work) => !placed.has(work.work_id) && fits(work));
      if (!rows.length) return;
      workNav.append(el("p", "assistant-works-group", label));
      rows.forEach((work) => {
        placed.add(work.work_id);
        const item = el("button", "assistant-works-item"); item.type = "button"; item.dataset.workId = work.work_id;
        const mark = markOf(work);
        if (mark) item.dataset.mark = mark;
        if (work.work_id === curId) item.setAttribute("aria-current", "true");
        const meta = el("span", "assistant-works-meta", stateLabel(work.state) + " · " + scopeLabel(work.scope, work.scope_title) + (tabs.includes(work.work_id) ? " · " + readText("workbench.assistant-island.open-2") : ""));
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
  // Reads asked while one is in flight share it: the start, the panel opening, coming back to the page and the list's timer
  // ask for the same list. A caller after a change of its own (fresh) waits for one read that starts after it, shared by every such caller.
  // Shared only for the same address: on the chooser the route follows the selected project, and another project's list is another read.
  let worksRead = null, worksAt = "", worksAgain = null, worksGeneration = 0;
  const loadWorks = (fresh) => {
    const at = host.route("/api/assistant/works");
    if (!worksRead || at !== worksAt) {
      worksAt = at; worksAgain = null;
      const read = worksRead = readWorks(at, ++worksGeneration).finally(() => { if (worksRead === read) worksRead = null; });
      return read;
    }
    if (!fresh) return worksRead;
    if (!worksAgain) worksAgain = worksRead.then(() => { worksAgain = null; return loadWorks(); });
    return worksAgain;
  };
  const readWorks = async (at, generation) => {
    try {
      const res = await api("/works", "GET", undefined, at);
      if (generation !== worksGeneration || at !== worksAt || at !== host.route("/api/assistant/works") || !island.isConnected) return;
      const drafts = new Map(works.map((work) => [work.work_id, { draft: work.draft, draft_revision: work.draft_revision }]));
      works = (res.works || []).map((work) => ({ ...work, ...(work.work_id === curId ? drafts.get(work.work_id) : undefined) }));
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
  ${ASSISTANT_SEND_CLIENT_SCRIPT}
  const nextRow = island.querySelector("[data-assistant-next-row]");
  stepRow = nextRow && (${ASSISTANT_STEP_ROW_FACTORY_SCRIPT})({ row: nextRow, thread, readText, el, drawn, jumpTo, bindText, setReviewWord, view: () => (view?.work.work_id === curId ? view : null), open: () => Boolean(panel && !panel.hidden),
    // A page's words and materials go in the input, in the work it named; nothing is sent.
    reply: (message) => replyToThread(message), take: async (message) => { if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id); bring(message); if (message.text) setWords(message.text); setPanel(true); input.focus(); },
    other: (id) => {
      const object = view.objects.find((one) => "open:" + one.subject.kind + ":" + one.subject.id === id), last = view.rounds[view.rounds.length - 1];
      if (object) showObject(object);
      else if (id === "check") jumpTo(".assistant-problem");
      else if (id.startsWith("work:")) switchTo(id.slice(5));
      else if (id === "retry" && last) { setWords(last.text); input.focus(); }
    } });
  const retitleReviews = () => {
    proc.retitle(thread);
    for (const card of thread.querySelectorAll('[data-review]')) retitleReviewText(card);
    stepRow?.retitle();
    receipts.retitle();
    Object.assign(words, composerWords());
    refreshComposerWords();
    paintAim();
    composer?.refresh();
    void loadExecutors();
  };
  document.addEventListener("molis-work:language-changed", retitleReviews);
  presentation = (${ASSISTANT_STAGE_FACTORY})({island,panel,input,current:getWork,switchTo,showProblem:showError,readText,el});
  /* ─── Head controls ────────────────────────────────────────────────────── */
  island.querySelector("[data-assistant-panel-close]")?.addEventListener("click", () => setPanel(false));
  island.querySelector("[data-assistant-memory]")?.addEventListener("click", (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) setPanel(false);
  });
  /** Pause, resume or stop the work in front: the summary's and the strip's buttons, and the composer's stop. */
  async function control(kind, extra) {
    if (!curId) return;
    try { view = await api("/works/" + encodeURIComponent(curId) + "/control", "POST", { kind, ...extra }); render(); }
    catch (error) { showError(error); }
    finally { poll(); }
  }
  island.querySelectorAll("[data-assistant-control]").forEach((btnEl) => btnEl.addEventListener("click", async () => {
    btnEl.disabled = true;
    await control(btnEl.dataset.assistantControl, btnEl.hasAttribute("data-keep-connections") ? { keep_connections: true } : {});
    btnEl.disabled = false;
  }));
  newButton?.addEventListener("click", () => { switchTo(null); input.focus(); });
  worksToggle?.addEventListener("click", () => setWorks(workNav.hidden));
  workNav?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setWorks(false); worksToggle?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...workNav.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    event.preventDefault();
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  });

  const watchers = [];
  // The bar grows with the composer: what sits above it (the panel, the side panel, popovers, toasts) reads the bar's real height
  // from --dock-h, written here; while the bar is not drawn (a page embedded in a pane) the sheets' rest height stands.
  const bar = island.closest(".workbench-bar");
  if (bar && "ResizeObserver" in window) {
    const titlebar = bar.closest(".immersive-workspace")?.querySelector(".immersive-titlebar");
    const watcher = new ResizeObserver(() => {
      const height = bar.offsetHeight;
      if (height) document.body.style.setProperty("--dock-h", height + "px"); else document.body.style.removeProperty("--dock-h");
      bar.toggleAttribute("data-dock-hidden", !height);
      if (titlebar) document.body.style.setProperty("--workbench-titlebar-bottom", Math.ceil(titlebar.getBoundingClientRect().bottom) + "px");
    });
    watcher.observe(bar);
    if (titlebar) watcher.observe(titlebar);
    watchers.push(watcher);
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
    watchers.push(watcher);
  }

  openTab(curId); render(); paintLayout(); repaintMaterials();
  // A work's own draft is known once the list arrives (the composer puts it back only into an empty box).
  // Changes already done before this page loaded are not news; only ones completing from now on are announced.
  loadWorks().then(() => { worksArrived(); restIfStale(); if (curId) return reload().then(poll); }).finally(() => { worksArrived(); announcing = true; });
  return { isOpen: () => Boolean(panel && !panel.hidden),
    /** Words for the input, as if typed (the project list's prompts); nothing is sent. */
    fill: (text) => { setWords(text); input.focus(); },
    /** Search's 问助理: the words go now, to where the next Send goes. */
    ask: (text) => say(text, {}),
    /** Where a new work goes, as the page changes what it is about: a project, or null for the person's own space. */
    setProject: (next) => {
      const chosen = next?.id ? next : null;
      if (chosen?.id === project?.id) { project = chosen; paintAim(); paintSum(); return; }
      project = chosen; tabs = savedTabs(); nextScope = project ? "project" : "personal";
      void showWork(store.get(scoped("current")));
    },
    dispose: () => { executorRequest++; document.removeEventListener("molis-work:language-changed", retitleReviews); follower.stop(); retries.stop(); clearInterval(listTimer); cancelAnimationFrame(materialsFrame); watchers.forEach((watcher) => watcher.disconnect()); composer?.destroy(); } };
}`;
