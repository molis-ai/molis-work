export interface TreeHost {
  readonly treeFilter: HTMLElement | null;
  readonly treeFilterTrigger: HTMLElement | null;
  readonly treeScroll: HTMLElement | null;
  readonly updateGraphVisibility: () => void;
  readonly queueSave: () => void;
  readonly saveUiState: () => void;
}

/** The Goal tree: selection, folding, filters and keyboard. */
export function treeClient(host: TreeHost) {
  const { treeFilter, treeFilterTrigger, treeScroll, updateGraphVisibility, queueSave, saveUiState } = host;
  let selectedStatuses = new Set<string>();
  function setSelectedStatuses(values: unknown) {
    const available = new Set([...document.querySelectorAll<HTMLInputElement>("[data-status-filter]")].map((input) => input.value));
    selectedStatuses = new Set((Array.isArray(values) ? values : []).filter((status): status is string => available.has(status)));
    document.querySelectorAll<HTMLInputElement>("[data-status-filter]").forEach((input) => {
      input.checked = selectedStatuses.has(input.value);
    });
    const selectedCount = selectedStatuses.size;
    const summary = treeFilter?.querySelector("[data-tree-filter-summary]");
    const clear = treeFilter?.querySelector<HTMLButtonElement>("[data-clear-status-filter]");
    if (summary) summary.textContent = selectedCount ? globalThis.t.text("goals.tree-client.count-count-selected", { count: selectedCount }) : globalThis.t.text("goals.tree-client.showing-every-status");
    if (clear) clear.disabled = selectedCount === 0;
    treeFilterTrigger?.classList.toggle("is-active", selectedCount > 0);
    treeFilterTrigger?.setAttribute("aria-label", selectedCount ? globalThis.t.text("goals.tree-client.filter-goals-count-count-selected", { count: selectedCount }) : globalThis.t.text("goals.tree-client.filter-goals"));
  }

  function setTreeFilterOpen(open: boolean, focusFirst = false) {
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

  function filterTree(value: string) {
    const query = value.trim().toLowerCase();
    const items = [...document.querySelectorAll<HTMLElement>("[data-tree-root] [data-tree-item]")];
    const matched = items.filter((item) => {
      const matchesQuery = !query || String(item.dataset.goalSearch || "").includes(query);
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(item.dataset.goalStatus || "");
      item.hidden = !(matchesQuery && matchesStatus);
      return !item.hidden;
    });
    if (query || selectedStatuses.size) {
      matched.forEach((item) => {
        let parent = item.parentElement?.closest<HTMLElement>("[data-tree-item]");
        while (parent) {
          parent.hidden = false;
          parent.classList.remove("is-collapsed");
          parent = parent.parentElement?.closest<HTMLElement>("[data-tree-item]");
        }
      });
    }
    const count = document.querySelector<HTMLElement>("[data-tree-filter-count]");
    const empty = treeScroll?.querySelector<HTMLElement>("[data-tree-filter-empty]");
    const suffix = count?.dataset.treeSuffix || "";
    if (count) {
      const suffixText = suffix ? suffix + " " : "";
      count.textContent = !query && selectedStatuses.size === 0
        ? globalThis.t.text("goals.tree-client.count-suffix-goals", { count: items.length, suffix: suffixText })
        : globalThis.t.text("goals.tree-client.showing-shown-total-suffix-goals", { shown: matched.length, total: items.length, suffix: suffixText });
    }
    if (empty) empty.hidden = matched.length > 0 || items.length === 0;
    updateGraphVisibility();
  }

  const expandAncestors = (node: Element | null) => {
    let parent = node?.closest(".tree-item")?.parentElement?.closest(".tree-item");
    while (parent) {
      parent.classList.remove("is-collapsed");
      parent.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", "true");
      parent = parent.parentElement?.closest(".tree-item");
    }
  };

  const syncGoalCollectionFolds = () => {
    document.querySelectorAll<HTMLDetailsElement>("[data-goal-collection-fold]").forEach((fold) => {
      if (fold.hasAttribute("data-collection-open") || fold.querySelector(".tree-node.is-selected")) fold.open = true;
    });
  };
  const selectTreeGoal = (goalId: string) => {
    document.querySelectorAll<HTMLElement>(".tree-node[data-select-goal]").forEach((button) => {
      const active = button.dataset.selectGoal === goalId;
      button.classList.toggle("is-selected", active);
      button.closest(".tree-entry")?.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        expandAncestors(button);
        const fold = button.closest<HTMLDetailsElement>("[data-goal-collection-fold]");
        if (fold) fold.open = true;
      }
    });
  };
  const getCollapsedTreeGoals = () => [...document.querySelectorAll<HTMLElement>("[data-tree-item].is-collapsed")].map((item) => item.dataset.goalId);
  const restoreTreeCollapsed = (values: unknown) => {
    const collapsed = new Set(Array.isArray(values) ? values : []);
    document.querySelectorAll<HTMLElement>("[data-tree-item]").forEach((item) => {
      const isCollapsed = collapsed.has(item.dataset.goalId);
      item.classList.toggle("is-collapsed", isCollapsed);
      item.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", String(!isCollapsed));
    });
  };
  const getSelectedStatuses = () => [...selectedStatuses];
  const bindTreeSearchEvents = () => {
    treeScroll?.addEventListener("keydown", (event) => {
      if (event.target !== treeScroll) return;
      const page = Math.max(38, treeScroll.clientHeight - 38);
      const next = ({
        ArrowDown: treeScroll.scrollTop + 38,
        ArrowUp: treeScroll.scrollTop - 38,
        PageDown: treeScroll.scrollTop + page,
        PageUp: treeScroll.scrollTop - page,
        Home: 0,
        End: treeScroll.scrollHeight,
      } as Partial<Record<string, number>>)[event.key];
      if (next == null) return;
      event.preventDefault();
      treeScroll.scrollTop = next;
      queueSave();
    });
    treeScroll?.addEventListener("scroll", queueSave, { passive: true });
  };
  const bindTreeFilterTrigger = () => {
    treeFilterTrigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTreeFilterOpen(treeFilter?.hidden !== false, true);
    });
  };
  const handleTreeStatusChange = (changed: Element) => {
    const statusFilter = changed.closest<HTMLInputElement>("[data-status-filter]");
    if (statusFilter) {
      if (statusFilter.checked) selectedStatuses.add(statusFilter.value);
      else selectedStatuses.delete(statusFilter.value);
      setSelectedStatuses([...selectedStatuses]);
      filterTree("");
      queueSave();
      return true;
    }
    return false;
  };
  const handleTreeDisclosureClick = (target: Element) => {
    if (treeFilter?.hidden === false && !target.closest("[data-tree-filter], [data-tree-filter-trigger]")) setTreeFilterOpen(false);
    if (target.closest("[data-clear-status-filter]") || target.closest("[data-clear-tree-filter]")) {
      setSelectedStatuses([]);
      filterTree("");
      queueSave();
      return true;
    }
    const treeToggle = target.closest("[data-tree-toggle]");
    if (treeToggle) {
      const item = treeToggle.closest("[data-tree-item]");
      const collapsed = item?.classList.toggle("is-collapsed") ?? false;
      treeToggle.setAttribute("aria-expanded", String(!collapsed));
      saveUiState();
      return true;
    }
    return false;
  };
  const handleTreeKeyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && treeFilter?.hidden === false) {
      event.preventDefault();
      setTreeFilterOpen(false);
      treeFilterTrigger?.focus();
      return true;
    }
    return false;
  };
  return { selectTreeGoal, syncGoalCollectionFolds, getCollapsedTreeGoals, restoreTreeCollapsed, setSelectedStatuses, getSelectedStatuses,
    setTreeFilterOpen, filterTree, bindTreeSearchEvents, bindTreeFilterTrigger,
    handleTreeStatusChange, handleTreeDisclosureClick,
    handleTreeKeyboard };
}
