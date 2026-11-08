/**
 * Project operations initialize independently of the Runtime settings dialog. The after-write checkers below the workspaces
 * (specs/prologue-adoption §6.0p.13) are a separate program, WRITE_CHECKERS_CLIENT_SCRIPT, that only the pages drawing that
 * section load; here the workspaces hand it `{ section, prefix, load }` when it is there and call the `load` it sets. The Runtime
 * row on the general page (BL-372) is in view with more than one Runtime to pick, or when the picked one is gone, so it can be
 * changed or put back to the default.
 */
export const PROJECT_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const L = globalThis.L || ((text) => text);
    const bindWorkspaces = (scope) => {
      const roots = scope?.matches?.('[data-project-workspaces]') ? [scope] : (scope || document).querySelectorAll('[data-project-workspaces]');
      roots.forEach(root => {
        if(root.dataset.bound === '1')return;root.dataset.bound='1';
        const list=root.querySelector('[data-project-workspaces-list]'), status=root.querySelector('[data-project-workspaces-status]');
        const form=root.querySelector('[data-project-workspaces-add]'), message=root.querySelector('[data-project-workspaces-add-status]');
        const refresh=root.querySelector('[data-project-workspaces-refresh]'), pick=root.querySelector('[data-project-workspaces-pick]');
        const prefix=root.dataset.workspacePrefix, checkers={section:root.querySelector('[data-write-checkers]'),prefix,load:null};if(typeof molisWorkWriteCheckers==='function')molisWorkWriteCheckers(checkers);
        let busy=false;
        const api=(path,body)=>molisWorkRequest(prefix+path,{body,fallback:L('工作目录操作失败')});
        const load=async()=>{
          refresh.disabled=true;status.textContent=L('正在读取工作目录…');
          try{
            const state=await api('/api/project-settings/workspaces');list.replaceChildren();
            for(const workspace of state.workspaces){
              const row=document.createElement('div');row.className='settings-setting-row';
              const copy=document.createElement('span');copy.className='setting-copy';
              const title=document.createElement('strong');title.textContent=workspace.display_name;
              const path=document.createElement('span');path.textContent=workspace.canonical_path;path.style.overflowWrap='anywhere';copy.append(title,path);
              const button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--secondary';
              const selected=state.selected===workspace.workspace_id;button.textContent=selected?L('当前浏览目录'):workspace.realpath_verified?L('用于浏览'):L('目录不可用');
              button.disabled=selected || !workspace.realpath_verified;button.setAttribute('aria-pressed',String(selected));button.dataset.browseWorkspace=workspace.workspace_id;
              button.addEventListener('click',async()=>{if(busy)return;busy=true;button.disabled=true;try{await api('/api/project-settings/workspaces',{workspace_id:workspace.workspace_id});await load();}catch(error){molisWorkRequest.show(status,error);button.disabled=false;}finally{busy=false;}});
              row.append(copy,button);list.append(row);
            }
            status.textContent=state.workspaces.length?(state.selected?'':L('请选择一个目录供 Files 和 Git 浏览。')):L('还没有关联目录，请在下方添加。');
            void checkers.load?.(state.workspaces);
          }catch(error){list.replaceChildren();molisWorkRequest.show(status,error);}finally{refresh.disabled=false;}
        };
        refresh.addEventListener('click',()=>void load());
        pick.addEventListener('click',async()=>{pick.disabled=true;try{const result=await api('/api/workspaces/pick',{});if(!result.cancelled)form.elements.path.value=result.path;}catch(error){molisWorkRequest.show(message,error);}finally{pick.disabled=false;}});
        form.addEventListener('submit',async(event)=>{
          event.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;message.textContent=L('正在关联目录…');
          try{await api('/api/workspaces',{workspace_path:form.elements.path.value.trim(),user_confirmed:true});form.reset();message.textContent=L('目录已关联。可在上方选择用于浏览。');await load();}
          catch(error){molisWorkRequest.show(message,error);}finally{busy=false;submit.disabled=false;}
        });
        void load();
      });
    };
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
              body: { display_name: String(new FormData(form).get("display_name") || "").trim(), expected_display_name: form.dataset.projectObservedName }, fallback: L("项目改名失败"),
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
      const show=state=>{
        const gone=state.selected&&!state.runtimes.some(item=>item.runtime_id===state.selected);
        root.hidden=state.runtimes.length<2&&!state.problem;
        select.replaceChildren(new Option(L('默认运行时'),''),...state.runtimes.map(item=>new Option(item.display_name,item.runtime_id)),...(gone?[new Option(state.selected+L('（不可用）'),state.selected)]:[]));
        select.value=state.selected||'';error.textContent=state.problem||'';error.hidden=!state.problem;
      };
      select.addEventListener('change',()=>molisWorkRequest(path,{body:{runtime_id:select.value||null},fallback:L('运行时选择失败')}).then(show,caught=>{molisWorkRequest.show(error,caught);error.hidden=false;}));
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
        const plainDescription = description.textContent;
        // The default output directory's question (A3): its two option cards are the confirmation, so the checkbox goes while it shows.
        const question = dialog.querySelector("[data-project-delete-output]");
        const options = [...question.querySelectorAll("[data-ix-option]")];
        const busyNotice = dialog.querySelector("[data-project-delete-busy]");
        const title = dialog.querySelector("header h2");
        const plainTitle = title.textContent;
        const formBody = dialog.querySelector(".runtime-plan-body:not([data-project-delete-kept])");
        const kept = dialog.querySelector("[data-project-delete-kept]");
        const actions = dialog.querySelector("[data-project-delete-actions]");
        const done = dialog.querySelector("[data-project-delete-done]");
        let busy = false;
        let cleanupPending = false;
        let deletionKey = null;
        let asks = false;
        let choice = null;
        const ready = () => !busy && (cleanupPending || (asks ? choice !== null : confirmation.checked));
        const label = () => cleanupPending ? L("重试清理") : asks && choice === "delete" ? L("删除项目和文件") : asks && choice === "keep" ? L("删除项目") : L("确认删除项目");
        const paint = () => {
          question.hidden = !asks;
          confirmRow.hidden = asks;
          description.textContent = asks ? L("永久删除这个项目在 Molis Work 中的目标、记录和关联。你自己选的文件夹里的代码和文件会保留。") : plainDescription;
          options.forEach((option) => {
            const on = option.dataset.ixOption === choice;
            option.setAttribute("aria-checked", on ? "true" : "false");
            option.tabIndex = on || (choice === null && option === options[0]) ? 0 : -1;
            // Once the deletion started the choice is fixed (another choice under the same key is refused), so the cards stop moving.
            option.disabled = busy || cleanupPending;
          });
          confirmation.disabled = busy || cleanupPending;
          submit.disabled = !ready();
          if (!busy) submit.textContent = label();
        };
        const choose = (value, focus) => {
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
        dialog.querySelector("[data-project-delete-keep-instead]").addEventListener("click", () => choose("keep", true));
        const loadScope = () => molisWorkRequest("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete-scope")
          .then((result) => {
            names.textContent = result.owners.map((owner) => owner.label).join("；");
            // Asked once per deletion: a retry keeps the shape the deletion started with.
            if (!deletionKey) { asks = result.default_output === "has_files"; paint(); }
          }).catch(() => null);
        const showKept = (path) => {
          title.textContent = L("项目已删除");
          formBody.hidden = actions.hidden = true;
          kept.hidden = done.hidden = false;
          kept.querySelector("[data-project-delete-kept-path]").textContent = path;
          const note = kept.querySelector("[data-project-delete-kept-note]");
          if (!asks) note.textContent = L("里面有文件，删除时没有动它们。") + note.textContent;
          busy = true;
          requestAnimationFrame(() => done.querySelector("a")?.focus({ preventScroll: true }));
        };
        kept.querySelector("[data-project-delete-copy]").addEventListener("click", async (event) => {
          const path = kept.querySelector("[data-project-delete-kept-path]").textContent;
          const button = event.currentTarget;
          if (window.molisCopy) { await window.molisCopy(button, () => path, { done: L("已复制"), failed: L("没能复制") }); return; }
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
            title.textContent = plainTitle;
            paint();
          }
          dialog.showModal();
          loadScope();
        });
        cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", (event) => { if (busy && kept.hidden) event.preventDefault(); });
        confirmation.addEventListener("change", paint);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!ready()) return;
          deletionKey ||= crypto.randomUUID();
          busy = true;
          cancel.disabled = true;
          error.hidden = true;
          paint();
          submit.textContent = L("正在删除…");
          try {
            const result = await molisWorkRequest("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete", {
              body: { delete_confirmed: true, idempotency_key: deletionKey, ...(asks && choice ? { output_files: choice } : {}) }, fallback: L("项目删除失败"),
            });
            cleanupPending = result.deletion.cleanup_state !== "complete";
            if (cleanupPending) throw new Error(L("项目已从目录移除，但本机数据清理未完成。请重试清理。"));
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
              const shown = !busyNotice.hidden;
              busyNotice.hidden = false;
              // First time it rises in; pressed again while it shows, it hops once instead of appearing again.
              busyNotice.classList.remove("is-nudged", "mw-alert--rise");
              void busyNotice.offsetWidth;
              busyNotice.classList.add(shown ? "is-nudged" : "mw-alert--rise");
              busyNotice.scrollIntoView({ block: "nearest" });
            } else {
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
            ? L("创建一份明确标记为可重建数据的示例项目？")
            : action === "reset"
              ? L("重建 demo 会清除其中的所有改动，但不会影响用户项目。确认继续？")
              : L("删除这个可重建 demo？用户项目不会被删除。");
          if (!window.confirm(message)) return;
          disable(true);
          if (error) error.hidden = true;
          try {
            const result = await molisWorkRequest("/api/settings/demo", { body: { action, user_confirmed: true }, fallback: L("demo 操作失败") });
            const message = result.message || L("demo 已更新");
            if (result.warning && error) {
              error.textContent = message + ' ' + result.warning + ' ';
              const refresh = document.createElement('a');refresh.href = location.href;refresh.textContent = L('刷新');
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
          const raw = decodeURIComponent(String(hash || "").replace(/^#/, ""));
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
          error.textContent = L("请先确认创建这个项目。");
          error.hidden = false;
          return;
        }
        const submit = createForm.querySelector("button[type=submit]");
        submit.disabled = true;
        error.hidden = true;
        try {
          const result = await molisWorkRequest("/api/settings/projects", { body: { display_name: String(values.get("display_name") || "").trim(), user_confirmed: true }, fallback: L("项目创建失败") });
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
      globalThis.molisWorkBindProjectRules?.(root);
      globalThis.molisWorkBindPlanningSettings?.(root);
      globalThis.molisWorkBindPlanningAdoption?.(root);
    };
    const resetEmbed = (details) => {
      const target = details.querySelector("[data-settings-embed-target]");
      if (!target || !details.dataset.settingsEmbed) return;
      details.open = false;
      target.replaceChildren();
      delete details.dataset.loaded;
    };
    globalThis.molisWorkResetProjectSettingsEmbeds = (root) => {
      root?.querySelectorAll?.("[data-settings-embed][data-loaded]").forEach(resetEmbed);
    };
    const loadEmbed = async (details) => {
      if (!details.open || details.dataset.loaded === "1" || !details.dataset.settingsEmbed) return;
      const target = details.querySelector("[data-settings-embed-target]");
      if (!target) return;
      details.dataset.loaded = "pending";
      target.innerHTML = "<p class=\\"project-settings-embed-pending\\">" + L("正在打开…") + "</p>";
      try {
        target.innerHTML = await molisWorkRequest(details.dataset.settingsEmbed, { as: "text", headers: { Accept: "text/html" } });
        details.dataset.loaded = "1";
        bindEmbedded(details);
      } catch {
        delete details.dataset.loaded;
        target.innerHTML = "<p class=\\"settings-form-error\\" role=\\"alert\\">" + L("无法打开这一段设置") + "</p>";
      }
    };
    document.querySelectorAll("[data-settings-embed]").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (details.open) loadEmbed(details);
      });
      if (details.open) loadEmbed(details);
    });
  })();
`;
