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
    const closeGoalOverlay = () => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      if (!shell) return;
      shell.removeAttribute("data-goal-planning");
      shell.removeAttribute("data-goal-rules");
      shell.querySelectorAll("[data-open-work-planning], [data-open-work-rules]").forEach((row) => {
        row.classList.remove("is-selected");
        row.setAttribute("aria-pressed", "false");
        row.removeAttribute("aria-current");
      });
    };
    // Loading and failure read like every other list: the shared loading line, then the reason and Retry in place.
    const settingsLoadingLine = () => {
      const line = document.createElement("p");
      line.className = "mw-loading";
      line.setAttribute("role", "status");
      line.textContent = globalThis.t.text("workbench.events-primary.loading-settings");
      return line;
    };
    const settingsLoadFailed = (message, retry) => {
      const box = document.createElement("div");
      box.className = "mw-empty mw-empty--error";
      box.setAttribute("role", "alert");
      box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
      box.querySelector("strong").textContent = globalThis.t.text("workbench.events-primary.couldn-t-load-settings");
      if(typeof message==="string")box.querySelector("p").textContent=message||globalThis.t.text("workbench.events-primary.try-again-moment");else molisWorkRequest.show(box.querySelector("p"),message,globalThis.t.text("workbench.events-primary.try-again-moment"));
      const button = box.querySelector(":scope > button");
      button.textContent = globalThis.t.text("common.control.retry");
      button.addEventListener("click", () => { button.disabled = true; void retry(); });
      return box;
    };
    const fillGoalOverlay = async (pane, path, bind) => {
      pane.replaceChildren(settingsLoadingLine());
      const html = await molisWorkRequest(path,{as:"text",headers:{Accept:"text/html"},fallback:globalThis.t.text("workbench.events-primary.couldn-t-load-settings")});
      if(!pane.isConnected)return;
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const content = parsed.querySelector(".work-planning, .planning-detail, .planning-edit, .project-rules-document, .settings-document") || parsed.querySelector(".settings-content") || parsed.body;
      const node = content.classList?.contains("settings-content") ? (content.firstElementChild || content) : content;
      pane.replaceChildren(document.importNode(node, true));
      bind?.(pane);
    };
    const openGoalWorkPlanning = async (pathname) => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      const pane = shell?.querySelector("[data-goal-work-planning]");
      if (!shell || !pane) return;
      if (!pathname && shell.dataset.goalPlanning === "open") {
        closeGoalOverlay();
        return;
      }
      closeGoalOverlay();
      shell.dataset.boardView = "list";
      shell.dataset.goalPlanning = "open";
      shell.querySelector("[data-open-work-planning]")?.setAttribute("aria-pressed", "true");
      const prefix = document.body.dataset.routePrefix || "";
      const path = pathname || (prefix + "/settings/planning?embed=1");
      const run = async () => {
        try {
          await fillGoalOverlay(pane, path, (root) => {
            globalThis.molisWorkBindPlanningSettings?.(root);
            globalThis.molisWorkBindPlanningAdoption?.(root);
          });
        } catch (error) {
          pane.replaceChildren(settingsLoadFailed(error,run));
        }
      };
      await run();
    };
    const openGoalWorkRules = async () => {
      const shell = document.querySelector("[data-goal-canvas-shell]");
      const pane = shell?.querySelector("[data-goal-work-rules]");
      if (!shell || !pane) return;
      if (shell.dataset.goalRules === "open") {
        closeGoalOverlay();
        return;
      }
      closeGoalOverlay();
      shell.dataset.boardView = "list";
      shell.dataset.goalRules = "open";
      shell.querySelector("[data-open-work-rules]")?.setAttribute("aria-pressed", "true");
      const prefix = document.body.dataset.routePrefix || "";
      const run = async () => {
        try {
          await fillGoalOverlay(pane, prefix + "/settings/rules?embed=1", (root) => {
            globalThis.molisWorkBindProjectRules?.(root);
          });
        } catch (error) {
          pane.replaceChildren(settingsLoadFailed(error,run));
        }
      };
      await run();
    };
    globalThis.molisWorkOpenGoalWorkPlanning = () => openGoalWorkPlanning();
    globalThis.molisWorkOpenGoalWorkRules = () => openGoalWorkRules();
    document.addEventListener("molis-work:goal-changed", closeGoalOverlay);

    document.addEventListener("click", async (event) => {
      const target = event.target?.nodeType === 1 ? event.target : null;
      if (!target) return;
      const activeProjectMenu = target.closest("[data-project-menu]");
      projectMenus.forEach((menu) => {
        if (menu.open && menu !== activeProjectMenu) menu.open = false;
      });
      const policyCancel = target.closest("[data-policy-cancel]");
      if (policyCancel) {
        const form = policyCancel.closest("form");
        form?.querySelectorAll("[aria-invalid]").forEach(field => field.removeAttribute("aria-invalid"));
        const error = form?.querySelector("[data-policy-error]");
        if (error) error.hidden = true;
        return;
      }
`;
