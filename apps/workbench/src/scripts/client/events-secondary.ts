/** AP3 Workbench client segment: events-secondary. */
export const CLIENT_EVENTS_SECONDARY_SCRIPT = `      const surfaceLink = target.closest("[data-work-surface-link]");
      if (surfaceLink) {
        saveUiState();
        const surface = surfaceLink.dataset.workSurfaceLink || "inbox";
        if (desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface)) {
          event.preventDefault();
          setDesktopDirectory("root", true, false, surfaceLink);
          if (!openDirectorySurface(surface, undefined, undefined, event)) setDesktopWorkSurface(surface, true, true);
        }
        return;
      }
      const surfaceOpen = target.closest("[data-work-surface-open]");
      if (surfaceOpen) {
        const surface = surfaceOpen.dataset.workSurfaceOpen || "goals";
        const available = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface);
        if (surface === "goals" && !available) {
          saveUiState();
          restoreLastGoal(true);
          return;
        }
        const directory = surface === "goals" || OWN_DIRECTORY_SURFACES.includes(surface) ? surface : "root";
        const nextDirectory = directory !== "root" && document.querySelector('[data-directory-panel="' + directory + '"]')
          ? directory
          : "root";
        setDesktopDirectory(nextDirectory, true, true, surfaceOpen);
        const pluginId = surfaceOpen.dataset.pluginId;
        if (pluginId && pluginId !== "home" && pluginId !== "market" && nextDirectory !== "root") setDirectoryCollapsed?.(false, false);
        if (!openDirectorySurface(surface, undefined, undefined, event)) setDesktopWorkSurface(surface, true, true);
        if (surface === "home" && !collectionView && localPathname() !== "/") {
          history.pushState({ workSurface: "home" }, "", route("/"));
        }
        if (matchMedia("(max-width: 760px)").matches) setMobileView(nextDirectory === "root" || surface === "home" || surface === "market" ? "document" : "tree");
        return;
      }
      const directoryOpen = target.closest("[data-directory-open]");
      if (directoryOpen && desktopDirectoryPanels.length) {
        if (directoryOpen.tagName === "A" && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1)) return;
        event.preventDefault();
        // Settings opened from the bar show their sections on a phone, as a plugin with a list does when switched to.
        if (directoryOpen.closest("[data-dock]") && matchMedia("(max-width: 760px)").matches) setMobileView("tree");
        const nextDirectory = directoryOpen.dataset.directoryOpen || "root";
        setDesktopDirectory(nextDirectory, true, true, directoryOpen);
        if (nextDirectory === "settings" || nextDirectory === "project-settings") tabWorkspace?.setExclusive(nextDirectory);
        if (directoryOpen.closest(".immersive-titlebar")) immersiveNavigation?.showDirectory();
        return;
      }
      if (target.closest("[data-directory-back]") && desktopDirectoryPanels.length) {
        setDesktopDirectory("root");
        if (!openWorkbenchSurface("home")) setDesktopWorkSurface("home");
        return;
      }
      if (handleTreeDisclosureClick(target)) return;
      if (handleMomentumNavigationClick(target)) return;
      if (target.closest("[data-tui-focus-return]")) {
        setWorkspaceMode("focus");
        return;
      }
      if (target.closest("[data-directory-toggle]")) {
        if (immersiveNavigation) { immersiveNavigation.hideDirectory(); return; }
        setDirectoryCollapsed(!workspace.classList.contains("is-directory-collapsed"));
        return;
      }
      if (handleMomentumSelectionClick(target, event)) return;
      if (handleMomentumZoomClick(target)) return;
      const planningLink = target.closest("[data-goal-work-planning] a[href]");
      if (planningLink && !planningLink.closest(".work-planning") && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1)) {
        const url = new URL(planningLink.href, location.origin);
        const prefix = document.body.dataset.routePrefix || "";
        if (url.origin === location.origin && url.pathname.startsWith(prefix + "/settings/planning")) {
          event.preventDefault();
          const nested = url.pathname !== prefix + "/settings/planning";
          void openGoalWorkPlanning(nested ? url.pathname + url.search : prefix + "/settings/planning?embed=1");
          return;
        }
      }
      if (target.closest("[data-open-work-planning]")) {
        void openGoalWorkPlanning();
        return;
      }
      if (target.closest("[data-open-work-rules]")) {
        void openGoalWorkRules();
        return;
      }
      const goalLink = target.closest("[data-select-goal]");
      if (goalLink) {
        if (goalLink.closest("[data-goal-stage-list]")) {
          const goalId = goalLink.dataset.selectGoal;
          if (stageListGestureTimer) { clearTimeout(stageListGestureTimer); stageListGestureTimer = null; }
          if (Number(event.detail) > 1) frameContainer?.openFrame(goalId);
          else stageListGestureTimer = setTimeout(() => { stageListGestureTimer = null; void selectGoal(goalId); }, 220);
          return;
        }
        openDirectorySurface("goals", goalLink.dataset.selectGoal, goalLink.textContent?.trim(), event);
        return;
      }
      if (handleGoalDialogClick(target)) return;
      const focusSectionTrigger = target.closest("[data-focus-section-trigger]");
      if (focusSectionTrigger) {
        const factor = focusSectionTrigger.dataset.goalFactorTab;
        if (factor) setGoalFactor(factor, true, true);
        else activateFocusSection(focusSectionTrigger);
        return;
      }
      if (handleGoalFactorClick(target)) return;
      const sectionLink = target.closest('a[href^="#"]');
      if (sectionLink) {
        const targetId = sectionLink.getAttribute("href")?.slice(1);
        const targetElement = targetId ? document.getElementById(targetId) : null;
        const targetReader = targetId ? eventReaderFromTargetId(targetId) : "";
        const targetFactor = targetId ? goalFactorFromTargetId(targetId) : "";
        if (targetId && (targetElement || targetReader || targetFactor)) {
          event.preventDefault();
          if (targetReader) openEventReader(targetReader);
          if (targetFactor) setGoalFactor(targetFactor, true);
          history.replaceState(null, "", "#" + targetId);
          if (targetElement) {
            const deepLinkScrollTarget = revealDeepLinkTarget(targetElement);
            requestAnimationFrame(() => deepLinkScrollTarget.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
          }
          return;
        }
      }
      const copy = target.closest("[data-copy-value]");
      if (copy) {
        if (!await window.molisCopy?.(copy, copy.dataset.copyValue, { done: L("已复制"), failed: L("复制失败") })) showToast(L("无法访问剪贴板，请手动复制"), true);
        return;
      }
      if (handleGoalRelationDisclosureClick(target)) return;
      const lifecycleClick = handleGoalLifecycleClick(target);
      if (lifecycleClick) { await lifecycleClick; return; }
`;
