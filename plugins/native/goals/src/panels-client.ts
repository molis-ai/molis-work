/** Factor and reader deep-links; old five-tab lazy loading is gone. */
const GOALS_READER_HASH_SCRIPT = `    const eventReaderFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
      const rendered = target?.closest?.("[data-event-panel]")?.dataset.eventPanel;
      if (rendered === "description" || rendered === "requirements" || rendered === "planning") return rendered;
      if (targetId.startsWith("goal-description-")) return "description";
      if (targetId.startsWith("goal-requirements-") || targetId.startsWith("completion-") || targetId.startsWith("acceptance-")) return "requirements";
      if (/^(?:goal-factor-panel|relation|risk|impact)-/.test(targetId)) return "description";
      return "";
    };

    const eventReaderFromHash = () => eventReaderFromTargetId(decodeURIComponent(location.hash.slice(1)));

    const openEventReaderFromHash = () => {
      const reader = eventReaderFromHash();
      if (reader) openEventReader?.(reader);
      return Boolean(reader);
    };

    const goalFactorFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
      const renderedFactor = target?.closest?.("[data-goal-factor-panel]")?.dataset.goalFactorPanel;
      if (renderedFactor) return renderedFactor;
      const factorTarget = targetId.match(/^goal-factor-panel-([a-z]+)-/);
      if (factorTarget && goalFactorKeys.includes(factorTarget[1])) return factorTarget[1];
      if (targetId.startsWith("goal-description-")) return "basics";
      if (targetId.startsWith("relation-")) return "relations";
      if (targetId.startsWith("risk-")) return "risks";
      if (targetId.startsWith("impact-")) return "impacts";
      return "";
    };

    const goalFactorFromHash = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      return goalFactorFromTargetId(targetId);
    };

`;

const GOALS_FACTOR_CLICK_SCRIPT = `    const handleGoalFactorClick = (target) => {
      const factorTab = target.closest("[data-goal-factor-tab]");
      if (factorTab) {
        setGoalFactor(factorTab.dataset.goalFactorTab, true, true);
        return true;
      }
      return false;
    };
`;

const GOALS_FACTOR_KEYBOARD_SCRIPT = `    const handleGoalFactorKeyboard = (event) => {
      const currentFactorTab = event.target?.closest?.("[data-goal-factor-tab]");
      if (currentFactorTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentFactorTab.closest('[role="tablist"]').querySelectorAll("[data-goal-factor-tab]")];
        const currentIndex = tabs.indexOf(currentFactorTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setGoalFactor(nextTab.dataset.goalFactorTab, true, true);
        nextTab.focus();
        return true;
      }
      return false;
    };
`;

const GOALS_FACTOR_SELECT_SCRIPT = `    const setGoalFactor = (factorName, persist = true, updateHash = false) => {
      const article = documentPane.querySelector("[data-goal-view]");
      if (!article) return false;
      const factor = goalFactorKeys.includes(factorName) ? factorName : "basics";
      const activePanel = article.querySelector('[data-goal-factor-panel="' + factor + '"]');
      if (!activePanel) {
        article.dataset.activeFactor = factor;
        return false;
      }
      const trigger = article.querySelector('[data-goal-factor-tab="' + factor + '"]');
      if (trigger) activateFocusSection(trigger);
      article.dataset.activeFactor = factor;
      article.querySelectorAll("[data-goal-factor-tab]").forEach((button) => {
        const active = button.dataset.goalFactorTab === factor;
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
      if (persist) queueSave();
      return true;
    };

`;

/** Factor deep-links and in-document workbench. */
export const GOALS_PANELS_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { documentPane, activateFocusSection, queueSave, openEventReader } = host;
    const goalFactorKeys = ["basics", "coverage", "relations", "risks", "impacts", "rules"];
${GOALS_READER_HASH_SCRIPT}${GOALS_FACTOR_SELECT_SCRIPT}${GOALS_FACTOR_CLICK_SCRIPT}${GOALS_FACTOR_KEYBOARD_SCRIPT}
    return { openEventReaderFromHash, eventReaderFromTargetId, eventReaderFromHash,
      setGoalFactor, goalFactorFromTargetId, goalFactorFromHash,
      handleGoalFactorClick, handleGoalFactorKeyboard };
  }`;
