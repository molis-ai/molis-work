/** The side pane's 路径 block: from who asked and where it started, through the session and the sub-tasks. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_SIDE_PATH_PART = String.raw`  /* 路径: a line from who asked and where it started, through the session and the sub-tasks, to what comes later. */
  const renderPath = (work) => {
    const node = blocks.path;
    if (!node) return;
    const objects = work && view.objects ? view.objects : [];
    const parent = work && work.delegated_by ? work.delegated_by : null;
    const children = work && view.delegated ? view.delegated : [];
    const scheduled = work && view.scheduled ? view.scheduled : [];
    const signature = JSON.stringify([work && work.work_id, work && work.executor, work && work.origin, parent, children,
      objects.filter((o) => o.relation === "origin" || o.relation === "session").map((o) => [o.relation, o.subject.id, o.state, o.title, o.current_revision]),
      scheduled.map((f) => [f.followup_id, f.next_at, f.enabled, f.last]), work && view.schedule_survives_close, latestSteps(work), waitsOn(work)]);
    if (node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const line = el("ol", "assistant-timeline");
      const step = (marker, tone, label, ...content) => {
        const item = el("li", "assistant-step");
        const dot = el("span", "assistant-step-marker" + (tone ? " is-" + tone : ""));
        // A marker is a glyph, or a count such as “1/2”.
        dot.append(/^\d+\/\d+$/.test(marker) ? document.createTextNode(marker) : glyph(marker));
        item.append(dot, el("p", "assistant-step-label", label), ...content);
        line.append(item);
      };
      if (parent) step("flag", "", globalThis.t.text("workbench.assistant-side-path.delegated"), card({ icon: "workflow", title: parent.title, sub: globalThis.t.text("workbench.assistant-side-path.acceptance-named", { value: parent.acceptance }), open: () => switchTo(parent.work_id) }));
      objects.filter((o) => o.relation === "origin").forEach((o) => step("flag", "", globalThis.t.text("workbench.assistant-side-path.start"), objectCard(o)));
      if (work && !objects.some((o) => o.relation === "origin") && work.origin && (work.origin.title || work.origin.surface)) {
        // The page is named as it names itself; its id is never shown, and the same name is not said twice.
        const name = surfaceName(work.origin.surface), title = work.origin.title || name;
        step("flag", "", globalThis.t.text("workbench.assistant-side-path.start"), card({ icon: kindGlyph(work.origin.surface), title, sub: name !== title && name !== work.origin.surface ? name : "" }));
      }
      objects.filter((o) => o.relation === "session").forEach((o) => step("code", "", globalThis.t.text("workbench.assistant-side-path.agent-session"), objectCard(o, "", globalThis.t.text("workbench.assistant-side-path.open-executor"))));
      const steps = latestSteps(work);
      if (steps.length) {
        // The step in hand either runs, or waits on the person: then it says what to do and takes them to it.
        const next = waitsOn(work);
        const doneSteps = steps.filter((item) => item.state === "done").length;
        const rows = steps.map((item) => {
          const cur = item.state === "in-progress", waiting = cur && next;
          const row = el("div", "assistant-subtask assistant-step-item" + (waiting ? " is-attention" : cur ? " is-current" : "") + (item.state === "abandoned" ? " is-abandoned" : ""));
          const mark = el("span", "assistant-subtask-mark" + (item.state === "done" ? " is-done" : waiting ? " is-attention" : ""));
          mark.append(spinner(item.state === "done" ? "done" : waiting ? (work.state === "needs-check" ? "verify" : work.state === "waiting-review" ? "approval" : "answer") : cur ? (work.state === "running" ? "running" : work.state === "paused" ? "paused" : "doing") : item.state === "abandoned" ? "cancelled" : "idle"));
          if (waiting) {
            const name = el("button", "assistant-subtask-name", item.text); name.type = "button"; name.setAttribute("aria-label", globalThis.t.text("workbench.assistant-side-path.action-named", { label: next.label, name: item.text }));
            name.addEventListener("click", () => next.run());
            row.append(mark, name, el("span", "assistant-subtask-state", next.label));
          } else row.append(mark, el("span", "assistant-subtask-name", item.text), el("span", "assistant-subtask-state", cur ? globalThis.t.text("workbench.assistant-side-path.hand") : item.state === "abandoned" ? globalThis.t.text("workbench.assistant-side-path.set-aside") : ""));
          return row;
        });
        step(doneSteps + "/" + steps.length, steps.some((item) => item.state === "in-progress") && next ? "attention" : doneSteps === steps.length ? "done" : "", globalThis.t.text("workbench.assistant-side-path.steps"), progress(doneSteps, steps.length, globalThis.t.text("workbench.assistant-side-path.steps")), ...rows);
      }
      if (children.length) {
        const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
        const waiting = children.some((child) => WAITING.has(child.state) && !child.taken_back);
        const meter = progress(done, children.length, globalThis.t.text("workbench.assistant-side-path.sub-task"));
        const rows = children.map((child) => {
          const row = el("div", "assistant-subtask" + (WAITING.has(child.state) && !child.taken_back ? " is-attention" : ""));
          const tone = child.taken_back ? "" : child.state === "completed" ? "done" : WAITING.has(child.state) ? "attention" : child.state === "failed" ? "blocked" : "";
          const mark = el("span", "assistant-subtask-mark" + (tone ? " is-" + tone : ""));
          mark.append(spinner(ringState(child.state)));
          const name = el("button", "assistant-subtask-name", child.title); name.type = "button"; name.setAttribute("aria-label", globalThis.t.text("workbench.assistant-side-path.open-named", { title: child.title }));
          name.addEventListener("click", () => switchTo(child.work_id));
          row.append(mark, name, el("span", "assistant-subtask-state", (child.taken_back ? globalThis.t.text("workbench.assistant-side-path.taken-back") : stateLabel(child.state)) + (child.follow_ups ? " · " + globalThis.t.text("workbench.assistant-side-path.follow-ups") + " " + child.follow_ups : "")));
          /* Stop one sub-task from here, without opening it; what it already did stays. */
          if (!child.taken_back && isLive(child.state)) row.append(sideAct(globalThis.t.text("workbench.assistant-side-path.stop"), child.title, async () => { await api("/works/" + encodeURIComponent(child.work_id) + "/control", "POST", { kind: "stop" }); await reload(); }, true));
          /* Take the part back: it stops, what it made stays, and this work finishes that part itself. */
          if (!child.taken_back) {
            const takeBack = sideAct(globalThis.t.text("workbench.assistant-side-path.take-back"), child.title, async () => { view = await api("/works/" + encodeURIComponent(child.work_id) + "/take-back", "POST", {}); render(); }, true);
            takeBack.title = globalThis.t.text("workbench.assistant-side-path.stop-sub-task-finish-that-part-work-what");
            row.append(takeBack);
          }
          return row;
        });
        step(done + "/" + children.length, waiting ? "attention" : done === children.length ? "done" : "", globalThis.t.text("workbench.assistant-side-path.sub-tasks-handed-out"), meter, ...rows);
      }
      if (scheduled.length) step("clock", "later", globalThis.t.text("workbench.assistant-followup.later"), ...scheduled.map((followUp) => {
        const at = (value) => ({ kind: "date", style: "datetime", at: value, time_zone: followUp.time_zone });
        const schedule = followUp.enabled && followUp.next_at
          ? globalThis.t.text("workbench.assistant-followup.next-" + followUp.repeat, { at: at(followUp.next_at) })
          : globalThis.t.text("workbench.assistant-followup.ended-" + followUp.repeat);
        const row = card({ icon: "clock", title: followUp.label, sub: schedule,
          actions: followUp.enabled ? [sideAct(globalThis.t.text("workbench.assistant-followup.cancel"), followUp.label, async () => { await api("/followups/remove", "POST", { followup_id: followUp.followup_id }); await reload(); }, true)] : [] });
        const content = row.querySelector(".assistant-item-text");
        content.querySelector(".assistant-item-title").translate = false;
        if (followUp.last) {
          content.append(el("span", "assistant-item-sub", globalThis.t.text("workbench.assistant-followup.last-" + followUp.last.outcome, { at: at(followUp.last.due_at) })));
          if (followUp.last.detail) {
            const detail = el("span", "assistant-item-sub", savedAssistantText(followUp.last.detail, globalThis.say.text));
            if (typeof followUp.last.detail.original === "string") { detail.translate = false; detail.style.whiteSpace = "pre-wrap"; }
            content.append(detail);
          }
        }
        if (followUp.enabled) content.append(el("span", "assistant-item-sub", globalThis.t.text(view.schedule_survives_close ? "workbench.assistant-followup.keep-running" : "workbench.assistant-followup.need-running")));
        return row;
      }));
      const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
      const stepsDone = steps.filter((item) => item.state === "done").length;
      paintBlock(node, globalThis.t.text("workbench.assistant-side-path.path"), "workflow", line.children.length ? line : null,
        steps.length ? globalThis.t.text("workbench.assistant-side-path.steps-count", { done: stepsDone, total: steps.length }) : children.length ? globalThis.t.text("workbench.assistant-side-path.sub-task-count", { done, total: children.length }) : "",
        children.some((child) => WAITING.has(child.state) && !child.taken_back) || (steps.some((item) => item.state === "in-progress") && waitsOn(work)));
    });
  };`;
