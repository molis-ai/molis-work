/** AP3 Workbench client segment: refresh-decisions. The end of restoring the saved UI state, its writer, and search activity; each page client refreshes its own page (specs/page-client-lifecycle). */
export const CLIENT_REFRESH_DECISIONS_SCRIPT = `      }
      setMobileView(restoredMobileView);
      pages.forEach((page) => page.applyUiState?.(ui, "end", desktopSurfaceScroll));
    };

    saveUiState = () => {
      if (window.parent !== window && new URLSearchParams(location.search).has("workbenchPane")) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readUiState()));
      } catch { /* Ignore sessionStorage write failure while saving UI state. */ }
    };

    const noteSearchActivity = (delay = 900) => {
      searchBusyUntil = Math.max(searchBusyUntil, Date.now() + delay);
      pages.forEach((page) => page.searchActivity?.());
    };

    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-persist-open]")) queueSave();
    }, true);
`;
