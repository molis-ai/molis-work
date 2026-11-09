import type { UiAppearanceReceipt, UiAppearanceSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkbenchAppearance, WorkbenchAppearanceChoices } from "../appearance-document.js";
import type { createAppearanceSync } from "./appearance-sync.js";
import { appearanceRef, ensureAppearanceSheet, prepareAppearance, setAppearanceScope, type AppearanceProjection } from "./appearance-view.js";

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

export function mountAppearancePicker(root: HTMLElement, initial: WorkbenchAppearance, sync: Sync, L: AppearanceText) {
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
    return [skinChoice(choices, selected.skin.id)?.name, font(selected.font.scheme.id)?.name, selection.mono && font(selection.mono.id)?.name].filter(Boolean).join(" · ");
  }

  function draw(): void {
    const selection = draft ?? current.selection, conflict = Boolean(draft && expected !== current.selection_revision);
    const resuming = ownsPending && sync.canContinue;
    const blocked = !sync.available || current.selection_revision === null || (sync.uncertain && !resuming);
    drawPickerChoices(root, current, draft);
    reopen.hidden = !draft;
    proof.dataset.state = phase === "ready" && conflict ? "conflict" : phase;
    const label = name(selection);
    title.textContent = L(draft ? "试：{name}" : "现在用的：{name}", { name: label });
    canvas.parentElement?.setAttribute("aria-label", L("样张：{name}（示意，不可操作）", { name: label }));
    canvas.querySelector("[data-look-code-name]")!.textContent = selection.skin.id;
    badge.textContent = L(draft ? "没用上" : "在用");
    badge.classList.toggle("mw-badge--success", !draft);
    badge.classList.toggle("mw-badge--info", Boolean(draft));
    apply.querySelector("[data-slot=button-label]")!.textContent = L(resuming ? "继续这次操作" : conflict ? "仍然用上" : "用上");
    apply.disabled = phase !== "ready" || writing || blocked;
    cancel.disabled = !draft || writing;
    retry.hidden = !sync.available || (phase !== "failed" && !sync.uncertain);
    status.textContent = writing ? L("正在保存外观…")
      : !sync.available ? L("此页面的会话已结束。")
      : sync.uncertain ? L("还无法确认外观是否已保存，请再查一次。")
      : current.selection_revision === null ? L("当前外观设置无法读取，暂时无法保存。")
      : phase === "loading" ? L("字体加载中，样张先用后备字体")
      : phase === "failed" ? L("字体没加载上，样张先用后备字体；这个组合还不能用上")
      : refused ? L("外观未保存，可以再试一次。")
      : conflict ? L("另一个窗口刚换成了「{name}」；用上会替换它", { name: name(current.selection) })
      : draft ? L("页面没变；用上之后这个 Home 的所有窗口一起换。")
      : L("点一个皮肤或字体，样张先换，页面不变。");
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
