/** Goal Tree browser behavior. Host still owns shared refresh/save and the surrounding startup scope. */
const GOALS_TREE_FILTER_SCRIPT = `    function setSelectedStatuses(values) {
      const available = new Set([...document.querySelectorAll("[data-status-filter]")].map((input) => input.value));
      selectedStatuses = new Set((Array.isArray(values) ? values : []).filter((status) => available.has(status)));
      document.querySelectorAll("[data-status-filter]").forEach((input) => {
        input.checked = selectedStatuses.has(input.value);
      });
      const selectedCount = selectedStatuses.size;
      const summary = treeFilter?.querySelector("[data-tree-filter-summary]");
      const clear = treeFilter?.querySelector("[data-clear-status-filter]");
      if (summary) summary.textContent = selectedCount ? L("已选择 {count} 种状态", { count: selectedCount }) : L("显示全部状态");
      if (clear) clear.disabled = selectedCount === 0;
      treeFilterTrigger?.classList.toggle("is-active", selectedCount > 0);
      treeFilterTrigger?.setAttribute("aria-label", selectedCount ? L("筛选目标，已选择 {count} 种状态", { count: selectedCount }) : L("筛选目标"));
    }

    function setTreeFilterOpen(open, focusFirst = false) {
      if (!treeFilter || !treeFilterTrigger) return;
      treeFilter.hidden = !open;
      treeFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (treeFilter.hidden) return;
          const firstStatusFilter = treeFilter.querySelector("[data-status-filter]");
          if (firstStatusFilter instanceof HTMLElement) firstStatusFilter.focus({ preventScroll: true });
        });
      }
    }

    function filterTree(value) {
      const query = value.trim().toLowerCase();
      const items = [...document.querySelectorAll("[data-tree-item]")];
      const matched = items.filter((item) => {
        const matchesQuery = !query || String(item.dataset.goalSearch || "").includes(query);
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(item.dataset.goalStatus);
        item.hidden = !(matchesQuery && matchesStatus);
        return !item.hidden;
      });
      if (query || selectedStatuses.size) {
        matched.forEach((item) => {
          let parent = item.parentElement?.closest("[data-tree-item]");
          while (parent) {
            parent.hidden = false;
            parent.classList.remove("is-collapsed");
            parent = parent.parentElement?.closest("[data-tree-item]");
          }
        });
      }
      const count = document.querySelector("[data-tree-filter-count]");
      const empty = treeScroll.querySelector("[data-tree-filter-empty]");
      const suffix = count?.dataset.treeSuffix || "";
      if (count) {
        const suffixText = suffix ? suffix + " " : "";
        count.textContent = !query && selectedStatuses.size === 0
          ? L("共 {count} 个{suffix}目标", { count: items.length, suffix: suffixText })
          : L("显示 {shown} / {total} 个{suffix}目标", { shown: matched.length, total: items.length, suffix: suffixText });
      }
      if (empty) empty.hidden = matched.length > 0 || items.length === 0;
      updateGraphVisibility();
    }

`;

const GOALS_TREE_SEARCH_EVENTS_SCRIPT = `    treeSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterTree(treeSearch.value);
      queueSave();
    });
    treeSearch?.addEventListener("focus", () => noteSearchActivity(500));
    treeSearch?.addEventListener("keydown", () => noteSearchActivity());
    treeSearch?.addEventListener("compositionstart", () => {
      searchComposing = true;
      noteSearchActivity();
    });
    treeSearch?.addEventListener("compositionend", () => {
      searchComposing = false;
      noteSearchActivity(500);
    });
    treeScroll.addEventListener("keydown", (event) => {
      if (event.target !== treeScroll) return;
      const page = Math.max(38, treeScroll.clientHeight - 38);
      const next = {
        ArrowDown: treeScroll.scrollTop + 38,
        ArrowUp: treeScroll.scrollTop - 38,
        PageDown: treeScroll.scrollTop + page,
        PageUp: treeScroll.scrollTop - page,
        Home: 0,
        End: treeScroll.scrollHeight,
      }[event.key];
      if (next == null) return;
      event.preventDefault();
      treeScroll.scrollTop = next;
      queueSave();
    });
    treeScroll.addEventListener("scroll", queueSave, { passive: true });
`;

const GOALS_TREE_STATUS_CHANGE_SCRIPT = `      const statusFilter = changed.closest("[data-status-filter]");
      if (statusFilter) {
        if (statusFilter.checked) selectedStatuses.add(statusFilter.value);
        else selectedStatuses.delete(statusFilter.value);
        setSelectedStatuses([...selectedStatuses]);
        filterTree(treeSearch?.value || "");
        queueSave();
        return true;
      }
      return false;
`;

const GOALS_TREE_FILTER_TRIGGER_SCRIPT = `    treeFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTreeFilterOpen(treeFilter?.hidden !== false, true);
    });
`;

const GOALS_TREE_SEARCH_FOCUS_SCRIPT = `      if (target.closest("[data-personal-search]")) {
        treeSearch?.focus();
        treeSearch?.select();
        return true;
      }
      return false;
`;

const GOALS_TREE_DISCLOSURE_SCRIPT = `      if (!treeFilter?.hidden && !target.closest("[data-tree-filter], [data-tree-filter-trigger]")) setTreeFilterOpen(false);
      if (target.closest("[data-clear-status-filter]")) {
        setSelectedStatuses([]);
        filterTree(treeSearch?.value || "");
        queueSave();
        return true;
      }
      if (target.closest("[data-clear-tree-filter]")) {
        if (treeSearch) treeSearch.value = "";
        setSelectedStatuses([]);
        filterTree("");
        queueSave();
        return true;
      }
      const treeToggle = target.closest("[data-tree-toggle]");
      if (treeToggle) {
        const item = treeToggle.closest("[data-tree-item]");
        const collapsed = item.classList.toggle("is-collapsed");
        treeToggle.setAttribute("aria-expanded", String(!collapsed));
        saveUiState();
        return true;
      }
      return false;
`;

const GOALS_TREE_COLLAPSE_ALL_SCRIPT = `      if (target.closest("[data-collapse-all]")) {
        const items = [...document.querySelectorAll("[data-tree-item]")];
        const shouldCollapse = items.some((item) => !item.classList.contains("is-collapsed"));
        items.forEach((item) => item.classList.toggle("is-collapsed", shouldCollapse));
        document.querySelectorAll("[data-tree-toggle]").forEach((button) => {
          button.setAttribute("aria-expanded", String(!shouldCollapse));
        });
        saveUiState();
        return true;
      }
      return false;
`;

const GOALS_TREE_KEYBOARD_SCRIPT = `      if (event.key === "Escape" && !treeFilter?.hidden) {
        event.preventDefault();
        setTreeFilterOpen(false);
        treeFilterTrigger?.focus();
        return true;
      }
      return false;
`;

/** Goal Tree state and handlers; shared refresh scheduling remains a Host service. */
export const GOALS_TREE_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { treeFilter, treeFilterTrigger, treeSearch, treeScroll, globalSearch,
      translate: L, updateGraphVisibility, queueSave, saveUiState, noteSearchActivity } = host;
    let selectedStatuses = new Set();
    let searchComposing = false;
${GOALS_TREE_FILTER_SCRIPT}
    const expandAncestors = (node) => {
      let parent = node?.closest(".tree-item")?.parentElement?.closest(".tree-item");
      while (parent) {
        parent.classList.remove("is-collapsed");
        parent.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", "true");
        parent = parent.parentElement?.closest(".tree-item");
      }
    };


    const selectTreeGoal = (goalId) => {
      document.querySelectorAll(".tree-node[data-select-goal]").forEach((button) => {
        const active = button.dataset.selectGoal === goalId;
        button.classList.toggle("is-selected", active);
        button.closest(".tree-entry")?.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
        if (active) expandAncestors(button);
      });
    };
    const getCollapsedTreeGoals = () => [...document.querySelectorAll("[data-tree-item].is-collapsed")].map((item) => item.dataset.goalId);
    const restoreTreeCollapsed = (values) => {
      const collapsed = new Set(values || []);
      document.querySelectorAll("[data-tree-item]").forEach((item) => {
        const isCollapsed = collapsed.has(item.dataset.goalId);
        item.classList.toggle("is-collapsed", isCollapsed);
        item.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", String(!isCollapsed));
      });
    };
    const getSelectedStatuses = () => [...selectedStatuses];
    const isTreeSearchComposing = () => searchComposing;
    const bindTreeSearchEvents = () => {
${GOALS_TREE_SEARCH_EVENTS_SCRIPT}    };
    const bindTreeFilterTrigger = () => {
${GOALS_TREE_FILTER_TRIGGER_SCRIPT}    };
    const handleTreeStatusChange = (changed) => {
${GOALS_TREE_STATUS_CHANGE_SCRIPT}    };
    const handleTreeSearchFocus = (target) => {
${GOALS_TREE_SEARCH_FOCUS_SCRIPT}    };
    const handleTreeDisclosureClick = (target) => {
${GOALS_TREE_DISCLOSURE_SCRIPT}    };
    const handleTreeCollapseAllClick = (target) => {
${GOALS_TREE_COLLAPSE_ALL_SCRIPT}    };
    const handleTreeKeyboard = (event) => {
${GOALS_TREE_KEYBOARD_SCRIPT}    };
    return { selectTreeGoal, getCollapsedTreeGoals, restoreTreeCollapsed, setSelectedStatuses, getSelectedStatuses, isTreeSearchComposing,
      setTreeFilterOpen, filterTree, bindTreeSearchEvents, bindTreeFilterTrigger,
      handleTreeStatusChange, handleTreeSearchFocus, handleTreeDisclosureClick,
      handleTreeCollapseAllClick, handleTreeKeyboard };
  }`;
