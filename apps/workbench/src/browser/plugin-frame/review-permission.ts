import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentDelegationMode, AgentExactDelegationScope } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { FrameScope } from "./types.js";

type PermissionPreview = { title: string; scope: AgentExactDelegationScope; automatic: boolean; scope_version: string;
  storage_version: number; selection: { mode: AgentDelegationMode; revoked_at: string | null } | null };

/** The outer shell holds this dialog. The framed plugin never receives its data or controls. */
export async function openReviewPermission(trigger: HTMLElement, id: string, version: string, scope: FrameScope,
  route: (path: string) => string, headers: () => Record<string, string>): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("[data-review-permission-dialog]");
  if (!dialog || dialog.open) return false;
  const form = dialog.querySelector("form")!, save = form.querySelector<HTMLButtonElement>("[data-permission-save]")!;
  const status = form.querySelector<HTMLElement>("[data-permission-status]")!, error = form.querySelector<HTMLElement>("[data-permission-error]")!;
  const text = (key: string, args?: Record<string, string>) => uiText.text("workbench.authorization." + key, args);
  const set = (key: string, value: string) => { form.querySelector<HTMLElement>("[data-permission-" + key + "]")!.textContent = value; };
  const endpoint = route("/api/agent/reviews/permission"), controller = new AbortController();
  const close = () => dialog.close();
  let finish!: (value: boolean) => void;
  const result = new Promise<boolean>(resolve => { finish = resolve; });
  let changed = false, generation = 0, preview: PermissionPreview | undefined;
  const field = (name: string) => String(new FormData(form).get(name));
  const mode = () => field("mode"), lifetime = () => field("lifetime");
  const automatic = form.querySelector<HTMLInputElement>("[name=mode][value=automatic]")!;
  const confirm = form.querySelector<HTMLInputElement>("[name=mode][value=confirm]")!;
  const render = () => {
    if (!preview) return;
    const selection = preview.selection;
    automatic.disabled = !preview.automatic;
    if (automatic.disabled && automatic.checked) confirm.checked = true;
    set("work", preview.title);
    set("mode-note", text(mode() + "-note"));
    set("lifetime-note", text(lifetime() === "work" ? "session-end" : "ongoing-end"));
    const detail = mode() === "automatic" ? JSON.stringify(JSON.parse(preview.scope.input_json), null, 2) : text(mode() + "-scope");
    const target = preview.scope.kind === "command-exact" ? preview.scope.workspace_path : preview.scope.kind === "mcp-exact" ? preview.scope.tool : "";
    set("scope", [mode() === "automatic" && target, detail, selection && !selection.revoked_at && text("replace", { mode: text(selection.mode) })].filter(Boolean).join("\n\n"));
    status.textContent = text("session-next-round");
  };
  const problem = (failure: unknown) => {
    if (!controller.signal.aborted) { status.textContent = ""; error.hidden = false; molisWorkRequest.show(error, failure); }
  };
  const load = async () => {
    const mine = ++generation;
    save.disabled = true; error.hidden = true; status.textContent = text("loading");
    try {
      const params = new URLSearchParams({ review_id: id, version, lifetime: lifetime() });
      const value = await molisWorkRequest<PermissionPreview>(endpoint + "?" + params, { headers: headers(), scope, signal: controller.signal });
      scope.assertCurrent(controller.signal);
      if (mine === generation) { preview = value; render(); save.disabled = false; }
    } catch (failure) { if (mine === generation) problem(failure); }
  };
  const onChange = (event: Event) => { if ((event.target as HTMLInputElement).name === "lifetime") void load(); else render(); };
  const submit = async (event: Event) => {
    event.preventDefault();
    if (save.disabled || !preview) return;
    save.disabled = true; error.hidden = true; status.textContent = text("saving");
    const body = { review_id: id, version, lifetime: lifetime(), mode: mode(), expected_version: preview.storage_version, scope_version: preview.scope_version };
    try {
      await molisWorkRequest(endpoint, { body, headers: headers(), scope, signal: controller.signal });
      scope.assertCurrent(controller.signal);
      changed = true; status.textContent = text("saved");
      window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
    } catch (failure) {
      if (controller.signal.aborted) return;
      if ((failure as { status?: number }).status === 409) await load(); else save.disabled = false;
      problem(failure);
    }
  };
  const controls = [...dialog.querySelectorAll("[data-dialog-close]")];
  const end = () => {
    controller.abort(); scope.signal.removeEventListener("abort", close);
    form.removeEventListener("change", onChange); form.removeEventListener("submit", submit);
    for (const control of controls) control.removeEventListener("click", close);
    if (trigger.isConnected) trigger.focus();
    finish(changed);
  };
  form.reset(); preview = undefined; set("work", ""); set("scope", ""); set("mode-note", ""); set("lifetime-note", "");
  form.addEventListener("change", onChange); form.addEventListener("submit", submit);
  for (const control of controls) control.addEventListener("click", close);
  scope.signal.addEventListener("abort", close, { once: true });
  dialog.addEventListener("close", end, { once: true });
  dialog.showModal(); void load();
  return result;
}
