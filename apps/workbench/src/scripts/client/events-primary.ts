/** AP3 Workbench client segment: events-primary. */
export const CLIENT_EVENTS_PRIMARY_SCRIPT = `        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
      if (handleTreeStatusChange(changed)) return;
      handleGoalRelationChange(changed);
    });
    document.addEventListener("input", (event) => {
      const changed = event.target?.nodeType === 1 ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-policy-form]");
      if (changedFactorForm) {
        changed.removeAttribute("aria-invalid");
        const factorError = changedFactorForm.querySelector("[data-relation-error], [data-policy-error]");
        if (factorError) factorError.hidden = true;
      }
    });
    const treeResizeBlocked = () => document.body.classList.contains("immersive-workbench")
      ? matchMedia("(max-width: 600px)").matches
      : matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui");
    const beginTreeResize = (clientX) => {
      resizeStartX = clientX;
      resizeStartWidth = treePane.getBoundingClientRect().width;
      treeResizer.classList.add("is-dragging");
      workspace.classList.add("is-tree-resizing");
    };
    const stopTreeResize = () => {
      treeResizer?.classList.remove("is-dragging");
      workspace.classList.remove("is-tree-resizing");
      saveUiState();
    };
    treeResizer?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || treeResizeBlocked()) return;
      beginTreeResize(event.clientX);
      const pointerId = event.pointerId;
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
      };
      const end = (endEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stopTreeResize();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    });
    treeResizer?.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || treeResizeBlocked()) return;
      if (!treeResizer.classList.contains("is-dragging")) beginTreeResize(event.clientX);
      const move = (moveEvent) => setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
      const end = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", end);
        if (treeResizer.classList.contains("is-dragging")) stopTreeResize();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);
    });
    treeResizer?.addEventListener("dblclick", () => setTreeWidth(innerWidth <= 1050 ? 220 : 240));
    treeResizer?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setTreeWidth(treePane.getBoundingClientRect().width + (event.key === "ArrowRight" ? 16 : -16));
    });
    if (tuiResizer && tuiPane) {
      tuiResizer.addEventListener("pointerdown", (event) => {
        resizeStartX = event.clientX;
        resizeStartWidth = tuiPane.getBoundingClientRect().width;
        tuiResizer.classList.add("is-dragging");
        tuiResizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      tuiResizer.addEventListener("pointermove", (event) => {
        if (!tuiResizer.hasPointerCapture(event.pointerId)) return;
        setTuiWidth(resizeStartWidth - (event.clientX - resizeStartX));
      });
      const finishTuiResize = (event) => {
        if (tuiResizer.hasPointerCapture(event.pointerId)) tuiResizer.releasePointerCapture(event.pointerId);
        tuiResizer.classList.remove("is-dragging");
        saveUiState();
      };
      tuiResizer.addEventListener("pointerup", finishTuiResize);
      tuiResizer.addEventListener("pointercancel", finishTuiResize);
      tuiResizer.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setTuiWidth(tuiPane.getBoundingClientRect().width + (event.key === "ArrowLeft" ? 16 : -16));
      });
    }

    bindTreeFilterTrigger();
    document.addEventListener("click", async (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target) return;
      const activeProjectMenu = target.closest("[data-project-menu]");
      projectMenus.forEach((menu) => {
        if (menu.open && menu !== activeProjectMenu) menu.open = false;
      });
`;
