import { elementOf } from "./dom.js";

export interface PanelsHost {
  readonly documentPane: HTMLElement;
  readonly activateFocusSection: (trigger: Element) => boolean;
  readonly queueSave: () => void;
  readonly openEventReader?: (name: string) => unknown;
}

/** The factor tabs and event readers of a Goal's document. */
export function panelsClient(host: PanelsHost) {
  const { documentPane, activateFocusSection, queueSave, openEventReader } = host;
  const goalFactorKeys = ["relations", "rules"];
  const eventReaderFromTargetId = (targetId: string) => {
    if (!targetId) return "";
    const target = document.getElementById(targetId);
    const rendered = target?.closest?.<HTMLElement>("[data-event-panel]")?.dataset.eventPanel;
    if (rendered === "description" || rendered === "requirements" || rendered === "planning") return rendered;
    if (targetId.startsWith("goal-description-")) return "description";
    if (targetId.startsWith("goal-requirements-") || targetId.startsWith("completion-") || targetId.startsWith("acceptance-")) return "requirements";
    if (/^(?:goal-factor-panel|relation)-/.test(targetId)) return "description";
    return "";
  };

  const eventReaderFromHash = () => eventReaderFromTargetId(decodeURIComponent(location.hash.slice(1)));

  const openEventReaderFromHash = () => {
    const reader = eventReaderFromHash();
    if (reader) openEventReader?.(reader);
    return Boolean(reader);
  };

  const goalFactorFromTargetId = (targetId: string) => {
    if (!targetId) return "";
    const target = document.getElementById(targetId);
    const renderedFactor = target?.closest?.<HTMLElement>("[data-goal-factor-panel]")?.dataset.goalFactorPanel;
    if (renderedFactor) return renderedFactor;
    const factorTarget = targetId.match(/^goal-factor-panel-(relations|rules)-/);
    if (factorTarget) return factorTarget[1];
    if (targetId.startsWith("relation-")) return "relations";
    return "";
  };

  const goalFactorFromHash = () => {
    const targetId = decodeURIComponent(location.hash.slice(1));
    return goalFactorFromTargetId(targetId);
  };

  const setGoalFactor = (factorName: string, persist = true, updateHash = false) => {
    const article = documentPane.querySelector<HTMLElement>("[data-goal-view]");
    if (!article) return false;
    const factor = goalFactorKeys.includes(factorName) ? factorName : "relations";
    const activePanel = article.querySelector('[data-goal-factor-panel="' + factor + '"]');
    if (!activePanel) {
      article.dataset.activeFactor = factor;
      return false;
    }
    const trigger = article.querySelector('[data-goal-factor-tab="' + factor + '"]');
    if (trigger) activateFocusSection(trigger);
    article.dataset.activeFactor = factor;
    article.querySelectorAll<HTMLElement>("[data-goal-factor-tab]").forEach((button) => {
      const active = button.dataset.goalFactorTab === factor;
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("tabindex", active ? "0" : "-1");
    });
    if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
    if (persist) queueSave();
    return true;
  };

  const handleGoalFactorClick = (target: Element) => {
    const factorTab = target.closest<HTMLElement>("[data-goal-factor-tab]");
    if (factorTab) {
      setGoalFactor(factorTab.dataset.goalFactorTab || "", true, true);
      return true;
    }
    return false;
  };
  const handleGoalFactorKeyboard = (event: KeyboardEvent) => {
    const currentFactorTab = elementOf(event)?.closest?.<HTMLElement>("[data-goal-factor-tab]");
    if (currentFactorTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...(currentFactorTab.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>("[data-goal-factor-tab]") ?? [])];
      const currentIndex = tabs.indexOf(currentFactorTab);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      setGoalFactor(nextTab.dataset.goalFactorTab || "", true, true);
      nextTab.focus();
      return true;
    }
    return false;
  };

  return { openEventReaderFromHash, eventReaderFromTargetId, eventReaderFromHash,
    setGoalFactor, goalFactorFromTargetId, goalFactorFromHash,
    handleGoalFactorClick, handleGoalFactorKeyboard };
}
