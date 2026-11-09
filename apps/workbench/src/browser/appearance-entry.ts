import type { UiAppearanceReceipt, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance } from "../appearance-document.js";
import { mountAppearancePicker } from "./appearance-picker.js";
import { createAppearanceSync } from "./appearance-sync.js";
import { announceAppearance, prepareAppearance, readDocumentAppearance, setAppearanceScope, withDocumentDevice } from "./appearance-view.js";

declare global {
  var molisWorkLookFade: (commit: () => void) => boolean;
  var molisWorkRestoreAppearance: (() => void) | undefined;
}

function mount(initial: WorkbenchAppearance): void {
  const L = globalThis.L ?? ((text: string) => text);
  const data = document.getElementById("ui-environment")!;
  const notice = document.querySelector<HTMLElement>("[data-appearance-notice]")!;
  const message = notice.querySelector("[data-appearance-message]")!;
  const undo = notice.querySelector<HTMLButtonElement>("[data-appearance-undo]")!, reread = notice.querySelector<HTMLButtonElement>("[data-appearance-read]")!;
  const resume = notice.querySelector<HTMLButtonElement>("[data-appearance-continue]")!;
  const recovery = document.querySelector<HTMLDialogElement>("[data-appearance-recovery]")!;
  const recoveryButton = recovery.querySelector<HTMLButtonElement>("[data-appearance-recover]")!;
  const recoveryStatus = recovery.querySelector<HTMLElement>("[data-appearance-recovery-status]")!;
  const settings = document.querySelector<HTMLElement>("[data-appearance-settings]");
  let current = initial, rendered = { ...initial, snapshot: withDocumentDevice(initial.snapshot) }, generation = 0;
  data.textContent = JSON.stringify(rendered.snapshot);
  const deviceChanged = () => {
    rendered = { ...rendered, snapshot: withDocumentDevice(rendered.snapshot) };
    data.textContent = JSON.stringify(rendered.snapshot);
  };
  new MutationObserver(deviceChanged).observe(document.documentElement, { attributes: true,
    attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-terminal-theme", "data-resolved-terminal-theme"] });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", deviceChanged);
  let picker: ReturnType<typeof mountAppearancePicker> | undefined;
  let receipt: UiAppearanceReceipt | undefined, feedback = "", readError = "", renderError = "";
  let recovering = false, recoveryWrite = false, recoveryRevision = initial.selection_revision;
  const unconfirmedText = () => L("还无法确认外观是否已保存，请再查一次。");

  function drawNotice(): void {
    const pending = sync.uncertain && !sync.submitting;
    message.textContent = renderError || readError || (pending ? unconfirmedText() : feedback);
    notice.hidden = !message.textContent;
    notice.classList.toggle("is-visible", !notice.hidden);
    undo.hidden = !sync.available || sync.uncertain || !receipt || current.selection_revision !== receipt.selection_revision;
    reread.hidden = !sync.available || !(renderError || readError || pending);
    resume.hidden = !sync.canContinue;
  }

  function display(next: WorkbenchAppearance): void {
    const turn = ++generation;
    const commit = () => {
      if (turn !== generation) return;
      const snapshot = withDocumentDevice(next.snapshot);
      setAppearanceScope(document.documentElement, snapshot);
      data.textContent = JSON.stringify(snapshot);
      data.dataset.stylesheet = next.stylesheet ?? "";
      data.dataset.selection = JSON.stringify(next.selection);
      data.dataset.selectionRevision = String(next.selection_revision ?? "");
      const previous = rendered.snapshot;
      rendered = { ...next, snapshot };
      announceAppearance(snapshot, previous);
      renderError = next.snapshot.problems.length ? L("部分外观设置不可用，已使用可用的组合。") : "";
      drawNotice();
    };
    if (rendered.snapshot.revision === next.snapshot.revision && !renderError) { commit(); return; }
    void prepareAppearance(next).then(() => {
      if (turn !== generation) return;
      globalThis.molisWorkLookFade(commit);
    }, () => {
      if (turn !== generation) return;
      renderError = L("此窗口未能加载新外观，保留了可用的样式。");
      drawNotice();
    });
  }

  function updateRecovery(text = ""): void {
    recoveryStatus.textContent = text;
    recoveryStatus.hidden = !text;
    const resuming = recovering && sync.canContinue;
    recoveryButton.disabled = !sync.available || recoveryWrite || recoveryRevision === null || (sync.uncertain && !resuming);
    recoveryButton.querySelector("[data-slot=button-label]")!.textContent = L(resuming ? "继续这次操作" : "恢复内置外观");
    recovery.querySelector<HTMLElement>("[data-appearance-check]")!.hidden = !sync.available || !sync.uncertain;
  }

  const sync = createAppearanceSync(initial, globalThis.molisWorkRequest, {
    present(next) {
      current = next;
      readError = "";
      picker?.present(next);
      display(next);
      if (recovery.open && recoveryRevision !== next.selection_revision) {
        recoveryRevision = next.selection_revision;
        updateRecovery(recoveryRevision === null ? L("当前外观设置无法读取，暂时无法保存。") : L("另一个窗口已更新外观，请重新确认。"));
      }
      drawNotice();
    },
    failed(error) {
      const status = (error as Partial<UiRequestFailure> | null)?.status;
      readError = status === 401 || status === 403 ? L("此页面的会话已结束。") : L("暂时无法读取外观，请再试一次。");
      if (!sync.available && recovery.open) updateRecovery(readError);
      picker?.redraw();
      drawNotice();
    },
    confirmed(result, kind) {
      receipt = kind === "apply" ? result : undefined;
      feedback = L(kind === "apply" ? "外观已保存" : "已撤销外观变更");
      if (recovering && kind === "apply") {
        recovering = false;
        recovery.close();
      } else if (kind === "apply") picker?.confirmed(result);
      drawNotice();
    },
    absent() {
      recovering = false;
      feedback = L("上次外观变更未保存。");
      if (recovery.open) updateRecovery(feedback);
      drawNotice();
    },
    changed() {
      picker?.redraw();
      if (recovery.open) updateRecovery(recovering && sync.uncertain && !recoveryWrite ? unconfirmedText() : recoveryStatus.textContent ?? "");
      drawNotice();
    },
  });
  if (settings) picker = mountAppearancePicker(settings, initial, sync, L);
  const open = () => {
    if (recovery.open || document.body.inert) return;
    recoveryRevision = current.selection_revision;
    updateRecovery(sync.uncertain ? unconfirmedText() : recoveryRevision === null ? L("当前外观设置无法读取，暂时无法保存。") : "");
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
    updateRecovery(L("正在保存外观…"));
    const save = sync.uncertain ? sync.continue() : sync.apply({ kind: "restore" }, recoveryRevision);
    void save.then(result => {
      if (!result && sync.uncertain) updateRecovery(unconfirmedText());
    }, () => {
      recovering = false;
      updateRecovery(L("外观未保存，可以再试一次。"));
    }).finally(() => {
      recoveryWrite = false;
      if (!sync.uncertain) recovering = false;
      updateRecovery(recoveryStatus.textContent ?? "");
    });
  });
  undo.addEventListener("click", () => {
    if (!receipt) return;
    undo.disabled = true;
    void sync.undo(receipt).catch(() => { feedback = L("外观已更新，无法撤销这次变更。"); drawNotice(); }).finally(() => { undo.disabled = false; });
  });
  reread.addEventListener("click", sync.retry);
  resume.addEventListener("click", () => { void sync.continue().catch(() => { /* The common operation feedback owns the message. */ }); });
  recovery.querySelector("[data-appearance-check]")?.addEventListener("click", sync.retry);
  notice.querySelector("[data-appearance-dismiss]")?.addEventListener("click", () => {
    readError = ""; renderError = ""; feedback = ""; drawNotice();
  });
  if (initial.stylesheet) {
    const turn = generation;
    void prepareAppearance(initial).catch(() => {
      if (turn !== generation) return;
      renderError = L("此窗口未能加载新外观，保留了可用的样式。");
      drawNotice();
    });
  }
  if (initial.snapshot.problems.length) renderError = L("部分外观设置不可用，已使用可用的组合。");
  drawNotice();
}

const initial = readDocumentAppearance();
if (initial && document.querySelector("[data-appearance-notice]")) mount(initial);
