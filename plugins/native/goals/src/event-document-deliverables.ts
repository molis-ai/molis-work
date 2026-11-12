import { GOALS_PLUGIN_API } from "./plugin-api.js";
/** Closure reads, current-content pins and uncertain receipts in the existing document factory scope. */
export const GOALS_DELIVERABLES_SCRIPT = `    // The closure form's deliverables (specs/artifact-positioning A5): versions in the 成果库, recorded before closing.
    const loadDeliverables = async (form, reconcile = false) => {
      const box = form.querySelector("[data-closure-deliverables]"), currentGoal = goalId();
      if (!box || (!reconcile && box.dataset.loadedFor === currentGoal)) return;
      const list = box.querySelector("[data-closure-deliverable-list]");
      const status = box.querySelector("[data-deliverable-read-status]");
      const edited = [...list.querySelectorAll('input[name="deliverable"]')].filter(input => input.checked !== (input.dataset.was === "true"))
        .map(input => ({ reference: JSON.parse(input.value), checked: input.checked }));
      if (reconcile) { status.hidden = false; status.textContent = globalThis.t.text("goals.event-document-deliverables.loading-artifacts"); }
      else list.textContent = globalThis.t.text("goals.event-document-deliverables.loading-artifacts");
      try {
        const read = (path) => molisWorkRequest(route(path), { fallback: globalThis.t.text("goals.event-document-deliverables.deliverable-list-could-not-be-read-check-again") });
        const [library, current] = await Promise.all([read("/api/artifacts/versions"),
          read("${GOALS_PLUGIN_API}/goals/" + encodeURIComponent(currentGoal) + "/deliverables")]);
        if (goalId() !== currentGoal || !form.isConnected) return;
        const key = (reference) => reference.artifact_id + "@" + reference.version;
        const recorded = current.deliverables || [], listed = new Set(recorded.map(item => key(item.reference)));
        const was = new Set(recorded.filter(item => !item.proposed).map(item => key(item.reference)));
        const chosen = new Set(was);
        edited.forEach(item => { if (item.checked) chosen.add(key(item.reference)); else chosen.delete(key(item.reference)); });
        // Proposals from the assistant, Coding or a workflow stay unticked: ticking one is the person's confirmation.
        const rows = [...recorded.filter(item => item.proposed).map(item => ({ reference: item.reference, title: item.title, type_title: globalThis.t.text("goals.event-document-deliverables.proposed-assistant") + (item.reason ? globalThis.t.text("common.punctuation.label-separator") + item.reason : "") })),
          ...recorded.filter(item => !item.proposed).map(item => ({ reference: item.reference, title: item.title, type_title: "" })),
          ...(library.versions || []).filter(item => !listed.has(key(item.reference)))];
        const option = (fieldName, value, checked, title, meta) => {
          const label = document.createElement("label"), input = document.createElement("input"), name = document.createElement("span"), small = document.createElement("small");
          input.type = "checkbox"; input.name = fieldName; input.value = JSON.stringify(value); input.checked = checked; input.dataset.was = String(checked);
          name.textContent = title; small.textContent = meta;
          label.append(input, name, small);
          return label;
        };
        // The Goal's own materials can be pinned on the spot: the current content becomes a new version and is handed in.
        const attempted = JSON.parse(box.dataset.attemptedPins || "[]");
        const pinnable = (current.candidates || []).map(item => {
          const row = option("deliverable-pin", item.subject, false, item.title, globalThis.t.text("goals.event-document-deliverables.pin-current-content-hand"));
          row.querySelector("input").disabled = attempted.includes(JSON.stringify(item.subject));
          return row;
        });
        const versions = rows.map(item => {
          const row = option("deliverable", item.reference, chosen.has(key(item.reference)), item.title, [item.type_title, "v" + item.reference.version].filter(Boolean).join(" · "));
          row.querySelector("input").dataset.was = String(was.has(key(item.reference)));
          return row;
        });
        list.replaceChildren(...(pinnable.length || versions.length ? [...pinnable, ...versions]
          : [Object.assign(document.createElement("p"), { className: "form-note", textContent: globalThis.t.text("goals.event-document-deliverables.results-library-has-no-versions-yet-save-one") })]));
        box.dataset.loadedFor = currentGoal;
        if (reconcile) {
          delete box.dataset.pinUnknown;
          box.querySelector("[data-reconcile-deliverables]").hidden = true;
          status.textContent = globalThis.t.text("goals.event-document-deliverables.checked-if-pinned-version-exists-without-goal-link");
          form.querySelector("[data-form-status]").hidden = true;
        }
      } catch {
        if (goalId() !== currentGoal || !form.isConnected) return;
        if (reconcile) status.textContent = globalThis.t.text("goals.event-document-deliverables.deliverable-list-could-not-be-read-check-again");
        else list.textContent = globalThis.t.text("goals.event-document-deliverables.results-library-cannot-be-read-right-now-can");
      }
    };
    const saveDeliverables = async (form, currentGoal) => {
      const box = form.querySelector("[data-closure-deliverables]");
      if (box?.dataset.pinUnknown) throw new Error(globalThis.t.text("goals.event-document-deliverables.pin-result-still-unknown-check-deliverables-before-continuing"));
      for (const input of form.querySelectorAll('input[name="deliverable"], input[name="deliverable-pin"]')) {
        if (input.checked === (input.dataset.was === "true")) continue;
        const pin = input.name === "deliverable-pin";
        if (pin) box.dataset.attemptedPins = JSON.stringify([...JSON.parse(box.dataset.attemptedPins || "[]"), input.value]);
        try {
          const writeKey = globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random();
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/goals/" + encodeURIComponent(currentGoal) + "/deliverables"), { method: "POST",
            headers: { accept: "application/json" },
            body: { [pin ? "subject" : "reference"]: JSON.parse(input.value), delivered: input.checked, idempotency_key: writeKey }, fallback: globalThis.t.text("goals.event-document-deliverables.deliverables-were-not-recorded") });
          input.dataset.was = String(input.checked);
          // A pinned version is now an ordinary deliverable; pinning again would write another version.
          if (pin) input.disabled = true;
        } catch (error) {
          if (!pin) throw error;
          box.dataset.pinUnknown = "true";
          input.disabled = true;
          box.querySelector("[data-reconcile-deliverables]").hidden = false;
          throw new Error(globalThis.t.text("goals.event-document-deliverables.pin-result-still-unknown-check-deliverables-before-continuing"));
        }
      }
    };

`;
