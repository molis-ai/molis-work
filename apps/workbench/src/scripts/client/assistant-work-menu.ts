/** The resident Assistant's existing work menu and the person's explicit lifecycle decision. The Host owns every fact. */
export const ASSISTANT_WORK_MENU_FACTORY_SCRIPT = String.raw`(ports) => {
  const { L, el, workNav, worksToggle, input, api, state, markOf, stateLabel, scopeLabel, ringState, tabMark } = ports;
  const choose = async (work, opener) => {
    toggle(false);
    const path = "/works/" + encodeURIComponent(work.work_id), route = ports.route(path), archived = !work.archived;
    const label = L(archived ? "归档工作" : "恢复工作");
    const dialog = el("dialog", "mw-dialog mw-dialog--alert"), form = el("form", "mw-form mw-dialog__shell");
    dialog.dataset.assistantArchiveDialog = "";
    const heading = el("h2", "", label + " · " + work.title); heading.id = "assistant-archive-" + crypto.randomUUID(); dialog.setAttribute("aria-labelledby", heading.id);
    const header = el("header", "mw-form__header"), body = el("div", "mw-form__body"), footer = el("footer", "mw-form__footer");
    header.append(heading);
    body.append(el("p", "", L("当前状态") + " · " + (work.archived ? L("已归档") : stateLabel(work.state))),
      el("p", "", L(archived ? "停止这项工作的定时，保留历史和记忆。执行方会话与子任务不会一起归档。" : "恢复这项工作，保留原历史和记忆。不会重新启用旧定时，也不会自动开始一轮。")));
    const message = el("p", "mw-loading", L("正在读取…")); message.setAttribute("role", "status"); body.append(message);
    const cancel = el("button", "mw-btn mw-btn--secondary", L("取消")), yes = el("button", "mw-btn mw-btn--primary", label);
    cancel.type = "button"; yes.type = "submit"; yes.disabled = true; yes.dataset.assistantArchiveConfirm = "";
    footer.append(cancel, yes); form.append(header, body, footer); dialog.append(form); document.body.append(dialog);
    let original, pending = false;
    const close = () => { if (!pending) dialog.close(); };
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
    dialog.addEventListener("close", () => { dialog.remove(); (opener.isConnected ? opener : worksToggle)?.focus(); });
    const preview = async () => {
      try {
        const request = await api(path + "/archive-preview?archived=" + archived, "GET", undefined, route + "/archive-preview?archived=" + archived);
        if (!dialog.isConnected) return;
        if (request.revision !== work.revision) throw new Error(L("工作已变化，请关闭后重新核对。"));
        original = JSON.stringify(request); message.textContent = ""; message.className = ""; yes.textContent = label;
      } catch (error) { message.className = ""; molisWorkRequest.show(message, error); yes.textContent = L("重试"); }
      finally { if (dialog.isConnected) yes.disabled = false; }
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (pending) return;
      yes.disabled = cancel.disabled = pending = true; form.setAttribute("aria-busy", "true");
      try {
        if (!original) { await preview(); return; }
        const result = await api(path + "/archive", "POST", JSON.parse(original), route + "/archive");
        await ports.changed(result.work); pending = false; dialog.close();
      } catch (error) { message.className = ""; molisWorkRequest.show(message, error); yes.textContent = L("按原决定重试"); }
      finally { pending = false; yes.disabled = cancel.disabled = false; form.removeAttribute("aria-busy"); }
    });
    dialog.showModal(); cancel.focus(); await preview();
  };
  const paint = () => {
    if (!workNav || workNav.hidden) return;
    const { works, curId, tabs } = state();
    const focused = document.activeElement && workNav.contains(document.activeElement) ? document.activeElement.dataset.workId || "new" : null;
    workNav.replaceChildren();
    const fresh = el("button", "assistant-works-item assistant-works-new", L("＋ 新工作")); fresh.type = "button"; fresh.dataset.workId = "new";
    fresh.addEventListener("click", () => { toggle(false); ports.open(null); input.focus(); }); workNav.append(fresh);
    const current = works.find(work => work.work_id === curId);
    if (current) {
      const action = el("button", "assistant-works-item", L(current.archived ? "恢复工作" : "归档工作")); action.type = "button";
      action.dataset.assistantArchiveAction = current.work_id; action.dataset.workId = "archive:" + current.work_id;
      action.addEventListener("click", () => choose(current, worksToggle)); workNav.append(action);
    }
    if (!works.length) workNav.append(el("p", "assistant-muted", L("还没有工作。发送一句话就会开始第一项。")));
    const groups = [["等你", work => !work.archived && markOf(work) === "waiting"], ["进行中", work => !work.archived && (work.state === "running" || work.state === "paused")], ["最近", work => !work.archived], ["已归档", work => work.archived]];
    const placed = new Set();
    groups.forEach(([label, fits]) => {
      const rows = works.filter(work => !placed.has(work.work_id) && fits(work)); if (!rows.length) return;
      workNav.append(el("p", "assistant-works-group", L(label)));
      rows.forEach(work => {
        placed.add(work.work_id);
        const item = el("button", "assistant-works-item"); item.type = "button"; item.dataset.workId = work.work_id;
        const mark = work.archived ? "" : markOf(work); if (mark) item.dataset.mark = mark;
        if (work.work_id === curId) item.setAttribute("aria-current", "true");
        const meta = el("span", "assistant-works-meta", (work.archived ? L("已归档") : stateLabel(work.state)) + " · " + scopeLabel(work.scope, work.scope_title) + (tabs.includes(work.work_id) ? " · " + L("已打开") : ""));
        meta.dataset.state = work.state; meta.dataset.mwState = ringState(work.state);
        const head = el("span", "assistant-works-head"); head.append(tabMark(mark, work), el("span", "assistant-works-title", work.title)); item.append(head, meta);
        item.addEventListener("click", () => { toggle(false); ports.open(work.work_id); }); workNav.append(item);
      });
    });
    if (focused) [...workNav.querySelectorAll("button")].find(button => button.dataset.workId === focused)?.focus();
  };
  const toggle = open => {
    if (!workNav) return;
    workNav.hidden = !open; worksToggle?.setAttribute("aria-expanded", String(open));
    if (open) { paint(); (workNav.querySelector("[aria-current]") || workNav.querySelector("button"))?.focus(); ports.load(); }
  };
  return { paint, toggle };
}`;
