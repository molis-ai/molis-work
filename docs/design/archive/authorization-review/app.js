/* Static design specimen. All interactions stay in this tab's memory. */
(() => {
  const kit = window.mwKit;
  const escape = kit.escapeHtml;
  const params = new URLSearchParams(location.search);
  const choose = (key, values, fallback) => values.includes(params.get(key)) ? params.get(key) : fallback;
  const state = {
    scheme: choose("scheme", ["A", "B"], "B"),
    surface: choose("surface", ["choose", "manage", "review"], "manage"),
    scene: choose("scene", ["normal", "expired", "revoked", "unknown", "restored", "error", "empty", "loading"], "normal"),
    lang: choose("lang", ["zh", "en"], "zh"),
    theme: choose("theme", ["light", "dark"], "light"),
    mode: "confirm", duration: "work", selected: "feedback", filter: "all", search: "",
    edit: false, confirmRevoke: false, operations: new Set(["read", "create", "edit"]),
    grants: new Map(), notice: "", vote: false, rejected: false, reconcile: false, errorShown: false,
  };
  const t = (zh, en) => state.lang === "zh" ? zh : en;
  const button = (act, zh, en, variant = "secondary", extra = {}) => kit.renderButton({
    label: t(zh, en), variant, attrs: { "data-act": act }, ...extra,
  });
  const status = (zh, en, tone = "quiet", icon) => kit.renderStatusMark({ label: t(zh, en), tone, icon });
  const badge = (zh, en) => kit.renderBadge({ label: t(zh, en) });
  const alert = (zh, en, bodyZh, bodyEn, tone = "warning") => kit.renderAlert({
    title: t(zh, en), body: t(bodyZh, bodyEn), tone,
  });
  const modes = () => [
    ["read", t("只读协助", "Read-only help")],
    ["confirm", t("改动前确认", "Confirm before changes")],
    ["auto", t("在授权范围内自动处理", "Act within this scope")],
  ];
  const modeLabel = (value) => modes().find(([key]) => key === value)?.[1];
  const samples = () => [
    { id: "feedback", group: "work", title: t("整理本周反馈", "Organize this week’s feedback"), caller: t("助理", "Assistant"), icon: "sparkles", mode: "auto", service: "Notion", target: t("Molis 官网 · 用户反馈", "Molis website · User feedback"), duration: t("你停止、归档这项工作或撤销授权时", "When you stop or archive this work, or revoke permission") },
    { id: "weekly", group: "ongoing", title: t("每周工作简报", "Weekly work brief"), caller: t("定时任务", "Scheduled task"), icon: "clock", mode: "read", service: t("项目资料", "Project knowledge"), target: t("Molis 官网 · 任务与笔记", "Molis website · Tasks and notes"), duration: t("你撤销或停用任务时", "When revoked or the task is disabled") },
    { id: "coding", group: "session", title: t("运行项目测试", "Run project tests"), caller: "Coding", icon: "terminal", mode: "auto", service: t("本机命令", "Local command"), target: "pnpm test · molis-website", duration: t("这个会话结束时", "When this session ends") },
  ].map((item) => {
    const saved = state.grants.get(item.id);
    return { ...item, ...saved, duration: saved?.durationKind === "ongoing" ? t("你收窄或撤销时", "When narrowed or revoked") : item.duration };
  });
  const sample = () => samples().find((item) => item.id === state.selected) ?? samples()[0];
  const grantState = (id) => state.grants.get(id) ?? {};
  const invalid = (id) => grantState(id).revoked || (id === "feedback" && ["expired", "revoked"].includes(state.scene));
  const notice = () => state.notice ? `<div class="inline-feedback">${alert(state.notice, state.notice, "", "", state.scene === "error" ? "danger" : "success")}</div>` : "";

  function controls() {
    const toggle = (key, label, entries) => kit.renderToggleGroup({ label, items: entries.map(([value, text]) => ({
      value, label: text, current: state[key] === value, attrs: { "data-control": key },
    })) });
    const scenes = [["normal", "正常", "Normal"], ["restored", "重启后记录", "After restart"], ["expired", "已到期", "Expired"], ["revoked", "已撤销", "Revoked"], ["unknown", "结果待核对", "Outcome unknown"], ["error", "保存失败", "Save failed"], ["empty", "空状态", "Empty"], ["loading", "加载中", "Loading"]];
    return `<div class="demo-controls"><span class="demo-label">${t("第 39 批 · 交互样，数据仅在当前页面演示", "Batch 39 · Interactive specimen with local demo data")}</span><div class="demo-options">
      ${toggle("scheme", t("布局方案", "Layout"), [["A", t("A · 就地展开", "A · Inline")], ["B", t("B · 详情栏", "B · Inspector")]])}
      ${toggle("lang", "Language", [["zh", "中"], ["en", "EN"]])}
      ${button("theme", state.theme === "light" ? "深色" : "浅色", state.theme === "light" ? "Dark" : "Light", "ghost")}
      <details><summary>${t("演示状态", "Demo state")}</summary><div class="state-options">${scenes.map(([value, zh, en]) => kit.renderButton({ label: t(zh, en), variant: value === state.scene ? "secondary" : "ghost", attrs: { "data-control": "scene", value } })).join("")}</div></details>
    </div></div>`;
  }

  function checks(editing = false) {
    const operations = [["read", "读取反馈", "Read feedback"], ["create", "创建摘要", "Create summaries"], ["edit", "更新反馈状态", "Update feedback status"]];
    const allowed = new Set(editing ? grantState(state.selected).operations ?? operations.map(([value]) => value) : operations.map(([value]) => value));
    // Same checkbox markup as plugin-sdk/ui/field.ts; this kit export does not include renderCheckbox.
    return `<div class="checks">${operations.filter(([value]) => allowed.has(value)).map(([value, zh, en]) => `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" name="operation" value="${value}"${state.operations.has(value) ? " checked" : ""}${value === "read" || (editing && grantState(state.selected).readOnly) ? " disabled" : ""}><span>${escape(t(zh, en))}</span></label>`).join("")}</div>`;
  }

  function scope() {
    return `<section class="scope"><h3>${t("允许的范围", "Allowed scope")}</h3><dl class="scope-facts">
      <dt>${t("由谁执行", "Actor")}</dt><dd>${t("助理", "Assistant")}</dd>
      <dt>${t("连接", "Connection")}</dt><dd>Notion · ${t("团队工作区", "Team workspace")}</dd>
      <dt>${t("对象", "Target")}</dt><dd>${t("Molis 官网 / 用户反馈", "Molis website / User feedback")}</dd>
      <dt>${t("操作", "Actions")}</dt><dd>${state.mode === "read" ? badge("读取反馈", "Read feedback") : checks()}</dd>
    </dl><p class="end-condition reading">${t("发送消息、删除内容和其他工作区不在这次授权内。", "Sending messages, deleting content and other workspaces are outside this scope.")}</p></section>`;
  }

  function chooser() {
    const permission = kit.renderRadioGroup({ legend: t("希望助理怎样协助", "How should the assistant help?"), name: "mode", className: "permission-options", items: modes().map(([value, label]) => ({ value, label, checked: state.mode === value })) });
    const duration = `<div class="duration">${kit.renderRadioGroup({ legend: t("有效期", "Duration"), name: "duration", items: [
      { value: "work", label: t("仅这项工作", "This work only"), checked: state.duration === "work" },
      { value: "ongoing", label: t("持续允许", "Ongoing"), checked: state.duration === "ongoing" },
    ] })}<p class="end-condition reading">${state.duration === "work" ? t("跨轮次、等待和重启继续有效；你停止、归档这项工作或撤销授权后结束。", "Survives turns, waits and restarts. Ends when you stop or archive this work, or revoke permission.") : t("同一助理、同一对象和操作持续有效，直到你收窄或撤销。", "Continues for the same actor, targets and actions until you narrow or revoke it.")}</p></div>`;
    const detail = `<div${state.scheme === "B" ? ' class="scope-preview"' : ""}>${state.scheme === "B" ? `<h3>${t("这次允许的事", "What this allows")}</h3>` : ""}${scope()}${duration}</div>`;
    return `<div class="${state.scheme === "A" ? "single-column" : ""}"><div class="context-card">${kit.icon("sparkles")}<div><strong>${t("整理本周反馈", "Organize this week’s feedback")}</strong><p class="reading">${t("归并反馈，写好摘要，再更新处理状态。", "Group feedback, write summaries and update each item’s status.")}</p></div></div>
      <div class="choice-layout scheme-${state.scheme}"><div class="chooser">${permission}<p class="reading quiet">${state.mode === "read" ? t("可以查看和建议；修改内容前需要你授权。", "Can read and suggest. Changes need your permission.") : state.mode === "confirm" ? t("先准备改动，执行前把具体内容交给你确认。", "Prepares changes and asks you to confirm the details before execution.") : t("范围内的工作会连续进行；新增对象或操作时只确认新增的部分。", "Work continues within this scope. Only additional targets or actions need new permission.")}</p></div>${detail}</div>
      ${notice()}<div class="action-row">${button("to-manage", "暂不授权", "Not now", "ghost")}${button("grant", "确认授权", "Confirm permission", "primary")}</div></div>`;
  }

  function grantDetail() {
    const item = sample();
    const saved = grantState(item.id);
    const unavailable = invalid(item.id);
    const command = item.id === "coding";
    const readonly = item.mode === "read" || saved.readOnly;
    const currentMode = saved.mode ?? (readonly ? "read" : item.mode);
    let feedback = "";
    if (unavailable) feedback = alert(state.scene === "expired" ? "这份授权已到期" : "这份授权已撤销", state.scene === "expired" ? "This permission has expired" : "This permission was revoked", "后续操作会停止；已经完成的操作仍保留记录。", "Future actions stop. Records of completed actions remain.");
    if (state.scene === "unknown" && item.id === "feedback") feedback = alert("上次操作的结果还没有确认", "The last outcome is unconfirmed", "先核对反馈状态，避免重复更新。撤销会停止后续操作，但不会撤回已经发出的请求。", "Check the feedback status before retrying. Revocation stops future actions but does not undo a request already sent.");
    const actions = state.edit ? checks(true) : `<div class="tags">${command ? badge("仅相同命令和目录", "Same command and directory only") : readonly ? badge("只读", "Read only") : [badge("读取反馈", "Read feedback"), ...(!saved.operations || saved.operations.includes("create") ? [badge("创建摘要", "Create summaries")] : []), ...(!saved.operations || saved.operations.includes("edit") ? [badge("更新反馈状态", "Update status")] : [])].join("")}</div>`;
    return `<section class="grant-detail" id="grant-detail" aria-label="${escape(t("授权详情", "Permission details"))}"><h3>${escape(item.title)}</h3>${feedback}<dl class="scope-facts">
      <dt>${t("执行者", "Actor")}</dt><dd>${escape(item.caller)}</dd><dt>${t("范围", "Scope")}</dt><dd>${escape(item.service)} · ${escape(item.target)}</dd>
      <dt>${t("方式", "Mode")}</dt><dd>${escape(modeLabel(currentMode))}</dd><dt>${t("操作", "Actions")}</dt><dd>${actions}</dd>
      <dt>${t("结束条件", "Ends")}</dt><dd>${escape(item.duration)}</dd><dt>${t("授权人", "Granted by")}</dt><dd>${t("你 · 今天 09:20", "You · Today, 09:20")}</dd>
    </dl>${state.edit ? `<p class="reading end-condition">${t("取消的操作会立即从后续工作中移除；新增范围需要重新授权。", "Removed actions stop immediately for future work. Expanding scope requires new permission.")}</p>` : ""}
    ${notice()}${!unavailable ? `<div class="action-row">${state.edit ? `${button("cancel-edit", "取消", "Cancel", "ghost")}${button("save-scope", "保存收窄", "Save narrower scope", "primary")}` : `${!readonly && !command ? button("narrow", "收窄范围", "Narrow scope") : ""}${button("revoke-prompt", "撤销授权", "Revoke permission", "danger-outline")}`}</div>` : ""}
    ${state.confirmRevoke && !unavailable ? `<div class="inline-feedback">${alert("撤销后，未开始的操作会停止", "Revoking stops actions that have not started", "已完成的改动不会自动撤回。", "Completed changes are not automatically undone.", "neutral")}<div class="action-row">${button("keep-grant", "保留授权", "Keep permission", "ghost")}${button("revoke", "确认撤销", "Confirm revocation", "danger")}</div></div>` : ""}
    <details class="receipt"><summary>${t("最近使用记录", "Recent use")}</summary><p class="reading">${command ? t("09:32 · pnpm test · 沿用你在本会话授予的规则", "09:32 · pnpm test · Used the rule you granted for this session") : t("09:32 · 读取 12 条反馈 · 沿用你在这项工作中的授权", "09:32 · Read 12 feedback items · Used your permission for this work")}</p></details></section>`;
  }

  function manager() {
    if (state.scene === "empty") return kit.renderEmpty({ icon: "key", title: t("还没有持续授权", "No active permissions yet"), body: t("你在工作中确认的授权会列在这里。", "Permissions you grant while working will appear here."), action: button("to-choose", "查看权限选择", "Try permission choices") });
    if (state.scene === "loading") return `<div class="single-column" aria-busy="true"><p class="reading quiet">${t("正在读取授权…", "Loading permissions…")}</p>${kit.renderSkeleton()}<div class="action-row">${button("loaded", "演示加载完成", "Show loaded state")}</div></div>`;
    const groupNames = { work: t("当前工作", "Current work"), ongoing: t("持续授权", "Ongoing"), session: t("当前会话", "Current session") };
    const list = samples().filter((item) => (state.filter === "all" || (state.filter === "active" ? !invalid(item.id) : invalid(item.id))) && `${item.title} ${item.caller} ${item.service}`.toLowerCase().includes(state.search.toLowerCase()));
    const rows = Object.entries(groupNames).map(([group, name]) => {
      const entries = list.filter((item) => item.group === group);
      return entries.length ? `<section class="grant-group"><h2 class="group-title">${name}</h2>${entries.map((item) => {
        const selected = item.id === state.selected;
        return `<div class="grant-entry"><button type="button" class="grant-row" data-grant="${item.id}" ${state.scheme === "A" ? 'aria-expanded' : 'aria-pressed'}="${selected}"${selected ? ' aria-controls="grant-detail"' : ""}><span class="grant-glyph">${kit.icon(item.icon)}</span><span><span class="grant-name">${escape(item.title)}</span><span class="grant-meta">${escape(item.caller)} · ${escape(modeLabel(grantState(item.id).readOnly ? "read" : item.mode))}</span></span>${invalid(item.id) ? status(state.scene === "expired" ? "已到期" : "已撤销", state.scene === "expired" ? "Expired" : "Revoked") : status("有效", "Active", "done")}</button>${state.scheme === "A" && selected ? grantDetail() : ""}</div>`;
      }).join("")}</section>` : "";
    }).join("");
    return `<div class="filters">${kit.renderInput({ type: "search", value: state.search, placeholder: t("查找工作、执行者或服务", "Find work, actor or service"), attrs: { "aria-label": t("查找授权", "Find permissions"), "data-search": "true" } })}${kit.renderToggleGroup({ label: t("授权状态", "Permission status"), items: [["all", "全部", "All"], ["active", "有效", "Active"], ["ended", "已结束", "Ended"]].map(([value, zh, en]) => ({ value, label: t(zh, en), current: state.filter === value, attrs: { "data-control": "filter" } })) })}</div>
    <div class="manage-layout scheme-${state.scheme}${state.scheme === "A" ? " single-column" : ""}"><div class="grant-list">${rows || kit.renderEmpty({ title: t("没有匹配的授权", "No matching permissions"), body: t("试试其他关键词或查看全部。", "Try another term or view all permissions.") })}</div>${state.scheme === "B" && list.some((item) => item.id === state.selected) ? grantDetail() : ""}</div>`;
  }

  function reviews() {
    const unavailable = ["restored", "expired", "revoked", "unknown"].includes(state.scene);
    const ended = ["restored", "expired"].includes(state.scene);
    const pending = !state.vote && !state.rejected && !ended;
    let reason = "";
    if (state.scene === "restored") reason = alert("原等待已撤回，没有执行", "The original request was withdrawn without execution", "重启后保留原提案供核对。需要执行时重新预览当前内容。", "The proposal remains for reference after restart. Preview the current content again if the action is still needed.");
    if (["expired", "revoked"].includes(state.scene)) reason = alert("这份请求已失效", "This request is no longer valid", "原授权已结束。重新核对当前内容和范围后再发起。", "Its authority has ended. Recheck the current content and scope before requesting again.");
    if (state.scene === "unknown") reason = alert(state.reconcile ? "已核对：操作没有执行" : "执行结果尚未确认", state.reconcile ? "Checked: the action did not run" : "Execution outcome is unknown", state.reconcile ? "如仍需要执行，请基于当前内容重新发起请求。" : "不要再次执行；先查看外部记录，确认是否已经完成。", state.reconcile ? "Start a new request against the current content if still needed." : "Do not run it again. Check the external record to see whether it completed.");
    const stamp = ended ? status(state.scene === "restored" ? "已取消" : "已到期", state.scene === "restored" ? "Cancelled" : "Expired") : state.vote ? status("人审已满足", "Human review met", "done") : state.rejected ? status("已拒绝", "Rejected", "blocked") : status("等你确认", "Needs your review", "attention");
    return `<div class="review-layout scheme-${state.scheme}${state.scheme === "A" ? " single-column" : ""}"><section class="record-box"><div class="record-title"><h3>${t("发布本周摘要", "Publish this week’s summary")}</h3>${stamp}</div><p class="record-description reading">${t("助理 · Molis 官网 / 团队知识库", "Assistant · Molis website / Team knowledge")}</p>
      <dl class="scope-facts"><dt>${t("将做什么", "Change")}</dt><dd>${t("把已核对的摘要发布给项目成员。", "Publish the reviewed summary to project members.")}</dd><dt>${t("内容版本", "Version")}</dt><dd>${t("第 3 版 · 今天 10:05", "Version 3 · Today, 10:05")}</dd><dt>${t("人审要求", "Review")}</dt><dd>${state.vote ? "2 / 2" : "1 / 2"} · ${t("当前版本，两位不同成员", "Current version, two distinct members")}</dd></dl>
      <div class="approval-trail"><div class="approval-person"><span class="person-mark">林</span><span><strong>${t("林悦", "Lin Yue")}</strong><small>${t("有权限的项目成员 · 人工批准", "Authorized project member · Human approval")}</small></span>${status("10:08", "10:08", "done", "check")}</div>${state.vote ? `<div class="approval-person"><span class="person-mark">${t("你", "Y")}</span><span><strong>${t("你", "You")}</strong><small>${t("人工批准 · 第 3 版", "Human approval · Version 3")}</small></span>${status("10:12", "10:12", "done", "check")}</div>` : ""}</div>
      <div class="inline-feedback">${reason}${notice()}</div>${pending ? `<div class="action-row">${state.scene === "unknown" ? button("reconcile", "核对执行记录", "Check execution record", "primary", { disabled: state.reconcile }) : `${button("reject", unavailable ? "关闭请求" : "拒绝", unavailable ? "Close request" : "Reject", "secondary")}${!unavailable ? button("approve", "批准第 3 版", "Approve version 3", "primary") : ""}`}</div>` : ""}
      <details class="receipt"><summary>${t("之前的决定", "Earlier decisions")}</summary><p class="reading">${t("昨天 17:20 · 你批准了第 2 版。内容已更新，这次不计入。", "Yesterday, 17:20 · You approved version 2. Content changed, so that vote does not count here.")}</p></details></section>
      <section class="record-box"><div class="record-title"><h3>${t("运行项目测试", "Run project tests")}</h3>${status("AI 放行", "AI approved", "progress", "sparkles")}</div><p class="record-description reading">Coding · pnpm test · molis-website</p><p class="reading">${t("独立的 AI 审查认为命令符合低风险规则。本次没有扩大授权，也没有保存长期规则。", "An independent AI reviewer found the command within the low-risk policy. This did not expand permission or save an ongoing rule.")}</p><div class="approval-trail"><div class="approval-person"><span class="person-mark ai">${kit.icon("sparkles")}</span><span><strong>${t("独立 AI 审查", "Independent AI review")}</strong><small>${t("来源：Coding 低风险审查 · 今天 09:42", "Source: Coding low-risk review · Today, 09:42")}</small></span></div></div><p class="end-condition reading">${t("不计入人工审批；要求真人确认的操作仍由人批准。", "Does not count as a human vote. Explicit human-review requirements still need a person.")}</p><details class="receipt"><summary>${t("查看放行理由", "View approval reasoning")}</summary><p class="reading">${t("仅运行项目现有测试；工作目录固定，未请求网络访问或额外文件权限。", "Runs the project’s existing tests in a fixed directory, without requested network access or additional file permissions.")}</p></details></section></div>`;
  }

  function render(focusSelector) {
    const focused = document.activeElement;
    const restoreFocus = focusSelector ?? (focused?.dataset.act ? `[data-act="${focused.dataset.act}"]` : null);
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.resolvedTheme = state.theme;
    document.title = t("授权与审批 · 第 39 批定样", "Permissions & review · Batch 39 specimen");
    document.getElementById("prototype-controls").innerHTML = controls();
    const tabs = [["choose", "权限选择", "Choose"], ["manage", "授权管理", "Manage"], ["review", "审批来源", "Reviews"]];
    document.getElementById("prototype").innerHTML = `<div class="workbench-sheet"><header class="page-header"><div class="breadcrumb">${t("设置 / 助理与自动化", "Settings / Assistant & automation")}</div><div class="page-heading"><h1>${t("授权与审批", "Permissions & review")}</h1>${status("Molis 官网", "Molis website", "quiet")}</div>${kit.renderTabs({ label: t("授权与审批", "Permissions & review"), tabs: tabs.map(([id, zh, en]) => ({ id, label: t(zh, en), selected: state.surface === id, attrs: { id: `tab-${id}`, "aria-controls": "surface-panel", tabindex: state.surface === id ? "0" : "-1" } })) })}</header><div id="surface-panel" role="tabpanel" aria-labelledby="tab-${state.surface}" class="page-content">${state.surface === "choose" ? chooser() : state.surface === "manage" ? manager() : reviews()}</div></div>`;
    const query = new URLSearchParams({ scheme: state.scheme, surface: state.surface, lang: state.lang, theme: state.theme, scene: state.scene });
    history.replaceState(null, "", `?${query}`);
    if (restoreFocus) {
      const target = document.querySelector(restoreFocus) ?? document.getElementById("surface-panel");
      if (target.id === "surface-panel") target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
    const tabList = selectedTab.closest('[role="tablist"]');
    const selectedBounds = selectedTab.getBoundingClientRect(), listBounds = tabList.getBoundingClientRect();
    if (selectedBounds.left < listBounds.left) tabList.scrollLeft -= listBounds.left - selectedBounds.left;
    if (selectedBounds.right > listBounds.right) tabList.scrollLeft += selectedBounds.right - listBounds.right;
  }

  function announce(zh, en) {
    document.getElementById("feedback").textContent = t(zh, en);
  }
  function saveFailed() {
    if (state.scene !== "error") return false;
    if (state.errorShown) { state.scene = "normal"; state.notice = ""; return false; }
    state.errorShown = true;
    state.notice = t("未保存，原授权仍然有效。你的选择已保留，可直接重试。", "Not saved. The previous permission still applies. Your choices are kept so you can retry.");
    render();
    return true;
  }

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-control]");
    if (control) {
      state[control.dataset.control] = control.value;
      state.notice = "";
      if (control.dataset.control === "scene") {
        state.vote = false; state.rejected = false; state.reconcile = false; state.errorShown = false; state.grants.clear();
        state.edit = false; state.confirmRevoke = false; state.selected = "feedback";
      }
      render(`[data-control="${control.dataset.control}"][value="${control.value}"]`);
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) { state.surface = tab.dataset.tab; state.notice = ""; render(`[data-tab="${state.surface}"]`); return; }
    const grant = event.target.closest("[data-grant]");
    if (grant) { state.selected = state.scheme === "A" && state.selected === grant.dataset.grant ? "" : grant.dataset.grant; state.edit = false; state.confirmRevoke = false; state.notice = ""; render(`[data-grant="${grant.dataset.grant}"]`); return; }
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "theme") state.theme = state.theme === "light" ? "dark" : "light";
    if (act === "to-manage") state.surface = "manage";
    if (act === "to-choose") { state.surface = "choose"; state.scene = "normal"; }
    if (act === "loaded") state.scene = "normal";
    if (act === "grant") {
      if (saveFailed()) return;
      state.grants.set("feedback", { mode: state.mode, readOnly: state.mode === "read", operations: [...state.operations], group: state.duration === "work" ? "work" : "ongoing", durationKind: state.duration });
      state.surface = "manage"; state.selected = "feedback"; state.scene = "normal";
      announce("演示：授权已生效，可在这里收窄或撤销。", "Demo: permission is active. Narrow or revoke it here.");
    }
    if (act === "narrow") { state.edit = true; state.operations = new Set(grantState(state.selected).operations ?? ["read", "create", "edit"]); }
    if (act === "cancel-edit") { state.edit = false; state.notice = ""; }
    if (act === "save-scope") {
      if (saveFailed()) return;
      const allowed = new Set(grantState(state.selected).operations ?? ["read", "create", "edit"]);
      state.operations = new Set([...state.operations].filter(value => allowed.has(value)));
      state.grants.set(state.selected, { ...grantState(state.selected), operations: [...state.operations], readOnly: state.operations.size === 1, mode: state.operations.size === 1 ? "read" : sample().mode });
      state.edit = false; state.notice = t("范围已收窄，后续操作按新范围执行。", "Scope narrowed. Future actions use the new scope.");
    }
    if (act === "revoke-prompt") state.confirmRevoke = true;
    if (act === "keep-grant") state.confirmRevoke = false;
    if (act === "revoke") {
      if (saveFailed()) return;
      state.grants.set(state.selected, { ...grantState(state.selected), revoked: true });
      state.confirmRevoke = false;
      announce("演示：授权已撤销，后续操作已停止。", "Demo: permission revoked. Future actions stopped.");
    }
    if (act === "approve") { if (saveFailed()) return; state.vote = true; announce("演示：已记录你对第 3 版的人工批准。", "Demo: your human approval of version 3 was recorded."); }
    if (act === "reject") { if (saveFailed()) return; state.rejected = true; announce("演示：请求已关闭，没有执行。", "Demo: request closed without execution."); }
    if (act === "reconcile") { state.reconcile = true; announce("演示核对结果：没有重复执行。", "Demo reconciliation completed without re-execution."); }
    render();
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (["mode", "duration"].includes(input.name)) { state[input.name] = input.value; render(`input[name="${input.name}"][value="${input.value}"]`); }
    if (input.name === "operation") { if (input.checked) state.operations.add(input.value); else state.operations.delete(input.value); }
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches("[data-search]")) return;
    const start = event.target.selectionStart;
    state.search = event.target.value; render("[data-search]");
    document.querySelector("[data-search]").setSelectionRange(start, start);
  });
  document.addEventListener("keydown", (event) => {
    if (!event.target.matches('[role="tab"]') || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = ["choose", "manage", "review"];
    const index = tabs.indexOf(state.surface);
    state.surface = tabs[event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3];
    render(`[data-tab="${state.surface}"]`);
  });

  document.getElementById("icons").innerHTML = window.mwKitSprite;
  render();
  const client = document.createElement("script");
  client.textContent = window.mwKitClient;
  document.body.appendChild(client);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.resolvedTheme = state.theme;
})();
