/** Project operations initialize independently of the Runtime settings dialog. */
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
        const prefix=root.dataset.workspacePrefix;
        let busy=false;
        const api=async(path,body)=>{
          const response=await fetch(prefix+path,body === undefined ? {} : {method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify(body)});
          const value=await response.json();if(!response.ok)throw new Error(value.error || L('工作目录操作失败'));return value;
        };
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
              button.addEventListener('click',async()=>{if(busy)return;busy=true;button.disabled=true;try{await api('/api/project-settings/workspaces',{workspace_id:workspace.workspace_id});await load();}catch(error){status.textContent=error.message;button.disabled=false;}finally{busy=false;}});
              row.append(copy,button);list.append(row);
            }
            status.textContent=state.workspaces.length?(state.selected?'':L('请选择一个目录供 Files 和 Git 浏览。')):L('还没有关联目录，请在下方添加。');
          }catch(error){list.replaceChildren();status.textContent=error.message;}finally{refresh.disabled=false;}
        };
        refresh.addEventListener('click',()=>void load());
        pick.addEventListener('click',async()=>{pick.disabled=true;try{const result=await api('/api/workspaces/pick',{});if(!result.cancelled)form.elements.path.value=result.path;}catch(error){message.textContent=error.message;}finally{pick.disabled=false;}});
        form.addEventListener('submit',async(event)=>{
          event.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;message.textContent=L('正在关联目录…');
          try{await api('/api/workspaces',{workspace_path:form.elements.path.value.trim(),user_confirmed:true});form.reset();message.textContent=L('目录已关联。可在上方选择用于浏览。');await load();}
          catch(error){message.textContent=error.message;}finally{busy=false;submit.disabled=false;}
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
            const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectRename) + "/rename", {
              method: "POST", headers: molisWorkControlHeaders(),
              body: JSON.stringify({ display_name: String(new FormData(form).get("display_name") || "").trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || L("项目改名失败"));
            location.reload();
          } catch (caught) {
            error.textContent = caught.message || L("项目改名失败");
            error.hidden = false;
            submit.disabled = false;
          }
        });
      });
    };
    const bindDelete = (scope) => {
      (scope || document).querySelectorAll("[data-project-delete-dialog]").forEach((dialog) => {
        if (dialog.dataset.bound === "1") return;
        dialog.dataset.bound = "1";
        const root = dialog.closest("[data-project-pane], .project-settings-hub, .project-settings-page") || scope || document;
        const form = dialog.querySelector("form");
        const confirmation = form.elements.delete_confirmed;
        const submit = form.querySelector("button[type=submit]");
        const error = dialog.querySelector("[data-project-delete-error]");
        const cancel = dialog.querySelector("[data-project-delete-cancel]");
        let busy = false;
        let cleanupPending = false;
        let deletionKey = null;
        root.querySelector("[data-project-delete-open]")?.addEventListener("click", () => {
          if (!deletionKey) {
            confirmation.checked = false;
            submit.disabled = true;
            error.hidden = true;
          }
          dialog.showModal();
        });
        cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
        dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
        confirmation.addEventListener("change", () => { submit.disabled = busy || !confirmation.checked; });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (busy || !confirmation.checked) return;
          const headers = molisWorkControlHeaders();
          deletionKey ||= headers["x-molis-work-idempotency-key"];
          busy = true;
          submit.disabled = cancel.disabled = confirmation.disabled = true;
          error.hidden = true;
          submit.textContent = L("正在删除…");
          try {
            const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete", {
              method: "POST", headers,
              body: JSON.stringify({ delete_confirmed: true, idempotency_key: deletionKey }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || L("项目删除失败"));
            cleanupPending = result.deletion.cleanup_state !== "complete";
            if (cleanupPending) throw new Error(L("项目已从目录移除，但本机数据清理未完成。请重试清理。"));
            location.assign(globalThis.molisWorkNavigationUrl(form.dataset.projectDirectoryHref));
          } catch (caught) {
            error.textContent = caught.message || L("项目删除失败");
            error.hidden = false;
            busy = false;
            cancel.disabled = confirmation.disabled = false;
            submit.disabled = !confirmation.checked;
            submit.textContent = cleanupPending ? L("重试清理") : L("确认删除项目");
          }
        });
      });
    };
    const bindDemo = (scope) => {
      (scope || document).querySelectorAll("[data-demo-action]").forEach((button) => {
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
          button.disabled = true;
          if (error) error.hidden = true;
          try {
            const response = await fetch("/api/settings/demo", { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify({ action, user_confirmed: true }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || L("demo 操作失败"));
            if (toast) {
              toast.textContent = result.message || L("demo 已更新");
              toast.classList.add("is-visible");
              setTimeout(() => toast.classList.remove("is-visible"), 2600);
            }
            setTimeout(() => location.reload(), 450);
          } catch (caught) {
            if (error) { error.textContent = caught.message || L("demo 操作失败"); error.hidden = false; }
            button.disabled = false;
          }
        });
      });
    };
    globalThis.molisWorkBindProjectIdentity = (scope) => {
      bindWorkspaces(scope);
      bindRename(scope);
      bindDelete(scope);
      bindDemo(scope);
    };
    globalThis.molisWorkBindProjectIdentity(document);
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
        const response = await fetch(details.dataset.settingsEmbed, { headers: { Accept: "text/html" } });
        if (!response.ok) throw new Error();
        target.innerHTML = await response.text();
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
