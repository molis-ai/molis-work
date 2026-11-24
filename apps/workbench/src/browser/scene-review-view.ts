import type { sceneSettingValues } from "./scene-setting-values.js";
import type { BlueprintAdoptionTarget, BlueprintApplyStep, BlueprintDraftResult, BlueprintLibraryResult, BlueprintPreviewChange, BlueprintPreviewPart, UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { OwnedTextRef, TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

type Words = (key: string, args?: Record<string, string | number>) => string;

export function sceneReviewPage(words: Words, say: (ref: OwnedTextRef) => string, action: (run: () => Promise<void> | void) => Promise<void>, values: ReturnType<typeof sceneSettingValues>) {
  const frame = document.querySelector<HTMLElement>("[data-scene-workspace]")!;
  const project = frame.dataset.project || "";
  const params = new URLSearchParams(location.search);
  const main = frame.querySelector<HTMLElement>("[data-scene-main]")!, aside = frame.querySelector<HTMLElement>("[data-scene-aside]")!;
  const bar = document.querySelector<HTMLElement>(".arrival-bar .bar-end")!, error = document.querySelector<HTMLElement>("[data-scene-error]")!;
  const t = (key: string, args?: Record<string, string | number>) => words("workbench.scene." + key, args);
  const name = (ref: TextRef | OwnedTextRef) => say("literal" in ref || "owner" in ref ? ref : { ...ref, owner: "workbench" });
  const node = <K extends keyof HTMLElementTagNameMap>(type: K, text?: string) => {
    const el = document.createElement(type);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const pageUrl = (ref = project, query?: Record<string, string>) => {
    const search = new URLSearchParams({ scene: "", ...query });
    if (params.get("desktop") === "1") search.set("desktop", "1");
    return (ref ? "/projects/" + encodeURIComponent(ref) : "") + "/onboarding?" + search;
  };
  const button = (label: string, run: () => Promise<void> | void, primary = false) => {
    const control = node("button", label); control.type = "button"; control.dataset.focus = label;
    control.className = "mw-btn " + (primary ? "mw-btn--primary" : "mw-btn--ghost");
    control.addEventListener("click", () => void action(run));
    return control;
  };
  const link = (label: string, to: string) => { const a = node("a", label); a.className = "mw-btn mw-btn--ghost"; a.href = to; return a; };
  const printable = (v: unknown) => typeof v === "boolean" ? t(v ? "on" : "off") : typeof v === "string" ? v : JSON.stringify(v, null, 2);
  const titleOf = (part: BlueprintPreviewPart) => part.title ? name(part.title) : part.proposal.kind === "setting" ? part.proposal.key : part.part_id;
  function sceneContext(title: TextRef, purpose?: TextRef) {
    const context = frame.querySelector<HTMLElement>("[data-scene-context]")!, lead = frame.querySelector<HTMLElement>("[data-scene-purpose]")!;
    context.textContent = name(title); context.hidden = false;
    lead.textContent = purpose ? name(purpose) : ""; lead.hidden = !lead.textContent || lead.textContent === context.textContent;
  }
  function empty() { main.replaceChildren(); aside.replaceChildren(); bar.replaceChildren(); }
  function heading(parent: HTMLElement, text: string) { const h = node("h2", text); h.tabIndex = -1; parent.append(h); return h; }
  function field(parent: HTMLElement, label: string, value: string) { const dt = node("dt", label), dd = node("dd", value); parent.append(dt, dd); }
  function chooseTarget(current: BlueprintDraftResult["draft"], show: (dest: BlueprintAdoptionTarget) => Promise<void>) {
    empty(); sceneContext(current.blueprint.title, current.blueprint.purpose.work); heading(main, t("scope"));
    const title = node("input"); title.value = name(current.blueprint.title); title.className = "mw-input"; title.maxLength = 160;
    title.setAttribute("aria-label", t("project-name"));
    const targets = project ? ["current_project", "personal", "new_project"] : ["personal", "new_project"];
    const initial = !project && current.blueprint.parts.some(p => p.layer === "project") ? "new_project" : targets[0]!;
    const scope = values.options(t("scope"), "scene-target", targets.map(value => ({ value, label: t(value) })), initial);
    const changed = () => { title.hidden = scope.value() !== "new_project"; };
    scope.field.addEventListener("change", changed); changed();
    main.append(scope.field, title);
    bar.append(button(t("preview"), async () => {
      const target = scope.value();
      if (target === "new_project" && !title.value.trim()) { title.focus(); return; }
      const dest: BlueprintAdoptionTarget = target === "new_project" ? { kind: "new_project", display_name: title.value.trim() }
        : { kind: target === "current_project" ? "current_project" : "personal" };
      await show(dest);
    }, true));
  }
  function library(records: BlueprintLibraryResult) {
    empty(); heading(main, t("drafts")); if (!records.drafts.length) main.append(node("p", t("empty-drafts")));
    for (const item of records.drafts) main.append(link(name(item.title), pageUrl(project, { draft: item.source.draft_id })));
    heading(aside, t("history")); if (!records.adoptions.length) aside.append(node("p", t("empty-history")));
    for (const item of records.adoptions) aside.append(link(name(item.title), pageUrl(project, { adoption: item.adoption_id })));
  }
  function redraw(content: () => void) {
    const active = document.activeElement;
    const ownedFocus = active instanceof HTMLElement && (frame.contains(active) || bar.contains(active));
    const key = ownedFocus ? active.dataset.focus : undefined;
    const oldHeading = main.querySelector("h2")?.textContent;
    empty();
    content();
    if (ownedFocus) {
      const heading = main.querySelector<HTMLElement>("h2");
      const same = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-workspace] [data-focus], .arrival-bar .bar-end [data-focus]"))
        .find(el => key && el.dataset.focus === key && !el.matches(":disabled"));
      (oldHeading === heading?.textContent ? same ?? heading : heading)?.focus();
    }
  }
  return { values, frame, project, error, main, aside, bar, t, name, node, pageUrl, button, link, printable, titleOf, sceneContext, heading, field, chooseTarget, library, redraw };
}

interface Review {
  parts: BlueprintPreviewPart[];
  cursor: number;
  selection: ReadonlySet<string>;
  editing: boolean;
  accepted: boolean;
  adopted: string;
  destination?: string;
  targetCreated: boolean;
  undo?: "revert" | "remove";
  applied: ReadonlyMap<string, BlueprintApplyStep>;
  undone: ReadonlyMap<string, UndoStep>;
  all: boolean;
  results: boolean;
}
interface Controls {
  select(id: string, checked: boolean): void;
  move(index: number): void;
  expand(all: boolean): void;
  edit(change: BlueprintPreviewChange): Promise<void>;
  submit(): Promise<void>;
  reverse(op: "revert" | "remove"): Promise<void>;
}
export function renderSceneReview(page: ReturnType<typeof sceneReviewPage>, state: Review, controls: Controls) {
  const { main, aside, bar, t, name, project, pageUrl, node, button, link, printable, titleOf, heading, field } = page;
  const { selection, cursor, parts, applied, undone, undo, adopted, destination: targetProject } = state;
  function check(part: BlueprintPreviewPart, label: string) {
    const row = node("label"), box = node("input"); box.type = "checkbox"; box.checked = selection.has(part.part_id);
    box.disabled = state.accepted || part.decision === "skip"; row.className = "ob-label"; box.dataset.focus = part.part_id + label;
    box.addEventListener("change", () => {
      controls.select(part.part_id, box.checked); box.checked = selection.has(part.part_id);
    });
    row.append(box, document.createTextNode(label)); return row;
  }
  function renderPreview(part: BlueprintPreviewPart) {
    heading(main, titleOf(part));
    if (part.summary) main.append(node("p", name(part.summary)));
    const current = part.candidates.find(c => c.kind === "owner")?.current, details = node("dl");
    const key = part.proposal.kind === "setting" ? part.proposal.key : "";
    field(details, t("current"), current?.state === "present" ? page.values.describe(key, current.value, part.model_selection) : current?.state === "unavailable" ? current.reason : t("unavailable"));
    if (current?.state === "present" && current.setting_source) field(details, t("source"), t(current.setting_source));
    if (current?.state === "present" && current.value_unavailable) field(details, t("status"), current.value_unavailable);
    if (part.decision === "reuse" || part.decision === "update") field(details, t("action"), t(part.decision));
    if (part.proposal.kind === "setting") field(details, t("proposed"), page.values.describe(part.proposal.key, part.proposal.value, part.model_selection));
    field(details, t("scope"), t(part.device_only ? "device-only" : part.layer));
    for (const consequence of part.consequences) field(details, t("impact"), t(consequence));
    main.append(details);
    if (part.decision === "skip") main.append(node("p", t(part.reason)));
    else main.append(check(part, t("include")));
    if (state.editing && part.proposal.kind === "setting" && (part.decision !== "skip" || part.reason === "value_unavailable" || part.reason === "invalid_proposal")) {
      const proposal = part.proposal, edit = node("details");
      const type = part.correction_type ?? typeof proposal.value;
      edit.append(node("summary", t("edit")));
      if (part.model_selection) {
        const save = button(t("refresh"), () => controls.edit({ part_id: part.part_id, proposal: { ...proposal, value: selected() } }));
        const selected = page.values.modelEditor(edit, proposal.value, save);
      } else if (type === "boolean") {
        const choice = page.values.options(t("proposed"), "scene-boolean",
          [true, false].map(value => ({ value: String(value), label: printable(value) })), String(proposal.value));
        const save = button(t("refresh"), () => controls.edit({ part_id: part.part_id, proposal: { ...proposal, value: choice.value() === "true" } }));
        edit.append(choice.field, save);
      } else {
        const value = node("textarea");
        value.className = "mw-input"; value.setAttribute("aria-label", t("proposed"));
        value.value = printable(proposal.value);
        const save = button(t("refresh"), async () => {
          const v = type === "string" ? value.value : JSON.parse(value.value);
          await controls.edit({ part_id: part.part_id, proposal: { ...proposal, value: v } });
        });
        edit.append(value, save);
      }
      main.append(edit);
    }
    const prev = button(t("previous"), () => controls.move(cursor - 1)), next = button(t("next"), () => controls.move(cursor + 1));
    prev.disabled ||= cursor === 0; next.disabled ||= cursor === parts.length - 1;
    aside.append(node("p", t("position", { n: cursor + 1, total: parts.length })), prev, next);
    const list = node("details"); list.open = state.all; list.append(node("summary", t("all")));
    list.addEventListener("toggle", () => { if (list.isConnected) controls.expand(list.open); });
    const choices = node("ul");
    for (const entry of parts) { const li = node("li"); li.append(check(entry, titleOf(entry))); choices.append(li); }
    list.append(choices); aside.append(list);
    const apply = button(state.accepted ? t("continue") : t("apply", { n: selection.size }), controls.submit, true);
    apply.disabled = !selection.size; bar.append(apply);
  }
  function renderResults() {
    heading(main, t("results"));
    const unfinished = (step?: BlueprintApplyStep | UndoStep) => !step || ["not_started", "pending_verification", "failed", "needs_install", "needs_approval"].includes(step.state)
      || (step.state === "skipped" && step.reason === "owner_unavailable");
    const hasUndo = Boolean(undo || undone.size);
    let retry = false;
    for (const part of parts) {
      const step = hasUndo ? undone.get(part.part_id) : applied.get(part.part_id);
      const row = node("details"); row.open = unfinished(step); retry ||= row.open;
      const state = step?.state === "applied" && step.current ? step.current : step?.state ?? "not_started";
      row.append(node("summary", titleOf(part) + " · " + t(state)));
      if (step?.state === "needs_approval" && targetProject) {
        const search = new URLSearchParams({ homePage: step.page_id, homeVersion: String(step.version), homeApproval: step.approval_request_id });
        row.append(link(t("needs_approval"), "/projects/" + encodeURIComponent(targetProject) + "/?" + search));
      }
      if (step?.state === "failed") row.append(node("p", step.error.message));
      if (step?.state === "skipped") row.append(node("p", t(step.reason)));
      if (step?.state === "pending_verification" && step.current)
        row.append(node("p", t(step.current === "owner_replaced" ? "pending-owner-replaced" : "pending-owner-unavailable")));
      if (part.proposal.kind === "setting") row.append(node("p", t("proposed") + " · " + page.values.describe(part.proposal.key, part.proposal.value, part.model_selection)));
      main.append(row);
    }
    if (targetProject && project !== targetProject && adopted) {
      bar.append(state.targetCreated ? link(t("open-target"), pageUrl(targetProject, { adoption: adopted }))
        : button(t("continue"), controls.submit, true));
      return;
    }
    if (retry && state.accepted) bar.append(button(t("continue"), () => undo ? controls.reverse(undo) : controls.submit(), true));
    if (adopted && !hasUndo) {
      aside.append(button(t("revert"), () => controls.reverse("revert")), button(t("remove"), () => controls.reverse("remove")));
    }
  }
  page.redraw(() => {
    if (state.results) renderResults();
    else if (parts[cursor]) renderPreview(parts[cursor]!);
    else main.append(node("p", t("empty-parts")));
  });
}
