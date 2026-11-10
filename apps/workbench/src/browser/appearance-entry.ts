import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiAppearanceReceipt, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance } from "../appearance-document.js";
import { mountAppearancePicker } from "./appearance-picker.js";
import { createAppearanceSync } from "./appearance-sync.js";
import { mountDiscussionAppearance } from "./discussion-appearance.js";
import { mountDocumentAppearance, readDocumentAppearance } from "./appearance-view.js";

declare global {
  var molisWorkLookFade: (commit: () => void) => boolean;
  var molisWorkRestoreAppearance: (() => void) | undefined;
}

function mount(initial: WorkbenchAppearance): void {
  const readText = globalThis.t.text;
  const notice = document.querySelector<HTMLElement>("[data-appearance-notice]")!;
  const message = notice.querySelector("[data-appearance-message]")!;
  const undo = notice.querySelector<HTMLButtonElement>("[data-appearance-undo]")!, reread = notice.querySelector<HTMLButtonElement>("[data-appearance-read]")!;
  const resume = notice.querySelector<HTMLButtonElement>("[data-appearance-continue]")!;
  const recovery = document.querySelector<HTMLDialogElement>("[data-appearance-recovery]")!;
  const recoveryButton = recovery.querySelector<HTMLButtonElement>("[data-appearance-recover]")!;
  const recoveryStatus = recovery.querySelector<HTMLElement>("[data-appearance-recovery-status]")!;
  const settings = document.querySelector<HTMLElement>("[data-appearance-settings]");
  let current = initial;
  let picker: ReturnType<typeof mountAppearancePicker> | undefined;
  let receipt: UiAppearanceReceipt | undefined, feedback = "", readError = "", renderError = "";
  let discussionFailed = false;
  let recovering = false, recoveryWrite = false, recoveryRevision = initial.selection_revision;
  const unconfirmedText = () => uiText.text("workbench.appearance-entry.change-unconfirmed-check-again");

  function drawNotice(): void {
    const pending = sync.uncertain && !sync.submitting;
    message.textContent = renderError || readError || (pending ? unconfirmedText() : discussionFailed
      ? uiText.text("common.appearance.window-couldnt-load-new-appearance-keeping-current-look") : feedback);
    notice.hidden = !message.textContent;
    notice.classList.toggle("is-visible", !notice.hidden);
    undo.hidden = !sync.available || sync.uncertain || !receipt || current.selection_revision !== receipt.selection_revision;
    reread.hidden = !discussionFailed && (!sync.available || !(renderError || readError || pending));
    resume.hidden = !sync.canContinue;
  }

  function updateRecovery(text = ""): void {
    recoveryStatus.textContent = text;
    recoveryStatus.hidden = !text;
    const resuming = recovering && sync.canContinue;
    recoveryButton.disabled = !sync.available || recoveryWrite || recoveryRevision === null || (sync.uncertain && !resuming);
    recoveryButton.querySelector("[data-slot=button-label]")!.textContent = uiText.text(resuming ? "workbench.appearance-entry.continue-change" : "workbench.appearance-entry.restore-built-appearance");
    recovery.querySelector<HTMLElement>("[data-appearance-check]")!.hidden = !sync.available || !sync.uncertain;
  }

  const sync = createAppearanceSync(initial, globalThis.molisWorkRequest, {
    present(next) {
      current = next;
      readError = "";
      picker?.present(next);
      page.present(next);
      if (recovery.open && recoveryRevision !== next.selection_revision) {
        recoveryRevision = next.selection_revision;
        updateRecovery(recoveryRevision === null ? uiText.text("workbench.appearance-entry.current-appearance-settings-cant-be-read-changes-cant") : uiText.text("workbench.appearance-entry.another-window-updated-appearance-confirm-again"));
      }
      drawNotice();
    },
    failed(error) {
      const status = (error as Partial<UiRequestFailure> | null)?.status;
      readError = status === 401 || status === 403 ? uiText.text("workbench.appearance-entry.pages-session-has-ended") : uiText.text("workbench.appearance-entry.appearance-couldnt-be-read-try-again");
      if (!sync.available && recovery.open) updateRecovery(readError);
      picker?.redraw();
      drawNotice();
    },
    confirmed(result, kind) {
      receipt = kind === "apply" ? result : undefined;
      feedback = uiText.text(kind === "apply" ? "workbench.appearance-entry.appearance-saved" : "workbench.appearance-entry.appearance-change-undone");
      if (recovering && kind === "apply") {
        recovering = false;
        recovery.close();
      } else if (kind === "apply") picker?.confirmed(result);
      drawNotice();
    },
    absent() {
      recovering = false;
      feedback = uiText.text("workbench.appearance-entry.last-appearance-change-wasnt-saved");
      if (recovery.open) updateRecovery(feedback);
      drawNotice();
    },
    changed() {
      picker?.redraw();
      if (recovery.open) updateRecovery(recovering && sync.uncertain && !recoveryWrite ? unconfirmedText() : recoveryStatus.textContent ?? "");
      drawNotice();
    },
  });
  if (settings) picker = mountAppearancePicker(settings, initial, sync, readText);
  const page = mountDocumentAppearance(initial, problem => {
    renderError = problem === "partial" ? uiText.text("workbench.appearance-entry.some-appearance-settings-unavailable-showing-available-combinati")
      : problem === "loading-failed" ? uiText.text("workbench.appearance-entry.window-couldnt-load-new-appearance-keeping-current-look") : "";
    drawNotice();
  });
  const discussion = mountDiscussionAppearance(failed => { discussionFailed = failed; drawNotice(); });
  const open = () => {
    if (recovery.open || document.body.inert) return;
    recoveryRevision = current.selection_revision;
    updateRecovery(sync.uncertain ? unconfirmedText() : recoveryRevision === null ? uiText.text("workbench.appearance-entry.current-appearance-settings-cant-be-read-changes-cant") : "");
    recovery.showModal();
  };
  globalThis.molisWorkRestoreAppearance = open;

  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("[data-appearance-restore]")) open();
  });
  recovery.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("[data-dialog-close]") && !recoveryWrite) recovery.close();
  });
  recovery.addEventListener("cancel", event => { if (recoveryWrite) event.preventDefault(); });
  recoveryButton.addEventListener("click", () => {
    if (recoveryRevision === null || recoveryWrite) return;
    recovering = true; recoveryWrite = true;
    updateRecovery(uiText.text("workbench.appearance-entry.saving-appearance"));
    const save = sync.uncertain ? sync.continue() : sync.apply({ kind: "restore" }, recoveryRevision);
    void save.then(result => {
      if (!result && sync.uncertain) updateRecovery(unconfirmedText());
    }, () => {
      recovering = false;
      updateRecovery(uiText.text("workbench.appearance-entry.appearance-wasnt-saved-can-try-again"));
    }).finally(() => {
      recoveryWrite = false;
      if (!sync.uncertain) recovering = false;
      updateRecovery(recoveryStatus.textContent ?? "");
    });
  });
  undo.addEventListener("click", () => {
    if (!receipt) return;
    undo.disabled = true;
    void sync.undo(receipt).catch(() => { feedback = uiText.text("workbench.appearance-entry.appearance-has-changed-since-then-change-can-no"); drawNotice(); }).finally(() => { undo.disabled = false; });
  });
  reread.addEventListener("click", () => {
    if (discussionFailed && !renderError && !readError && !sync.uncertain) discussion.retry();
    else sync.retry();
  });
  resume.addEventListener("click", () => { void sync.continue().catch(() => { /* The common operation feedback owns the message. */ }); });
  recovery.querySelector("[data-appearance-check]")?.addEventListener("click", sync.retry);
  notice.querySelector("[data-appearance-dismiss]")?.addEventListener("click", () => {
    readError = ""; feedback = ""; discussionFailed = false; page.dismissProblem();
  });
  drawNotice();
}

const initial = readDocumentAppearance();
if (initial && document.querySelector("[data-appearance-notice]")) mount(initial);
