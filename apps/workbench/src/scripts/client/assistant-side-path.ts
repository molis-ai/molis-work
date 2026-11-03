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
      scheduled.map((f) => [f.followup_id, f.next_at, f.enabled, f.last && f.last.outcome]), work && view.schedule_survives_close, latestSteps(work), waitsOn(work)]);
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
      if (parent) step("flag", "", L("受托于"), card({ icon: "workflow", title: parent.title, sub: L("验收") + "：" + parent.acceptance, open: () => switchTo(parent.work_id) }));
      objects.filter((o) => o.relation === "origin").forEach((o) => step("flag", "", L("起点"), objectCard(o)));
      if (work && !objects.some((o) => o.relation === "origin") && work.origin && (work.origin.title || work.origin.surface)) {
        // The page is named as it names itself; its id is never shown, and the same name is not said twice.
        const name = surfaceName(work.origin.surface), title = work.origin.title || name;
        step("flag", "", L("起点"), card({ icon: kindGlyph(work.origin.surface), title, sub: name !== title && name !== work.origin.surface ? name : "" }));
      }
      objects.filter((o) => o.relation === "session").forEach((o) => step("code", "", L("专业会话"), objectCard(o, "", L("在执行方打开"))));
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
            const name = el("button", "assistant-subtask-name", item.text); name.type = "button"; name.setAttribute("aria-label", next.label + "：" + item.text);
            name.addEventListener("click", () => next.run());
            row.append(mark, name, el("span", "assistant-subtask-state", next.label));
          } else row.append(mark, el("span", "assistant-subtask-name", item.text), el("span", "assistant-subtask-state", cur ? L("正在做") : item.state === "abandoned" ? L("已放弃") : ""));
          return row;
        });
        step(doneSteps + "/" + steps.length, steps.some((item) => item.state === "in-progress") && next ? "attention" : doneSteps === steps.length ? "done" : "", L("步骤"), progress(doneSteps, steps.length, L("步骤")), ...rows);
      }
      if (children.length) {
        const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
        const waiting = children.some((child) => WAITING.has(child.state) && !child.taken_back);
        const meter = progress(done, children.length, L("子任务"));
        const rows = children.map((child) => {
          const row = el("div", "assistant-subtask" + (WAITING.has(child.state) && !child.taken_back ? " is-attention" : ""));
          const tone = child.taken_back ? "" : child.state === "completed" ? "done" : WAITING.has(child.state) ? "attention" : child.state === "failed" ? "blocked" : "";
          const mark = el("span", "assistant-subtask-mark" + (tone ? " is-" + tone : ""));
          mark.append(spinner(ringState(child.state)));
          const name = el("button", "assistant-subtask-name", child.title); name.type = "button"; name.setAttribute("aria-label", L("打开") + "：" + child.title);
          name.addEventListener("click", () => switchTo(child.work_id));
          row.append(mark, name, el("span", "assistant-subtask-state", (child.taken_back ? L("已收回") : stateLabel(child.state)) + (child.follow_ups ? " · " + L("补改") + " " + child.follow_ups : "")));
          /* Stop one sub-task from here, without opening it; what it already did stays. */
          if (!child.taken_back && isLive(child.state)) row.append(sideAct(L("停止"), child.title, async () => { await api("/works/" + encodeURIComponent(child.work_id) + "/control", "POST", { kind: "stop" }); await reload(); }, true));
          /* Take the part back: it stops, what it made stays, and this work finishes that part itself. */
          if (!child.taken_back) {
            const takeBack = sideAct(L("收回"), child.title, async () => { view = await api("/works/" + encodeURIComponent(child.work_id) + "/take-back", "POST", {}); render(); }, true);
            takeBack.title = L("停下这个子任务，由这项工作自己接着做这一部分；它已产出的保留");
            row.append(takeBack);
          }
          return row;
        });
        step(done + "/" + children.length, waiting ? "attention" : done === children.length ? "done" : "", L("分出去的子任务"), meter, ...rows);
      }
      const REPEAT = { none: "一次", daily: "每天", weekly: "每周" }, OUTCOME = { started: "已开始", missed: "错过（当时没在运行）", skipped: "跳过（上一轮未结束）", failed: "没有完成" };
      if (scheduled.length) step("clock", "later", L("之后"), ...scheduled.map((followUp) => card({ icon: "clock", title: followUp.label,
        sub: L(REPEAT[followUp.repeat] || followUp.repeat) + " · " + (followUp.enabled && followUp.next_at ? L("下一次") + " " + when(followUp.next_at) : L("已结束")),
        detail: (followUp.last ? L("上次") + L(OUTCOME[followUp.last.outcome] || followUp.last.outcome) + " · " : "") + (followUp.enabled ? L(view.schedule_survives_close ? "关闭窗口后仍会执行" : "需要 Molis Work 在运行") : ""),
        actions: followUp.enabled ? [sideAct(L("取消"), followUp.label, async () => { await api("/followups/remove", "POST", { followup_id: followUp.followup_id }); await reload(); }, true)] : [] })));
      const done = children.filter((child) => child.state === "completed" || child.taken_back).length;
      const stepsDone = steps.filter((item) => item.state === "done").length;
      paintBlock(node, L("路径"), "workflow", line.children.length ? line : null,
        steps.length ? L("步骤") + " " + stepsDone + "/" + steps.length : children.length ? L("子任务") + " " + done + "/" + children.length : "",
        children.some((child) => WAITING.has(child.state) && !child.taken_back) || (steps.some((item) => item.state === "in-progress") && waitsOn(work)));
    });
  };`;
