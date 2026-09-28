/**
 * The resident Assistant in the bottom bar: one assistant, many works.
 *
 * Every fact shown here comes from the Host (`/api/assistant`): a work's state is its real run's state, a question is
 * the run's own pending question, a confirmation is the Host's review of the exact effect. The page only decides where
 * the next Send goes, and never sends anything the person did not send.
 */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = String.raw`(host) => {
  const L = host.translate;
  const island = document.querySelector("[data-assistant-island]");
  if (!island) return null;
  const panel = island.querySelector("[data-assistant-panel]");
  const composer = island.querySelector("[data-assistant-composer]");
  const input = island.querySelector("[data-assistant-input]");
  const send = island.querySelector("[data-assistant-send]");
  const thread = island.querySelector("[data-assistant-thread]");
  const empty = island.querySelector("[data-assistant-empty]");
  const worksNav = island.querySelector("[data-assistant-works]");
  const worksToggle = island.querySelector("[data-assistant-works-toggle]");
  const titleEl = island.querySelector("[data-assistant-work-title]");
  const stateEl = island.querySelector("[data-assistant-work-state]");
  const scopeEl = island.querySelector("[data-assistant-work-scope]");
  const target = island.querySelector("[data-assistant-target]");
  const targetLabel = island.querySelector("[data-assistant-target-label]");
  const targetClear = island.querySelector("[data-assistant-target-clear]");
  const newButton = island.querySelector("[data-assistant-new]");
  if (!composer || !input || !send || !thread || !target) return null;
  const project = host.project && host.project.id ? host.project : null;
  const BT = String.fromCharCode(96);
  const FENCE = BT + BT + BT;
  const STATE_LABELS = { idle: "尚未开始", running: "进行中", "waiting-input": "等你回答", "waiting-review": "等你确认", paused: "已暂停",
    completed: "已完成", failed: "没有完成", stopped: "已停止", "needs-check": "需要核对" };
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ } },
  };
  const CURRENT_KEY = "molis.assistant.current";
  const NEW_DRAFT_KEY = "molis.assistant.new-draft";
  let works = [];
  let currentId = store.get(CURRENT_KEY);
  let view = null;
  let busy = false;
  let problem = null;
  let newScope = project ? "project" : "personal";
  let pollTimer = 0, draftTimer = 0;
  // A Send whose outcome is unknown (the connection dropped) is retried with the same id, so the Host starts nothing twice.
  let unsettled = null;

  const api = async (path, method, body) => {
    let response;
    try {
      response = await fetch(host.route("/api/assistant" + path), { method: method || "GET", headers: host.headers(),
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      const failure = new Error(L("连接中断，结果未知；再次发送不会重复提交"));
      failure.unknown = true;
      throw failure;
    }
    let result = {};
    try { result = await response.json(); } catch { /* an empty body is reported by status below */ }
    if (!response.ok) {
      const failure = new Error(result.error || L("助理暂时无法完成"));
      failure.data = result;
      throw failure;
    }
    return result;
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const stateLabel = (state) => L(STATE_LABELS[state] || state || "");
  const scopeLabel = (scope) => !scope ? "" : scope.kind === "personal" ? L("个人")
    : project && scope.project_id === project.id ? (project.title || L("本项目")) : L("另一个项目");
  const currentWork = () => works.find((work) => work.work_id === currentId) || (view && view.work.work_id === currentId ? view.work : null);
  const isLive = (state) => state === "running" || state === "waiting-input" || state === "waiting-review" || state === "paused";
  const setPanel = (open) => { if (panel) panel.hidden = !open; };
  const syncSend = () => { send.disabled = busy || !String(input.value || "").trim(); };

  /* ─── Where the next Send goes ─────────────────────────────────────────── */
  const paintTarget = () => {
    const work = currentWork();
    if (work) {
      targetLabel.textContent = (isLive(work.state) ? L("补充到") : L("继续")) + "：" + work.title;
      target.title = L("下一次发送进入这项工作；点 × 改为开始新工作");
      if (targetClear) targetClear.hidden = false;
      target.dataset.mode = "work";
    } else {
      targetLabel.textContent = L("新工作") + " · " + (newScope === "project" && project ? (project.title || L("本项目")) : L("个人"));
      target.title = project ? L("点击切换：新工作属于本项目，或属于你个人（不需要项目）") : L("新工作属于你个人");
      if (targetClear) targetClear.hidden = true;
      target.dataset.mode = "new";
    }
    input.placeholder = work ? L("补充要求、回答或纠正…") : L("让助理做点什么…");
  };
  const remember = () => store.set(CURRENT_KEY, currentId);

  /* ─── Drafts: every work keeps its own unsent text ─────────────────────── */
  const saveDraft = (immediate) => {
    clearTimeout(draftTimer);
    const id = currentId, text = String(input.value || "");
    const write = () => {
      if (!id) { store.set(NEW_DRAFT_KEY, text || null); return; }
      const work = works.find((row) => row.work_id === id);
      if (work && work.draft === text) return;
      if (work) work.draft = text;
      api("/works/" + encodeURIComponent(id) + "/draft", "POST", { draft: text }).catch(() => { /* kept on the page; the next edit retries */ });
    };
    if (immediate) write(); else draftTimer = setTimeout(write, 700);
  };
  const loadDraft = () => {
    const work = currentWork();
    input.value = work ? (work.draft || "") : (store.get(NEW_DRAFT_KEY) || "");
    syncSend();
  };
  const switchTo = async (id) => {
    if (id === currentId) return;
    saveDraft(true);
    currentId = id; remember(); problem = null; view = null;
    thread.querySelectorAll(":scope > [data-round], :scope > [data-review], :scope > .assistant-problem").forEach((node) => node.remove());
    loadDraft(); render();
    if (id) { await refresh(); schedule(); }
  };

  /* ─── Text: the model's words as plain structure, never as markup ──────── */
  const inline = (parent, text) => {
    const pattern = new RegExp("(\\*\\*[^*]+\\*\\*|" + BT + "[^" + BT + "]+" + BT + ")", "g");
    let last = 0, match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)));
      const token = match[0];
      parent.append(token.startsWith("**") ? el("strong", "", token.slice(2, -2)) : el("code", "", token.slice(1, -1)));
      last = match.index + token.length;
    }
    if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
  };
  const rich = (text) => {
    const root = el("div", "assistant-rich");
    const lines = String(text || "").split("\n");
    let list = null, paragraph = null;
    const close = () => { list = null; paragraph = null; };
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().startsWith(FENCE)) {
        const code = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith(FENCE)) { code.push(lines[index]); index += 1; }
        const pre = el("pre"); pre.append(el("code", "", code.join("\n"))); root.append(pre); close(); continue;
      }
      if (!line.trim()) { close(); continue; }
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) { const node = el("p", "assistant-rich-heading"); inline(node, heading[2]); root.append(node); close(); continue; }
      const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (bullet) {
        const ordered = /^\s*\d/.test(line);
        if (!list || list.tagName !== (ordered ? "OL" : "UL")) { list = el(ordered ? "ol" : "ul"); root.append(list); paragraph = null; }
        const item = el("li"); inline(item, bullet[1]); list.append(item); continue;
      }
      if (!paragraph) { paragraph = el("p"); root.append(paragraph); list = null; }
      else paragraph.append(el("br"));
      inline(paragraph, line);
    }
    return root;
  };

  /* ─── Rendering, updated in place so reading and focus are never disturbed ─ */
  const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
  const keyed = (parent, attribute, key, create) => {
    let node = [...parent.children].find((child) => child.getAttribute(attribute) === key);
    if (!node) { node = create(); node.setAttribute(attribute, key); parent.append(node); }
    return node;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const activityLine = (item) => {
    const words = { started: "正在：", completed: "已完成：", failed: "失败：", unknown: "结果未确认：" };
    return L(words[item.state] || "") + (item.summary || item.name) + (item.target ? " · " + item.target : "");
  };
  const renderQuestion = (card, work, round, question) => {
    card.replaceChildren();
    card.append(el("p", "assistant-card-title", L("助理在等你回答")), rich(question.prompt));
    const answer = async (payload, button) => {
      if (button) button.disabled = true;
      try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/answer", "POST",
        Object.assign({ run_id: round.run_id, pending_id: question.pending_id, pending_revision: question.pending_revision }, payload)); render(); schedule(); }
      catch (error) { showProblem({ message: error.message }); if (button) button.disabled = false; }
    };
    if (question.answerable === false) { card.append(el("p", "assistant-muted", question.unavailable_reason || L("这个问题暂时不能回答"))); return; }
    if (question.questions && question.questions.length) {
      const form = el("form", "assistant-questionnaire");
      question.questions.forEach((item) => {
        const set = el("fieldset"); set.append(el("legend", "", item.prompt));
        item.options.forEach((option) => {
          const label = el("label"); const box = el("input"); box.type = item.multiple ? "checkbox" : "radio";
          box.name = "q" + item.index; box.value = String(option.index); label.append(box, document.createTextNode(" " + option.label)); set.append(label);
        });
        if (item.allow_other) { const other = el("input", "mw-input"); other.name = "other" + item.index; other.placeholder = L("其他（可选）"); set.append(other); }
        form.append(set);
      });
      const submit = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("提交回答")); submit.type = "submit"; form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const answers = question.questions.map((item) => {
          const indexes = [...form.querySelectorAll('input[name="q' + item.index + '"]:checked')].map((box) => Number(box.value));
          const other = form.querySelector('input[name="other' + item.index + '"]');
          return Object.assign({ question: item.index, indexes }, other && other.value.trim() ? { other: other.value.trim() } : {});
        });
        answer({ answers }, submit);
      });
      card.append(form);
      return;
    }
    if (question.options && question.options.length) {
      const row = el("div", "assistant-card-actions");
      question.options.forEach((option) => {
        const button = el("button", "mw-btn mw-btn--secondary mw-btn--sm", option.label); button.type = "button";
        button.addEventListener("click", () => answer({ text: option.value || option.label }, button));
        row.append(button);
      });
      card.append(row);
    }
    if (question.allows_free_text) {
      const form = el("form", "assistant-answer");
      const field = el("input", "mw-input"); field.placeholder = L("写下回答"); field.setAttribute("aria-label", L("写下回答"));
      const submit = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("回答")); submit.type = "submit";
      form.append(field, submit);
      form.addEventListener("submit", (event) => { event.preventDefault(); if (field.value.trim()) answer({ text: field.value.trim() }, submit); });
      card.append(form);
    }
  };
  const renderReview = (card, work, review) => {
    card.replaceChildren();
    card.append(el("p", "assistant-card-title", L("执行前需要你确认")), el("p", "", review.summary));
    if (review.fields.length) {
      const list = el("dl", "assistant-fields");
      review.fields.forEach((field) => { list.append(el("dt", "", field.label)); list.append(el("dd", "", field.value)); });
      card.append(list);
    }
    const row = el("div", "assistant-card-actions");
    const decide = async (decision) => {
      row.querySelectorAll("button").forEach((one) => { one.disabled = true; });
      try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/reviews/" + encodeURIComponent(review.review_id), "POST", { decision }); render(); schedule(); }
      catch (error) { showProblem({ message: error.message }); row.querySelectorAll("button").forEach((one) => { one.disabled = false; }); }
    };
    const allow = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("允许执行")); allow.type = "button";
    const reject = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("拒绝")); reject.type = "button";
    allow.addEventListener("click", () => decide("approve")); reject.addEventListener("click", () => decide("reject"));
    row.append(allow, reject); card.append(row);
  };
  const renderRound = (work, round) => {
    const node = keyed(thread, "data-round", round.run_id, () => el("section", "assistant-round"));
    const entries = [];
    round.turns.forEach((turn, index) => entries.push({ key: "t:" + turn.turn_id, order: turn.sequence ?? index, turn }));
    round.activity.forEach((item, index) => entries.push({ key: "a:" + item.call_id, order: item.sequence ?? (1000 + index), item }));
    entries.sort((a, b) => a.order - b.order);
    if (!round.turns.some((turn) => turn.kind === "user")) {
      const own = keyed(node, "data-entry", "task", () => el("div", "assistant-msg assistant-msg--user"));
      setText(own, round.text);
    } else node.querySelector(':scope > [data-entry="task"]')?.remove();
    entries.forEach((entry) => {
      if (entry.turn) {
        const turn = entry.turn;
        const kind = turn.kind === "user" ? "user" : turn.kind === "assistant" ? "assistant" : "note";
        const bubble = keyed(node, "data-entry", entry.key, () => el("div", "assistant-msg assistant-msg--" + kind));
        if (bubble.dataset.text !== turn.text) {
          bubble.dataset.text = turn.text;
          if (kind === "assistant") bubble.replaceChildren(rich(turn.text)); else bubble.textContent = turn.text;
        }
        node.append(bubble);
      } else {
        const line = keyed(node, "data-entry", entry.key, () => el("p", "assistant-activity"));
        line.dataset.state = entry.item.state;
        setText(line, activityLine(entry.item));
        node.append(line);
      }
    });
    if (round.materials && round.materials.length) {
      const chips = keyed(node, "data-entry", "materials", () => el("p", "assistant-materials"));
      setText(chips, L("带上的材料") + "：" + round.materials.map((item) => item.title + (item.draft ? L("（草稿）") : "")).join("、"));
    }
    const status = keyed(node, "data-entry", "status", () => el("p", "assistant-round-status"));
    const phase = round.phase;
    status.dataset.phase = phase;
    setText(status, phase === "running" || phase === "starting" || phase === "compacting" ? L("正在处理…")
      : phase === "failed" ? L("这一轮没有完成") + (round.stop_reason ? "：" + round.stop_reason : "")
      : phase === "stopped" || phase === "cancelled" ? L("这一轮已停止，已经发生的操作不会被撤回")
      : phase === "paused" ? L("已暂停，点“继续”接着做")
      : phase === "reconcile-required" ? L("有操作的结果还没确认，请先核对")
      : phase === "unknown" ? L("这一轮的执行记录读不到，结果需要核对") : "");
    status.hidden = !status.textContent;
    node.append(status);
    const questions = round.awaiting_input || [];
    [...node.children].forEach((card) => { if (card.dataset.question && !questions.some((q) => q.pending_id === card.dataset.question)) card.remove(); });
    questions.forEach((question) => {
      const card = keyed(node, "data-question", question.pending_id, () => el("div", "assistant-card assistant-card--question"));
      const signature = JSON.stringify(question);
      if (card.dataset.signature !== signature) { card.dataset.signature = signature; renderQuestion(card, work, round, question); }
      node.append(card);
    });
  };
  const paintHead = () => {
    const work = view && view.work.work_id === currentId ? view.work : currentWork();
    titleEl.textContent = work ? work.title : L("新工作");
    stateEl.textContent = work ? stateLabel(work.state) : "";
    stateEl.dataset.state = work ? work.state : "";
    scopeEl.textContent = work ? scopeLabel(work.scope) : (newScope === "project" && project ? (project.title || L("本项目")) : L("个人"));
    const state = work ? work.state : "idle";
    island.querySelector('[data-assistant-control="pause"]').hidden = state !== "running";
    island.querySelector('[data-assistant-control="resume"]').hidden = state !== "paused";
    island.querySelector('[data-assistant-control="stop"]').hidden = !isLive(state);
  };
  const showProblem = (next) => { problem = next; render(); };
  const render = () => {
    const stick = nearBottom();
    const work = view && view.work.work_id === currentId ? view.work : null;
    if (work) {
      const index = works.findIndex((row) => row.work_id === work.work_id);
      if (index >= 0) works[index] = Object.assign({}, works[index], work, { draft: works[index].draft });
      else works.unshift(work);
    }
    if (empty) empty.hidden = Boolean(currentId);
    const rounds = work ? view.rounds : [];
    [...thread.children].forEach((node) => { if (node.dataset.round && !rounds.some((round) => round.run_id === node.dataset.round)) node.remove(); });
    rounds.forEach((round) => renderRound(work, round));
    const reviews = work ? view.reviews : [];
    [...thread.children].forEach((card) => { if (card.dataset.review && !reviews.some((r) => r.review_id === card.dataset.review)) card.remove(); });
    reviews.forEach((review) => {
      const card = keyed(thread, "data-review", review.review_id, () => el("div", "assistant-card assistant-card--review"));
      if (!card.dataset.painted) { card.dataset.painted = "1"; renderReview(card, work, review); }
      thread.append(card);
    });
    thread.querySelector(":scope > .assistant-problem")?.remove();
    const shown = problem || (work && view.problem) || null;
    if (shown) {
      const box = el("div", "assistant-problem"); box.setAttribute("role", "alert");
      box.append(el("p", "", shown.message));
      if (shown.action) {
        if (/模型/.test(shown.action)) { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", L(shown.action)); link.href = "/settings/models"; box.append(link); }
        else box.append(el("p", "assistant-muted", L(shown.action)));
      }
      thread.append(box);
    }
    paintHead(); paintTarget(); paintWorks();
    if (stick) thread.scrollTop = thread.scrollHeight;
  };

  /* ─── The list of works ────────────────────────────────────────────────── */
  const paintWorks = () => {
    if (!worksNav || worksNav.hidden) return;
    const focused = document.activeElement && worksNav.contains(document.activeElement) ? document.activeElement.dataset.workId || "new" : null;
    worksNav.replaceChildren();
    const fresh = el("button", "assistant-works-item assistant-works-new", L("＋ 新工作")); fresh.type = "button"; fresh.dataset.workId = "new";
    fresh.addEventListener("click", () => { setWorks(false); switchTo(null); input.focus(); });
    worksNav.append(fresh);
    if (!works.length) worksNav.append(el("p", "assistant-muted", L("还没有工作。发送一句话就会开始第一项。")));
    works.forEach((work) => {
      const item = el("button", "assistant-works-item"); item.type = "button"; item.dataset.workId = work.work_id;
      if (work.work_id === currentId) item.setAttribute("aria-current", "true");
      const meta = el("span", "assistant-works-meta", stateLabel(work.state) + " · " + scopeLabel(work.scope));
      meta.dataset.state = work.state;
      item.append(el("span", "assistant-works-title", work.title), meta);
      item.addEventListener("click", () => { setWorks(false); switchTo(work.work_id); });
      worksNav.append(item);
    });
    if (focused) [...worksNav.querySelectorAll("button")].find((button) => button.dataset.workId === focused)?.focus();
  };
  const setWorks = (open) => {
    if (!worksNav) return;
    worksNav.hidden = !open;
    worksToggle?.setAttribute("aria-expanded", String(open));
    if (open) { paintWorks(); (worksNav.querySelector("[aria-current]") || worksNav.querySelector("button"))?.focus(); loadWorks(); }
  };
  const loadWorks = async () => {
    try {
      const result = await api("/works");
      const drafts = new Map(works.map((work) => [work.work_id, work.draft]));
      works = (result.works || []).map((work) => drafts.has(work.work_id) && work.work_id === currentId ? Object.assign(work, { draft: drafts.get(work.work_id) }) : work);
      if (currentId && !works.some((work) => work.work_id === currentId)) { currentId = null; remember(); view = null; }
      paintWorks(); paintTarget(); paintHead();
    } catch { /* the list stays as it was; the next refresh retries */ }
  };

  /* ─── Keeping up with a running work ───────────────────────────────────── */
  const refresh = async () => {
    if (!currentId) return;
    const id = currentId;
    try { const next = await api("/works/" + encodeURIComponent(id)); if (id === currentId) { view = next; render(); } }
    catch (error) {
      if (error.data && error.data.code === "assistant.not_found") { currentId = null; remember(); view = null; render(); return; }
      if (id === currentId) showProblem({ message: error.message });
    }
  };
  const schedule = () => {
    clearTimeout(pollTimer);
    if (!currentId) return;
    const state = view && view.work.work_id === currentId ? view.work.state : null;
    // A hidden page still follows a live work, slowly, so it is current when the person looks again.
    const delay = !isLive(state) ? 0 : document.hidden ? 8000 : state === "running" ? 1200 : 4000;
    if (delay) pollTimer = setTimeout(async () => { await refresh(); schedule(); }, delay);
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh().then(schedule); loadWorks(); } });
  const listTimer = setInterval(() => { if (!document.hidden && panel && !panel.hidden) loadWorks(); }, 15000);

  /* ─── Sending ──────────────────────────────────────────────────────────── */
  const pageContext = () => {
    const current = document.querySelector("[data-plugin-picker-current]");
    const active = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    const surface = (active && active.dataset.pluginId) || "home";
    const title = current ? current.textContent.trim() : "";
    return { source: Object.assign({ surface }, title ? { title } : {}), captured_at: new Date().toISOString() };
  };
  let typed = false;
  input.addEventListener("input", () => { typed = true; syncSend(); saveDraft(false); });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    syncSend();
    if (!send.disabled) composer.requestSubmit(send);
  });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(input.value || "").trim();
    if (!text || busy) return;
    busy = true; syncSend(); problem = null; setPanel(true);
    const requestId = unsettled && unsettled.text === text && unsettled.work === currentId ? unsettled.id : crypto.randomUUID();
    const body = { text, request_id: requestId, context: pageContext() };
    if (currentId) body.work_id = currentId;
    else body.scope = newScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    unsettled = { id: requestId, text, work: currentId };
    try {
      const result = await api("/send", "POST", body);
      unsettled = null;
      clearTimeout(draftTimer);
      // Sent text is nobody's draft any more, including the new-work draft it may have started as.
      if (!currentId || store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
      currentId = result.work.work_id; remember();
      if (String(input.value || "").trim() === text) input.value = "";
      const index = works.findIndex((work) => work.work_id === result.work.work_id);
      if (index >= 0) works[index] = result.work; else works.unshift(result.work);
      if (result.outcome === "steered") host.showToast?.(L("已补充到正在进行的这一轮"));
      if (result.outcome === "answered") host.showToast?.(L("已作为回答发送"));
      await refresh();
    } catch (error) {
      if (!error.unknown) unsettled = null;
      const data = error.data || {};
      if (data.work) {
        // The Host kept the text as this work's draft; it is no longer the new-work draft.
        if (store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
        currentId = data.work.work_id; remember();
        const index = works.findIndex((work) => work.work_id === data.work.work_id);
        if (index >= 0) works[index] = data.work; else works.unshift(data.work);
      }
      problem = { message: error.message + (error.unknown ? "" : "。" + L("输入已保留")), action: data.action };
      if (currentId) await refresh(); else render();
    } finally { busy = false; syncSend(); schedule(); }
  });

  /* ─── Head controls ────────────────────────────────────────────────────── */
  island.querySelectorAll("[data-assistant-control]").forEach((button) => button.addEventListener("click", async () => {
    if (!currentId) return;
    button.disabled = true;
    try { view = await api("/works/" + encodeURIComponent(currentId) + "/control", "POST", { kind: button.dataset.assistantControl }); render(); }
    catch (error) { showProblem({ message: error.message }); }
    finally { button.disabled = false; schedule(); }
  }));
  newButton?.addEventListener("click", () => { switchTo(null); input.focus(); });
  worksToggle?.addEventListener("click", () => setWorks(worksNav.hidden));
  target.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-assistant-target-clear]")) { switchTo(null); input.focus(); return; }
    if (currentWork()) { setPanel(true); refresh().then(schedule); return; }
    if (project) { newScope = newScope === "project" ? "personal" : "project"; paintTarget(); paintHead(); }
  });
  worksNav?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setWorks(false); worksToggle?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...worksNav.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    event.preventDefault();
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  });

  loadDraft(); render();
  // The work's own draft is known only once the list arrives; fill it then unless the person has already typed.
  loadWorks().then(() => { if (!typed) loadDraft(); if (currentId) refresh().then(schedule); });
  return { isOpen: () => Boolean(panel && !panel.hidden), dispose: () => { clearTimeout(pollTimer); clearInterval(listTimer); } };
}`;
