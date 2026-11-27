import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OverviewReadResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Cross-project data stays in the trusted shell. Opening a result goes to its owner's ordinary item page. */
export function bindPersonalTasks(root: HTMLElement): () => void {
  const panel = root.querySelector<HTMLDetailsElement>("[data-personal-tasks]");
  const body = panel?.querySelector<HTMLElement>("[data-personal-tasks-body]");
  if (!panel || !body) return () => {};
  const { taskMember, taskOwner, taskRoute } = panel.dataset;
  if (!taskMember || !taskOwner || !taskRoute) return () => {};
  const personal = PERSONAL_SPACE_PROJECT_ID, prefix = "/projects/" + encodeURIComponent(personal);
  let read: AbortController | undefined;
  const request = globalThis.molisWorkRequest;
  type Place = { project_id: string; display_name: string; plugins: string[]; revision: string };
  const button = (label: string) => {
    const control = document.createElement("button");
    control.type = "button"; control.className = "mw-btn mw-btn--secondary"; control.textContent = label;
    return control;
  };
  const draw = async () => {
    read?.abort(); body.replaceChildren();
    if (!panel.open) return;
    const { signal } = read = new AbortController();
    try {
      const { projects } = await request<{ projects: Place[] }>("/api/settings/project-plugins", { signal });
      signal.throwIfAborted();
      if (panel.dataset.personalTasks === "overview") {
        const result = await request<OverviewReadResult>("/api/runtime/overview/read", { method: "POST", body: { kinds: ["task"], limit: 2000 }, signal });
        signal.throwIfAborted();
        const names = new Map(projects.map(place => [place.project_id, place.display_name]));
        const list = document.createElement("ul");
        for (const row of result.rows) {
          if (row.plugin_id !== taskOwner || typeof row.fields.title !== "string" || !names.has(row.partition_id)) continue;
          const link = document.createElement("a"), li = document.createElement("li");
          const url = new URL("/projects/" + encodeURIComponent(row.partition_id) + "/", location.origin);
          url.searchParams.set("openPlugin", taskMember); url.searchParams.set("openItem", row.row_id);
          const desktop = new URLSearchParams(location.search).get("desktop");
          if (desktop) url.searchParams.set("desktop", desktop);
          link.href = url.pathname + url.search; link.textContent = names.get(row.partition_id) + " · " + row.fields.title;
          li.append(link); list.append(li);
        }
        if (list.childElementCount) body.append(list);
        else body.textContent = t.text("workbench.personal-tasks.empty");
        return;
      }
      const place = projects.find(row => row.project_id === personal);
      if (!place) return;
      if (!place.plugins.includes(taskMember)) {
        const prompt = document.createElement("p");
        prompt.textContent = t.text("workbench.side-view.enable-personal", { name: t.text("workbench.personal-tasks.name") });
        const enable = button(t.text("workbench.side-view.enable-confirm"));
        enable.onclick = async () => {
          enable.disabled = true;
          try {
            await request("/api/settings/projects/" + encodeURIComponent(personal) + "/plugins", { method: "POST", body: { plugin_id: taskMember, expected_revision: place.revision }, signal });
            if (!signal.aborted) await draw();
          } catch (error) { if (!signal.aborted) { enable.disabled = false; request.show(body, error); } }
        };
        const cancel = button(t.text("common.control.cancel"));
        cancel.onclick = () => { panel.open = false; };
        body.append(prompt, enable, cancel); return;
      }
      const form = document.createElement("form"), label = document.createElement("label"), input = document.createElement("input");
      label.textContent = t.text("workbench.personal-tasks.prompt");
      input.className = "mw-input"; input.required = true; label.append(input);
      const save = button(t.text("workbench.personal-tasks.save")); save.type = "submit";
      form.append(label, save); body.append(form);
      form.onsubmit = async event => {
        event.preventDefault(); if (save.disabled || !input.value.trim()) return;
        save.disabled = true;
        try {
          await request(prefix + "/api/plugins/" + encodeURIComponent(taskOwner) + taskRoute, { method: "POST", body: { title: input.value.trim() }, signal });
          if (!signal.aborted) body.textContent = t.text("workbench.personal-tasks.saved");
        } catch (error) { if (!signal.aborted) { save.disabled = false; request.show(body, error); } }
      };
    } catch (error) { if (!signal.aborted) request.show(body, error); }
  };
  panel.addEventListener("toggle", draw);
  if (panel.open) void draw();
  document.addEventListener("molis-work:language-changed", draw);
  return () => { read?.abort(); panel.removeEventListener("toggle", draw); document.removeEventListener("molis-work:language-changed", draw); };
}
