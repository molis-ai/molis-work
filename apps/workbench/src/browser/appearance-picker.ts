import type { UiAppearanceReceipt, UiAppearanceSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance, WorkbenchAppearanceChoices } from "../appearance-document.js";
import type { createAppearanceSync } from "./appearance-sync.js";
import { appearanceRef, ensureAppearanceSheet, prepareAppearance, setAppearanceScope, type AppearanceProjection } from "./appearance-view.js";

const uiText = globalThis.t;

export type AppearanceText = (text: string, values?: Record<string, string | number>) => string;
type Sync = ReturnType<typeof createAppearanceSync>;
type Phase = "idle" | "loading" | "ready" | "failed";

function same(one: UiAppearanceSelection, two: UiAppearanceSelection): boolean {
  return appearanceRef(one.skin) === appearanceRef(two.skin) && one.mono?.id === two.mono?.id && one.mono?.revision === two.mono?.revision
    && (one.font.policy === "follow-skin" ? two.font.policy === "follow-skin"
      : two.font.policy === "pinned" && appearanceRef(one.font.scheme) === appearanceRef(two.font.scheme));
}

const skinChoice = (choices: WorkbenchAppearanceChoices, id: string) => choices.skins.find(skin => skin.ref.id === id);

function candidateProjection(current: WorkbenchAppearance, choices: WorkbenchAppearanceChoices, selection: UiAppearanceSelection): AppearanceProjection {
  const scheme = selection.font.policy === "pinned" ? selection.font.scheme : skinChoice(choices, selection.skin.id)!.recommended_font;
  const mono = selection.mono ?? scheme;
  const optional = appearanceRef(selection.skin) !== appearanceRef(choices.baseline.skin)
    || appearanceRef(scheme) !== appearanceRef(choices.baseline.font) || appearanceRef(mono) !== appearanceRef(choices.baseline.font);
  return { snapshot: { ...current.snapshot, skin: selection.skin, font: { scheme, mono, policy: selection.font.policy } },
    stylesheet: optional ? choices.stylesheet : null };
}

/** Reflect the applied and candidate choices in the same cards and font controls. */
function drawPickerChoices(root: HTMLElement, current: WorkbenchAppearance, draft: UiAppearanceSelection | undefined): void {
  for (const card of root.querySelectorAll<HTMLElement>("[data-look-card]")) {
    const inUse = card.dataset.lookCard === current.snapshot.skin.id;
    const picked = Boolean(draft && card.dataset.lookCard === draft.skin.id);
    card.querySelector<HTMLElement>(".mw-look-card__current")!.hidden = !inUse;
    card.querySelector<HTMLElement>(".mw-look-card__trial")!.hidden = !picked || inUse;
    const button = card.querySelector("button")!;
    button.setAttribute("aria-pressed", String(picked));
    button.toggleAttribute("data-look-in-use", inUse);
  }
  const selection = draft ?? current.selection;
  const fontId = selection.font.policy === "pinned" ? selection.font.scheme.id : "follow";
  for (const button of root.querySelectorAll<HTMLElement>("[data-appearance-font], [data-appearance-mono]")) {
    const selected = button.dataset.appearanceFont !== undefined ? fontId === button.dataset.appearanceFont : (selection.mono?.id ?? "") === button.dataset.appearanceMono;
    button.setAttribute("aria-pressed", String(selected));
  }
}

export function mountAppearancePicker(root: HTMLElement, initial: WorkbenchAppearance, sync: Sync, _L: AppearanceText) {
  const choices = JSON.parse(root.querySelector("[data-appearance-choices]")!.textContent!) as WorkbenchAppearanceChoices;
  const proof = root.querySelector<HTMLElement>(".mw-look-proof")!, canvas = proof.querySelector<HTMLElement>(".mw-look-proof__canvas")!;
  const home = root.querySelector("[data-appearance-proof-home]")!, sheet = root.querySelector<HTMLDialogElement>("[data-appearance-proof-sheet]")!;
  const sheetBody = sheet.querySelector("[data-appearance-proof-sheet-body]")!;
  const apply = proof.querySelector<HTMLButtonElement>("[data-look-apply]")!, cancel = proof.querySelector<HTMLButtonElement>("[data-look-cancel]")!;
  const retry = proof.querySelector<HTMLButtonElement>("[data-look-retry]")!, status = proof.querySelector<HTMLElement>(".mw-look-proof__status")!;
  const badge = proof.querySelector<HTMLElement>(".mw-card__header [data-slot=badge]")!, title = proof.querySelector<HTMLElement>(".mw-card__description")!;
  const reopen = root.querySelector<HTMLButtonElement>("[data-appearance-preview]")!;
  const useSheet = () => getComputedStyle(root).getPropertyValue("--appearance-use-sheet").trim() === "1";
  const font = (id: string) => choices.fonts.find(font => font.ref.id === id);
  let current = initial, draft: UiAppearanceSelection | undefined, expected = initial.selection_revision;
  let phase: Phase = "idle", preparing = 0, writing = false, refused = false, ownsPending = false;
  let trigger: HTMLElement | undefined;

  function name(selection: UiAppearanceSelection): string {
    const selected = candidateProjection(current, choices, selection).snapshot;
    const names = [skinChoice(choices, selected.skin.id)?.name_ref, font(selected.font.scheme.id)?.name_ref, selection.mono && font(selection.mono.id)?.name_ref];
    return names.flatMap(ref => ref ? [globalThis.say.text("literal" in ref ? ref : { ...ref, owner: "workbench" })] : []).join(" · ");
  }

  function draw(): void {
    const selection = draft ?? current.selection, conflict = Boolean(draft && expected !== current.selection_revision);
    const resuming = ownsPending && sync.canContinue;
    const blocked = !sync.available || current.selection_revision === null || (sync.uncertain && !resuming);
    drawPickerChoices(root, current, draft);
    reopen.hidden = !draft;
    proof.dataset.state = phase === "ready" && conflict ? "conflict" : phase;
    const label = name(selection);
    title.textContent = uiText.text(draft ? "workbench.appearance-picker.trying-name" : "workbench.appearance-picker.use-name", { name: label });
    canvas.parentElement?.setAttribute("aria-label", uiText.text("workbench.appearance-picker.specimen-name-picture-not-operable", { name: label }));
    canvas.querySelector("[data-look-code-name]")!.textContent = selection.skin.id;
    badge.textContent = uiText.text(draft ? "workbench.appearance-picker.not-applied" : "workbench.appearance-picker.use");
    badge.classList.toggle("mw-badge--success", !draft);
    badge.classList.toggle("mw-badge--info", Boolean(draft));
    apply.querySelector("[data-slot=button-label]")!.textContent = uiText.text(resuming ? "workbench.appearance-picker.continue-change" : conflict ? "workbench.appearance-picker.use-mine-anyway" : "workbench.appearance-picker.use-2");
    apply.disabled = phase !== "ready" || writing || blocked;
    cancel.disabled = !draft || writing;
    retry.hidden = !sync.available || (phase !== "failed" && !sync.uncertain);
    status.textContent = writing ? uiText.text("workbench.appearance-picker.saving-appearance")
      : !sync.available ? uiText.text("workbench.appearance-picker.pages-session-has-ended")
      : sync.uncertain ? uiText.text("workbench.appearance-picker.change-unconfirmed-check-again")
      : current.selection_revision === null ? uiText.text("workbench.appearance-picker.current-appearance-settings-cant-be-read-changes-cant")
      : phase === "loading" ? uiText.text("workbench.appearance-picker.font-loading-specimen-uses-fallback-font")
      : phase === "failed" ? uiText.text("workbench.appearance-picker.font-didnt-load-specimen-uses-fallback-font-combination")
      : refused ? uiText.text("workbench.appearance-picker.appearance-wasnt-saved-can-try-again")
      : conflict ? uiText.text("workbench.appearance-picker.another-window-just-switched-name-using-replaces", { name: name(current.selection) })
      : draft ? uiText.text("workbench.appearance-picker.page-hasnt-changed-once-used-every-window-home")
      : uiText.text("workbench.appearance-picker.pick-skin-font-specimen-changes-first-page-stays");
  }

  function leaveSheet(): void {
    if (sheet.open) sheet.close();
    home.append(proof);
  }
  function openSheet(): void {
    if (!useSheet() || sheet.open) return;
    sheetBody.append(proof);
    sheet.showModal();
  }
  sheet.addEventListener("close", () => {
    if (sheet.open) return;
    home.append(proof);
    trigger?.focus({ preventScroll: true });
  });
  sheet.addEventListener("cancel", event => { if (writing) event.preventDefault(); });
  sheet.querySelector("[data-dialog-close]")?.addEventListener("click", () => { if (!writing) leaveSheet(); });
  let usedSheet = useSheet();
  new ResizeObserver(() => {
    const compact = useSheet();
    if (usedSheet === compact) return;
    usedSheet = compact;
    if (!compact) leaveSheet();
    else if (draft) openSheet();
  }).observe(root);
  reopen.addEventListener("click", () => { trigger = reopen; openSheet(); });

  function discard(): void {
    preparing += 1;
    draft = undefined; phase = "idle"; refused = false;
    leaveSheet();
    setAppearanceScope(canvas, current.snapshot);
    draw();
  }

  function prepare(selection: UiAppearanceSelection): void {
    const token = ++preparing;
    phase = "loading";
    draw();
    void prepareAppearance(candidateProjection(current, choices, selection), canvas).then(() => {
      if (token !== preparing) return;
      phase = "ready"; draw();
    }, () => {
      if (token !== preparing) return;
      phase = "failed"; draw();
    });
  }

  function choose(selection: UiAppearanceSelection, button: HTMLElement): void {
    if (writing || sync.uncertain) return;
    if (same(selection, current.selection)) { discard(); return; }
    if (!draft) expected = current.selection_revision;
    draft = selection; refused = false; trigger = button;
    openSheet();
    prepare(selection);
  }
  root.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button) return;
    const base = draft ?? current.selection;
    const skinId = button.closest<HTMLElement>("[data-look-card]")?.dataset.lookCard;
    if (skinId) choose({ ...base, skin: skinChoice(choices, skinId)!.ref }, button);
    if (button.dataset.appearanceFont !== undefined) choose({ ...base, font: button.dataset.appearanceFont === "follow"
      ? { policy: "follow-skin" } : { policy: "pinned", scheme: font(button.dataset.appearanceFont)!.ref } }, button);
    if (button.dataset.appearanceMono !== undefined) choose({ ...base, mono: button.dataset.appearanceMono ? font(button.dataset.appearanceMono)!.ref : null }, button);
  });
  cancel.addEventListener("click", () => { discard(); trigger?.focus({ preventScroll: true }); });
  retry.addEventListener("click", () => {
    if (sync.uncertain) { sync.retry(); return; }
    if (draft) prepare(draft);
  });
  apply.addEventListener("click", () => {
    const revision = current.selection_revision;
    if (!draft || revision === null || apply.disabled) return;
    writing = true; refused = false; ownsPending = true; draw();
    const save = sync.uncertain ? sync.continue() : sync.apply({ kind: "selection", selection: draft }, revision);
    void save.then(receipt => {
      if (receipt && draft && same(draft, receipt.selection)) discard();
    }, () => { refused = expected === current.selection_revision; }).finally(() => { writing = false; if (!sync.uncertain) ownsPending = false; draw(); });
  });
  const visibility = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visibility.disconnect();
    void ensureAppearanceSheet(choices.stylesheet).catch(() => { /* Selecting a card can retry its own sheet. */ });
  });
  visibility.observe(root);
  draw();
  return {
    redraw: draw,
    present(next: WorkbenchAppearance) {
      current = next;
      refused = false;
      if (!draft) setAppearanceScope(canvas, next.snapshot);
      draw();
    },
    confirmed(receipt: UiAppearanceReceipt) {
      if (draft && same(draft, receipt.selection)) discard();
    },
  };
}
