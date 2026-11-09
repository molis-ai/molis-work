import { escapeHtml as e, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceDisplayCorrection, SurfaceHomeDisplay } from "../surface-home-display.js";
import { surfaceCorrectionWord } from "./project-home-render.js";
import { restoreObject, restorePosition, type CorrectionControls, type CorrectionRender } from "./project-correction-render.js";

export function createPositionCorrections(root: HTMLElement, ports: {
  send(input: SurfaceDisplayCorrection, signal: AbortSignal): Promise<unknown>;
  changed(): void;
  note(message: string): void;
  translate(message: string): string;
  defaults?: boolean;
  headerOnly?: boolean;
}) {
  const doc = root.ownerDocument, controls: CorrectionControls = new Map();
  let recovery: SurfaceDisplayCorrection["subject"], position: SurfaceHomeDisplay["position"];
  let task: AbortController | undefined, prompt: HTMLDialogElement | undefined, valid = false;
  let focusAfter: { anchor: HTMLElement; selector: string } | undefined;
  const resetFocus = ".surface-correction-default summary";
  function dismiss() {
    prompt?.close(); prompt?.remove(); prompt = undefined;
  }
  function suspend() { valid = false; task?.abort(); task = undefined; dismiss(); }
  function clear() { suspend(); controls.clear(); recovery = position = focusAfter = undefined; }
  function rendering(data: SurfaceHomeDisplay): CorrectionRender {
    position = data.position; valid = true;
    return { controls, recovery: data.object_restore_available ? recovery : undefined, defaults: ports.defaults, headerOnly: ports.headerOnly };
  }
  function afterPaint() {
    const focus = focusAfter;
    if (!focus) return;
    const next = root.querySelector<HTMLElement>(focus.selector) ?? root.querySelector<HTMLElement>(resetFocus);
    if (!next && recovery) return; // A discussion batch may precede the exact recovery read.
    focusAfter = undefined;
    if (doc.activeElement === focus.anchor || doc.activeElement === doc.body) next?.focus({ preventScroll: true });
  }
  async function apply(input: SurfaceDisplayCorrection, anchor: HTMLElement, row: string | null) {
    if (!valid || task) return;
    const work = task = new AbortController();
    try {
      await ports.send(input, work.signal);
      if (work.signal.aborted || task !== work) return;
      if (input.correction === "remove" && position?.kind !== "home") recovery = input.subject;
      else if (input.correction === "reset") recovery = undefined;
      const selector = input.correction === "remove" && recovery ? '[data-presentation-action="' + restoreObject + '"]'
        : row ? '[data-home-row="' + CSS.escape(row) + '"] .mw-presentation__more summary' : resetFocus;
      focusAfter = { anchor, selector };
      ports.note(surfaceCorrectionWord("saved"));
    } catch {
      if (work.signal.aborted || task !== work) return;
      recovery = undefined;
      ports.note(surfaceCorrectionWord("failed"));
    } finally {
      if (task === work) {
        task = undefined; valid = false;
        ports.changed();
      }
    }
  }
  function confirm(input: SurfaceDisplayCorrection, anchor: HTMLElement) {
    dismiss();
    const dialog = prompt = doc.createElement("dialog");
    dialog.className = "mw-dialog home-peek";
    dialog.dataset.positionDialog = "";
    const label = surfaceCorrectionWord("confirm-reset");
    dialog.setAttribute("aria-label", label);
    dialog.innerHTML = '<div class="mw-dialog__shell"><h2>' + e(label) + '</h2><p>' + e(surfaceCorrectionWord("scope." + position?.kind)) + '</p>'
      + renderButton({ label: ports.translate("取消"), variant: "secondary", attrs: { "data-position-reset": "cancel" } })
      + renderButton({ label: ports.translate("确认"), variant: "primary", attrs: { "data-position-reset": "confirm" } }) + "</div>";
    (root.parentElement ?? doc.body).append(dialog);
    dialog.addEventListener("close", () => {
      dialog.remove(); if (prompt === dialog) prompt = undefined;
      if (valid && anchor.checkVisibility() && (doc.activeElement === doc.body || doc.activeElement === anchor)) anchor.focus({ preventScroll: true });
    });
    dialog.addEventListener("click", event => {
      const choice = (event.target as Element)?.closest<HTMLElement>("[data-position-reset]")?.dataset.positionReset;
      if (!event.isTrusted || !choice || prompt !== dialog) return;
      dismiss();
      if (choice === "confirm") void apply(input, anchor, null);
    });
    dialog.showModal();
    dialog.querySelector("button")?.focus({ preventScroll: true });
  }
  return { rendering, afterPaint, clear, suspend, recovery: () => recovery,
    handle(key: string, hit: HTMLElement, event: Event) {
      const input = controls.get(key);
      if (!input) return false;
      if (!event.isTrusted || !valid || task) return true;
      const menu = hit.closest<HTMLDetailsElement>("details");
      const anchor = menu?.querySelector<HTMLElement>("summary") ?? hit;
      if (menu) { menu.open = false; anchor.focus({ preventScroll: true }); }
      if (key === restorePosition) confirm(input, anchor);
      else void apply(input, anchor, hit.closest<HTMLElement>("[data-home-row]")?.dataset.homeRow ?? null);
      return true;
    },
  };
}
