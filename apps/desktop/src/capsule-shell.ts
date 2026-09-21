import { SELECT_MENU_CLIENT_SCRIPT, SELECT_MENU_STYLES } from "@molis-ai/molis-work-design-system";

export interface CapsuleProjectNavigation {
  project_id: string;
  display_name: string;
}

export interface CapsuleShellEnvironment {
  translate(message: string): string;
  htmlLang: string;
  clientI18nScript: string;
  themeBootstrapScript: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export const CAPSULE_STYLES = `
  :root {
    color-scheme: light;
    --paper: #ffffff;
    --paper-raised: #ffffff;
    --ink: #222326;
    --ink-soft: #3c3f44;
    --muted: #6b6f76;
    --faint: #737882;
    --line: #e2e4e7;
    --line-strong: #d0d6e0;
    --surface: #f3f4f5;
    --surface-hover: color-mix(in srgb, var(--ink) 6%, transparent);
    --accent: #5e6ad2;
    --accent-hover: #4c56c4;
    --accent-soft: #eef0fb;
    --green: #2d7a5a;
    --amber: #8a5c18;
    --red: #b03d45;
    --action: #222326;
    --action-ink: #ffffff;
    --shadow: 0 20px 50px rgba(21, 24, 31, .20), 0 3px 12px rgba(21, 24, 31, .12);
    --font: "Inter Variable", Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
    --capsule-anchor-x: 210px;
    --capsule-height: 476px;
  }
  html[data-resolved-theme="dark"] {
    color-scheme: dark;
    --paper: #161718;
    --paper-raised: #161718;
    --ink: #f7f8f8;
    --ink-soft: #d0d1d3;
    --muted: #8a8f98;
    --faint: #737880;
    --line: #23252a;
    --line-strong: #2e3036;
    --surface: #0f1011;
    --surface-hover: color-mix(in srgb, var(--ink) 8%, transparent);
    --accent: #8b93f1;
    --accent-hover: #a8aef5;
    --accent-soft: #262848;
    --green: #6bc49a;
    --amber: #d4a15c;
    --red: #ee858c;
    --action: #f7f8f8;
    --action-ink: #0f1011;
    --shadow: 0 24px 60px rgba(0, 0, 0, .44), 0 3px 12px rgba(0, 0, 0, .28);
  }
  * { box-sizing: border-box; }
  html { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
  body { width: 420px; height: var(--capsule-height); margin: 0; overflow: hidden; padding: 8px 0 0; background: transparent; color: var(--ink); font: 13px/1.45 var(--font); letter-spacing: -.006em; }
  button, select { font: inherit; }
  button:focus-visible, select:focus-visible {
    outline: 1px solid var(--ink);
    outline-offset: -1px;
  }
  .capsule-shell { position: relative; width: 100%; height: calc(var(--capsule-height) - 8px); padding: 0 4px 4px; }
  .capsule__arrow {
    position: absolute; z-index: 2; top: -5px; left: var(--capsule-anchor-x); width: 12px; height: 12px;
    border: 1px solid var(--line-strong); border-right: 0; border-bottom: 0; background: var(--paper);
    transform: translateX(-50%) rotate(45deg); pointer-events: none;
  }
  .capsule {
    position: relative; z-index: 1; display: grid; grid-template-rows: 45px 44px minmax(0, 1fr) 51px;
    width: 100%; height: 100%; overflow: hidden; border: 1px solid var(--line-strong);
    border-radius: 8px; background: var(--paper); box-shadow: var(--shadow);
  }
  .capsule__head { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .capsule__project-wrap { position: relative; display: flex; align-items: center; min-width: 0; max-width: 230px; }
  .capsule__project-mark { position: relative; flex: 0 0 auto; width: 18px; height: 18px; margin-right: 7px; border: 1.5px solid var(--accent); border-radius: 50%; }
  .capsule__project-mark::after { content: ""; position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); transform: translate(-50%, -50%); }
  .capsule__project { min-width: 0; max-width: 202px; height: 30px; border: 0; padding: 0 22px 0 0; background: transparent; color: var(--ink-soft); font-size: 12px; font-weight: 400; text-overflow: ellipsis; cursor: pointer; }
  .capsule__project:hover { color: var(--ink); }
  .capsule__status { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; color: var(--ink-soft); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
  .capsule__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--blue); }
  .capsule-shell[data-state="working"] .capsule__dot { background: var(--accent); animation: capsule-pulse 1.8s cubic-bezier(.16, 1, .3, 1) infinite; }
  .capsule-shell[data-state="checking"] .capsule__dot { background: var(--amber); }
  .capsule-shell[data-state="needs_you"] .capsule__dot,
  .capsule-shell[data-state="blocked"] .capsule__dot { background: var(--red); }
  .capsule-shell[data-state="complete"] .capsule__dot,
  .capsule-shell[data-state="ready"] .capsule__dot { background: var(--green); }
  .capsule-shell[data-state="empty"] .capsule__dot,
  .capsule-shell[data-state="disconnected"] .capsule__dot { background: var(--faint); }
  .capsule__tabs { min-width: 0; display: flex; align-items: stretch; gap: 2px; overflow-x: auto; overflow-y: hidden; padding: 0 10px; border-bottom: 1px solid var(--line); background: var(--paper); scrollbar-width: none; }
  .capsule__tabs::-webkit-scrollbar { display: none; }
  .capsule__tab { position: relative; flex: 0 0 auto; min-width: 0; border: 0; padding: 0 8px; background: transparent; color: var(--muted); font-size: 12px; font-weight: 400; white-space: nowrap; cursor: pointer; }
  .capsule__tab::after { content: ""; position: absolute; right: 8px; bottom: 0; left: 8px; height: 2px; border-radius: 4px 4px 0 0; background: transparent; }
  .capsule__tab:hover { color: var(--ink-soft); }
  .capsule__tab[aria-selected="true"] { color: var(--ink); }
  .capsule__tab[aria-selected="true"]::after { background: var(--accent); }
  .capsule__tab-count { margin-left: 3px; color: var(--faint); font-variant-numeric: tabular-nums; }
  .capsule__tab[aria-selected="true"] .capsule__tab-count { color: var(--accent); }
  .capsule__list { min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; background: var(--paper); overscroll-behavior: contain; }
  .capsule__goal-row { border-bottom: 1px solid var(--line); }
  .capsule__goal-row:last-child { border-bottom: 0; }
  .capsule__goal-summary { width: 100%; min-width: 0; border: 0; padding: 11px 13px 10px; background: transparent; color: inherit; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; cursor: pointer; }
  .capsule__goal-summary:hover { background: var(--surface); }
  .capsule__goal-summary[aria-expanded="true"] { background: var(--surface); }
  .capsule__goal-title { min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: 400; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .capsule__goal-summary[aria-expanded="true"] .capsule__goal-title { overflow: visible; text-overflow: clip; white-space: normal; }
  .capsule__goal-state { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; font-weight: 400; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .capsule__goal-state::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .capsule__goal-row[data-tone="working"] .capsule__goal-state::before { background: var(--accent); }
  .capsule__goal-row[data-tone="checking"] .capsule__goal-state::before { background: var(--amber); }
  .capsule__goal-row[data-tone="needs_you"] .capsule__goal-state::before,
  .capsule__goal-row[data-tone="blocked"] .capsule__goal-state::before { background: var(--red); }
  .capsule__goal-row[data-tone="ready"] .capsule__goal-state::before,
  .capsule__goal-row[data-tone="complete"] .capsule__goal-state::before { background: var(--green); }
  .capsule__goal-next { min-width: 0; display: flex; align-items: baseline; gap: 5px; overflow: hidden; color: var(--ink-soft); font-size: 12px; line-height: 1.4; }
  .capsule__goal-next small { flex: 0 0 auto; color: var(--muted); font-size: 10px; }
  .capsule__goal-next span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .capsule__chevron { align-self: center; width: 7px; height: 7px; margin-right: 3px; border-right: 1.5px solid var(--faint); border-bottom: 1.5px solid var(--faint); transform: rotate(45deg); transition: transform 150ms cubic-bezier(.16, 1, .3, 1); }
  .capsule__goal-summary[aria-expanded="true"] .capsule__chevron { transform: rotate(225deg) translate(-1px, -1px); }
  .capsule__goal-details { padding: 0 13px 13px; background: var(--surface); }
  .capsule__why { margin: 0; padding: 10px 0 9px; border-top: 1px solid var(--line); color: var(--ink-soft); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .capsule__why strong { margin-right: 5px; color: var(--ink); font-size: 10px; }
  .capsule__facts { margin: 0; }
  .capsule__fact { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 9px; padding: 5px 0; }
  .capsule__fact dt { color: var(--muted); font-size: 10px; font-weight: 400; }
  .capsule__fact dd { min-width: 0; margin: 0; color: var(--ink-soft); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .capsule__fact--next dt { color: var(--accent); }
  .capsule__fact--next dd { color: var(--ink); font-weight: 400; }
  .capsule__item-actions { display: flex; justify-content: flex-end; gap: 7px; padding-top: 9px; }
  .capsule__item-action { min-height: 30px; border: 1px solid var(--action); border-radius: 7px; padding: 0 11px; background: var(--action); color: var(--action-ink); font-size: 12px; font-weight: 400; cursor: pointer; }
  .capsule__item-action:hover { border-color: var(--ink); background: var(--ink); color: var(--action-ink); }
  .capsule__empty { min-height: 100%; padding: 38px 28px; color: var(--muted); display: grid; place-content: center; gap: 5px; text-align: center; }
  .capsule__empty strong { color: var(--ink); font-size: 13px; }
  .capsule__empty span { max-width: 30ch; font-size: 12px; line-height: 1.5; }
  .capsule__loading { min-height: 100%; padding: 38px 28px; color: var(--muted); display: grid; place-content: center; justify-items: center; gap: 9px; text-align: center; }
  .capsule__loading strong { color: var(--ink); font-size: 13px; }
  .capsule__loading span { max-width: 30ch; font-size: 12px; line-height: 1.5; }
  .capsule__spinner { width: 20px; height: 20px; margin-bottom: 2px; border: 2px solid var(--line-strong); border-top-color: var(--accent); border-radius: 50%; animation: capsule-spin .72s linear infinite; }
  .capsule__actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px 9px 14px; border-top: 1px solid var(--line); background: var(--surface); }
  .capsule__hint { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 10px; }
  .capsule__buttons { display: flex; gap: 6px; }
  .capsule__button { height: 31px; border: 1px solid var(--line-strong); border-radius: 7px; padding: 0 11px; background: var(--paper-raised); color: var(--ink-soft); font-size: 12px; font-weight: 400; cursor: pointer; transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease; }
  .capsule__button:hover { border-color: var(--faint); background: var(--surface-hover); color: var(--ink); }
  .capsule__button:active { transform: translateY(1px); }
  .capsule__button--primary { border-color: var(--action); background: var(--action); color: var(--action-ink); }
  .capsule__button--primary:hover { border-color: var(--ink); background: var(--ink); color: var(--action-ink); }
  .capsule__error { display: none; grid-row: 1 / -1; place-content: center; justify-items: center; gap: 8px; margin: 0; padding: 30px; color: var(--muted); text-align: center; font-size: 12px; line-height: 1.55; }
  .capsule__error::before { content: "!"; display: block; width: 28px; height: 28px; margin: 0 auto; border: 1px solid currentColor; border-radius: 50%; font-weight: 400; line-height: 26px; }
  .capsule__error strong { color: var(--ink); font-size: 13px; }
  .capsule__error span { max-width: 32ch; }
  .capsule__retry { min-height: 30px; margin-top: 5px; border: 1px solid var(--line-strong); border-radius: 7px; padding: 0 12px; background: var(--paper-raised); color: var(--ink-soft); font-size: 12px; font-weight: 400; cursor: pointer; }
  .capsule__retry:hover { border-color: var(--faint); background: var(--surface-hover); color: var(--ink); }
  .capsule-shell[data-error="true"] .capsule > :not(.capsule__error) { display: none; }
  .capsule-shell[data-error="true"] .capsule__error { display: grid; }
  @keyframes capsule-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 55% { opacity: .42; transform: scale(.72); } }
  @keyframes capsule-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .capsule__dot, .capsule__spinner { animation: none !important; }
    .capsule__button, .capsule__chevron { transition: none; }
  }
  ${SELECT_MENU_STYLES}
  .capsule__project-wrap .mw-select-picker { min-width: 0; max-width: 202px; }
  .capsule__project-wrap .mw-select-picker__trigger { height: 30px; }
`;

export const CAPSULE_CLIENT_SCRIPT = `
(() => {
  const root = document.querySelector("[data-capsule]");
  if (!root) return;
  const projects = JSON.parse(document.getElementById("capsule-projects")?.textContent || "[]");
  const projectSelects = Array.from(document.querySelectorAll("[data-capsule-project]"));
  const storageKey = "molis-work:capsule-project";
  const viewStorageKey = "molis-work:capsule-view:v1";
  const invoke = window.__TAURI__?.core?.invoke;
  const tabsRoot = document.querySelector("[data-capsule-tabs]");
  const listRoot = document.querySelector("[data-capsule-list]");
  const validProject = (id) => projects.some((project) => project.project_id === id);
  let savedView = { projectId: "", projects: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(viewStorageKey) || "null");
    if (parsed && parsed.projects && typeof parsed.projects === "object") savedView = parsed;
  } catch {}
  const requested = new URLSearchParams(location.search).get("project");
  let projectId = validProject(requested) ? requested : null;
  if (!projectId && validProject(savedView.projectId)) projectId = savedView.projectId;
  if (!projectId) {
    try {
      const stored = localStorage.getItem(storageKey);
      if (validProject(stored)) projectId = stored;
    } catch {}
  }
  if (!projectId) projectId = projects[0]?.project_id || "";
  let snapshot = null;
  let selectedTab = savedView.projects?.[projectId]?.selectedTab || null;
  let expandedGoal = savedView.projects?.[projectId]?.expandedGoal || null;
  let lastHeight = null;
  let requestSequence = 0;
  let activeRequest = null;
  const selectedTabs = new Map(
    Object.entries(savedView.projects || {}).map(([id, value]) => [id, value?.selectedTab || null]),
  );
  const expandedGoals = new Map(
    Object.entries(savedView.projects || {}).map(([id, value]) => [id, value?.expandedGoal || null]),
  );

  const saveView = () => {
    const projectViews = {};
    projects.forEach((project) => {
      const selected = selectedTabs.get(project.project_id) || null;
      const expanded = expandedGoals.get(project.project_id) || null;
      if (selected || expanded) projectViews[project.project_id] = { selectedTab: selected, expandedGoal: expanded };
    });
    try {
      localStorage.setItem(viewStorageKey, JSON.stringify({ projectId, projects: projectViews }));
      localStorage.setItem(storageKey, projectId);
    } catch {}
  };

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((node) => { node.textContent = value || ""; });
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const elapsed = (since) => {
    if (!since) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000));
    if (!Number.isFinite(seconds)) return "";
    if (seconds < 60) return seconds + "s";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m";
    return Math.floor(seconds / 3600) + "h";
  };
  const syncElapsed = () => {
    document.querySelectorAll("[data-status-since]").forEach((node) => {
      const duration = elapsed(node.dataset.statusSince);
      node.textContent = duration ? node.dataset.statusLabel + " · " + duration : node.dataset.statusLabel;
    });
  };
  const openPath = (path) => {
    if (!path) return;
    if (invoke) invoke("capsule_open_main", { path }).catch(() => { location.href = path; });
    else location.href = path;
  };
  const capsuleLocale = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
  const capsuleRequestPath = (path) => path + (path.includes("?") ? "&" : "?") + "locale=" + capsuleLocale;
  const appendFact = (list, label, value, emphasized = false) => {
    const row = element("div", "capsule__fact" + (emphasized ? " capsule__fact--next" : ""));
    row.append(element("dt", "", label), element("dd", "", value || "—"));
    list.append(row);
  };
  const projectName = (id) => projects.find((project) => project.project_id === id)?.display_name || L("当前项目");
  const setCapsuleHeight = (height) => {
    document.documentElement.style.setProperty("--capsule-height", height + "px");
    if (height === lastHeight) return;
    lastHeight = height;
    invoke?.("capsule_resize", { height }).catch(() => {});
  };
  const setLoading = (id) => {
    root.dataset.loading = "true";
    root.dataset.error = "false";
    root.dataset.state = "empty";
    root.setAttribute("aria-busy", "true");
    tabsRoot?.replaceChildren();
    tabsRoot?.setAttribute("aria-busy", "true");
    listRoot?.removeAttribute("aria-labelledby");
    listRoot?.setAttribute("aria-busy", "true");
    if (listRoot) {
      const loading = element("div", "capsule__loading");
      const spinner = element("i", "capsule__spinner");
      spinner.setAttribute("aria-hidden", "true");
      loading.append(
        spinner,
        element("strong", "", L("正在读取「{project}」", { project: projectName(id) })),
        element("span", "", L("正在获取这个项目的最新工作状态")),
      );
      listRoot.replaceChildren(loading);
    }
    setText("[data-capsule-status-text]", L("正在读取…"));
    document.querySelectorAll("[data-capsule-open-board]").forEach((button) => {
      button.dataset.path = "/projects/" + encodeURIComponent(id);
    });
    setCapsuleHeight(280);
  };
  const clearLoading = () => {
    root.dataset.loading = "false";
    root.removeAttribute("aria-busy");
    tabsRoot?.removeAttribute("aria-busy");
    listRoot?.removeAttribute("aria-busy");
  };
  const syncPanelStatus = () => {
    const tab = snapshot?.tabs?.find((candidate) => candidate.kind === selectedTab);
    const count = tab?.items?.length || 0;
    setText("[data-capsule-status-text]", tab
      ? (count > 1 ? tab.label + " · " + count : tab.label)
      : snapshot?.state?.menu_bar_title);
    root.dataset.state = tab?.tone || snapshot?.state?.kind || "empty";
  };
  const syncCapsuleHeight = () => {
    window.requestAnimationFrame(() => {
      if (!listRoot) return;
      const chromeHeight = 148;
      const listContentHeight = Array.from(listRoot.children)
        .reduce((total, node) => total + node.getBoundingClientRect().height, 0);
      const desired = snapshot?.tabs?.length
        ? chromeHeight + listContentHeight
        : 280;
      const height = Math.max(252, Math.min(476, Math.ceil(desired)));
      setCapsuleHeight(height);
    });
  };
  const renderList = (focusGoalId = null) => {
    if (!snapshot || !listRoot) return;
    const tab = snapshot.tabs.find((candidate) => candidate.kind === selectedTab);
    listRoot.replaceChildren();
    if (tab) listRoot.setAttribute("aria-labelledby", "capsule-tab-" + tab.kind);
    else listRoot.removeAttribute("aria-labelledby");
    if (!tab) {
      const empty = element("div", "capsule__empty");
      empty.append(
        element("strong", "", L("当前没有需要处理的 Goal")),
        element("span", "", L("有新的工作、决定或可开始事项时，会自动出现在这里。")),
      );
      listRoot.append(empty);
      syncCapsuleHeight();
      return;
    }
    tab.items.forEach((item) => {
      const expanded = expandedGoal === item.goal_id;
      const row = element("article", "capsule__goal-row");
      row.dataset.tone = item.kind;
      const summary = element("button", "capsule__goal-summary");
      summary.type = "button";
      summary.dataset.goalId = item.goal_id;
      summary.title = item.goal_title;
      summary.setAttribute("aria-expanded", String(expanded));
      summary.setAttribute("aria-controls", "capsule-details-" + item.goal_id);
      summary.setAttribute("aria-label", (expanded ? L("收起 Goal 详情：") : L("展开 Goal 详情：")) + item.goal_title);
      const title = element("span", "capsule__goal-title", item.goal_title);
      const status = element("span", "capsule__goal-state");
      status.dataset.statusSince = item.status_since || "";
      status.dataset.statusLabel = item.status_label;
      const next = element("span", "capsule__goal-next");
      next.append(element("small", "", L("下一步")), element("span", "", item.next_step));
      const chevron = element("span", "capsule__chevron");
      chevron.setAttribute("aria-hidden", "true");
      summary.append(title, status, next, chevron);
      summary.addEventListener("click", () => {
        expandedGoal = expanded ? null : item.goal_id;
        expandedGoals.set(projectId, expandedGoal);
        saveView();
        renderList(item.goal_id);
        syncElapsed();
      });
      row.append(summary);
      if (expanded) {
        const details = element("div", "capsule__goal-details");
        details.id = "capsule-details-" + item.goal_id;
        const why = element("p", "capsule__why");
        why.append(element("strong", "", L("为什么做")), document.createTextNode(item.why || "—"));
        const facts = element("dl", "capsule__facts");
        if (item.just_completed) appendFact(facts, L("刚完成"), item.just_completed);
        appendFact(facts, L("当前情况"), item.current);
        if (item.blocker) appendFact(facts, L("主要问题"), item.blocker);
        appendFact(facts, L("下一步"), item.next, true);
        const actions = element("div", "capsule__item-actions");
        const action = element("button", "capsule__item-action", item.action_label);
        action.type = "button";
        action.addEventListener("click", () => openPath(item.action_path));
        actions.append(action);
        details.append(why, facts, actions);
        row.append(details);
      }
      listRoot.append(row);
    });
    syncElapsed();
    syncCapsuleHeight();
    if (focusGoalId) {
      window.requestAnimationFrame(() => {
        listRoot.querySelector('[data-goal-id="' + CSS.escape(focusGoalId) + '"]')?.focus({ preventScroll: true });
      });
    }
  };
  const renderTabs = (focusSelected = false) => {
    if (!snapshot || !tabsRoot) return;
    tabsRoot.replaceChildren();
    snapshot.tabs.forEach((tab) => {
      const button = element("button", "capsule__tab");
      button.type = "button";
      button.id = "capsule-tab-" + tab.kind;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.kind === selectedTab));
      button.tabIndex = tab.kind === selectedTab ? 0 : -1;
      button.dataset.tabKind = tab.kind;
      button.append(
        element("span", "", tab.label),
        element("span", "capsule__tab-count", String(tab.items.length)),
      );
      button.addEventListener("click", () => {
        selectedTab = tab.kind;
        selectedTabs.set(projectId, selectedTab);
        expandedGoal = null;
        expandedGoals.set(projectId, null);
        saveView();
        syncPanelStatus();
        renderTabs(true);
        renderList();
      });
      tabsRoot.append(button);
    });
    if (focusSelected) {
      window.requestAnimationFrame(() => {
        tabsRoot.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
      });
    }
  };
  const render = (next) => {
    const projectChanged = snapshot?.project?.project_id !== next.project.project_id;
    const keepTabFocus = tabsRoot?.contains(document.activeElement) || false;
    const focusedGoalId = listRoot?.contains(document.activeElement)
      ? document.activeElement?.closest?.("[data-goal-id]")?.dataset?.goalId || null
      : null;
    snapshot = next;
    clearLoading();
    root.dataset.error = "false";
    projectSelects.forEach((select) => { select.value = next.project.project_id; });
    document.querySelectorAll("[data-capsule-open-board]").forEach((button) => { button.dataset.path = "/projects/" + encodeURIComponent(next.project.project_id); });
    if (projectChanged) expandedGoal = expandedGoals.get(next.project.project_id) || null;
    const expandedItem = expandedGoal
      ? next.tabs.flatMap((tab) => tab.items).find((item) => item.goal_id === expandedGoal)
      : null;
    if (expandedItem) {
      selectedTab = expandedItem.tab_kind;
    } else {
      expandedGoal = null;
      expandedGoals.set(next.project.project_id, null);
      const remembered = projectChanged ? selectedTabs.get(next.project.project_id) : selectedTab;
      selectedTab = next.tabs.some((tab) => tab.kind === remembered) ? remembered : next.default_tab;
    }
    if (selectedTab) selectedTabs.set(next.project.project_id, selectedTab);
    saveView();
    syncPanelStatus();
    renderTabs(keepTabFocus);
    renderList(focusedGoalId);
    invoke?.("capsule_update_menu_bar", {
      title: next.state.menu_bar_title,
      tooltip: next.state.menu_bar_tooltip,
      path: next.state.action_path,
    }).catch(() => {});
  };
  const load = async ({ showLoading = false } = {}) => {
    if (!projectId) {
      clearLoading();
      root.dataset.error = "true";
      setText("[data-capsule-error]", L("还没有 Molis Work 项目"));
      return;
    }
    const requestedProjectId = projectId;
    const requestId = ++requestSequence;
    activeRequest?.controller.abort();
    const controller = new AbortController();
    activeRequest = { requestId, controller };
    if (showLoading) setLoading(requestedProjectId);
    try {
      const response = await fetch(capsuleRequestPath("/projects/" + encodeURIComponent(requestedProjectId) + "/api/capsule"), {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || L("无法读取工作状态"));
      if (requestId !== requestSequence || requestedProjectId !== projectId) return;
      if (payload.project?.project_id !== requestedProjectId) throw new Error(L("读取到的项目不一致，请重试"));
      render(payload);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestSequence || requestedProjectId !== projectId) return;
      clearLoading();
      root.dataset.error = "true";
      root.dataset.state = "disconnected";
      setText("[data-capsule-status-text]", L("连接中断"));
      setText("[data-capsule-error-detail]", L("Molis Work 正在自动重新连接。恢复前，这里不会把旧状态当成正在进行。"));
      setCapsuleHeight(252);
      invoke?.("capsule_update_menu_bar", {
        title: L("连接中断"),
        tooltip: L("暂时无法确认最新工作状态，Molis Work 正在自动重新连接"),
        path: snapshot?.state?.action_path || "/projects/" + encodeURIComponent(requestedProjectId),
      }).catch(() => {});
    } finally {
      if (activeRequest?.requestId === requestId) activeRequest = null;
    }
  };
  const refresh = () => {
    if (activeRequest) return;
    load();
  };

  projectSelects.forEach((select) => {
    select.value = projectId;
    select.addEventListener("change", () => {
      projectId = select.value;
      projectSelects.forEach((other) => { other.value = projectId; });
      selectedTab = selectedTabs.get(projectId) || null;
      expandedGoal = expandedGoals.get(projectId) || null;
      saveView();
      load({ showLoading: true });
    });
  });
  document.addEventListener("click", (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    const openButton = eventTarget?.closest("[data-capsule-open-board]");
    if (openButton) openPath(openButton.dataset.path);
    const retryButton = eventTarget?.closest("[data-capsule-retry]");
    if (retryButton) load({ showLoading: true });
  });
  tabsRoot?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = Array.from(tabsRoot.querySelectorAll("[role=tab]"));
    const current = buttons.indexOf(document.activeElement);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const target = buttons[(current + offset + buttons.length) % buttons.length];
    target?.focus();
    target?.click();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    invoke?.("capsule_hide").catch(() => {});
  });
  load({ showLoading: true });
  window.addEventListener("online", () => load({ showLoading: true }));
  window.setInterval(refresh, 2500);
  window.setInterval(syncElapsed, 1000);
})();`;

function projectOptions(projects: CapsuleProjectNavigation[]): string {
  return projects.map((project) =>
    `<option value="${escapeHtml(project.project_id)}">${escapeHtml(project.display_name)}</option>`
  ).join("");
}

export function renderDesktopCapsuleShell(
  projects: CapsuleProjectNavigation[],
  environment: CapsuleShellEnvironment,
): string {
  const L = environment.translate;
  const options = projectOptions(projects);
  return `<!doctype html><html lang="${environment.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${L("工作胶囊")} · Molis Work</title><script>${environment.themeBootstrapScript}</script><style>${CAPSULE_STYLES}</style></head><body><main class="capsule-shell" data-capsule data-state="empty" data-error="false" data-loading="true" aria-busy="true">
    <i class="capsule__arrow" aria-hidden="true"></i>
    <section class="capsule">
      <header class="capsule__head">
        <label class="capsule__project-wrap"><span class="capsule__project-mark" aria-hidden="true"></span><select class="capsule__project" data-capsule-project aria-label="${L("切换查看的项目")}">${options}</select></label>
        <span class="capsule__status"><i class="capsule__dot" aria-hidden="true"></i><span data-capsule-status-text>${L("正在读取…")}</span></span>
      </header>
      <nav class="capsule__tabs" data-capsule-tabs role="tablist" aria-label="${L("按工作状态查看 Goal")}" aria-busy="true"></nav>
      <section class="capsule__list" data-capsule-list role="tabpanel" aria-live="polite" aria-busy="true"><div class="capsule__loading"><i class="capsule__spinner" aria-hidden="true"></i><strong>${L("正在读取工作状态")}</strong><span>${L("正在获取这个项目的最新工作状态")}</span></div></section>
      <footer class="capsule__actions"><p class="capsule__hint">Esc ${L("关闭")}</p><div class="capsule__buttons"><button class="capsule__button" type="button" data-capsule-open-board>${L("打开 Molis Work")}</button></div></footer>
      <div class="capsule__error" data-capsule-error role="alert"><strong>${L("暂时无法确认最新状态")}</strong><span data-capsule-error-detail>${L("Molis Work 正在自动重新连接。恢复前，这里不会把旧状态当成正在进行。")}</span><button class="capsule__retry" type="button" data-capsule-retry>${L("立即重试")}</button></div>
    </section>
  </main><script id="capsule-projects" type="application/json">${safeJson(projects)}</script><script>${environment.clientI18nScript}${SELECT_MENU_CLIENT_SCRIPT}${CAPSULE_CLIENT_SCRIPT}</script></body></html>`;
}

