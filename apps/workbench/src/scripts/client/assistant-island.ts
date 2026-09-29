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
  const targetWrap = island.querySelector("[data-assistant-target-wrap]");
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
  let newExecutor = "assistant";
  // The first round's mode for a new Coding work; after that the session keeps it.
  let newMode = "execute";
  const executorButton = island.querySelector("[data-assistant-executor]");
  const executorLabel = island.querySelector("[data-assistant-executor-label]");
  const executorsPop = island.querySelector("[data-assistant-executors]");
  const openExecutor = island.querySelector("[data-assistant-open-executor]");
  const handoverButton = island.querySelector("[data-assistant-handover]");
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
    const work = currentWork();
    const chosen = work ? work.executor && work.executor.mode : newMode;
    modesPop.replaceChildren(el("p", "assistant-popover-title", L(work ? "下一轮的方式（与 Coding 页面同一设置）" : "第一轮的方式")));
    MODES.forEach((mode) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (chosen === mode.id) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(mode.label)), el("span", "assistant-material-origin", " " + L(mode.hint)));
      item.addEventListener("click", async () => {
        setModes(false);
        if (!work) { newMode = mode.id; paintTarget(); input.focus(); return; }
        try {
          view = await api("/works/" + encodeURIComponent(work.work_id) + "/mode", "POST", { mode: mode.id }); render();
          window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: "coding.sessions.update", session_id: view.work.executor.session_id } }));
        }
        catch (error) { showProblem({ message: error.message }); }
        input.focus();
      });
      modesPop.append(item);
    });
    (modesPop.querySelector("[aria-current]") || modesPop.querySelector("button"))?.focus();
  };
  // The choice is made against what is saved now, not what this panel last read.
  modeButton?.addEventListener("click", async () => { if (!modesPop.hidden) { setModes(false); return; } if (currentId) await refresh().catch(() => {}); setModes(true); });
  // Which Character carries the next round: the work's own choice, or one made here that the next Send brings along.
  // Only the Assistant's own project work has Characters (they are published per project); a Coding work picks its own.
  const characterButton = island.querySelector("[data-assistant-character]");
  const characterLabel = island.querySelector("[data-assistant-character-label]");
  const charactersPop = island.querySelector("[data-assistant-characters]");
  let newCharacter = null, pendingCharacter;
  const chosenCharacter = () => { const work = currentWork(); return work ? (pendingCharacter !== undefined ? pendingCharacter : work.character || null) : newCharacter; };
  const characterAllowed = () => { const work = currentWork();
    return work ? work.executor.kind !== "coding" && work.scope.kind === "project" : newExecutor === "assistant" && newScope === "project" && Boolean(project); };
  const setCharacters = async (open) => {
    if (!charactersPop) return;
    charactersPop.hidden = !open;
    characterButton?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = currentWork(), chosen = chosenCharacter();
    charactersPop.replaceChildren(el("p", "assistant-popover-title", L("由哪个角色负责（从下一轮开始）")));
    let choices = [];
    try { choices = (await api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : ""))).characters; }
    catch (error) { charactersPop.append(el("p", "assistant-material-origin", error.message)); }
    const pick = (value) => { setCharacters(false); if (work) pendingCharacter = value; else newCharacter = value; paintTarget(); input.focus(); };
    const own = el("button", "assistant-starter"); own.type = "button";
    if (!chosen) own.setAttribute("aria-current", "true");
    own.append(el("strong", "", L("助理自己")), el("span", "assistant-material-origin", " " + L("不指定角色")));
    own.addEventListener("click", () => pick(null));
    charactersPop.append(own);
    choices.forEach((choice) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      const same = chosen && chosen.artifact_id === choice.reference.artifact_id && chosen.version === choice.reference.version;
      if (same) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", choice.title), el("span", "assistant-material-origin", " v" + choice.reference.version + (choice.available ? "" : " · " + (choice.reason || L("当前不可用")))));
      // An unavailable version is shown with why, and cannot be chosen: nothing runs under a name it is not.
      if (!choice.available) item.disabled = true;
      else item.addEventListener("click", () => pick({ artifact_id: choice.reference.artifact_id, version: choice.reference.version, title: choice.title }));
      charactersPop.append(item);
    });
    if (!choices.length) charactersPop.append(el("p", "assistant-material-origin", L("这个项目里还没有你发布的 Character；在 Characters 里新建并发布后就能选择。")));
    (charactersPop.querySelector("[aria-current]") || charactersPop.querySelector("button:not([disabled])"))?.focus();
  };
  characterButton?.addEventListener("click", async () => { if (!charactersPop.hidden) { setCharacters(false); return; } if (currentId) await refresh().catch(() => {}); await setCharacters(true); });
  // A surface says the person changed something there that this work may show: read the work again.
  window.addEventListener("molis:assistant-surface-changed", (event) => {
    const detail = event.detail || {}, work = currentWork();
    const id = detail.object && detail.object.id;
    if (!work || !id || !(work.executor && work.executor.session_id === id)) return;
    void refresh().then(schedule).catch(() => {});
  });
  const codingHere = () => Boolean(project && document.querySelector('.plugin-rail-items [data-plugin-id="coding"]'));
  let pollTimer = 0, draftTimer = 0, draftWrite = Promise.resolve();
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
  const scopeLabel = (scope, title) => !scope ? "" : scope.kind === "personal" ? L("个人")
    : title || (project && scope.project_id === project.id ? (project.title || L("本项目")) : L("另一个项目"));
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
      if (targetWrap) targetWrap.dataset.mode = "work";
    } else {
      targetLabel.textContent = L("新工作") + " · " + (newScope === "project" && project ? (project.title || L("本项目")) : L("个人"));
      target.title = project ? L("点击切换：新工作属于本项目，或属于你个人（不需要项目）") : L("新工作属于你个人");
      if (targetClear) targetClear.hidden = true;
      if (targetWrap) targetWrap.dataset.mode = "new";
    }
    input.placeholder = work ? L("补充要求、回答或纠正…") : newExecutor === "coding" ? L("让 Coding Agent 做点什么…") : L("让助理做点什么…");
    // A Coding work shows the mode its next round runs in — the session's own setting, the same one its page shows.
    if (modeButton) {
      // A new work that continues an open Coding session runs in that session's own mode, shown once it is the work's.
      const coding = work ? work.executor && work.executor.kind === "coding" : newExecutor === "coding" && codingHere() && !openCodingSession();
      modeButton.hidden = !coding;
      if (coding && modeLabel) {
        const label = L("方式") + "：" + L((MODES.find((one) => one.id === (work ? work.executor.mode : newMode)) || { label: "执行" }).label);
        modeLabel.textContent = label;
        modeButton.setAttribute("aria-label", L(work ? "下一轮的方式" : "第一轮的方式") + " · " + label);
      }
    }
    if (characterButton) {
      const allowed = characterAllowed(), chosen = chosenCharacter();
      characterButton.hidden = !allowed;
      characterButton.toggleAttribute("data-chosen", Boolean(allowed && chosen));
      if (allowed && characterLabel) {
        characterLabel.textContent = L("角色") + "：" + (chosen ? chosen.title : L("助理"));
        characterButton.setAttribute("aria-label", L("由哪个角色负责") + " · " + (chosen ? chosen.title + " v" + chosen.version : L("助理自己")));
      }
    }
    // Who carries the next new work: chosen before sending; an existing work keeps its own.
    if (executorButton) {
      executorButton.hidden = Boolean(work) || !codingHere();
      if (!codingHere() && newExecutor !== "assistant") newExecutor = "assistant";
      executorButton.toggleAttribute("data-chosen", newExecutor !== "assistant");
      if (executorLabel) executorLabel.textContent = L((EXECUTORS.find((one) => one.id === newExecutor) || EXECUTORS[0]).label)
        + (newExecutor === "coding" && openCodingSession() ? " · " + L("当前会话") : "");
    }
  };
  const setExecutors = (open) => {
    if (!executorsPop) return;
    executorsPop.hidden = !open;
    executorButton?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    executorsPop.replaceChildren(el("p", "assistant-popover-title", L("由谁来做")));
    EXECUTORS.filter((one) => one.id !== "coding" || codingHere()).forEach((one) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (one.id === newExecutor) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(one.label)), el("span", "assistant-material-origin", " " + L(one.hint)));
      item.addEventListener("click", () => { newExecutor = one.id; setExecutors(false); paintTarget(); paintHead(); input.focus(); });
      executorsPop.append(item);
    });
    (executorsPop.querySelector("[aria-current]") || executorsPop.querySelector("button"))?.focus();
  };
  executorButton?.addEventListener("click", () => setExecutors(executorsPop.hidden));
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
      draftWrite = api("/works/" + encodeURIComponent(id) + "/draft", "POST", { draft: text }).catch(() => { /* kept on the page; the next edit retries */ });
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
    currentId = id; remember(); problem = null; view = null; pendingCharacter = undefined;
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
  const VERBS = { lookup: "查找能力", read: "读取", change: "修改", ask: "向你提问", todo: "更新待办", "lookup-tools": "查找工具",
    delegate: "委托子任务", "delegate-check": "查看子任务", "delegate-follow-up": "让子任务补改", "delegate-stop": "停止子任务",
    "memory-keep": "记下你的要求", "memory-list": "查看记住的事", "memory-forget": "删除一条记忆",
    "file-read": "读取文件", "file-list": "查看目录", "file-search": "搜索代码", "file-change": "修改文件", command: "运行命令", "command-output": "查看命令输出", "auto-continue": "自动续做" };
  const REASONS = { "not-authorized": "未获授权，没有执行", declined: "你拒绝了，没有执行", interrupted: "这一轮停止了，没有执行", unavailable: "这项能力已关闭或不再可用，没有执行" };
  const activityLine = (item) => {
    const verb = L(VERBS[item.verb] || item.verb);
    const what = item.target ? " " + item.target : "";
    if (item.state === "started") return L("正在") + verb + what;
    if (item.state === "completed") return L("已") + verb + what;
    if (item.state === "failed") return verb + what + " — " + L(REASONS[item.reason] || "没有完成");
    return verb + what + " — " + L("结果未确认");
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
    const plain = review.fields.filter((field) => field.label !== "完整参数" && field.label !== "能力");
    if (plain.length) {
      const list = el("dl", "assistant-fields");
      plain.forEach((field) => {
        list.append(el("dt", "", L(field.label)));
        const cell = el("dd");
        // A diff or command reads as code: kept exact, monospaced, with added and removed lines told apart.
        if (field.label === "改动" || field.label === "命令" || field.label === "参数") {
          const pre = el("pre", "assistant-diff");
          field.value.split("\n").forEach((line) => pre.append(el("span", line.startsWith("+ ") ? "is-added" : line.startsWith("- ") ? "is-removed" : "", line + "\n")));
          cell.append(pre);
        } else cell.textContent = field.value;
        list.append(cell);
      });
      card.append(list);
    }
    const exact = review.fields.filter((field) => field.label === "完整参数" || field.label === "能力");
    if (exact.length) {
      const more = el("details", "assistant-exact"); more.append(el("summary", "", L("准确参数与能力")));
      exact.forEach((field) => { more.append(el("p", "assistant-muted", L(field.label))); more.append(el("pre", "", field.value)); });
      card.append(more);
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
  const EFFECTS = { read: "只读取，不改数据", write: "会修改数据，可在原处修改或撤回", irreversible: "会修改数据，不可撤回" };
  const CARD_STATUS = { running: "正在执行…", done: "已完成", failed: "没有完成", unknown: "结果未确认，请到原处核对，不会自动重试", stale: "已失效", dismissed: "已忽略", "needs-input": "还需要你填写" };
  const renderCard = (node, work, card) => {
    node.replaceChildren();
    node.dataset.status = card.status;
    node.append(el("p", "assistant-card-title", card.title), el("p", "", card.summary),
      el("p", "assistant-muted", card.provider + " · " + card.capability_title + " · " + L(EFFECTS[card.effect] || "")));
    const open = card.status === "ready" || card.status === "needs-input" || card.status === "failed";
    const inputs = {};
    if (card.fields.length) {
      const list = el("dl", "assistant-fields");
      card.fields.forEach((field) => {
        const asked = card.missing.find((item) => item.field === field.key);
        list.append(el("dt", "", asked ? asked.question : L(field.label)));
        const cell = el("dd");
        if (field.editable && open) {
          const control = el(field.value.includes("\n") || field.value.length > 60 ? "textarea" : "input", "mw-input");
          control.value = field.value; control.setAttribute("aria-label", asked ? asked.question : field.label);
          if (control.tagName === "TEXTAREA") control.rows = Math.min(8, field.value.split("\n").length + 1);
          inputs[field.key] = control; cell.append(control);
        } else cell.textContent = field.value;
        list.append(cell);
      });
      node.append(list);
    }
    if (card.outcome || CARD_STATUS[card.status]) {
      const status = el("p", "assistant-card-status", L(CARD_STATUS[card.status] || "") + (card.outcome ? "：" + card.outcome : ""));
      status.setAttribute("role", "status"); node.append(status);
    }
    if (card.status === "stale") {
      // Only an explicit request: the Assistant re-reads and offers a fresh card; nothing runs in this one's place.
      const redo = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("请助理按最新状态重新准备")); redo.type = "button";
      redo.addEventListener("click", async () => {
        redo.disabled = true;
        try {
          await api("/send", "POST", { work_id: work.work_id, request_id: crypto.randomUUID(),
            text: L("建议「") + card.title + L("」没有执行：数据在建议之后变化了。请读取最新状态，重新准备这一项的操作卡。") });
          await refresh(); schedule();
        } catch (error) { showProblem({ message: error.message }); redo.disabled = false; }
      });
      node.append(redo);
    }
    if (!open) return;
    const row = el("div", "assistant-card-actions");
    const runButton = el("button", "mw-btn mw-btn--primary mw-btn--sm", card.status === "failed" ? L("再试一次") + "：" + card.title : card.title); runButton.type = "button";
    const dismiss = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("忽略")); dismiss.type = "button";
    runButton.addEventListener("click", async () => {
      row.querySelectorAll("button").forEach((one) => { one.disabled = true; });
      const values = {};
      Object.entries(inputs).forEach(([key, control]) => { values[key] = control.value; });
      try {
        const next = await api("/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/run", "POST", { revision: card.revision, values });
        if (view && view.work.work_id === work.work_id) view.cards = view.cards.map((one) => one.card_id === next.card_id ? next : one);
        if (next.status === "done") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: next.capability_id } }));
        render();
      } catch (error) { showProblem({ message: error.message }); row.querySelectorAll("button").forEach((one) => { one.disabled = false; }); }
    });
    dismiss.addEventListener("click", async () => {
      try { const next = await api("/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/dismiss", "POST", {});
        if (view) view.cards = view.cards.map((one) => one.card_id === next.card_id ? next : one); render(); }
      catch (error) { showProblem({ message: error.message }); }
    });
    row.append(runButton, dismiss); node.append(row);
  };
  const renderCards = (parent, work, cards) => {
    // A card the person set aside leaves the list, like one that is gone.
    const shown = cards.filter((card) => card.status !== "dismissed");
    [...parent.children].forEach((child) => { if (child.dataset.card && !shown.some((card) => card.card_id === child.dataset.card)) child.remove(); });
    shown.forEach((card) => {
      const node = keyed(parent, "data-card", card.card_id, () => el("div", "assistant-card assistant-card--action"));
      const signature = card.revision + ":" + card.status;
      if (node.dataset.signature !== signature) { node.dataset.signature = signature; renderCard(node, work, card); }
      parent.append(node);
    });
  };
  const renderRound = (work, round) => {
    const node = keyed(thread, "data-round", round.run_id, () => el("section", "assistant-round"));
    const entries = [];
    round.turns.forEach((turn, index) => entries.push({ key: "t:" + turn.turn_id, order: turn.sequence ?? index, turn }));
    round.activity.forEach((item, index) => entries.push({ key: "a:" + item.call_id, order: item.sequence ?? (1000 + index), item }));
    entries.sort((a, b) => a.order - b.order);
    // Which Agent ran this round, when the work changed hands.
    if (round.executor === "coding") { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); setText(tag, L("由 Coding Agent 执行")); }
    else if (round.character) { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); setText(tag, L("由角色负责") + "：" + round.character.title + " v" + round.character.version); }
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
        if (entry.item.detail) line.title = entry.item.detail; else line.removeAttribute("title");
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
    renderCards(node, work, ((view && view.cards) || []).filter((card) => card.run_id === round.run_id));
  };
  const paintHead = () => {
    const work = view && view.work.work_id === currentId ? view.work : currentWork();
    titleEl.textContent = work ? work.title : L("新工作");
    stateEl.textContent = work ? stateLabel(work.state) : "";
    stateEl.dataset.state = work ? work.state : "";
    scopeEl.textContent = work ? scopeLabel(work.scope, work.scope_title) : (newScope === "project" && project ? (project.title || L("本项目")) : L("个人"));
    // Which Agent carries this work, and the way into its own professional page.
    if (openExecutor) {
      const coding = work && work.executor && work.executor.kind === "coding";
      openExecutor.hidden = !coding;
      if (coding) {
        openExecutor.textContent = L("由 Coding Agent 执行") + (work.executor.session_id ? " · " + L("打开 Coding") : "");
        openExecutor.disabled = !work.executor.session_id || !host.openItem;
        openExecutor.onclick = () => { if (work.executor.session_id) host.openItem?.("coding", work.executor.session_id, work.title); };
      }
    }
    // The same work can change hands between rounds: to Coding in its project, and back to the Assistant.
    if (handoverButton) {
      const between = work && !isLive(work.state);
      const toCoding = work && work.executor && work.executor.kind === "assistant" && work.scope.kind === "project" && codingHere();
      const toAssistant = work && work.executor && work.executor.kind === "coding";
      handoverButton.hidden = !between || !(toCoding || toAssistant);
      if (!handoverButton.hidden) {
        handoverButton.textContent = toCoding ? L("交给 Coding 继续") : L("回到助理");
        handoverButton.onclick = async () => {
          handoverButton.disabled = true;
          try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/handover", "POST", { to: toCoding ? "coding" : "assistant" }); render(); input.focus(); }
          catch (error) { showProblem({ message: error.message }); }
          finally { handoverButton.disabled = false; }
        };
      }
    }
    const state = work ? work.state : "idle";
    island.querySelector('[data-assistant-control="pause"]').hidden = state !== "running";
    island.querySelector('[data-assistant-control="resume"]').hidden = state !== "paused";
    /* Stop also reaches the sub-tasks it handed out, so it stays offered while any of them still runs. */
    const liveChildren = work && view && view.delegated ? view.delegated.filter((child) => isLive(child.state)).length : 0;
    island.querySelector('[data-assistant-control="stop"]').hidden = !isLive(state) && !liveChildren;
  };
  const showProblem = (next) => { problem = next; render(); };
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
  const objectsBox = island.querySelector("[data-assistant-objects]");
  const RELATION_LABEL = { origin: "起点", material: "材料", result: "成果", session: "专业会话" };
  const objectState = (object) => object.state === "changed" ? L("已被修改") + " · " + L("现为版本") + " " + object.current_revision + " · " + L("这项工作记下版本") + " " + object.recorded_revision
    : object.state === "missing" ? L("已不存在") : object.state === "unavailable" ? L("暂时读不到")
    : object.state === "moved" ? (object.moved_to ? L("已移到") + "「" + object.moved_to.title + "」" : L("在别的项目里"))
    : object.current_revision ? L("未变") + " · " + L("版本") + " " + object.current_revision : L("可用");
  const renderObjects = (work) => {
    if (!objectsBox) return;
    const objects = work && view.objects ? view.objects : [];
    const signature = JSON.stringify([work && work.work_id, objects.map((o) => [o.relation, o.subject.kind, o.subject.id, o.state, o.current_revision, o.recorded_revision, o.title])]);
    if (objectsBox.dataset.signature === signature) return;
    objectsBox.dataset.signature = signature;
    objectsBox.hidden = !objects.length;
    if (!objects.length) { objectsBox.replaceChildren(); return; }
    const changed = objects.filter((o) => o.state === "changed").length;
    const gone = objects.filter((o) => o.state === "missing").length;
    const moved = objects.filter((o) => o.state === "moved").length;
    const wasOpen = objectsBox.querySelector("details")?.open;
    const details = el("details", "assistant-objects-list");
    details.open = wasOpen === undefined ? changed + gone + moved > 0 : wasOpen;
    details.append(el("summary", "", L("这项工作的对象") + " · " + objects.length + (changed ? " · " + changed + " " + L("项已被修改") : "") + (gone ? " · " + gone + " " + L("项已不存在") : "") + (moved ? " · " + moved + " " + L("项已移走") : "")));
    const list = el("ul", "assistant-objects-items");
    objects.forEach((object) => {
      const row = el("li", "assistant-object assistant-object--" + object.state);
      row.append(el("span", "assistant-object-relation", L(RELATION_LABEL[object.relation] || object.relation)), el("span", "assistant-object-title", object.title),
        el("span", "assistant-object-state", objectState(object)));
      if (object.open && host.openItem) {
        const open = el("button", "assistant-object-open", L("打开")); open.type = "button";
        open.setAttribute("aria-label", L("打开") + "：" + object.title);
        open.addEventListener("click", () => host.openItem(object.open.surface, object.open.id, object.title));
        row.append(open);
      }
      list.append(row);
    });
    details.append(list);
    objectsBox.replaceChildren(details);
  };
  /* What this work used (its sub-tasks with it) and the cap the person gave it; a sub-task shows its delegating work's. */
  const usageBox = island.querySelector("[data-assistant-usage]");
  const renderUsage = (work) => {
    if (!usageBox) return;
    const usage = work && view && view.usage ? view.usage : null;
    const signature = JSON.stringify([work && work.work_id, usage]);
    if (usageBox.dataset.signature === signature) return;
    const wasOpen = usageBox.querySelector("details")?.open;
    usageBox.dataset.signature = signature;
    usageBox.hidden = !usage;
    if (!usage) { usageBox.replaceChildren(); return; }
    const number = (value) => Number(value).toLocaleString("en-US");
    const over = usage.budget_tokens !== null && usage.tokens >= usage.budget_tokens;
    const details = el("details", "assistant-objects-list");
    details.open = wasOpen === undefined ? over : wasOpen;
    details.append(el("summary", "", L("用量") + " · " + number(usage.tokens) + " tokens" + (usage.budget_tokens !== null ? " / " + L("上限") + " " + number(usage.budget_tokens) : "") + (over ? " · " + L("已到上限") : "")));
    if (usage.budget_of) {
      details.append(el("p", "assistant-material-origin", L("子任务按委托它的工作计算") + "：「" + usage.budget_of.title + "」"));
    } else {
      const form = el("form", "assistant-usage-form");
      const field = el("input", "assistant-usage-input"); field.type = "number"; field.min = "1000"; field.step = "1000"; field.inputMode = "numeric";
      field.placeholder = L("不单独设限"); field.value = usage.budget_tokens !== null ? String(usage.budget_tokens) : "";
      field.setAttribute("aria-label", L("这项工作的用量上限（tokens，含子任务）"));
      const save = el("button", "assistant-material-add", L("保存上限")); save.type = "submit";
      form.append(el("span", "assistant-material-origin", L("上限（tokens，含子任务）")), field, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true;
        try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/budget", "POST", { budget_tokens: field.value.trim() === "" ? null : Number(field.value) }); render(); }
        catch (error) { host.showToast?.(error.message); }
        finally { save.disabled = false; }
      });
      details.append(form);
    }
    usageBox.replaceChildren(details);
  };
  /* The work's task board: sub-tasks it handed to works of their own, and for a delegated work, who asked for it. */
  const delegatedBox = island.querySelector("[data-assistant-delegated]");
  const renderDelegated = (work) => {
    if (!delegatedBox) return;
    const children = work && view && view.delegated ? view.delegated : [];
    const parent = work && work.delegated_by ? work.delegated_by : null;
    const scheduled = work && view && view.scheduled ? view.scheduled : [];
    const unsettled = work && view && view.unsettled ? view.unsettled : [];
    const jobs = work && view && view.jobs ? view.jobs : [];
    const undoable = work && view && view.undoable ? view.undoable : [];
    const signature = JSON.stringify([work && work.work_id, children.map((c) => [c.work_id, c.state, c.follow_ups, c.title, c.taken_back]), parent && parent.work_id,
      scheduled.map((f) => [f.followup_id, f.next_at, f.enabled, f.last && f.last.outcome]), unsettled.map((u) => [u.change_id, u.state]), jobs.map((j) => [j.job_id, j.state, j.last_state]),
      undoable.map((u) => [u.undo_id, u.state, u.detail])]);
    if (delegatedBox.dataset.signature === signature) return;
    delegatedBox.dataset.signature = signature;
    delegatedBox.hidden = !children.length && !parent && !scheduled.length && !unsettled.length && !jobs.length && !undoable.length;
    delegatedBox.replaceChildren();
    /* Changes this work made that say how they are taken back: one click undoes it, once. */
    const UNDO = { available: "可以撤销", undone: "已撤销", failed: "没能撤销" };
    undoable.slice().reverse().forEach((change) => {
      const row = el("p", "assistant-object");
      row.append(el("span", "assistant-object-relation", L("修改")), el("span", "assistant-object-title", change.title),
        el("span", "assistant-object-state", L(UNDO[change.state] || change.state) + (change.detail ? "：" + change.detail : "")));
      if (change.state !== "undone") {
        const undo = el("button", "assistant-object-open", L("撤销")); undo.type = "button";
        undo.setAttribute("aria-label", L("撤销") + "：" + change.title);
        undo.addEventListener("click", async () => {
          undo.disabled = true;
          try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/undo/" + encodeURIComponent(change.undo_id), "POST", {}); render(); }
          catch (error) { host.showToast?.(error.message); undo.disabled = false; }
        });
        row.append(undo);
      }
      delegatedBox.append(row);
    });
    /* Background work this work started in plugins, followed until it ends. */
    const JOB = { running: "后台进行中", completed: "后台已完成", failed: "后台没有完成", unknown: "不再跟进，请到原处查看" };
    jobs.forEach((job) => {
      const row = el("p", "assistant-object");
      row.append(el("span", "assistant-object-relation", L("后台任务")), el("span", "assistant-object-title", job.title),
        el("span", "assistant-object-state", L(JOB[job.state] || job.state) + (job.last_state ? "（" + job.last_state + "）" : "")));
      delegatedBox.append(row);
    });
    /* A change still with its owner when the round stopped: what it finally did, never re-sent. */
    const SETTLED = { pending: "还在等它的结果，不会重新提交", completed: "停止后已完成", failed: "停止后失败", "not-run": "停止时还没开始，没有执行" };
    unsettled.forEach((change) => {
      const row = el("p", "assistant-object");
      row.append(el("span", "assistant-object-relation", L("停止时仍在执行")), el("span", "assistant-object-title", change.title),
        el("span", "assistant-object-state", L(SETTLED[change.state] || change.state) + (change.detail ? "：" + change.detail : "")));
      delegatedBox.append(row);
    });
    const REPEAT = { none: "一次", daily: "每天", weekly: "每周" }, OUTCOME = { started: "已开始", missed: "错过（当时没在运行）", skipped: "跳过（上一轮未结束）", failed: "没有完成" };
    scheduled.forEach((followUp) => {
      const row = el("p", "assistant-object");
      const when = followUp.enabled && followUp.next_at ? L("下一次") + " " + new Date(followUp.next_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : L("已结束");
      row.append(el("span", "assistant-object-relation", L("定时")), el("span", "assistant-object-title", followUp.label),
        el("span", "assistant-object-state", L(REPEAT[followUp.repeat] || followUp.repeat) + " · " + when
          + (followUp.last ? " · " + L("上次") + L(OUTCOME[followUp.last.outcome] || followUp.last.outcome) : "")
          + (followUp.enabled ? " · " + L(view.schedule_survives_close ? "关闭窗口后仍会执行" : "需要 Molis Work 在运行") : "")));
      if (followUp.enabled) {
        const cancel = el("button", "assistant-object-open", L("取消")); cancel.type = "button";
        cancel.addEventListener("click", async () => { try { await api("/followups/remove", "POST", { followup_id: followUp.followup_id }); await refresh(); } catch (error) { showProblem({ message: error.message }); } });
        row.append(cancel);
      }
      delegatedBox.append(row);
    });
    if (parent) {
      const row = el("p", "assistant-object");
      row.append(el("span", "assistant-object-relation", L("受托于")), el("span", "assistant-object-title", parent.title), el("span", "assistant-object-state", L("验收") + "：" + parent.acceptance));
      const back = el("button", "assistant-object-open", L("打开")); back.type = "button";
      back.addEventListener("click", () => switchTo(parent.work_id));
      row.append(back);
      delegatedBox.append(row);
    }
    if (children.length) {
      const details = el("details", "assistant-objects-list"); details.open = true;
      const waiting = children.filter((c) => c.state === "waiting-review" || c.state === "waiting-input").length;
      details.append(el("summary", "", L("分工") + " · " + children.length + (waiting ? " · " + waiting + " " + L("个在等你") : "")));
      const list = el("ul", "assistant-objects-items");
      children.forEach((child) => {
        const row = el("li", "assistant-object");
        row.append(el("span", "assistant-object-relation", L("子任务")), el("span", "assistant-object-title", child.title),
          el("span", "assistant-object-state", (child.taken_back ? L("已收回") : stateLabel(child.state)) + (child.follow_ups ? " · " + L("补改") + " " + child.follow_ups : "")));
        const open = el("button", "assistant-object-open", L("打开")); open.type = "button";
        open.setAttribute("aria-label", L("打开") + "：" + child.title);
        open.addEventListener("click", () => switchTo(child.work_id));
        row.append(open);
        /* Stop one sub-task from the board, without opening it; what it already did stays. */
        if (["running", "paused", "waiting-input", "waiting-review"].includes(child.state)) {
          const stop = el("button", "assistant-object-open", L("停止")); stop.type = "button";
          stop.setAttribute("aria-label", L("停止") + "：" + child.title);
          stop.addEventListener("click", async () => {
            stop.disabled = true;
            try { await api("/works/" + encodeURIComponent(child.work_id) + "/control", "POST", { kind: "stop" }); await refresh(); }
            catch (error) { stop.disabled = false; showProblem({ message: error.message }); }
          });
          row.append(stop);
        }
        /* Take the part back: it stops, what it made stays, and this work finishes that part itself. */
        if (!child.taken_back) {
          const takeBack = el("button", "assistant-object-open", L("收回")); takeBack.type = "button";
          takeBack.title = L("停下这个子任务，由这项工作自己接着做这一部分；它已产出的保留");
          takeBack.setAttribute("aria-label", L("收回") + "：" + child.title);
          takeBack.addEventListener("click", async () => {
            takeBack.disabled = true;
            try { view = await api("/works/" + encodeURIComponent(child.work_id) + "/take-back", "POST", {}); render(); }
            catch (error) { takeBack.disabled = false; showProblem({ message: error.message }); }
          });
          row.append(takeBack);
        }
        list.append(row);
      });
      details.append(list);
      delegatedBox.append(details);
    }
  };
  const render = () => {
    const stick = nearBottom();
    const work = view && view.work.work_id === currentId ? view.work : null;
    renderObjects(work);
    renderDelegated(work);
    renderUsage(work);
    if (work) {
      const index = works.findIndex((row) => row.work_id === work.work_id);
      if (index >= 0) works[index] = Object.assign({}, works[index], work, { draft: works[index].draft });
      else works.unshift(work);
    }
    if (empty) empty.hidden = Boolean(currentId);
    const rounds = work ? view.rounds : [];
    if (work) announceEffects(work, rounds);
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
                  catch (error) { showProblem({ message: error.message }); }
                });
                list.append(close);
              }
            });
            check.replaceWith(list);
          } catch (error) { showProblem({ message: error.message }); }
        });
        box.append(check);
      }
      if (shown.action) {
        if (/模型/.test(shown.action)) { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", L(shown.action)); link.href = "/settings/models"; box.append(link); }
        // A work's own cap is raised right here, in its usage box; the daily cap lives in the Assistant's settings.
        else if (/这项工作的上限/.test(shown.action) && usageBox) {
          const raise = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L(shown.action)); raise.type = "button";
          raise.addEventListener("click", () => { const details = usageBox.querySelector("details"); if (details) details.open = true; usageBox.querySelector("input")?.focus(); });
          box.append(raise);
        }
        else if (shown.action === "打开设置") { const link = el("a", "mw-btn mw-btn--secondary mw-btn--sm", L("打开助理设置")); link.href = "/settings/assistant"; box.append(link); }
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
      const meta = el("span", "assistant-works-meta", stateLabel(work.state) + " · " + scopeLabel(work.scope, work.scope_title));
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
  // Another window may have changed this work (a Coding mode, a new round): coming back to this one reads it again.
  window.addEventListener("focus", () => { if (!document.hidden && currentId) refresh().then(schedule); });
  const listTimer = setInterval(() => { if (!document.hidden && panel && !panel.hidden) loadWorks(); }, 15000);

  /* ─── What deserves the person's attention (their rules decide where it stays quiet) ─────────────────────── */
  const attentionButton = island.querySelector("[data-assistant-attention]");
  const attentionCount = island.querySelector("[data-assistant-attention-count]");
  const noticesPop = island.querySelector("[data-assistant-notices]");
  let notices = [];
  const shownSurface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  const paintNotices = (force) => {
    if (!noticesPop) return;
    // Polling repaints only what changed, and keeps focus on the same button: a list rebuilt under the person's
    // finger or keyboard focus loses the tap or drops focus to the page.
    const signature = JSON.stringify(notices.map((notice) => [notice.notice_id, notice.text, notice.held && notice.held.reason]));
    if (!force && noticesPop.dataset.signature === signature) return;
    noticesPop.dataset.signature = signature;
    const focused = noticesPop.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? [focused.dataset.noticeId, focused.dataset.noticeAction] : null;
    noticesPop.replaceChildren(el("p", "assistant-popover-title", L("需要你看看")));
    const open = notices.filter((notice) => !notice.held), held = notices.filter((notice) => notice.held);
    const row = (notice) => {
      const item = el("div", "assistant-notice");
      item.append(el("p", "assistant-notice-text", notice.text));
      if (notice.held) item.append(el("p", "assistant-material-origin", L("按你的规则暂不提醒") + "：" + notice.held.reason));
      const actions = el("div", "assistant-offer-actions");
      const go = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("打开")); go.type = "button";
      go.dataset.noticeId = notice.notice_id; go.dataset.noticeAction = "open";
      go.setAttribute("aria-label", L("打开") + "：" + notice.text);
      go.addEventListener("click", async () => {
        setNotices(false);
        // A reminder opens its item where it lives: here when it is this page's project, otherwise on its own project's page.
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
    open.forEach((notice) => noticesPop.append(row(notice)));
    if (held.length) {
      const quiet = el("details", "assistant-notices-held");
      quiet.append(el("summary", "", L("按你的规则暂不提醒") + " · " + held.length));
      held.forEach((notice) => quiet.append(row(notice)));
      noticesPop.append(quiet);
    }
    if (!notices.length) noticesPop.append(el("p", "assistant-material-origin", L("现在没有需要你看的事")));
    if (focusKey) (noticesPop.querySelector('[data-notice-id="' + focusKey[0] + '"][data-notice-action="' + focusKey[1] + '"]') || noticesPop.querySelector("button"))?.focus();
  };
  const paintAttention = () => {
    const open = notices.filter((notice) => !notice.held).length;
    if (attentionButton) {
      attentionButton.hidden = !open;
      if (attentionCount) attentionCount.textContent = open ? String(open) : "";
      attentionButton.setAttribute("aria-label", L("需要你看看") + " · " + open);
    }
    if (noticesPop && !noticesPop.hidden) paintNotices();
  };
  const setNotices = (open) => {
    if (!noticesPop) return;
    noticesPop.hidden = !open;
    attentionButton?.setAttribute("aria-expanded", String(open));
    if (open) { paintNotices(true); noticesPop.querySelector("button")?.focus(); }
  };
  const loadNotices = async () => {
    try { notices = (await api("/notices?surface=" + encodeURIComponent(shownSurface()))).notices || []; }
    catch { return; }
    // A work the person has open in front of them is being seen: its notices need no badge.
    if (panel && !panel.hidden && currentId && notices.some((notice) => notice.work_id === currentId && !notice.held)) { void settleNotice({ work_id: currentId }, "seen"); return; }
    paintAttention();
  };
  const settleNotice = async (target, state) => {
    try { await api("/notices", "POST", Object.assign({ state }, target)); } catch { /* the next read shows it again */ }
    await loadNotices();
  };
  attentionButton?.addEventListener("click", () => setNotices(noticesPop.hidden));
  setInterval(() => { if (!document.hidden) void loadNotices(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void loadNotices(); });
  // The rules depend on where the person is: moving to another plugin reads them again.
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(() => void loadNotices(), 300));
  void loadNotices();

  /* ─── Sending ──────────────────────────────────────────────────────────── */
  /* ─── What the person is looking at, and what goes with this Send ──────── */
  const materialsButton = island.querySelector("[data-assistant-materials]");
  const materialsCount = island.querySelector("[data-assistant-materials-count]");
  const materialsList = island.querySelector("[data-assistant-materials-list]");
  const startersPop = island.querySelector("[data-assistant-starters]");
  const attach = island.querySelector("[data-assistant-attach]");
  const fileInput = island.querySelector("[data-assistant-file]");
  let lastSurface = null;
  let selection = null;
  let files = [];
  const removed = new Set();
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
  const noteSurface = (target) => {
    if (!(target instanceof Element) || island.contains(target)) return;
    const surface = target.closest("[data-assistant-context]");
    if (surface) lastSurface = surface;
  };
  document.addEventListener("focusin", (event) => noteSurface(event.target), true);
  document.addEventListener("pointerdown", (event) => noteSurface(event.target), true);
  document.addEventListener("selectionchange", () => {
    const current = getSelection();
    const node = current && current.anchorNode;
    const element = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!element || island.contains(element)) return;
    const text = current.isCollapsed ? "" : current.toString().trim();
    if (!text) { selection = null; paintMaterials(); return; }
    selection = { text: text.slice(0, 8000), truncated: text.length > 8000, surface: element.closest("[data-assistant-context]") };
    removed.delete("selection");
    paintMaterials();
  });
  /** Official surfaces whose tab item is an object with a shared context reader; a plugin that declares its own context wins. */
  const TAB_KINDS = { pages: "pages_document", coding: "coding_session", inbox: "inbox_entry", feed: "feed_item", goals: "goal", sessions: "session", artifacts: "artifact" };
  // What plugins declare for their searchable objects (kind and the surface it opens in) extends and corrects the list.
  const declaredKinds = {};
  api("/surface-kinds").then((result) => Object.assign(declaredKinds, result.kinds || {})).catch(() => undefined);
  // The last background a plugin page sent (purpose "background"), used while that plugin is the one on show.
  let background = null;
  const surfaceContext = () => {
    const surface = visible(lastSurface) ? lastSurface : [...document.querySelectorAll("[data-assistant-context]")].find(visible);
    if (surface) {
      try { return JSON.parse(surface.getAttribute("data-assistant-context") || "null"); } catch { return null; }
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
  const belongsToWork = (object) => Boolean(view && view.work.work_id === currentId && (view.objects || []).some((item) => item.subject.kind === object.kind && item.subject.id === object.id));
  /** The Coding session open on the page, which a new Coding work continues instead of starting another. */
  const openCodingSession = () => { const context = surfaceContext(); return context && context.object && context.object.kind === "coding_session" ? context.object.id : null; };
  const relatedCache = new Map();
  const relatedWorks = (object) => {
    const key = objectKey(object), held = relatedCache.get(key);
    if (held && Date.now() - held.at < 10000) return held.works;
    relatedCache.set(key, { at: Date.now(), works: held ? held.works : [] });
    api("/related?kind=" + encodeURIComponent(object.kind) + "&id=" + encodeURIComponent(object.id))
      .then((result) => { relatedCache.set(key, { at: Date.now(), works: result.works || [] }); paintMaterials(); }).catch(() => {});
    return held ? held.works : [];
  };
  const pageObject = () => {
    const context = surfaceContext();
    if (!context || !context.object || removed.has("object")) return null;
    const object = context.object;
    const related = !currentId || belongsToWork(object);
    return { object, context, related, included: related || joined.has(objectKey(object)) };
  };
  const clip = (text, size) => text.length > size ? text.slice(0, size - 1) + "…" : text;
  /** The materials this Send would carry, each named and removable; page items are marked as coming from the page. */
  const materialsNow = () => {
    const context = surfaceContext();
    const items = [];
    const page = pageObject();
    if (page) {
      const label = L("正在看") + "：" + (page.object.title || page.object.id);
      if (page.included) items.push({ key: "object", label, auto: !joined.has(objectKey(page.object)), note: currentId && page.related ? L("这项工作的对象") : "" });
      else items.push({ key: "object", label, optional: true });
    }
    if (page && page.included && context.unsaved && context.draft_text && !removed.has("draft")) items.push({ key: "draft", label: L("未保存的修改"), auto: true });
    if (page) relatedWorks(page.object).filter((row) => row.work_id !== currentId).slice(0, 2)
      .forEach((row) => items.push({ key: "work:" + row.work_id, label: L("这个对象属于工作") + "「" + row.title + "」", optional: true, work: row }));
    if (selection && !removed.has("selection")) items.push({ key: "selection", label: L("选中的内容") + "：" + clip(selection.text.replace(/\s+/g, " "), 28), auto: true });
    files.forEach((file) => items.push({ key: "file:" + file.material_id, label: (file.kind === "image" ? L("图片") + "：" : file.reference ? L("引用") + "：" : "") + file.title, auto: false, thumb: file.preview }));
    return items;
  };
  function paintMaterials() {
    if (!materialsButton) return;
    const items = materialsNow();
    const carried = items.filter((item) => !item.optional);
    materialsButton.hidden = !items.length;
    if (materialsCount) materialsCount.textContent = String(carried.length) + (carried.length < items.length ? "+" : "");
    materialsButton.setAttribute("aria-label", L("本次发送带上的材料") + "：" + carried.length + (carried.length < items.length ? "，" + L("另有正在看的对象未加入") : ""));
    if (!materialsList || materialsList.hidden) return;
    materialsList.replaceChildren(el("p", "assistant-popover-title", L("本次发送带上的材料")));
    if (!items.length) materialsList.append(el("p", "assistant-muted", L("没有材料。可以在页面上选中内容，或添加文件。")));
    items.forEach((item) => {
      const row = el("div", "assistant-material" + (item.optional ? " assistant-material--optional" : ""));
      if (item.work) {
        // Another work already holds this object: continuing it there is one click, never automatic.
        row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", stateLabel(item.work.state)));
        const go = el("button", "assistant-material-add", L("切换过去")); go.type = "button";
        go.addEventListener("click", () => { setMaterials(false); switchTo(item.work.work_id); input.focus(); });
        row.append(go); materialsList.append(row); return;
      }
      if (item.optional) {
        // Browsing is not working on it: the person decides whether this round takes it.
        row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", L("与这项工作无关，不会带上")));
        const add = el("button", "assistant-material-add", L("加入本轮")); add.type = "button";
        add.addEventListener("click", () => { const page = pageObject(); if (page) joined.add(objectKey(page.object)); paintMaterials(); materialsList.querySelector("button")?.focus(); });
        row.append(add); materialsList.append(row); return;
      }
      if (item.thumb) { row.classList.add("assistant-material--image"); const thumb = el("img", "assistant-material-thumb"); thumb.src = item.thumb; thumb.alt = ""; row.append(thumb); }
      row.append(el("span", "assistant-material-label", item.label), el("span", "assistant-material-origin", item.note || (item.auto ? L("来自当前页面") : L("你添加的"))));
      const drop = el("button", "assistant-material-remove", "×"); drop.type = "button";
      drop.setAttribute("aria-label", L("不带上") + "：" + item.label);
      drop.addEventListener("click", () => {
        const page = item.key === "object" ? pageObject() : null;
        if (page && joined.has(objectKey(page.object))) joined.delete(objectKey(page.object));
        else if (item.key.startsWith("file:")) files = files.filter((file) => "file:" + file.material_id !== item.key); else removed.add(item.key);
        paintMaterials(); (materialsList.querySelector("button") || materialsButton).focus();
      });
      row.append(drop); materialsList.append(row);
    });
  }
  const setMaterials = (open) => {
    if (!materialsList) return;
    materialsList.hidden = !open;
    materialsButton?.setAttribute("aria-expanded", String(open));
    if (open) { setStarters(false); paintMaterials(); materialsList.querySelector("button")?.focus(); }
  };
  materialsButton?.addEventListener("click", () => setMaterials(materialsList.hidden));
  /* Starting points for the current content: choosing one fills the input and sends nothing. */
  const startersFor = () => {
    const context = surfaceContext();
    const list = [];
    if (selection && !removed.has("selection")) {
      list.push({ label: L("改写选中的内容"), prompt: L("改写我选中的这段内容，保持原意，更清楚") });
      list.push({ label: L("总结选中的内容"), prompt: L("用三句话总结我选中的内容") });
    }
    ((context && context.starters) || []).forEach((starter) => { if (starter && starter.label && starter.prompt) list.push(starter); });
    return list.slice(0, 5);
  };
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
  const slashOpen = () => startersPop && !startersPop.hidden && startersPop.dataset.mode === "slash";
  async function setSlash(query) {
    if (!startersPop) return;
    const q = String(query || "").trim().toLowerCase();
    const starters = startersFor().filter((starter) => !q || starter.label.toLowerCase().includes(q));
    const rows = (await loadCapabilityRows()).filter((row) => !q || [row.title, row.provider, row.description].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 8);
    const methods = (await loadMethodRows()).filter((row) => !q || [row.name, row.plugin_title, row.summary].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 5);
    if (!String(input.value || "").startsWith("/")) return;
    startersPop.dataset.mode = "slash";
    startersPop.hidden = false;
    startersPop.replaceChildren(el("p", "assistant-popover-title", L("用一个方法或能力，或这样开始")));
    starters.forEach((starter) => {
      const button = el("button", "assistant-starter", starter.label); button.type = "button";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => { input.value = starter.prompt; typed = true; syncSend(); saveDraft(false); closeSlash(); input.focus(); });
      startersPop.append(button);
    });
    // A method is how to do it: chosen here, its steps go with this round only.
    methods.forEach((row) => {
      const button = el("button", "assistant-starter", L("方法") + "：" + row.name + " · " + row.plugin_title); button.type = "button";
      button.title = row.summary || row.name;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!files.some((file) => file.kind === "method" && file.method.method_id === row.method_id)) {
          files.push({ material_id: "method-" + crypto.randomUUID(), kind: "method", title: L("方法") + "：" + row.name, explicit: true, method: { method_id: row.method_id } });
        }
        input.value = ""; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMaterials(); input.focus();
      });
      startersPop.append(button);
    });
    rows.forEach((row) => {
      const title = row.provider + " · " + row.title;
      const button = el("button", "assistant-starter", L("用") + "：" + title); button.type = "button";
      button.title = row.description || title;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!files.some((file) => file.kind === "capability" && file.capability.capability_id === row.capability_id)) {
          files.push({ material_id: "cap-" + crypto.randomUUID(), kind: "capability", title: L("用") + "：" + title, explicit: true,
            capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } });
        }
        input.value = ""; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMaterials(); input.focus();
      });
      startersPop.append(button);
    });
    if (!starters.length && !rows.length && !methods.length) startersPop.append(el("p", "assistant-material-origin", L("没有匹配的能力；换个词，或直接说要做什么")));
  }
  function closeSlash() { if (startersPop && startersPop.dataset.mode === "slash") { delete startersPop.dataset.mode; startersPop.hidden = true; } }
  /* “@”: find something in this project or the person's own content through the system search and bring it along.
     A hit is only a pointer: the Host checks it with its owner and reads it before the round. */
  const mentionOpen = () => startersPop && !startersPop.hidden && startersPop.dataset.mode === "mention";
  const mentionAt = () => {
    const before = String(input.value || "").slice(0, input.selectionStart ?? String(input.value || "").length);
    const match = /(^|\s)@([^\s@]{0,40})$/.exec(before);
    return match ? { query: match[2], start: before.length - match[2].length - 1 } : null;
  };
  let mentionSeq = 0, mentionTimer = null;
  function closeMention() { clearTimeout(mentionTimer); if (startersPop && startersPop.dataset.mode === "mention") { delete startersPop.dataset.mode; startersPop.hidden = true; } }
  function setMention(found) {
    if (!startersPop) return;
    clearTimeout(mentionTimer);
    startersPop.dataset.mode = "mention";
    startersPop.hidden = false;
    const head = el("p", "assistant-popover-title", L("引用内容"));
    if (!found.query) { startersPop.replaceChildren(head, el("p", "assistant-material-origin", L("输入关键词，从本项目和你个人的内容里找"))); return; }
    const seq = ++mentionSeq;
    mentionTimer = setTimeout(async () => {
      let result;
      try {
        const response = await fetch(host.route("/api/search/query"), { method: "POST", cache: "no-store", headers: { "content-type": "application/json", ...host.headers() }, body: JSON.stringify({ query: found.query, scope: "all", limit: 8 }) });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || L("搜索暂时不可用，请稍后重试"));
      } catch (error) { if (seq === mentionSeq && mentionOpen()) startersPop.replaceChildren(head, el("p", "assistant-material-origin", error.message)); return; }
      if (seq !== mentionSeq || !mentionOpen()) return;
      startersPop.replaceChildren(head);
      (result.hits || []).forEach((hit) => {
        const button = el("button", "assistant-starter assistant-mention", ""); button.type = "button";
        button.append(el("span", "assistant-mention-title", hit.plugin_title + " · " + hit.title), el("span", "assistant-mention-snippet", hit.snippet || ""));
        button.setAttribute("aria-label", L("引用") + "：" + hit.plugin_title + " · " + hit.title);
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          const at = mentionAt() || found;
          const value = String(input.value || "");
          input.value = value.slice(0, at.start) + "「" + hit.title + "」" + value.slice(at.start + 1 + at.query.length);
          if (!files.some((file) => file.reference && file.object && file.object.kind === hit.subject.kind && file.object.id === hit.subject.id)) {
            files.push({ material_id: "ref-" + crypto.randomUUID(), kind: "object", title: hit.title, explicit: true, reference: { hit_id: hit.hit_id },
              object: { kind: hit.subject.kind, id: hit.subject.id, title: hit.title }, source: { surface: (hit.open && hit.open.surface) || hit.plugin_id, plugin_id: hit.plugin_id, title: hit.plugin_title },
              text: hit.snippet || "" });
          }
          typed = true; syncSend(); saveDraft(false); closeMention(); paintMaterials(); input.focus();
        });
        startersPop.append(button);
      });
      if (!(result.hits || []).length) startersPop.append(el("p", "assistant-material-origin", result.status === "indexing" ? L("内容还在建立索引，稍后再试") : L("没有找到；换个词试试")));
    }, 180);
  }
  function setStarters(open) {
    if (!startersPop) return;
    delete startersPop.dataset.mode;
    const list = open ? startersFor() : [];
    startersPop.hidden = !list.length;
    if (!list.length) return;
    startersPop.replaceChildren(el("p", "assistant-popover-title", L("可以这样开始")));
    list.forEach((starter) => {
      const button = el("button", "assistant-starter", starter.label); button.type = "button";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => { input.value = starter.prompt; typed = true; syncSend(); saveDraft(false); setStarters(false); input.focus(); });
      startersPop.append(button);
    });
  }
  input.addEventListener("focus", () => { paintMaterials(); if (!String(input.value || "").trim() && !busy) setStarters(true); });
  input.addEventListener("blur", () => setTimeout(() => { if (!island.contains(document.activeElement) || document.activeElement === input) return; setStarters(false); }, 0));
  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element) || island.contains(event.target)) return;
    setStarters(false); if (materialsList && !materialsList.hidden) setMaterials(false); if (executorsPop && !executorsPop.hidden) setExecutors(false); if (modesPop && !modesPop.hidden) setModes(false); if (charactersPop && !charactersPop.hidden) setCharacters(false); if (noticesPop && !noticesPop.hidden) setNotices(false);
  });
  island.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (materialsList && !materialsList.hidden) { event.preventDefault(); event.stopPropagation(); setMaterials(false); materialsButton?.focus(); return; }
    if (startersPop && !startersPop.hidden) { event.preventDefault(); event.stopPropagation(); setStarters(false); }
    if (executorsPop && !executorsPop.hidden) { event.preventDefault(); event.stopPropagation(); setExecutors(false); executorButton?.focus(); }
    if (modesPop && !modesPop.hidden) { event.preventDefault(); event.stopPropagation(); setModes(false); modeButton?.focus(); }
    if (charactersPop && !charactersPop.hidden) { event.preventDefault(); event.stopPropagation(); setCharacters(false); characterButton?.focus(); }
    if (noticesPop && !noticesPop.hidden) { event.preventDefault(); event.stopPropagation(); setNotices(false); attentionButton?.focus(); }
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
        } catch (error) { host.showToast?.(file.name + "：" + error.message); }
        continue;
      }
      // A PDF is read by the Agent runtime's own parser (text layer only); what cannot be read says why.
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if (file.size > 8 * 1024 * 1024) { host.showToast?.(L("文件超过 8 MB，请只带需要的部分") + "：" + file.name); continue; }
        try {
          const { material } = await api("/attachments", "POST", { name: file.name, data: await readBase64(file) });
          files.push({ material_id: material.material_id, kind: "file", title: material.title, text: material.text, explicit: true });
        } catch (error) { host.showToast?.(file.name + "：" + error.message); }
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
    paintMaterials();
  }
  attach?.addEventListener("click", () => fileInput?.click());
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
  composer?.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault(); composer.dataset.dropping = "true";
  });
  composer?.addEventListener("dragleave", (event) => { if (!composer.contains(event.relatedTarget)) delete composer.dataset.dropping; });
  composer?.addEventListener("drop", (event) => {
    delete composer.dataset.dropping;
    const dropped = [...(event.dataTransfer?.files || [])];
    if (!dropped.length) return;
    event.preventDefault();
    void addFiles(dropped);
  });
  /** The page, what is selected on it and the materials the person kept: all data for this Send, nothing more. */
  const pageContext = () => {
    const context = surfaceContext();
    const current = document.querySelector("[data-plugin-picker-current]");
    const active = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    const surface = (context && context.plugin_id) || (active && active.dataset.pluginId) || "home";
    const title = (context && context.surface_title) || (current ? current.textContent.trim() : "");
    const result = { source: Object.assign({ surface }, context && context.plugin_id ? { plugin_id: context.plugin_id } : {}, title ? { title } : {}), captured_at: new Date().toISOString() };
    const page = pageObject();
    if (page && page.included) result.object = page.object;
    if (context && context.unsaved && page && page.included) result.unsaved = true;
    if (selection && !removed.has("selection")) result.selection = { text: selection.text, truncated: selection.truncated };
    return result;
  };
  const sendMaterials = () => {
    const context = surfaceContext();
    // The picture's preview stays on this page; the Send names the runtime's reference only.
    const list = files.map(({ preview: _preview, ...file }) => file);
    const page = pageObject();
    if (page && currentId && joined.has(objectKey(page.object))) {
      list.push({ material_id: "object", kind: "object", title: page.object.title || page.object.id, explicit: true, object: page.object,
        source: { surface: context.plugin_id || "page", ...(context.plugin_id ? { plugin_id: context.plugin_id } : {}) } });
    }
    if (page && page.included && context.unsaved && context.draft_text && !removed.has("draft")) {
      list.unshift({ material_id: "draft", kind: "text", title: L("未保存的修改") + "：" + ((context.object && context.object.title) || ""), text: context.draft_text,
        explicit: false, draft: true, source: { surface: context.plugin_id, plugin_id: context.plugin_id }, object: context.object });
    }
    return list;
  };
  const consumeMaterials = () => { files = []; selection = null; removed.clear(); joined.clear(); paintMaterials(); };

  /* ─── What plugin pages tell the Assistant (spec 8.3): by purpose, never by wording ───────────────────────── */
  const offerBar = island.querySelector("[data-assistant-offer]");
  const heard = new Set();
  // A delegated Send reuses its message id, so the same message twice starts one work.
  let requestOverride = null;
  const tidyMessage = (raw) => {
    if (!raw || typeof raw !== "object" || typeof raw.message_id !== "string" || !raw.message_id || raw.message_id.length > 120) return null;
    if (!["background", "change", "suggest", "delegate", "reply"].includes(raw.purpose)) return null;
    if (!raw.source || typeof raw.source.surface !== "string" || !raw.source.surface) return null;
    const source = { surface: raw.source.surface.slice(0, 80), title: typeof raw.source.title === "string" && raw.source.title ? raw.source.title.slice(0, 80) : raw.source.surface.slice(0, 80) };
    const object = raw.object && typeof raw.object.kind === "string" && typeof raw.object.id === "string" && raw.object.kind && raw.object.id
      ? Object.assign({ kind: raw.object.kind.slice(0, 80), id: raw.object.id.slice(0, 200) }, typeof raw.object.title === "string" ? { title: raw.object.title.slice(0, 200) } : {},
        typeof raw.object.version === "number" || typeof raw.object.version === "string" ? { version: raw.object.version } : {}) : null;
    const materials = Array.isArray(raw.materials) ? raw.materials.filter((item) => item && typeof item.title === "string" && typeof item.text === "string" && item.text)
      .slice(0, 4).map((item) => ({ title: item.title.slice(0, 200), text: item.text.slice(0, 20000) })) : [];
    return { message_id: raw.message_id, purpose: raw.purpose, source, object, text: typeof raw.text === "string" ? raw.text.trim().slice(0, 8000) : "", materials,
      work_id: typeof raw.work_id === "string" && raw.work_id ? raw.work_id : null };
  };
  /** What a request brings becomes this Send's materials, marked as from that page; its words go into the input. */
  const bring = (message) => {
    message.materials.forEach((item, index) => files.push(Object.assign({ material_id: "msg-" + message.message_id.slice(0, 40) + "-" + index, kind: "text", title: item.title, text: item.text,
      explicit: true, source: { surface: message.source.surface, title: message.source.title } }, message.object ? { object: message.object } : {})));
    if (message.text) input.value = message.text;
    syncSend(); paintMaterials();
  };
  const hideOffer = () => { if (!offerBar) return; offerBar.hidden = true; offerBar.replaceChildren(); };
  /** A suggestion waits for the person: shown with where it came from, put into the input only if they say so. */
  const showOffer = (message, unconfirmed) => {
    if (!offerBar) return;
    offerBar.replaceChildren();
    const copy = el("p", "assistant-offer-copy");
    copy.append(el("strong", "", message.source.title), document.createTextNode(" " + (unconfirmed ? L("想交给助理处理") : L("建议")) + "：" + (message.text || L("带上这些材料发起一项工作"))
      + (message.materials.length ? "（" + L("材料") + " " + message.materials.length + "）" : "")));
    offerBar.append(copy);
    if (unconfirmed) offerBar.append(el("p", "assistant-material-origin", L("没有确认是你刚才在那里发起的：放进输入框后，请你确认再发送。")));
    const actions = el("div", "assistant-offer-actions");
    const put = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("放进输入框")); put.type = "button";
    put.addEventListener("click", async () => { hideOffer(); if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id); bring(message); input.focus(); });
    const skip = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("忽略")); skip.type = "button";
    skip.addEventListener("click", hideOffer);
    actions.append(put, skip);
    offerBar.append(actions);
    offerBar.hidden = false;
  };
  /** The person just asked that page to hand this over: continue the work it names, or start a new one, right away. */
  const delegate = async (message) => {
    if (busy) { showOffer(message, false); return; }
    if (message.work_id && works.some((work) => work.work_id === message.work_id)) await switchTo(message.work_id);
    else if (message.work_id || currentId) await switchTo(null);
    bring(message);
    if (!String(input.value || "").trim()) { setPanel(true); input.focus(); return; }
    requestOverride = "msg-" + message.message_id;
    composer.requestSubmit(send);
  };
  window.addEventListener("molis:assistant-message", (event) => {
    const message = tidyMessage(event.detail);
    if (!message || heard.has(message.message_id)) return;
    heard.add(message.message_id);
    if (message.purpose === "background") {
      // Context only: it shapes what the next Send carries from this page; nothing is sent and no model runs.
      background = message; paintMaterials(); return;
    }
    if (message.purpose === "change") {
      if (!message.object) return;
      relatedCache.delete(objectKey(message.object));
      if (view && belongsToWork(message.object)) void refresh().then(schedule).catch(() => {});
      return;
    }
    if (message.purpose === "suggest") { showOffer(message, false); return; }
    if (message.purpose === "delegate") {
      // Only a real gesture on the page counts as the person asking; a script alone gets a suggestion instead.
      const asked = Boolean(navigator.userActivation && navigator.userActivation.isActive);
      if (asked) void delegate(message); else showOffer(message, true);
      return;
    }
    if (message.purpose === "reply") {
      if (!message.work_id || !message.object) return;
      void api("/works/" + encodeURIComponent(message.work_id) + "/results", "POST", { object: message.object, source: message.source })
        .then((result) => { if (currentId === message.work_id) { view = result; render(); } })
        .catch((error) => showProblem({ message: error.message }));
    }
  });
  let typed = false;
  input.addEventListener("input", () => {
    typed = true; syncSend(); saveDraft(false);
    const value = String(input.value || "");
    if (value.startsWith("/")) { void setSlash(value.slice(1)); return; }
    closeSlash();
    const mention = mentionAt();
    if (mention) { setMention(mention); return; }
    closeMention();
    if (value.trim()) setStarters(false);
  });
  input.addEventListener("keydown", (event) => {
    // In the “/” list: down moves into it, Enter takes the first match; a “/…” is never sent as words.
    if (slashOpen() && event.key === "ArrowDown") { event.preventDefault(); startersPop.querySelector("button")?.focus(); return; }
    if (slashOpen() && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSlash(); return; }
    // In the “@” list the same way: down moves into it, Enter takes the first hit, Escape leaves the words as typed.
    if (mentionOpen() && event.key === "ArrowDown") { event.preventDefault(); startersPop.querySelector("button")?.focus(); return; }
    if (mentionOpen() && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMention(); return; }
    if (mentionOpen() && event.key === "Enter" && !event.isComposing && event.keyCode !== 229 && startersPop.querySelector("button")) { event.preventDefault(); startersPop.querySelector("button").click(); return; }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (String(input.value || "").startsWith("/")) { if (slashOpen()) startersPop.querySelector("button")?.click(); return; }
    // Nothing typed: Enter opens the work the next Send goes to — the way in from the keyboard, and on a phone,
    // where the work chip steps aside while the input has focus.
    if (!String(input.value || "").trim()) { if (currentWork()) { setPanel(true); refresh().then(schedule); } return; }
    syncSend();
    if (!send.disabled) composer.requestSubmit(send);
  });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(input.value || "").trim();
    if (!text || busy) return;
    busy = true; syncSend(); problem = null; setPanel(true);
    const requestId = requestOverride || (unsettled && unsettled.text === text && unsettled.work === currentId ? unsettled.id : crypto.randomUUID());
    requestOverride = null;
    const materials = sendMaterials();
    setStarters(false); if (materialsList) setMaterials(false);
    // A draft save still waiting to go out would land after the send and bring the sent text back: cancel it, and let
    // one already on its way arrive first.
    clearTimeout(draftTimer);
    await draftWrite;
    const body = { text, request_id: requestId, context: pageContext(), materials };
    // The Character choice travels with the Send that makes it; the Host freezes that exact version or refuses.
    const character = currentId ? pendingCharacter : newCharacter || undefined;
    if (character !== undefined && characterAllowed()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (currentId) body.work_id = currentId;
    else if (newExecutor !== "assistant") {
      body.executor = newExecutor;
      if (newExecutor === "coding") { const session = openCodingSession(); if (session) body.coding_session_id = session; else body.mode = newMode; }
    }
    else body.scope = newScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    unsettled = { id: requestId, text, work: currentId };
    try {
      const result = await api("/send", "POST", body);
      unsettled = null;
      consumeMaterials();
      clearTimeout(draftTimer);
      // Sent text is nobody's draft any more, including the new-work draft it may have started as.
      if (!currentId || store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
      currentId = result.work.work_id; remember(); pendingCharacter = undefined; newCharacter = null;
      if (String(input.value || "").trim() === text) input.value = "";
      const index = works.findIndex((work) => work.work_id === result.work.work_id);
      if (index >= 0) works[index] = result.work; else works.unshift(result.work);
      // A round a plugin's own Agent carries is that plugin's session: its page, if open, shows it now.
      if (result.work.executor && result.work.executor.kind === "coding") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: result.work.work_id, capability_id: "coding.runs.start", session_id: result.work.executor.session_id } }));
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
  targetClear?.addEventListener("click", () => { switchTo(null); input.focus(); });
  target.addEventListener("click", () => {
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
  // Changes already done before this page loaded are not news; only ones completing from now on are announced.
  loadWorks().then(() => { if (!typed) loadDraft(); if (currentId) return refresh().then(schedule); }).finally(() => { announcing = true; });
  return { isOpen: () => Boolean(panel && !panel.hidden), dispose: () => { clearTimeout(pollTimer); clearInterval(listTimer); } };
}`;
