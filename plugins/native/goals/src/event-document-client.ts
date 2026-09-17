export const GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { documentPane, route, translate: L, isAbortError, showError, showStatus, reloadDocument, controlHeaders } = host;
    let selectedRequest = 0;
    let moreRequest = 0;
    let returnFocusTarget = null;
    const reading = { goal: "", item: "", filter: "all", reader: "", form: "", infoOpen: null };
    const escapeText = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const root = () => documentPane.querySelector("[data-goal-event-document]");
    const goalId = () => root()?.dataset.goalView || "";
    const jsonHeaders = () => ({ accept: "application/json", ...(typeof controlHeaders === "function" ? controlHeaders() : (typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders() : { "content-type": "application/json" })) });
    const captureRestore = () => ({
      goal: reading.goal || goalId(),
      item: reading.item,
      reader: reading.reader,
      filter: reading.filter || "all",
      form: reading.form,
      infoOpen: root()?.querySelector("[data-goal-info]")?.open,
    });
    const resetReading = (nextGoal) => {
      selectedRequest += 1;
      reading.goal = nextGoal;
      reading.item = "";
      reading.filter = "all";
      reading.reader = "";
      reading.form = "";
      reading.infoOpen = null;
      returnFocusTarget = null;
    };
    const applyLaneFilter = (node) => {
      const filter = reading.filter || "all";
      node.hidden = filter !== "all" && node.dataset.lane !== filter;
    };

    const syncPanelPresence = () => {
      const article = root();
      const editing = Boolean(article?.classList.contains("is-editing-goal"));
      article?.querySelector(".goal-workspace-hero")?.toggleAttribute("inert", editing && matchMedia("(max-width: 760px)").matches);
      const frame = article?.closest("[data-goal-node-workspace]");
      if (frame?.querySelector("[data-goal-work-main]")) {
        article.dispatchEvent(new CustomEvent("molis-work:goal-panel-presence", { bubbles: true }));
      } else frame?.querySelector("[data-tui-pane]")?.toggleAttribute("inert", editing);
      article?.querySelector(".timeline-pane")?.toggleAttribute("inert", editing && matchMedia("(max-width: 760px)").matches);
    };
    const hidePanels = (restoreFocus = false) => {
      const article = root();
      if (!article) return;
      article.querySelector("[data-event-reader-root]")?.setAttribute("hidden", "");
      article.querySelectorAll("[data-event-form]").forEach((form) => { form.hidden = true; });
      const sheet = article.querySelector("[data-event-sheet]");
      if (sheet) sheet.hidden = !reading.item;
      article.classList.remove("is-editing-goal");
      syncPanelPresence();
      if (restoreFocus) requestAnimationFrame(() => requestAnimationFrame(() => {
        if (root() !== article || article.classList.contains("is-editing-goal")) return;
        const target = returnFocusTarget?.isConnected ? returnFocusTarget : article.querySelector("[data-record-menu] > summary, [data-goal-info] > summary");
        target?.focus({ preventScroll: true });
      }));
    };
    const showDetail = (showing) => {
      root()?.querySelector("[data-goal-layout]")?.classList.toggle("is-showing-detail", showing);
      root()?.classList.toggle("is-showing-detail", showing);
    };
    const renderEventHtml = (html) => {
      const sheet = root()?.querySelector("[data-event-sheet]");
      if (!sheet) return;
      sheet.hidden = false;
      sheet.innerHTML = html;
    };

    const loadEventBody = async (item, explicit) => {
      const requestId = ++selectedRequest;
      const currentGoal = goalId();
      if (reading.goal && reading.goal !== currentGoal) return;
      if (!reading.goal) reading.goal = currentGoal;
      const itemId = item?.dataset.timelineItem;
      if (itemId) reading.item = itemId;
      if (explicit) {
        reading.reader = "";
        reading.form = "";
      } else if (reading.form || reading.reader) {
        return;
      }
      root()?.querySelectorAll("[data-timeline-item]").forEach((node) => node.setAttribute("aria-current", String(node.dataset.timelineItem === itemId)));
      root()?.querySelectorAll("[data-timeline-item]").forEach((node) => node.setAttribute("aria-expanded", String(node.dataset.timelineItem === itemId)));
      const sheet = root()?.querySelector("[data-event-sheet]");
      const anchor = root()?.querySelector('[data-timeline-item="' + CSS.escape(itemId || "") + '"]');
      if (sheet) {
        if (anchor) anchor.after(sheet);
        else root()?.querySelector("[data-event-timeline]")?.prepend(sheet);
      }
      showDetail(true);
      hidePanels();
      if (!itemId) return;
      renderEventHtml("<p class=\\"no-results\\">" + escapeText(L("正在载入原文…")) + "</p>");
      try {
        const response = await fetch(route("/api/goals/" + encodeURIComponent(currentGoal) + "/history/" + encodeURIComponent(itemId)), { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (requestId !== selectedRequest || goalId() !== currentGoal || reading.goal !== currentGoal) return;
        if (!explicit && (reading.form || reading.reader)) return;
        if (!response.ok) throw new Error(body.error || L("无法读取事件"));
        renderEventHtml(body.html || "");
      } catch (error) {
        if (isAbortError?.(error) || requestId !== selectedRequest || goalId() !== currentGoal || reading.goal !== currentGoal) return;
        if (!explicit && (reading.form || reading.reader)) return;
        renderEventHtml("<p class=\\"no-results\\" role=\\"alert\\">" + escapeText(error.message || L("无法读取事件")) + "</p><button type=\\"button\\" class=\\"mw-btn mw-btn--link\\" data-retry-event>" + escapeText(L("重试读取事件")) + "</button>");
      }
    };

    const locateHistory = async (itemId) => {
      if (!itemId || reading.form || reading.reader || (reading.goal && reading.goal !== goalId())) return;
      reading.item = itemId;
      const existing = root()?.querySelector('[data-timeline-item="' + CSS.escape(itemId) + '"]')
        || root()?.querySelector('[data-event-id="' + CSS.escape(itemId) + '"]');
      if (existing) { void loadEventBody(existing); return; }
      const fake = document.createElement("button");
      fake.dataset.timelineItem = itemId;
      fake.dataset.eventId = itemId;
      fake.dataset.source = "event_work";
      await loadEventBody(fake);
    };

    const showForm = (name, typeId, trigger) => {
      const article = root();
      if (!article) return;
      const origin = trigger || document.activeElement;
      const menu = origin?.closest?.("[data-record-menu], .goal-more");
      if (trigger || !article.classList.contains("is-editing-goal")) returnFocusTarget = menu?.querySelector("summary") || origin;
      if (menu) menu.open = false;
      const isReader = name === "planning" || name === "description" || name === "requirements";
      if (isReader) {
        reading.reader = name;
        reading.form = "";
      } else {
        reading.form = name;
        reading.reader = "";
      }
      hidePanels();
      article.classList.add("is-editing-goal");
      syncPanelPresence();
      const sheet = article.querySelector("[data-event-sheet]");
      if (sheet) sheet.hidden = true;
      if (isReader) {
        article.querySelector("[data-event-reader-root]")?.removeAttribute("hidden");
        article.querySelectorAll("[data-event-panel]").forEach((panel) => { panel.hidden = panel.dataset.eventPanel !== name; });
        const title = article.querySelector("[data-reader-title]");
        if (title) {
          title.textContent = name === "planning" ? L("记录模板") : name === "description" ? L("目标与要求") : L("完成要求");
          title.tabIndex = -1;
          requestAnimationFrame(() => { if (title.isConnected && reading.reader === name) title.focus({ preventScroll: true }); });
        }
        showDetail(true);
        return;
      }
      const form = typeId && name === "type-edit"
        ? article.querySelector('[data-event-form="type-edit"][data-type-id="' + CSS.escape(typeId) + '"]')
        : typeId && name === "report"
          ? article.querySelector('[data-event-form="report"][data-type-id="' + CSS.escape(typeId) + '"]')
          : article.querySelector('[data-event-form="' + CSS.escape(name) + '"]');
      if (form) {
        form.hidden = false;
        requestAnimationFrame(() => {
          if (!form.isConnected || form.hidden || reading.form !== name) return;
          [...form.querySelectorAll('input:not([type="hidden"]), textarea, select')].find((field) => !field.disabled && field.getClientRects().length)?.focus({ preventScroll: true });
        });
      }
      showDetail(true);
    };

    const fieldError = (form, fieldId, message) => {
      form.querySelectorAll("[data-field-error]").forEach((node) => { node.hidden = true; node.textContent = ""; });
      if (!fieldId) return;
      const node = form.querySelector('[data-field-error="' + CSS.escape(fieldId) + '"]');
      const input = form.querySelector('[name="' + CSS.escape(fieldId) + '"]');
      if (node) { node.hidden = false; node.textContent = message; }
      if (input?.setCustomValidity) { input.setCustomValidity(message); input.reportValidity(); }
    };
    const checkedValues = (form, name) => [...form.querySelectorAll('[name="' + name + '"]:checked')].map((input) => input.value);
    const typeFields = (form) => [...form.querySelectorAll(".type-field-row")].map((row) => ({
      field_id: row.querySelector('[name="field_id"]')?.value.trim(),
      name: row.querySelector('[name="field_name"]')?.value.trim(),
      purpose: row.querySelector('[name="field_purpose"]')?.value.trim(),
      format: row.querySelector('[name="field_format"]')?.value || "text",
      required: row.querySelector('[name="field_required"]')?.checked === true,
    })).filter((field) => field.field_id && field.name && field.purpose);

    const formPath = (kind) => ({
      report: "/event-report", note: "/event-note", type: "/event-configure", "type-edit": "/event-configure",
      requirement: "/event-agree", adopt: "/event-configure", progress: "/event-progress",
      concern: "/event-concern", decision: "/event-decision", closure: "/event-close",
      resume: "/event-resume", agreement: "/event-agree",
    }[kind] || "/event-report");

    const buildPayload = (form, kind, article) => {
      const data = new FormData(form);
      const text = (name) => String(data.get(name) || "").trim();
      if (kind === "report") {
        const fields = Object.create(null);
        form.querySelectorAll("[data-report-field]").forEach((input) => { fields[input.name] = input.value; });
        const requirementId = form.querySelector("[data-judgment-requirement]")?.value.trim();
        const verdict = form.querySelector("[data-judgment-verdict]")?.value.trim();
        const judgments = requirementId && verdict ? [{ requirement_id: requirementId, verdict }] : [];
        const title = form.querySelector("[data-event-title]")?.value.trim() || text("event_title");
        return { events: [{ type_id: form.dataset.typeId, type_version: Number(form.dataset.typeVersion), title, fields, judgments }] };
      }
      if (kind === "note") return { body: text("note") };
      if (kind === "type" || kind === "type-edit") {
        return {
          expected_version: Number(form.dataset.configVersion || article.dataset.configVersion || 0),
          types: [{ type_id: text("type_id"), version: Number(text("version") || 1), name: text("name"), purpose: text("purpose"), semantic_family: text("semantic_family") || undefined, fields: typeFields(form) }],
        };
      }
      if (kind === "requirement") {
        return {
          expected_config_version: Number(form.dataset.configVersion || article.dataset.configVersion || 0),
          expected_agreement_version: Number(form.dataset.agreementVersion || article.dataset.agreementVersion || 0),
          new_requirements: [{
            requirement_id: text("requirement_id"),
            statement: text("statement"),
            bound_type_id: text("bound_type_id") || undefined,
            human_decision_required: form.querySelector('[name="human_decision_required"]')?.checked === true,
          }],
        };
      }
      if (kind === "adopt") {
        const selected = form.querySelector('[name="method_id"] option:checked');
        const defaults = checkedValues(form, "adopt_default_requirement_ids");
        return {
          expected_version: Number(form.dataset.configVersion || article.dataset.configVersion || 0),
          ...(defaults.length ? { expected_agreement_version: Number(form.dataset.agreementVersion || article.dataset.agreementVersion || 0) } : {}),
          adopted_planning: text("method_id") ? [{ method_id: text("method_id"), version: Number(selected?.dataset.version || 1), source: selected?.dataset.source || "built_in" }] : [],
          adopt_default_requirement_ids: defaults,
        };
      }
      if (kind === "progress") return { summary: text("summary"), next_step: text("next_step") || undefined, next_actor: text("next_actor") || undefined, based_on_cursor: Number(data.get("based_on_cursor") || article.dataset.goalEventCursor || 0) };
      if (kind === "concern") {
        const action = text("action") || "open";
        const payload = { action, concern_id: text("concern_id") || undefined, title: text("title") || undefined, statement: text("statement") || undefined, reason: text("reason") || undefined, cited_decision_id: text("cited_decision_id") || undefined, blocks_closure: form.querySelector('[name="blocks_closure"]')?.checked === true };
        if (action === "open") {
          payload.scope = {
            requirement_ids: checkedValues(form, "requirement_ids"),
            event_ids: text("event_ids") ? text("event_ids").split(/[\\s,]+/).filter(Boolean) : [],
            concern_ids: [],
            action: text("scope_action") || null,
          };
        }
        return payload;
      }
      if (kind === "decision") {
        const agreementChoice = form.querySelector('[name="agreement_change_decision"]:checked')?.value;
        if (form.querySelector('[name="agreement_change_decision"]')) {
          return {
            request_id: text("request_id") || undefined,
            conclusion: text("conclusion"),
            effects: agreementChoice === "authorize"
              ? [{ kind: "authorize_agreement_change" }]
              : [{ kind: "deny_action", action: "set_agreement" }],
          };
        }
        const pendingAction = form.dataset.pendingAction || text("action");
        const effects = [...form.querySelectorAll('[name="effect"]:checked')].map((input) => {
          if (input.value === "authorize_action" || input.value === "deny_action") return { kind: input.value, action: pendingAction || undefined };
          return { kind: input.value };
        });
        return { request_id: text("request_id") || undefined, selected_option_id: text("selected_option_id") || undefined, conclusion: text("conclusion"), effects, scope: { requirement_ids: checkedValues(form, "requirement_ids"), concern_ids: checkedValues(form, "concern_ids"), action: pendingAction || null } };
      }
      if (kind === "agreement") {
        const revise_requirements = [];
        const retire_requirement_ids = [];
        form.querySelectorAll("[data-requirement-edit]").forEach((row) => {
          const requirementId = row.querySelector('[name="requirement_id"]')?.value.trim();
          if (!requirementId) return;
          if (row.querySelector('[name="retire_requirement"]')?.checked) {
            retire_requirement_ids.push(requirementId);
            return;
          }
          const statement = row.querySelector('[name="requirement_statement"]')?.value.trim();
          const human = row.querySelector('[name="human_decision_required"]')?.checked === true;
          revise_requirements.push({ requirement_id: requirementId, statement, human_decision_required: human });
        });
        return {
          outcome: text("outcome") || undefined,
          expected_config_version: Number(data.get("expected_config_version")),
          expected_agreement_version: Number(data.get("expected_agreement_version")),
          ...(revise_requirements.length ? { revise_requirements } : {}),
          ...(retire_requirement_ids.length ? { retire_requirement_ids } : {}),
        };
      }
      if (kind === "closure") {
        return { kind: text("kind"), result: text("result") || undefined, reason: text("reason"), expected_config_version: Number(data.get("expected_config_version")), expected_agreement_version: Number(data.get("expected_agreement_version")) };
      }
      if (kind === "resume") return { reason: text("reason") };
      return {};
    };

    const submitForm = async (form) => {
      if (form.getAttribute("aria-busy") === "true") return;
      const article = root();
      const currentGoal = goalId();
      const kind = form.dataset.eventForm;
      const status = form.querySelector("[data-form-status]");
      const conflict = article?.querySelector("[data-event-conflict]");
      if (conflict) { conflict.hidden = true; conflict.textContent = ""; }
      if (status) { status.hidden = true; status.textContent = ""; }
      fieldError(form, "", "");
      if ((kind === "type" || kind === "type-edit") && !typeFields(form).length) {
        if (status) { status.hidden = false; status.textContent = L("至少保留一个字段。"); }
        return;
      }
      if (kind === "decision" && form.querySelector('[name="agreement_change_decision"]')) {
        const choice = form.querySelector('[name="agreement_change_decision"]:checked')?.value;
        if (choice !== "authorize" && choice !== "deny") {
          if (status) { status.hidden = false; status.textContent = L("必须选择批准或拒绝这一份约定变更"); }
          return;
        }
      }
      const key = form.dataset.idempotencyKey || (globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random()));
      form.dataset.idempotencyKey = key;
      form.setAttribute("data-live-dirty", "true");
      form.setAttribute("aria-busy", "true");
      const fields = form.querySelector(".event-form-body");
      if (fields) fields.inert = true;
      const buttons = [...form.querySelectorAll("button:not(:disabled)")];
      buttons.forEach(button => { button.disabled = true; });
      const submit = form.querySelector("[type=submit]");
      const submitLabel = submit?.textContent;
      if (submit) submit.textContent = L("正在保存…");
      const restore = { ...captureRestore(), form: kind };
      let typeSaved = false;
      try {
        const response = await fetch(route("/api/goals/" + encodeURIComponent(currentGoal) + formPath(kind)), {
          method: "POST", headers: { ...jsonHeaders(), "x-molis-work-idempotency-key": key },
          body: JSON.stringify({ ...buildPayload(form, kind, article), idempotency_key: key }),
        });
        const body = await response.json().catch(() => ({}));
        if (goalId() !== currentGoal) return;
        if (response.status === 409) {
          const versionConflict = /version_conflict|stale_version/.test(String(body.code || ""));
          if (!versionConflict) {
            if (status) { status.hidden = false; status.textContent = body.error || L("已保存，正在读回当前事实。"); }
            try {
              if (typeof reloadDocument === "function") {
                const replaced = await reloadDocument(currentGoal, restore);
                if (replaced === false) throw new Error(L("读取断线"));
              }
            } catch (readError) {
              if (status) {
                status.hidden = false;
                status.innerHTML = escapeText((readError.message || L("读取断线")) + " · " + L("已保存，请重试读取，不会再写一条。"))
                  + '<button type="button" class="mw-btn mw-btn--secondary" data-retry-read>' + escapeText(L("重试读取")) + "</button>";
              }
            }
            return;
          }
          let current = {};
          try { current = await fetch(route("/api/goals/" + encodeURIComponent(currentGoal) + "/event-state"), { cache: "no-store" }).then((res) => res.json()); } catch {}
          if (conflict) {
            conflict.hidden = false;
            conflict.innerHTML = "<p>" + escapeText(body.error || L("当前约定已变化。输入已保留。")) + "</p>"
              + "<p>" + escapeText(L("当前预期结果")) + "：" + escapeText(current.agreement?.outcome || L("未填写")) + "</p>"
              + "<p>" + escapeText(L("约定版本")) + " " + escapeText(current.agreement?.version ?? "") + " · " + escapeText(L("配置版本")) + " " + escapeText(current.config?.version ?? "") + "</p>"
              + '<button type="button" class="mw-btn mw-btn--secondary" data-conflict-retry>' + escapeText(L("按当前版本重新审阅后提交")) + "</button>";
          }
          form.setAttribute("data-live-dirty", "true");
          return;
        }
        if (!response.ok) {
          fieldError(form, body.details?.field_id, body.error || L("保存失败"));
          if (status) { status.hidden = false; status.textContent = body.error || L("保存失败"); }
          return;
        }
        typeSaved = kind === "type";
        if (kind === "type" && form.querySelector('[name="add_requirement"]')?.checked) {
          const extraData = new FormData(form);
          const extraStatement = String(extraData.get("requirement_statement") || "").trim();
          if (!extraStatement) {
            if (status) { status.hidden = false; status.textContent = L("类型已登记，但完成要求没有写上。"); }
            return;
          }
          const extraKey = key + ":req";
          const extraRes = await fetch(route("/api/goals/" + encodeURIComponent(currentGoal) + "/event-agree"), {
            method: "POST", headers: { ...jsonHeaders(), "x-molis-work-idempotency-key": extraKey },
            body: JSON.stringify({
              expected_config_version: Number(body.config?.version ?? form.dataset.configVersion ?? 0),
              expected_agreement_version: Number(form.dataset.agreementVersion || article.dataset.agreementVersion || 0),
              new_requirements: [{
                requirement_id: String(extraData.get("new_requirement_id") || "").trim(),
                statement: extraStatement,
                bound_type_id: String(extraData.get("type_id") || "").trim() || undefined,
              }],
              idempotency_key: extraKey,
            }),
          });
          const extraBody = await extraRes.json().catch(() => ({}));
          if (!extraRes.ok) {
            fieldError(form, extraBody.details?.field_id, extraBody.error || L("保存失败"));
            if (status) { status.hidden = false; status.textContent = L("类型已登记，但完成要求没有写上。") + " " + (extraBody.error || L("保存失败")) + " " + L("输入已保留，重试将继续保存完成要求。"); }
            return;
          }
        }
        form.dataset.writeReceipt = body.event_id || "recorded";
        if (body.unmet_reasons?.length && body.completion_applied === false && status) {
          status.hidden = false;
          status.innerHTML = escapeText(L("收尾未生效")) + "<ul>" + body.unmet_reasons.map((item) => "<li>" + escapeText(item.message) + "</li>").join("") + "</ul>";
        }
        try {
          if (typeof reloadDocument === "function") {
            const replaced = await reloadDocument(currentGoal, { ...restore, form: body.completion_applied === false ? restore.form : "" });
            if (replaced === false) throw new Error(L("读取断线"));
            if (!replaced) return;
            form.removeAttribute("data-live-dirty");
          }
        } catch (readError) {
          if (status) {
            status.hidden = false;
            status.innerHTML = escapeText((readError.message || L("读取断线")) + " · " + L("已保存，请重试读取，不会再写一条。"))
              + '<button type="button" class="mw-btn mw-btn--secondary" data-retry-read>' + escapeText(L("重试读取")) + "</button>";
          }
          showError?.(L("已保存，但当前页面还没读回。"));
          return;
        }
        delete form.dataset.idempotencyKey;
        if (goalId() !== currentGoal) return;
        if (body.unmet_reasons?.length && body.completion_applied === false) {
          showStatus?.(L("收尾未生效。顶部已按当前权威状态更新。"));
          return;
        }
        showStatus?.(L("已保存。顶部已按当前权威状态更新。"));
        reading.form = "";
        reading.reader = "";
        hidePanels(true);
      } catch (error) {
        const message = error instanceof TypeError ? L("无法连接本地服务，输入已保留，请重试。") : error.message || L("保存失败");
        if (status) { status.hidden = false; status.textContent = typeSaved ? L("类型已登记，但完成要求没有写上。") + " " + message : message; }
        else showError?.(message);
      } finally {
        form.removeAttribute("aria-busy");
        if (fields) fields.inert = false;
        buttons.forEach(button => { button.disabled = false; });
        if (submit) submit.textContent = submitLabel;
        if (form.isConnected && !form.hidden) (form.querySelector(":invalid") || submit)?.focus();
      }
    };

    const appendTimelineItems = (items) => {
      const nav = root()?.querySelector("[data-event-timeline]");
      if (!nav) return;
      const existing = new Set([...nav.querySelectorAll("[data-timeline-item]")].map((node) => node.dataset.timelineItem));
      const pending = new Set(JSON.parse(nav.dataset.pendingDecisionEvents || "[]"));
      let lastDay = [...nav.querySelectorAll(".day-label")].at(-1)?.textContent;
      items.forEach((item) => {
        if (existing.has(item.item_id)) return;
        existing.add(item.item_id);
        const received = item.received_at || "";
        const date = new Date(received);
        const validDate = !Number.isNaN(date.getTime());
        const pad = (value) => String(value).padStart(2, "0");
        const day = validDate ? date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) : L("未标注日期");
        if (day !== lastDay) {
          const heading = document.createElement("div");
          heading.className = "day-label";
          heading.textContent = day;
          nav.append(heading);
          lastDay = day;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "timeline-entry";
        button.dataset.timelineItem = item.item_id;
        button.dataset.eventId = item.event_id || "";
        button.dataset.source = item.source || "";
        button.dataset.originalId = item.original_id || "";
        button.dataset.lane = item.lane || "other";
        if (item.lane && item.lane !== "other") button.classList.add("is-" + item.lane);
        button.setAttribute("aria-current", String(item.item_id === reading.item));
        button.setAttribute("aria-expanded", "false");
        applyLaneFilter(button);
        const time = validDate ? pad(date.getHours()) + ":" + pad(date.getMinutes()) : "--:--";
        const status = item.type_label === "请求决定" ? pending.has(item.event_id) ? L("待你决定") : L("已处理") : item.status_label;
        const mark = item.relation ? "↗" : item.lane === "result" ? "✓" : item.lane === "decision" ? "◇" : item.lane === "problem" ? "!" : "·";
        button.innerHTML = "<time></time><span class=timeline-dot aria-hidden=true><span class=timeline-mark>" + mark + "</span></span><span class=timeline-copy><strong>" + escapeText(item.title || "") + "</strong><small><b class=timeline-type>" + escapeText(item.type_label || "") + "</b> <span class=timeline-actor>" + escapeText(item.actor_id || "") + "</span></small>" + (status ? "<em class=history-state>" + escapeText(status) + "</em>" : "") + "</span>";
        button.querySelector("time").dateTime = received;
        button.querySelector("time").textContent = time;
        nav.append(button);
      });
    };

    const onClick = (event) => {
      const article = event.target.closest?.("[data-goal-event-document]");
      if (!article || article !== root()) return;
      if (article.querySelector('[data-event-form][aria-busy="true"]')) { event.preventDefault(); return; }
      const item = event.target.closest("[data-timeline-item]");
      if (item) {
        const sheet = article.querySelector("[data-event-sheet]");
        if (item.getAttribute("aria-expanded") === "true" && sheet && !sheet.hidden && !reading.form && !reading.reader) {
          selectedRequest += 1;
          item.setAttribute("aria-expanded", "false");
          item.setAttribute("aria-current", "false");
          reading.item = "";
          sheet.hidden = true;
        } else void loadEventBody(item, true);
        return;
      }
      if (event.target.closest("[data-retry-event]")) { void locateHistory(reading.item); return; }
      if (event.target.closest("[data-action=timeline]")) { showDetail(false); return; }
      if (event.target.closest("[data-event-back]")) {
        reading.reader = "";
        reading.form = "";
        hidePanels(true);
        return;
      }
      if (event.target.closest("[data-previous-event]")) { stepEvent(-1); return; }
      if (event.target.closest("[data-next-event]")) { stepEvent(1); return; }
      const retryRead = event.target.closest("[data-retry-read]");
      if (retryRead) {
        void (async () => {
          const form = retryRead.closest("[data-event-form]");
          const status = form?.querySelector("[data-form-status]");
          try {
            const replaced = await reloadDocument(goalId(), captureRestore());
            if (replaced === false) throw new Error(L("读取断线"));
            if (replaced) showStatus?.(L("已保存。顶部已按当前权威状态更新。"));
          } catch (error) {
            if (status) { status.hidden = false; status.textContent = error.message || L("读取断线"); }
            showError?.(error.message || L("读取断线"));
          }
        })();
        return;
      }
      const retry = event.target.closest("[data-conflict-retry]");
      if (retry) {
        void (async () => {
          const state = await fetch(route("/api/goals/" + encodeURIComponent(goalId()) + "/event-state"), { cache: "no-store" }).then((res) => res.json());
          const form = article.querySelector("[data-event-form]:not([hidden])");
          if (!form) return;
          const config = form.querySelector('[name="expected_config_version"]');
          const agreement = form.querySelector('[name="expected_agreement_version"]');
          if (config) config.value = String(state.config?.version ?? 0);
          if (agreement) agreement.value = String(state.agreement?.version ?? 0);
          form.dataset.configVersion = String(state.config?.version ?? 0);
          form.dataset.agreementVersion = String(state.agreement?.version ?? 0);
          delete form.dataset.idempotencyKey;
          const box = article.querySelector("[data-event-conflict]");
          if (box) {
            box.hidden = false;
            box.innerHTML = "<p>" + escapeText(L("已换成当前版本。请核对输入后再提交。")) + "</p>"
              + "<p>" + escapeText(L("当前预期结果")) + "：" + escapeText(state.agreement?.outcome || L("未填写")) + "</p>"
              + "<p>" + escapeText(L("约定版本")) + " " + escapeText(state.agreement?.version ?? "") + " · " + escapeText(L("配置版本")) + " " + escapeText(state.config?.version ?? "") + "</p>";
          }
        })();
        return;
      }
      const more = event.target.closest("[data-load-more-timeline]");
      if (more) {
        void (async () => {
          const requestId = ++moreRequest;
          const currentGoal = goalId();
          more.disabled = true;
          try {
            const response = await fetch(route("/api/goals/" + encodeURIComponent(currentGoal) + "/event-timeline?before_cursor=" + encodeURIComponent(more.dataset.nextCursor || "") + "&limit=40"), { cache: "no-store" });
            const body = await response.json().catch(() => ({}));
            if (requestId !== moreRequest || goalId() !== currentGoal) return;
            if (!response.ok) throw new Error(body.error || L("无法读取更早记录，请重试。"));
            appendTimelineItems(body.items || []);
            if (!body.next_cursor) { more.hidden = true; more.dataset.nextCursor = ""; }
            else more.dataset.nextCursor = String(body.next_cursor);
          } catch (error) {
            if (requestId === moreRequest && goalId() === currentGoal) showError?.(error.message || L("无法读取更早记录，请重试。"));
          } finally { more.disabled = false; }
        })();
        return;
      }
      const locateReq = event.target.closest("[data-locate-requirement]");
      if (locateReq) {
        if (locateReq.dataset.reportEvent) { void locateHistory(locateReq.dataset.reportEvent); return; }
        if (locateReq.dataset.boundType) { showForm("report", locateReq.dataset.boundType); return; }
        showForm("requirements");
        return;
      }
      const locate = event.target.closest("[data-locate-event]");
      if (locate) {
        if (locate.dataset.locateEvent) { void locateHistory(locate.dataset.locateEvent); return; }
        if (locate.dataset.boundType) { showForm("report", locate.dataset.boundType); return; }
        return;
      }
      const reader = event.target.closest("[data-event-reader]");
      if (reader) { showForm(reader.dataset.eventReader, undefined, reader); return; }
      const openForm = event.target.closest("[data-event-form-open]");
      if (openForm) { showForm(openForm.dataset.eventFormOpen, openForm.dataset.typeId, openForm); return; }
      const report = event.target.closest("[data-event-report]");
      if (report) { showForm("report", report.dataset.eventReport, report); return; }
      const filter = event.target.closest("[data-timeline-filter]");
      if (filter) {
        reading.filter = filter.dataset.timelineFilter || "all";
        article.querySelectorAll("[data-timeline-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === filter)));
        article.querySelectorAll("[data-timeline-item]").forEach((node) => applyLaneFilter(node));
        return;
      }
      const addField = event.target.closest("[data-add-type-field]");
      if (addField) {
        const box = addField.closest("form")?.querySelector("[data-type-fields]");
        if (!box) return;
        const wrap = document.createElement("div");
        wrap.className = "type-field-row";
        const id = "field-" + (globalThis.crypto?.randomUUID?.().slice(0, 8) || String(Date.now()));
        wrap.innerHTML = '<input type="hidden" name="field_id" value="' + id + '"><label><span>' + escapeText(L("字段名")) + '</span><input name="field_name" required></label><label><span>' + escapeText(L("说明")) + '</span><input name="field_purpose" required value="' + escapeText(L("记录原文")) + '"></label><div class="type-field-tools"><label><span>' + escapeText(L("内容形式")) + '</span><select name="field_format"><option value="text">' + escapeText(L("短文本")) + '</option><option value="longtext" selected>' + escapeText(L("长文本")) + '</option></select></label><label class="check-row"><input type="checkbox" name="field_required" checked><span>' + escapeText(L("必填")) + '</span></label><button type="button" class="mw-btn mw-btn--link" data-remove-type-field>' + escapeText(L("移除")) + '</button></div>';
        box.append(wrap);
        return;
      }
      const removeField = event.target.closest("[data-remove-type-field]");
      if (removeField) {
        const form = removeField.closest("form");
        const rows = form?.querySelectorAll(".type-field-row") || [];
        if (rows.length < 2) {
          const box = form?.querySelector("[data-form-status]");
          if (box) { box.hidden = false; box.textContent = L("至少保留一个字段。"); }
          return;
        }
        removeField.closest(".type-field-row")?.remove();
      }
    };

    const stepEvent = (direction) => {
      const items = [...(root()?.querySelectorAll("[data-timeline-item]") || [])].filter((item) => !item.hidden);
      const current = items.findIndex((item) => item.getAttribute("aria-current") === "true");
      const next = items[Math.min(items.length - 1, Math.max(0, current + direction))];
      if (next) void loadEventBody(next, true);
    };

    const onSubmit = (event) => {
      const form = event.target.closest?.("[data-event-form]");
      if (!form || form.closest("[data-goal-event-document]") !== root()) return;
      event.preventDefault();
      void submitForm(form);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        const menu = event.target.closest?.("[data-record-menu][open], .goal-more[open]");
        if (menu) { event.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus(); return; }
      }
      if (!event.target.closest?.("[data-event-timeline]")) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.target.matches?.("input, textarea, select")) return;
      const items = [...root().querySelectorAll("[data-timeline-item]")].filter((item) => !item.hidden);
      const current = items.findIndex((item) => item.getAttribute("aria-current") === "true");
      const next = event.key === "ArrowDown" ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1);
      if (items[next]) { event.preventDefault(); void loadEventBody(items[next], true); items[next].focus(); }
    };
    const onChange = (event) => {
      const input = event.target;
      const form = input.closest?.("[data-event-form]");
      if (!form || form.closest("[data-goal-event-document]") !== root()) return;
      if (input.name === "effect" && input.checked) {
        const opposite = { accept_requirements: "reject_requirements", reject_requirements: "accept_requirements", accept_concerns: "reject_concerns", reject_concerns: "accept_concerns", authorize_action: "deny_action", deny_action: "authorize_action" }[input.value];
        if (opposite) { const other = form.querySelector('[name="effect"][value="' + opposite + '"]'); if (other) other.checked = false; }
      }
      if (input.matches('[name="add_requirement"]')) {
        const row = form.querySelector("[data-new-requirement]");
        if (row) { row.hidden = !input.checked; row.querySelector("textarea").required = input.checked; }
      }
      if (input.matches("[data-judgment-requirement]")) {
        const verdict = form.querySelector("[data-judgment-verdict]");
        verdict.disabled = !input.value; verdict.closest("label").hidden = !input.value;
        if (!input.value) verdict.value = "";
      }
      if (form.dataset.eventForm === "adopt" && input.name === "method_id") {
        let count = 0;
        form.querySelectorAll("[data-adopt-method]").forEach(row => {
          row.hidden = row.dataset.adoptMethod !== input.value;
          const checkbox = row.querySelector("input"); checkbox.disabled = row.hidden;
          if (row.hidden) checkbox.checked = false; else count++;
        });
        const empty = form.querySelector("[data-adopt-empty]"); if (empty) empty.hidden = count > 0;
      }
      if (form.dataset.eventForm === "concern" && (input.name === "concern_id" || input.name === "action")) {
        const existing = Boolean(form.querySelector('[name="concern_id"]')?.value);
        const action = form.querySelector('[name="action"]');
        if (input.name === "concern_id") action.value = existing ? "resolve" : "open";
        form.querySelectorAll("[data-concern-new]").forEach(row => row.hidden = existing);
        form.querySelectorAll("[data-concern-existing]").forEach(row => row.hidden = !existing);
        form.querySelector('[name="title"]').required = !existing;
        form.querySelector('[name="statement"]').required = !existing;
        form.querySelector('[name="reason"]').required = existing;
        const open = action.querySelector('option[value="open"]'); if (open) open.hidden = existing;
        form.querySelectorAll("[data-concern-accept]").forEach(row => row.hidden = action.value !== "accept");
        const decision = form.querySelector('[name="cited_decision_id"]'); if (decision) decision.required = action.value === "accept";
      }
    };

    document.addEventListener("click", (event) => {
      root()?.querySelectorAll("[data-record-menu][open], .goal-more[open]").forEach((menu) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    });
    documentPane.addEventListener("click", onClick);
    documentPane.addEventListener("change", onChange);
    documentPane.addEventListener("submit", onSubmit);
    documentPane.addEventListener("keydown", onKeydown);
    documentPane.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-goal-info]") && event.target.closest("[data-goal-event-document]") === root()) reading.infoOpen = event.target.open;
    }, true);
    window.addEventListener("resize", () => requestAnimationFrame(syncPanelPresence));

    return {
      openEventReader(name) { showForm(name); },
      bindGoalEventDocument(restore) {
        const article = root();
        const current = goalId();
        const restoreForGoal = restore && (!restore.goal || restore.goal === current) ? restore : null;
        if (reading.goal !== current) resetReading(current);
        const info = article?.querySelector("[data-goal-info]");
        if (info && !info.dataset.initialized) {
          info.open = restoreForGoal?.infoOpen ?? reading.infoOpen ?? !matchMedia("(max-width: 760px)").matches;
          info.dataset.initialized = "true";
        }
        if (restoreForGoal?.item) reading.item = restoreForGoal.item;
        if (restoreForGoal?.filter) reading.filter = restoreForGoal.filter;
        if (restoreForGoal?.reader) reading.reader = restoreForGoal.reader;
        if (restoreForGoal?.form !== undefined) reading.form = restoreForGoal.form;
        hidePanels();
        article?.querySelectorAll("[data-timeline-filter]").forEach((button) => {
          button.setAttribute("aria-pressed", String(button.dataset.timelineFilter === (reading.filter || "all")));
        });
        article?.querySelectorAll("[data-timeline-item]").forEach((node) => applyLaneFilter(node));
        if (reading.item) {
          article?.querySelectorAll("[data-timeline-item]").forEach((node) => node.setAttribute("aria-current", String(node.dataset.timelineItem === reading.item)));
        }
        if (reading.form) showForm(reading.form);
        else if (reading.reader) showForm(reading.reader);
        else if (reading.item) void locateHistory(reading.item);
      },
    };
  }`;
