import type { BlueprintAdoptionApplyInput, BlueprintAdoptionApplyResult, BlueprintAdoptionPreviewResult, BlueprintAdoptionReadResult,
  BlueprintAdoptionTarget, BlueprintAdoptionUndoResult, BlueprintApplyStep, BlueprintDraftResult, BlueprintLibraryResult,
  BlueprintPreviewChange, BlueprintPreviewPart, UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { OwnedTextRef, TextRef, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { readEventStream } from "./event-stream.js";

export function sceneOnboarding(request: UiRequest, readStream: typeof readEventStream,
  words: (key: string, args?: Record<string, string | number>) => string, say: (ref: OwnedTextRef) => string) {
  const frame = document.querySelector<HTMLElement>("[data-scene-workspace]")!;
  const project = frame.dataset.project || "", prefix = project ? "/projects/" + encodeURIComponent(project) : "";
  const api = prefix + "/api/blueprints/", params = new URLSearchParams(location.search);
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
    const control = node("button", label); control.type = "button"; control.disabled = busy; control.dataset.focus = label;
    control.className = "mw-btn " + (primary ? "mw-btn--primary" : "mw-btn--ghost");
    control.addEventListener("click", () => void action(run));
    return control;
  };
  const link = (label: string, to: string) => { const a = node("a", label); a.className = "mw-btn mw-btn--ghost"; a.href = to; return a; };
  const printable = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v, null, 2);
  const titleOf = (part: BlueprintPreviewPart) => part.title ? name(part.title) : part.proposal.kind === "setting" ? part.proposal.key : part.part_id;
  let busy = false, cursor = 0, all = false, stream: AbortController | undefined, adopted = "", viewingResult = false;
  let draft: BlueprintDraftResult["draft"] | undefined, preview: BlueprintAdoptionPreviewResult | undefined;
  let target: BlueprintAdoptionTarget, selection = new Set<string>(), changes: BlueprintPreviewChange[] = [];
  let original: BlueprintAdoptionApplyInput | undefined, targetProject: string | undefined, undo: "remove" | "revert" | undefined;
  const applied = new Map<string, BlueprintApplyStep>(), undone = new Map<string, UndoStep>();

  function report(e: unknown) { error.hidden = false; error.textContent = request.text(e, t("load-error")); }
  async function action(run: () => Promise<void> | void) {
    if (busy) return;
    busy = true; error.hidden = true; frame.setAttribute("aria-busy", "true");
    try { await run(); }
    catch (e) { report(e); }
    finally { busy = false; frame.setAttribute("aria-busy", "false"); if (preview) draw(); }
  }
  function empty() { main.replaceChildren(); aside.replaceChildren(); bar.replaceChildren(); }
  function heading(parent: HTMLElement, text: string) { const h = node("h2", text); h.tabIndex = -1; parent.append(h); return h; }
  function field(parent: HTMLElement, label: string, value: string) { const dt = node("dt", label), dd = node("dd", value); parent.append(dt, dd); }
  function check(part: BlueprintPreviewPart, label: string) {
    const row = node("label"), box = node("input"); box.type = "checkbox"; box.checked = selection.has(part.part_id);
    box.disabled = busy || part.decision === "skip"; row.className = "ob-label"; box.dataset.focus = part.part_id + label;
    box.addEventListener("change", () => { if (box.checked) selection.add(part.part_id); else selection.delete(part.part_id); draw(); });
    row.append(box, document.createTextNode(label)); return row;
  }
  function renderPreview(part: BlueprintPreviewPart) {
    heading(main, titleOf(part));
    if (part.summary) main.append(node("p", name(part.summary)));
    const current = part.candidates.find(c => c.kind === "owner")?.current, details = node("dl");
    details.className = "project-manager-storage";
    field(details, t("current"), current?.state === "present" ? printable(current.value) : current?.state === "unavailable" ? current.reason : t("unavailable"));
    if (current?.state === "present" && current.setting_source) field(details, t("source"), t(current.setting_source));
    if (part.proposal.kind === "setting") field(details, t("proposed"), printable(part.proposal.value));
    field(details, t("scope"), t(part.layer));
    for (const consequence of part.consequences) field(details, t("impact"), t(consequence));
    main.append(details);
    if (part.decision === "skip") main.append(node("p", t(part.reason)));
    else {
      main.append(check(part, t("include")));
      if (draft && part.proposal.kind === "setting") {
        const proposal = part.proposal, edit = node("details"), value = node("textarea");
        value.className = "mw-input"; value.setAttribute("aria-label", t("proposed"));
        value.value = printable(proposal.value); const save = button(t("refresh"), async () => {
          const v = typeof proposal.value === "string" ? value.value : JSON.parse(value.value);
          const next = changes.filter(c => c.part_id !== part.part_id).concat({ part_id: part.part_id, proposal: { ...proposal, value: v } });
          await showPreview(draft!, target, next, false);
        });
        edit.append(node("summary", t("edit")), value, save); main.append(edit);
      }
    }
    const prev = button(t("previous"), () => { cursor--; }), next = button(t("next"), () => { cursor++; });
    prev.disabled ||= cursor === 0; next.disabled ||= cursor === preview!.parts.length - 1;
    aside.append(node("p", t("position", { n: cursor + 1, total: preview!.parts.length })), prev, next);
    const list = node("details"); list.open = all; list.append(node("summary", t("all")));
    list.addEventListener("toggle", () => { all = list.open; });
    const choices = node("ul");
    for (const entry of preview!.parts) { const li = node("li"); li.append(check(entry, titleOf(entry))); choices.append(li); }
    list.append(choices); aside.append(list);
    const apply = button(t("apply", { n: selection.size }), () => submit(), true); apply.disabled ||= !selection.size; bar.append(apply);
  }
  function renderResults() {
    heading(main, t("results"));
    const unfinished = (step?: BlueprintApplyStep | UndoStep) => !step || ["not_started", "pending_verification", "failed", "needs_install", "needs_approval"].includes(step.state)
      || (step.state === "skipped" && step.reason === "owner_unavailable");
    const hasUndo = Boolean(undo || undone.size);
    let retry = false;
    for (const part of preview!.parts) {
      const step = hasUndo ? undone.get(part.part_id) : applied.get(part.part_id);
      const row = node("details"); row.open = unfinished(step); retry ||= row.open;
      const state = step?.state === "applied" && step.current ? step.current : step?.state ?? "not_started";
      row.append(node("summary", titleOf(part) + " · " + t(state)));
      if (step?.state === "failed") row.append(node("p", step.error.message));
      if (step?.state === "skipped") row.append(node("p", t(step.reason)));
      if (part.proposal.kind === "setting") row.append(node("p", t("proposed") + " · " + printable(part.proposal.value)));
      main.append(row);
    }
    if (targetProject && project !== targetProject && adopted) {
      bar.append(link(t("open-target"), pageUrl(targetProject, { adoption: adopted }))); return;
    }
    if (retry && original) bar.append(button(t("continue"), () => hasUndo && undo ? reverse(undo) : submit(), true));
    if (adopted && !hasUndo) {
      aside.append(button(t("revert"), () => reverse("revert")), button(t("remove"), () => reverse("remove")));
    }
  }
  function draw() {
    if (!preview) return;
    const active = document.activeElement, key = active && frame.contains(active) ? (active as HTMLElement).dataset.focus : undefined;
    empty();
    if (viewingResult) renderResults();
    else if (preview.parts[cursor]) renderPreview(preview.parts[cursor]!);
    else main.append(node("p", t("empty-parts")));
    if (key) Array.from(frame.querySelectorAll<HTMLElement>("[data-focus]")).find(el => el.dataset.focus === key)?.focus();
  }
  function setStatus(status: BlueprintAdoptionReadResult) {
    for (const step of status.apply_steps) applied.set(step.part_id, step);
    if (status.latest_undo) { undo = status.latest_undo.operation; for (const step of status.latest_undo.steps) undone.set(step.part_id, step); }
  }
  function remember(id: string, destination?: string | null) {
    adopted = id; targetProject = destination ?? undefined; viewingResult = true;
    history.replaceState(null, "", pageUrl(project, { adoption: id }));
  }
  function watch(id: string) {
    stream?.abort();
    const connection = new AbortController(); stream = connection;
    void (async () => {
      try {
        const response = await request<Response>(api + "events?id=" + encodeURIComponent(id), { as: "response", signal: connection.signal, headers: { accept: "text/event-stream" } });
        if (!response.ok || !response.body) throw new Error(t("load-error"));
        await readStream(response.body, { message(raw, event) {
          if (connection.signal.aborted || preview?.preview_id !== id) return;
          const data = JSON.parse(raw);
          if (event === "snapshot" && data.record) {
            original = data.record.request; remember(data.record.adoption_id, data.record.target.project_id);
            if (data.status) setStatus(data.status);
          } else if (event === "target" || event === "progress") {
            remember(data.adoption_id, data.project_id);
            if (data.kind === "apply") applied.set(data.step.part_id, data.step);
            if (data.kind === "undo") undone.set(data.step.part_id, data.step);
          } else return;
          draw();
        } });
        if (!connection.signal.aborted) throw new Error(t("stream-ended"));
      } catch (e) {
        if (connection.signal.aborted) return;
        report(e); error.append(button(t("reconnect"), () => watch(id)));
      }
    })();
  }
  async function submit() {
    if (!preview) return;
    original ??= { preview_id: preview.preview_id, part_ids: [...selection], request_id: crypto.randomUUID() };
    const done = await request<BlueprintAdoptionApplyResult>(api + "apply", { body: original });
    remember(done.adoption_id, done.target.kind === "project" ? done.target.project_id : undefined);
    for (const step of done.steps) applied.set(step.part_id, step);
  }
  async function reverse(op: "revert" | "remove") {
    const done = await request<BlueprintAdoptionUndoResult>(api + op, { body: { adoption_id: adopted, request_id: crypto.randomUUID() } });
    undo = done.undo.operation; for (const step of done.undo.steps) undone.set(step.part_id, step);
  }
  async function showPreview(current: BlueprintDraftResult["draft"], dest: BlueprintAdoptionTarget, edits: BlueprintPreviewChange[], reset = true) {
    const result = await request<BlueprintAdoptionPreviewResult>(api + "preview", { body: {
      source: current.source, target: dest, part_ids: current.blueprint.parts.map(p => p.part_id), changes: edits,
    } });
    target = dest; preview = result; changes = edits; original = undefined;
    if (reset) { cursor = 0; selection = new Set(result.parts.filter(p => p.decision !== "skip").map(p => p.part_id)); }
    watch(result.preview_id); draw();
  }
  function chooseTarget(current: BlueprintDraftResult["draft"]) {
    empty(); heading(main, name(current.blueprint.title)); main.append(node("p", name(current.blueprint.purpose.work)));
    const label = node("label", t("scope")), select = node("select"); label.append(select); main.append(label);
    const title = node("input"); title.value = name(current.blueprint.title); title.className = "mw-input"; title.maxLength = 160;
    title.setAttribute("aria-label", t("project-name"));
    const targets = project ? ["current_project", "personal", "new_project"] : ["personal", "new_project"];
    for (const kind of targets) { const option = node("option", t(kind)); option.value = kind; select.append(option); }
    if (!project && current.blueprint.parts.some(p => p.layer === "project")) select.value = "new_project";
    const changed = () => { title.hidden = select.value !== "new_project"; }; select.addEventListener("change", changed); changed();
    main.append(title);
    bar.append(button(t("preview"), async () => {
      if (select.value === "new_project" && !title.value.trim()) { title.focus(); return; }
      const dest: BlueprintAdoptionTarget = select.value === "new_project" ? { kind: "new_project", display_name: title.value.trim() }
        : { kind: select.value === "current_project" ? "current_project" : "personal" };
      await showPreview(current, dest, []);
    }, true));
  }
  async function start() {
    const draftId = params.get("draft"), adoptionId = params.get("adoption");
    if (draftId) {
      draft = (await request<BlueprintDraftResult>(api + "draft?id=" + encodeURIComponent(draftId))).draft; chooseTarget(draft); return;
    }
    const records = await request<BlueprintLibraryResult>(api + "library" + (adoptionId ? "?id=" + encodeURIComponent(adoptionId) : ""));
    if (adoptionId && records.preview && records.adoptions[0]) {
      preview = records.preview; original = records.adoptions[0].request; const record = records.adoptions[0];
      remember(adoptionId, record.target.kind === "project" ? record.target.project_id : undefined);
      watch(preview.preview_id); draw(); return;
    }
    empty(); heading(main, t("drafts")); if (!records.drafts.length) main.append(node("p", t("empty-drafts")));
    for (const item of records.drafts) main.append(link(name(item.title), pageUrl(project, { draft: item.source.draft_id })));
    heading(aside, t("history")); if (!records.adoptions.length) aside.append(node("p", t("empty-history")));
    for (const item of records.adoptions) aside.append(link(name(item.title), pageUrl(project, { adoption: item.adoption_id })));
  }
  addEventListener("pagehide", () => stream?.abort(), { once: true });
  void start().catch(report);
}
