import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * The bundle's entry (dist/settings-update-client.js): 设置 › 更新 (U3 §5.4). The confirm dialog asks the desktop to go back
 * (`rollback_to_previous`, granted only to this page in the main window); while it runs the page says so, and when it is done the page
 * reloads from whichever program is serving then. A refusal comes back into the dialog. 「重新装上」 lifts the hold through the Host.
 */
interface TauriBridge { core: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> } }
const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest; __TAURI__?: TauriBridge };
const root = document.querySelector<HTMLElement>("[data-update-settings]");

if (root) {
  const dialog = root.querySelector<HTMLDialogElement>("[data-rollback-dialog]");
  const error = root.querySelector<HTMLElement>("[data-rollback-error]"), progress = root.querySelector<HTMLElement>("[data-rollback-progress]");
  const confirm = root.querySelector<HTMLButtonElement>("[data-rollback-confirm]"), save = root.querySelector<HTMLInputElement>("[data-rollback-save]");
  root.querySelector("[data-rollback-open]")?.addEventListener("click", () => dialog?.showModal());
  confirm?.addEventListener("click", async () => {
    if (!dialog || !error || !progress || !page.__TAURI__) return;
    confirm.disabled = true; error.hidden = true; dialog.close(); progress.hidden = false;
    try {
      await page.__TAURI__.core.invoke("rollback_to_previous", { saveCurrent: save?.checked ?? true });
      location.reload();
    } catch (failure) {
      progress.hidden = true; confirm.disabled = false;
      error.textContent = String(failure); error.hidden = false; dialog.showModal();
    }
  });
  const lift = root.querySelector<HTMLButtonElement>("[data-rollback-lift]");
  lift?.addEventListener("click", async () => {
    lift.disabled = true;
    try { await page.molisWorkRequest("/api/update/hold/lift", { method: "POST", body: {} }); location.reload(); }
    catch { lift.disabled = false; /* The request client has shown why on the page; the button is there to try again. */ }
  });
}
