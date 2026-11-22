/** AP3 Workbench client segment: events-secondary. */
export const CLIENT_EVENTS_SECONDARY_SCRIPT = `      const surfaceLink = target.closest("[data-work-surface-link]");
      if (surfaceLink) {
        saveUiState();
        const surface = surfaceLink.dataset.workSurfaceLink || "";
        if (surface && desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface)) {
          event.preventDefault();
          setDesktopDirectory("root", true, false, surfaceLink);
          if (!openDirectorySurface(surface, undefined, undefined, event)) setDesktopWorkSurface(surface, true, true);
        }
        return;
      }
      const surfaceOpen = target.closest("[data-work-surface-open]");
      if (surfaceOpen) {
        const surface = surfaceOpen.dataset.workSurfaceOpen || "";
        if (surface) openSurfaceEntry(surface, surfaceOpen, event);
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
      for (const page of pages) {
        const handled = page.click?.(target, event);
        if (handled) { if (handled !== true) await handled; return; }
      }
      if (target.closest("[data-tui-focus-return]")) {
        setWorkspaceMode("focus");
        return;
      }
      if (target.closest("[data-directory-toggle]")) {
        if (immersiveNavigation) { immersiveNavigation.hideDirectory(); return; }
        setDirectoryCollapsed(!workspace.classList.contains("is-directory-collapsed"));
        return;
      }
      const sectionLink = target.closest('a[href^="#"]');
      if (sectionLink) {
        const targetId = sectionLink.getAttribute("href")?.slice(1);
        const targetElement = targetId ? document.getElementById(targetId) : null;
        const openTarget = targetId ? pages.map((page) => page.anchor?.(targetId)).find(Boolean) : null;
        if (targetId && (targetElement || openTarget)) {
          event.preventDefault();
          openTarget?.();
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
        if (!await window.molisCopy?.(copy, copy.dataset.copyValue, { done: globalThis.t.text("workbench.events-secondary.copied"), failed: globalThis.t.text("workbench.events-secondary.could-not-copy") })) showToast(globalThis.t.text("workbench.events-secondary.clipboard-unavailable-copy-manually"), true);
        return;
      }
      for (const page of pages) {
        const handled = page.clickAfter?.(target, event);
        if (handled) { if (handled !== true) await handled; return; }
      }
`;
