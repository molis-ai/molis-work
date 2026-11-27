/** AP3 Workbench client segment: events-primary. */
export const CLIENT_EVENTS_PRIMARY_SCRIPT = `    const treeResizeBlocked = () => document.body.classList.contains("immersive-workbench")
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
    if ("PointerEvent" in window) {
      treeResizer?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || treeResizeBlocked()) return;
        event.preventDefault();
        beginTreeResize(event.clientX);
        const pointerId = event.pointerId;
        let dragging = true;
        try { treeResizer.setPointerCapture(pointerId); } catch { /* synthetic or non-capturable pointer */ }
        const move = (moveEvent) => {
          if (!dragging || moveEvent.pointerId !== pointerId) return;
          setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
        };
        const end = (endEvent) => {
          if (!dragging || (endEvent.pointerId !== undefined && endEvent.pointerId !== pointerId)) return;
          dragging = false;
          try { if (treeResizer.hasPointerCapture(pointerId)) treeResizer.releasePointerCapture(pointerId); } catch { /* already released */ }
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          treeResizer.removeEventListener("lostpointercapture", end);
          stopTreeResize();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        treeResizer.addEventListener("lostpointercapture", end);
      });
    } else {
      treeResizer?.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || treeResizeBlocked()) return;
        event.preventDefault();
        beginTreeResize(event.clientX);
        const move = (moveEvent) => setTreeWidth(resizeStartWidth + moveEvent.clientX - resizeStartX);
        const end = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", end);
          if (treeResizer.classList.contains("is-dragging")) stopTreeResize();
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", end);
      });
    }
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

    document.addEventListener("click", async (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target) return;
      const activeProjectMenu = target.closest("[data-project-menu]");
      projectMenus.forEach((menu) => {
        if (menu.open && menu !== activeProjectMenu) menu.open = false;
      });
`;
