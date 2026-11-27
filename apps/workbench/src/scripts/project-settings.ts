/**
 * Project operations initialize independently of the Runtime settings dialog. The project's 「输入与输出」 and the after-write
 * checkers below them (specs/prologue-adoption §6.0p.13) are separate programs (PROJECT_DIRECTORIES_CLIENT_SCRIPT, which hands
 * WRITE_CHECKERS_CLIENT_SCRIPT its part), loaded only by the pages drawing that section; here they are bound with the rest. The Runtime
 * row on the general page (BL-372) is in view with more than one Runtime to pick, or when the picked one is gone, so it can be
 * changed or put back to the default.
 */
export const PROJECT_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    // A project's 「输入与输出」 is its own typed program (src/browser/project-directories.ts), loaded before this one.
    const bindWorkspaces = (scope) => globalThis.molisWorkBindProjectDirectories?.(scope);
    const bindRename = (scope) => {
      (scope || document).querySelectorAll("[data-project-rename]").forEach((form) => {
        if (form.dataset.bound === "1") return;
        form.dataset.bound = "1";
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submit = form.querySelector("button[type=submit]");
          if (submit.disabled) return;
          const error = form.querySelector(".settings-form-error");
          submit.disabled = true;
          error.hidden = true;
          try {
            await molisWorkRequest("/api/settings/projects/" + encodeURIComponent(form.dataset.projectRename) + "/rename", {
              body: { display_name: String(new FormData(form).get("display_name") || "").trim(), expected_display_name: form.dataset.projectObservedName }, fallback: globalThis.t.text("workbench.project-settings.could-not-rename-project"),
            });
            location.reload();
          } catch (caught) {
            molisWorkRequest.show(error, caught);
            error.hidden = false;
            submit.disabled = false;
          }
        });
      });
    };
    const bindRuntime=(scope)=>{(scope||document).querySelectorAll('[data-project-runtime]').forEach(root=>{
      if(root.dataset.bound==='1')return;root.dataset.bound='1';
      const select=root.querySelector('select'),error=root.querySelector('.settings-form-error'),path=root.dataset.runtimePrefix+'/api/project-settings/runtime';
      let revision;
      const show=state=>{
        revision=state.revision;
        const gone=state.selected&&!state.runtimes.some(item=>item.runtime_id===state.selected);
        root.hidden=state.runtimes.length<2&&!state.problem;
        select.replaceChildren(new Option(globalThis.t.text("workbench.project-settings.default-runtime"),''),...state.runtimes.map(item=>new Option(item.display_name,item.runtime_id)),...(gone?[new Option(state.selected+globalThis.t.text("workbench.project-settings.unavailable"),state.selected)]:[]));
        select.value=state.selected||'';error.textContent=state.problem||'';error.hidden=!state.problem;
      };
      select.addEventListener('change',async ()=>{
        if(!revision)return;
        select.disabled=true;
        try {
          show(await molisWorkRequest(path,{body:{runtime_id:select.value||null,expected_revision:revision,request_id:crypto.randomUUID()},fallback:globalThis.t.text("workbench.project-settings.could-not-change-runtime")}));
        } catch(caught) {
          try { show(await molisWorkRequest(path)); } catch { /* Keep the last displayed revision and report the original save failure. */ }
          molisWorkRequest.show(error,caught);error.hidden=false;
        } finally { select.disabled=false; }
      });
      molisWorkRequest(path).then(show,()=>null);
    });};
    const bindDelete = (scope) => {
      (scope || document).querySelectorAll("[data-project-delete-dialog]").forEach((dialog) => {
        if (dialog.dataset.bound === "1") return;
        dialog.dataset.bound = "1";
        const root = dialog.closest("[data-project-pane], .project-settings-page") || scope || document;
        const form = dialog.querySelector("form");
        const confirmation = form.elements.delete_confirmed;
        const confirmRow = dialog.querySelector("[data-project-delete-confirm]");
        const submit = form.querySelector("button[type=submit]");
        const error = dialog.querySelector("[data-project-delete-error]");
        const cancel = dialog.querySelector("[data-project-delete-cancel]");
        const names = dialog.querySelector("[data-project-delete-scope] span");
        const description = dialog.querySelector(".runtime-plan-body > p[id]");
        // The default output directory's question (A3): its two option cards are the confirmation, so the checkbox goes while it shows.
        const question = dialog.querySelector("[data-project-delete-output]");
        const options = [...question.querySelectorAll("[data-ix-option]")];
        const busyNotice = dialog.querySelector("[data-project-delete-busy]");
        const title = dialog.querySelector("header h2");
        const formBody = dialog.querySelector(".runtime-plan-body:not([data-project-delete-kept])");
        const kept = dialog.querySelector("[data-project-delete-kept]");
        const actions = dialog.querySelector("[data-project-delete-actions]");
        const done = dialog.querySelector("[data-project-delete-done]");
        let busy = false;
        let cleanupPending = false;
        // The last answer was lost on the way (the deletion may have started): the next try sends the same key and the same choice.
        let unsure = false;
        let deletionKey = null;
        let asks = false;
        let choice = null, scopeTurn = 0;
        // Once the deletion may have started the choice is fixed: another choice under the same key is refused.
        const locked = () => cleanupPending || unsure;
        const ready = () => !busy && (cleanupPending || (asks ? choice !== null : confirmation.checked));
        const label = () => cleanupPending ? globalThis.t.text("workbench.project-settings.retry-cleanup") : asks && choice === "delete" ? globalThis.t.text("workbench.project-settings.delete-project-files") : asks && choice === "keep" ? globalThis.t.text("workbench.project-settings.delete-project") : globalThis.t.text("workbench.project-settings.confirm-project-deletion");
        const paintWords = () => {
          const summary = asks ? globalThis.t.text("workbench.project-settings.delete-project-data") : globalThis.t.text("workbench.project-settings-folds.delete-project-data");
          const action = busy ? globalThis.t.text("workbench.project-settings.deleting") : label();
          if (description.textContent !== summary) description.textContent = summary;
          if (submit.textContent !== action) submit.textContent = action;
        };
        const retitle = () => {
          if (dialog.open && dialog.isConnected) paintWords();
          else document.removeEventListener("molis-work:language-changed", retitle);
        };
        const paint = () => {
          question.hidden = !asks;
          confirmRow.hidden = asks;
          options.forEach((option) => {
            const on = option.dataset.ixOption === choice;
            option.setAttribute("aria-checked", on ? "true" : "false");
            option.tabIndex = on || (choice === null && option === options[0]) ? 0 : -1;
            option.disabled = busy || locked();
          });
          confirmation.disabled = busy || locked();
          keepInstead.disabled = busy || locked();
          // Cleaning up what is left is the one way on, so the way around a busy refusal goes.
          if (cleanupPending) busyNotice.hidden = true;
          submit.disabled = !ready();
          paintWords();
        };
        const choose = (value, focus) => {
          if (busy || locked()) return;
          choice = value;
          busyNotice.hidden = true;
          paint();
          if (focus) options.find((option) => option.dataset.ixOption === value)?.focus();
        };
        options.forEach((option, index) => {
          option.addEventListener("click", () => choose(option.dataset.ixOption, false));
          option.addEventListener("keydown", (event) => {
            const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            choose(options[(index + step + options.length) % options.length].dataset.ixOption, true);
          });
        });
        const keepInstead = dialog.querySelector("[data-project-delete-keep-instead]");
        keepInstead.addEventListener("click", () => choose("keep", true));
        const loadScope = () => {
          const turn = ++scopeTurn, language = document.documentElement.dataset.uiLanguageTag;
          return molisWorkRequest("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete-scope")
            .then((result) => {
              if (turn !== scopeTurn || !dialog.open || !dialog.isConnected) return;
              if (document.documentElement.dataset.uiLanguageTag === language) names.textContent = result.owners.map((owner) => owner.label).join(globalThis.t.text("workbench.project-deletion.separator"));
              // Only this initial output check sets the question. Preparing language HTML never checks it or changes the choice.
              if (!deletionKey) { asks = result.default_output === "has_files"; paint(); }
            }).catch(() => null);
        };
        const showKept = (path) => {
          title.textContent = globalThis.t.text("workbench.project-settings.project-deleted");
          formBody.hidden = actions.hidden = true;
          kept.hidden = done.hidden = false;
          kept.querySelector("[data-project-delete-kept-path]").textContent = path;
          const note = kept.querySelector("[data-project-delete-kept-note]");
          if (!asks) note.textContent = globalThis.t.text("workbench.project-settings.had-files-so-they-were-left-alone") + note.textContent;
          busy = true;
          requestAnimationFrame(() => done.querySelector("a")?.focus({ preventScroll: true }));
        };
        kept.querySelector("[data-project-delete-copy]").addEventListener("click", async (event) => {
          const path = kept.querySelector("[data-project-delete-kept-path]").textContent;
          const button = event.currentTarget;
          if (window.molisCopy) { await window.molisCopy(button, () => path, { done: globalThis.t.text("workbench.project-settings.copied"), failed: globalThis.t.text("workbench.project-settings.couldn-t-copy") }); return; }
          try { await navigator.clipboard.writeText(path); } catch (caught) { molisWorkRequest.show(error, caught); }
        });
        done.querySelector("a").addEventListener("click", (event) => {
          event.preventDefault();
          location.assign(globalThis.molisWorkNavigationUrl(form.dataset.projectDirectoryHref));
        });
        root.querySelector("[data-project-delete-open]")?.addEventListener("click", () => {
          if (!deletionKey) {
            confirmation.checked = false;
            choice = null;
            asks = false;
            error.hidden = busyNotice.hidden = true;
            title.textContent = globalThis.t.text("workbench.project-settings-folds.delete-project");
          }
          paint();
          dialog.showModal();
          document.addEventListener("molis-work:language-changed", retitle);
          loadScope();
        });
        cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", (event) => { if (busy && kept.hidden) event.preventDefault(); });
        dialog.addEventListener("close", () => { if (!dialog.open) document.removeEventListener("molis-work:language-changed", retitle); });
        confirmation.addEventListener("change", paint);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!ready()) return;
          deletionKey ||= crypto.randomUUID();
          busy = true;
          cancel.disabled = true;
          error.hidden = true;
          paint();
          try {
            const result = await molisWorkRequest("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete", {
              body: { delete_confirmed: true, idempotency_key: deletionKey, ...(asks && choice ? { output_files: choice } : {}) }, fallback: globalThis.t.text("workbench.project-settings.could-not-delete-project"),
            });
            unsure = false;
            cleanupPending = result.deletion.cleanup_state !== "complete";
            if (cleanupPending) throw new Error(globalThis.t.text("workbench.project-settings.removed-project-data-pending"));
            busyNotice.hidden = true;
            if (result.kept_output_directory) { showKept(result.kept_output_directory); return; }
            location.assign(globalThis.molisWorkNavigationUrl(form.dataset.projectDirectoryHref));
          } catch (caught) {
            busy = false;
            cancel.disabled = false;
            if (caught?.code === "catalog.project_task_live") {
              // Tasks may still be writing into the folder: say so where the choice is, and offer the way that works now.
              // The deletion did not start, so the next try may choose again under a new key.
              deletionKey = null;
              unsure = false;
              const shown = !busyNotice.hidden;
              busyNotice.hidden = false;
              // First time it rises in; pressed again while it shows, it hops once instead of appearing again.
              busyNotice.classList.remove("is-nudged", "mw-alert--rise");
              void busyNotice.offsetWidth;
              busyNotice.classList.add(shown ? "is-nudged" : "mw-alert--rise");
              busyNotice.scrollIntoView({ block: "nearest" });
            } else {
              if (!cleanupPending) {
                // Refused before the deletion started: the choice is open again, so the next try is a new deletion under a new key
                // (the old key with another choice would be refused). When the answer was lost, the deletion may have started: keep both.
                unsure = ["ui_host.outcome_unknown", "ui_host.invalid_response", "actions.outcome_unknown"].includes(caught?.code);
                if (!unsure) deletionKey = null;
              }
              molisWorkRequest.show(error, caught);
              error.hidden = false;
              error.scrollIntoView({ block: "nearest" });
            }
            paint();
          }
        });
      });
    };
    const bindDemo = (scope) => {
      const buttons = (scope || document).querySelectorAll("[data-demo-action]");
      const disable = value => buttons.forEach(button => {button.disabled = value;});
      buttons.forEach((button) => {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", async () => {
          const action = button.dataset.demoAction;
          const error = button.closest("section, details")?.querySelector("[data-demo-error]") || document.querySelector("[data-demo-error]");
          const toast = document.querySelector("[data-settings-toast]");
          const message = action === "create"
            ? globalThis.t.text("workbench.project-settings.create-demo-description")
            : action === "reset"
              ? globalThis.t.text("workbench.project-settings.rebuild-demo-description")
              : globalThis.t.text("workbench.project-settings.delete-demo-description");
          if (!window.confirm(message)) return;
          disable(true);
          if (error) error.hidden = true;
          try {
            const result = await molisWorkRequest("/api/settings/demo", { body: { action, user_confirmed: true }, fallback: globalThis.t.text("workbench.project-settings.demo-action-failed") });
            const message = result.message || globalThis.t.text("workbench.project-settings.demo-updated");
            if (result.warning && error) {
              error.textContent = message + ' ' + result.warning + ' ';
              const refresh = document.createElement('a');refresh.href = location.href;refresh.textContent = globalThis.t.text("workbench.project-settings.refresh");
              refresh.onclick = event => {event.preventDefault();location.reload();};error.append(refresh);error.hidden = false;
              return;
            }
            if (toast) {
              toast.textContent = message; toast.dataset.mwState = "done"; toast.classList.remove("is-error");
              toast.classList.add("is-visible");
              setTimeout(() => toast.classList.remove("is-visible"), 2600);
            }
            setTimeout(() => location.reload(), 450);
          } catch (caught) {
            if (error) { molisWorkRequest.show(error, caught); error.hidden = false; }
            disable(false);
          }
        });
      });
    };
    globalThis.molisWorkBindProjectIdentity = (scope) => {
      bindWorkspaces(scope);
      bindRename(scope);
      bindRuntime(scope);
      bindDelete(scope);
      bindDemo(scope);
    };
    globalThis.molisWorkBindProjectIdentity(document);
    // Every project on this machine (/settings/projects): a list to pick one, its settings beside it, and 新建项目. On its
    // own page the picked project is the address's #fragment; in the workbench's settings it is the address the cover loaded.
    globalThis.molisWorkBindProjectManager = (scope, address = { hash: location.hash }) => {
      const projectManager = scope.matches?.("[data-project-manager]") ? scope : scope.querySelector("[data-project-manager]");
      if (projectManager && projectManager.dataset.bound !== "1") {
        projectManager.dataset.bound = "1";
        const ownPage = scope === document;
        const radios = [...projectManager.querySelectorAll('input[name="project-focus"]')];
        const panes = projectManager.querySelectorAll("[data-project-pane]");
        const showPane = (value) => {
          panes.forEach((pane) => {
            const hide = pane.dataset.projectPane !== value;
            if (hide && !pane.hidden) globalThis.molisWorkResetProjectSettingsEmbeds?.(pane);
            pane.hidden = hide;
          });
        };
        const applyHash = (hash) => {
          let raw = "";
          try { raw = decodeURIComponent(String(hash || "").replace(/^#/, "")); } catch { return; }
          const match = raw && radios.find((radio) => radio.value === raw);
          if (!match) return;
          match.checked = true;
          showPane(match.value);
        };
        radios.forEach((radio) => {
          radio.addEventListener("change", () => {
            if (!radio.checked) return;
            showPane(radio.value);
            const next = "#" + encodeURIComponent(radio.value);
            if (ownPage && location.hash !== next) history.replaceState(null, "", next);
          });
        });
        if (ownPage) window.addEventListener("hashchange", () => applyHash(location.hash));
        applyHash(address.hash);
      }
      const createForm = scope.querySelector("[data-project-create]");
      if (!createForm || createForm.dataset.bound === "1") return;
      createForm.dataset.bound = "1";
      createForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(createForm);
        const error = createForm.querySelector(".settings-form-error");
        if (values.get("user_confirmed") !== "on") {
          error.textContent = globalThis.t.text("workbench.project-settings.confirm-that-want-create-project");
          error.hidden = false;
          return;
        }
        const submit = createForm.querySelector("button[type=submit]");
        submit.disabled = true;
        error.hidden = true;
        try {
          const result = await molisWorkRequest("/api/settings/projects", { body: { display_name: String(values.get("display_name") || "").trim(), user_confirmed: true }, fallback: globalThis.t.text("workbench.project-settings.could-not-create-project") });
          location.assign(globalThis.molisWorkNavigationUrl(result.project_path));
        } catch (caught) {
          molisWorkRequest.show(error, caught);
          error.hidden = false;
          submit.disabled = false;
        }
      });
    };
    globalThis.molisWorkBindProjectManager(document);
    const bindEmbedded = (root) => {
      globalThis.molisWorkBindProjectIdentity?.(root);
      globalThis.molisWorkBindProjectGuidance?.(root);
    };
    const embedSeq = new WeakMap();
    const resetEmbed = (details) => {
      const target = details.querySelector("[data-settings-embed-target]");
      if (!target || !details.dataset.settingsEmbed) return;
      embedSeq.set(details, (embedSeq.get(details) || 0) + 1);
      details.open = false;
      target.replaceChildren();
      delete details.dataset.loaded;
    };
    globalThis.molisWorkResetProjectSettingsEmbeds = (root) => {
      root?.querySelectorAll?.("[data-settings-embed][data-loaded]").forEach(resetEmbed);
    };
    const loadEmbed = async (details) => {
      if (!details.open || details.dataset.loaded === "1" || details.dataset.loaded === "pending" || !details.dataset.settingsEmbed) return;
      const target = details.querySelector("[data-settings-embed-target]");
      if (!target) return;
      const seq = (embedSeq.get(details) || 0) + 1;
      embedSeq.set(details, seq);
      details.dataset.loaded = "pending";
      const pendingNote = document.createElement("p");
      pendingNote.className = "project-settings-embed-pending";
      pendingNote.textContent = globalThis.t.text("workbench.project-settings.opening");
      target.replaceChildren(pendingNote);
      try {
        const html = await molisWorkRequest(details.dataset.settingsEmbed, { as: "text", headers: { Accept: "text/html" } });
        if (embedSeq.get(details) !== seq || !details.isConnected || !details.open) return;
        target.innerHTML = html;
        details.dataset.loaded = "1";
        bindEmbedded(details);
      } catch (caught) {
        if (embedSeq.get(details) !== seq || !details.isConnected) return;
        delete details.dataset.loaded;
        const err = document.createElement("p");
        err.className = "settings-form-error";
        err.setAttribute("role", "alert");
        molisWorkRequest.show(err, caught, globalThis.t.text("workbench.project-settings.could-not-open-settings-section"));
        target.replaceChildren(err);
      }
    };
    document.querySelectorAll("[data-settings-embed]").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (details.open) void loadEmbed(details);
      });
      if (details.open) void loadEmbed(details);
    });
  })();
`;
