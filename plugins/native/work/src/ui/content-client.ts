/** Browser initializer: only the named ports cross this behavior boundary. */
export const WORK_CONTENT_CLIENT = `
({ route, L }) => {
  const sourceLabel = (source) => source === "runtime_native"
    ? L("Runtime 原生")
    : source === "molis_work_tui"
      ? L("Molis Work TUI · 部分终端记录")
      : L("Molis Work 记录");
  const setContentToolbar = (detail, visible) => {
    const toolbar = detail?.querySelector(".session-execution-toolbar");
    if (toolbar) toolbar.hidden = !visible;
  };
  const renderContentState = (detail, title, message, retry = false) => {
    const body = detail.querySelector(".session-content-body");
    body.replaceChildren();
    setContentToolbar(detail, false);
    const state = document.createElement("div");
    state.className = "session-content-state";
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    copy.append(heading, paragraph);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mw-btn mw-btn--secondary";
      button.dataset.sessionRetry = "";
      button.textContent = L("重试读取");
      copy.append(button);
    }
    state.append(copy);
    body.append(state);
  };
  const eventFilterGroup = (kind) => ["user_message", "runtime_message"].includes(kind)
    ? "conversation"
    : ["tool", "approval"].includes(kind)
      ? "tool"
      : kind === "artifact"
        ? "artifact"
        : kind === "terminal_output"
        ? "terminal"
          : "status";
  const timelineIconName = (kind) => ({
    user_message: "user",
    runtime_message: "target",
    tool: "terminal",
    approval: "shield",
    status: "completed",
    artifact: "file",
    terminal_output: "code",
  }[kind] || "info");
  const createTimelineIcon = (kind) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-" + timelineIconName(kind));
    svg.append(use);
    return svg;
  };
  const formatSessionDay = (date) => {
    if (Number.isNaN(date.getTime())) return { key: "unknown", label: L("时间未知") };
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    const locale = document.documentElement.lang || "zh-CN";
    const weekday = date.toLocaleDateString(locale, { weekday: "long" });
    const monthDay = date.toLocaleDateString(locale, { month: "long", day: "numeric" });
    return { key, label: monthDay + " · " + weekday };
  };
  const applySessionContentFilters = (detail) => {
    if (!detail) return;
    const query = String(detail.querySelector("[data-session-content-search]")?.value || "").trim().toLocaleLowerCase();
    const filter = String(detail.querySelector("[data-session-content-filter][aria-pressed='true']")?.dataset.sessionContentFilter || "all");
    let shown = 0;
    detail.querySelectorAll(".session-timeline-event").forEach((item) => {
      const matchesQuery = !query || String(item.dataset.eventSearch || item.textContent || "").toLocaleLowerCase().includes(query);
      const matchesFilter = filter === "all" || item.dataset.eventFilterGroup === filter;
      item.hidden = !matchesQuery || !matchesFilter;
      if (!item.hidden) shown += 1;
    });
    detail.querySelectorAll(".session-day-group").forEach((group) => {
      group.hidden = !group.querySelector(".session-timeline-event:not([hidden])");
    });
    const empty = detail.querySelector("[data-session-content-empty]");
    if (empty) empty.hidden = shown > 0;
  };
  const renderSessionTimeline = (detail, payload) => {
    const body = detail.querySelector(".session-content-body");
    body.replaceChildren();
    const events = Array.isArray(payload.events)
      ? payload.events.filter((event) => String(event.content || "").replace(/[\s\u200B-\u200D\uFEFF]/g, "") || ["tool", "artifact", "terminal_output"].includes(event.kind))
      : [];
    if (!events.length) {
      const title = payload.content_mode === "failed" ? L("Runtime 内容读取失败") : L("还没有可显示的执行内容");
      const message = payload.native_error?.message || (payload.content_mode === "unavailable"
        ? L("这个 Runtime 没有内容读取能力，Molis Work 也还没有持久化的 TUI 记录。")
        : L("Session 身份与关系已经保留，产生执行记录后会显示在这里。"));
      renderContentState(detail, title, message, payload.content_mode === "failed");
      return;
    }
    setContentToolbar(detail, true);
    const list = document.createElement("div");
    list.className = "session-transcript";
    list.dataset.sessionContentList = "";
    if (payload.native_error?.message) {
      const warning = document.createElement("p");
      warning.className = "session-content-warning";
      warning.setAttribute("role", "status");
      warning.textContent = payload.native_error.message;
      list.append(warning);
    }
    if (payload.native_history?.mode === "summary") {
      const summary = document.createElement("p");
      summary.className = "session-content-summary";
      summary.setAttribute("role", "status");
      const count = Number(payload.native_history.turn_count || 0);
      summary.textContent = payload.native_history.has_earlier
        ? L("为保证稳定性，这里显示最近 {count} 轮的摘要；更早记录仍保留在原 Runtime。", { count })
        : L("已安全读取这条 Session 的 {count} 轮摘要；大体积工具输出会由原 Runtime 收拢。", { count });
      list.append(summary);
    }
    const dayGroups = new Map();
    events.forEach((event) => {
      const occurredAt = new Date(event.occurred_at);
      const day = formatSessionDay(occurredAt);
      let group = dayGroups.get(day.key);
      if (!group) {
        group = document.createElement("section");
        group.className = "session-day-group";
        group.dataset.sessionDay = day.key;
        const dayHeading = document.createElement("header");
        dayHeading.className = "session-day-heading";
        const dayLabel = document.createElement("time");
        dayLabel.dateTime = day.key === "unknown" ? "" : day.key;
        dayLabel.textContent = day.label;
        dayHeading.append(dayLabel);
        group.append(dayHeading);
        dayGroups.set(day.key, group);
        list.append(group);
      }
      const article = document.createElement("article");
      article.className = "session-timeline-event session-event--" + (event.kind || "status");
      article.dataset.eventKind = event.kind || "status";
      article.dataset.eventFilterGroup = eventFilterGroup(event.kind);
      article.dataset.eventSearch = [event.label, event.content, sourceLabel(event.source), event.metadata?.status].filter(Boolean).join(" ").toLocaleLowerCase();
      const timeRail = document.createElement("time");
      timeRail.className = "session-event-time";
      timeRail.dateTime = event.occurred_at || "";
      timeRail.textContent = Number.isNaN(occurredAt.getTime()) ? "—" : occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const track = document.createElement("div");
      track.className = "session-event-track";
      const node = document.createElement("span");
      node.setAttribute("aria-hidden", "true");
      node.append(createTimelineIcon(event.kind));
      track.append(node);
      const card = document.createElement("div");
      card.className = "session-event-card";
      const eventContent = String(event.content || "");
      const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
      const metaParts = [
        sourceLabel(event.source),
        metadata.duration_ms != null && Number.isFinite(Number(metadata.duration_ms)) ? Math.max(0, Math.round(Number(metadata.duration_ms))) + " ms" : "",
        metadata.exit_code != null ? L("退出码 {code}", { code: metadata.exit_code }) : "",
      ].filter(Boolean);
      const rawStatus = typeof metadata.status === "string" ? metadata.status : "";
      const statusText = rawStatus
        ? ({ completed: L("已完成"), failed: L("失败"), running: L("进行中"), pending: L("等待中"), approved: L("已批准"), denied: L("已拒绝") }[rawStatus] || rawStatus)
        : metadata.exit_code === 0
          ? L("已完成")
          : metadata.exit_code != null
            ? L("已结束")
            : "";
      const technical = ["tool", "artifact", "terminal_output"].includes(event.kind);
      const compact = ["status", "approval"].includes(event.kind);
      if (technical) {
        card.classList.add("session-event-card--technical");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const summaryCopy = document.createElement("span");
        summaryCopy.className = "session-event-summary";
        const label = document.createElement("strong");
        label.textContent = event.label || L("执行事件");
        const meta = document.createElement("small");
        meta.textContent = metaParts.join(" · ");
        summaryCopy.append(label, meta);
        if (statusText) {
          const status = document.createElement("span");
          status.className = "session-event-status";
          status.textContent = statusText;
          if (["failed", "denied"].includes(rawStatus)) status.classList.add("is-error");
          summary.append(summaryCopy, status);
        } else {
          summary.append(summaryCopy);
        }
        const disclosure = document.createElement("span");
        disclosure.className = "session-event-disclosure";
        disclosure.append(document.createTextNode(event.kind === "artifact"
          ? L("查看变更")
          : event.kind === "terminal_output"
            ? L("展开输出")
            : L("查看详情")), createTimelineIcon("disclosure"));
        disclosure.querySelector("use")?.setAttribute("href", "#icon-chevron-down");
        summary.append(disclosure);
        const content = document.createElement("pre");
        content.textContent = eventContent || L("没有附加输出。");
        details.append(summary, content);
        card.append(details);
      } else {
        if (compact) card.classList.add("session-event-card--compact");
        const header = document.createElement("header");
        const identity = document.createElement("span");
        identity.className = "session-event-identity";
        const label = document.createElement("strong");
        label.textContent = event.label || (event.kind === "runtime_message" ? "Runtime" : L("执行事件"));
        const source = document.createElement("small");
        source.textContent = sourceLabel(event.source);
        identity.append(label, source);
        const meta = document.createElement("span");
        meta.className = "session-event-meta";
        meta.textContent = metaParts.slice(1).join(" · ");
        header.append(identity, meta);
        const content = document.createElement("p");
        content.textContent = eventContent;
        card.append(header, content);
      }
      article.append(timeRail, track, card);
      group.append(article);
    });
    const empty = document.createElement("p");
    empty.className = "operation-search-empty";
    empty.dataset.sessionContentEmpty = "";
    empty.hidden = true;
    empty.textContent = L("当前内容中没有匹配结果。");
    body.append(list, empty);
    applySessionContentFilters(detail);
  };
  const loadSessionContent = async (detail, force = false) => {
    if (!detail?.dataset.detailId) return;
    if (!force && detail.dataset.sessionStage === "unavailable") return;
    if (!force && ["loading", "loaded"].includes(detail.dataset.contentState || "")) return;
    detail.dataset.contentState = "loading";
    renderContentState(detail, L("正在读取执行内容"), L("正在联系原 Runtime，并加载 Molis Work 已保存的 TUI 记录。"), false);
    try {
      const response = await fetch(route("/api/sessions/" + encodeURIComponent(detail.dataset.detailId) + "/content"), {
        cache: "no-store",
        headers: window.molisWorkControlHeaders?.() || {},
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || L("Session 内容读取失败"));
      detail.dataset.contentState = "loaded";
      renderSessionTimeline(detail, payload);
    } catch (error) {
      detail.dataset.contentState = "failed";
      renderContentState(detail, L("内容读取失败"), error instanceof Error ? error.message : String(error), true);
    }
  };
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-session-content-search]")) applySessionContentFilters(event.target.closest("[data-operation-detail]"));
  });
  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-session-content-filter]");
    if (filter) {
      const group = filter.closest("[data-slot='toggle-group']");
      group?.querySelectorAll("[data-session-content-filter]").forEach((button) => {
        const current = button === filter;
        button.classList.toggle("is-current", current);
        button.setAttribute("aria-pressed", String(current));
      });
      applySessionContentFilters(filter.closest("[data-operation-detail]"));
      return;
    }
    const railOpen = event.target.closest("[data-session-rail-open]");
    if (railOpen) {
      railOpen.closest("[data-operation-detail]")?.classList.toggle("is-rail-open");
      return;
    }
    const railDismiss = event.target.closest("[data-session-rail-dismiss]");
    if (railDismiss) {
      railDismiss.closest("[data-operation-detail]")?.classList.remove("is-rail-open");
      return;
    }
    const load = event.target.closest("[data-session-content-load]");
    const retry = event.target.closest("[data-session-retry]");
    if (load || retry) void loadSessionContent(event.target.closest("[data-operation-detail]"), true);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
    document.querySelector(".session-stage.is-rail-open")?.classList.remove("is-rail-open");
  });
  document.querySelectorAll("[data-session-load]").forEach((button) => button.addEventListener("click", () => {
    const status = button.closest("[data-operation-detail]").querySelector("[data-session-load-status]");
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = L("正在请求原 Runtime 加载这条 Session...");
    button.disabled = true;
    const detail = button.closest("[data-operation-detail]");
    fetch(route("/api/sessions/" + encodeURIComponent(detail.dataset.detailId) + "/resume"), {
      method: "POST",
      headers: window.molisWorkControlHeaders?.() || {},
      body: "{}",
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.message || payload.error || L("Runtime 加载失败")), { nextAction: payload.next_action });
      status.textContent = L("原 Runtime 已加载这条 Session，可以继续执行。");
    }).catch((error) => {
      status.textContent = error.nextAction === "create_handoff"
        ? L("{message} 可以使用“创建 Handoff”交给新的目标 Session。", { message: error.message })
        : error.message;
      status.classList.toggle("is-error", !String(error.message || "").includes("无需重复加载"));
    }).finally(() => { button.disabled = false; });
  }));
  return { loadSessionContent };
}
`;
