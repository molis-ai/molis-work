import type { BlueprintAdoptionApplyInput, BlueprintAdoptionApplyResult, BlueprintAdoptionPreviewResult, BlueprintAdoptionReadResult,
  BlueprintAdoptionTarget, BlueprintAdoptionUndoResult, BlueprintApplyStep, BlueprintDraftResult, BlueprintLibraryResult,
  BlueprintPreviewChange, UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { OwnedTextRef, TextRef, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { readEventStream } from "./event-stream.js";

import type { sceneSettingValues } from "./scene-setting-values.js";
import type { sceneReviewPage, renderSceneReview } from "./scene-review-view.js";

export function sceneOnboarding(request: UiRequest, readStream: typeof readEventStream,
  words: (key: string, args?: Record<string, string | number>) => string, say: (ref: OwnedTextRef) => string, makePage: typeof sceneReviewPage, renderReview: typeof renderSceneReview,
  settingValues: typeof sceneSettingValues) {
  const page = makePage(words, say, action, settingValues(words));
  const { frame, project, error, t, button, pageUrl, sceneContext } = page;
  const api = (project ? "/projects/" + encodeURIComponent(project) : "") + "/api/blueprints/";
  const params = new URLSearchParams(location.search);
  let busy = false, cursor = 0, all = false, stream: AbortController | undefined, adopted = "", viewingResult = false, targetCreated = false;
  let draft: BlueprintDraftResult["draft"] | undefined, preview: BlueprintAdoptionPreviewResult | undefined;
  let target: BlueprintAdoptionTarget, selection = new Set<string>(), changes: BlueprintPreviewChange[] = [];
  let original: BlueprintAdoptionApplyInput | undefined, targetProject: string | undefined;
  let undo: { operation: "remove" | "revert"; request_id: string } | undefined;
  let lastLibrary: BlueprintLibraryResult | undefined, recordTitle: TextRef | undefined;
  const applied = new Map<string, BlueprintApplyStep>(), undone = new Map<string, UndoStep>();

  function report(e: unknown) { error.hidden = false; error.textContent = request.text(e, t("load-error")); }
  async function action(run: () => Promise<void> | void) {
    if (busy) return;
    busy = true; error.hidden = true; frame.setAttribute("aria-busy", "true");
    let succeeded = false;
    try { await run(); succeeded = true; }
    catch (e) { report(e); }
    finally { busy = false; frame.setAttribute("aria-busy", "false"); if (succeeded && preview) draw(); }
  }
  function edit(change: BlueprintPreviewChange) {
    return showPreview(draft!, target, changes.filter(c => c.part_id !== change.part_id).concat(change), false);
  }
  function draw(): void {
    if (!preview) return;
    renderReview(page, { parts: preview.parts, cursor, selection, editing: Boolean(draft && !original),
      accepted: Boolean(original), adopted, destination: targetProject, targetCreated, undo: undo?.operation, applied, undone, all, results: viewingResult }, {
      select(id, checked) {
        if (busy) return;
        if (checked) selection.add(id); else selection.delete(id);
        rememberReview(); draw();
      },
      move(index) { cursor = index; rememberReview(); },
      expand(value) { all = value; },
      edit, submit, reverse,
    });
  }
  function setStatus(status: BlueprintAdoptionReadResult) {
    for (const step of status.apply_steps) applied.set(step.part_id, step);
    undo = status.latest_undo ?? undefined;
    undone.clear();
    for (const step of status.latest_undo?.steps ?? []) undone.set(step.part_id, step);
  }
  function remember(id: string, destination?: string | null) {
    adopted = id; targetProject = destination ?? undefined; viewingResult = true;
    history.replaceState(null, "", pageUrl(project, { adoption: id }));
  }
  function rememberReview() {
    if (preview && !adopted) history.replaceState({ cursor, part_ids: [...selection], request: original },
      "", pageUrl(project, { preview: preview.preview_id }));
  }
  function watch(id: string, opening?: "adoption" | "preview") {
    stream?.abort();
    const connection = new AbortController(); stream = connection;
    void (async () => {
      try {
        const response = await request<Response>(api + "events?id=" + encodeURIComponent(id) + (opening ? "&open=" + opening : ""), { as: "response", signal: connection.signal, headers: { accept: "text/event-stream" } });
        if (!response.ok || !response.body) throw new Error(t("load-error"));
        await readStream(response.body, { message(raw, event) {
          if (connection.signal.aborted) return;
          const data = JSON.parse(raw);
          if (event === "snapshot" && data.preview) {
            preview = data.preview;
            if (data.record) {
              recordTitle = data.record.title;
              sceneContext(data.record.title);
            }
            else if (data.draft) { restoreReview(data.preview, data.draft); return; }
          }
          if (event === "snapshot" && data.record) {
            if (data.target_created !== undefined) targetCreated = data.target_created;
            original = data.record.request; remember(data.record.adoption_id, data.record.target.project_id);
            if (data.status) setStatus(data.status);
          } else if (event === "target" || event === "progress") {
            if (data.target_created) targetCreated = true;
            remember(data.adoption_id, data.project_id);
            if (data.kind === "apply") applied.set(data.step.part_id, data.step);
            if (data.kind === "undo") { undo = data.undo; undone.set(data.step.part_id, data.step); }
          } else return;
          draw();
        } });
        if (!connection.signal.aborted) throw new Error(t("stream-ended"));
      } catch (e) {
        if (connection.signal.aborted) return;
        report(e); error.append(button(t("reconnect"), () => watch(id, opening)));
      }
    })();
  }
  async function submit() {
    if (!preview) return;
    original ??= { preview_id: preview.preview_id, part_ids: [...selection], request_id: crypto.randomUUID() };
    rememberReview();
    draw();
    const done = await request<BlueprintAdoptionApplyResult>(api + "apply", { body: original });
    if (preview.target.kind === "new_project") targetCreated = true;
    remember(done.adoption_id, done.target.kind === "project" ? done.target.project_id : undefined);
    for (const step of done.steps) applied.set(step.part_id, step);
  }
  async function reverse(op: "revert" | "remove") {
    const attempt = undo ?? { operation: op, request_id: adopted + ":" + op };
    try {
      const done = await request<BlueprintAdoptionUndoResult>(api + attempt.operation, { body: { adoption_id: adopted, request_id: attempt.request_id } });
      undo = done.undo;
      for (const step of done.undo.steps) undone.set(step.part_id, step);
    } catch (failure) {
      if (preview) watch(preview.preview_id);
      throw failure;
    }
  }
  async function showPreview(current: BlueprintDraftResult["draft"], dest: BlueprintAdoptionTarget, edits: BlueprintPreviewChange[], reset = true) {
    const result = await request<BlueprintAdoptionPreviewResult>(api + "preview", { body: {
      source: current.source, target: dest, part_ids: current.blueprint.parts.map(p => p.part_id), changes: edits,
    } });
    const edited = !reset && result.parts.find(p => p.part_id === edits.at(-1)?.part_id);
    if (edited && edited.decision === "skip" && edited.reason === "invalid_proposal") throw new Error(t(edited.reason));
    target = dest; preview = result; changes = edits; original = undefined;
    if (reset) { cursor = 0; selection = new Set(result.parts.filter(p => p.decision !== "skip").map(p => p.part_id)); }
    else selection = new Set(result.parts.filter(p => p.decision !== "skip" && selection.has(p.part_id)).map(p => p.part_id));
    rememberReview(); watch(result.preview_id);
  }
  function chooseTarget(current: BlueprintDraftResult["draft"]) {
    page.chooseTarget(current, dest => showPreview(current, dest, []));
  }
  async function start() {
    const draftId = params.get("draft"), adoptionId = params.get("adoption"), previewId = params.get("preview");
    if (draftId) {
      draft = (await request<BlueprintDraftResult>(api + "draft?id=" + encodeURIComponent(draftId))).draft; chooseTarget(draft); return;
    }
    if (adoptionId || previewId) { watch((adoptionId ?? previewId)!, adoptionId ? "adoption" : "preview"); return; }
    lastLibrary = await request<BlueprintLibraryResult>(api + "library");
    page.library(lastLibrary);
  }
  function restoreReview(savedPreview: BlueprintAdoptionPreviewResult, current: BlueprintDraftResult["draft"]) {
    preview = savedPreview; target = preview.target; draft = current;
    sceneContext(draft.blueprint.title, draft.blueprint.purpose.work);
    if (savedPreview.source.kind !== "draft" || draft.source.revision !== savedPreview.source.revision || Date.parse(preview.expires_at) <= Date.now()) {
      stream?.abort(); preview = undefined; chooseTarget(draft); return;
    }
    changes = preview.parts.map(p => ({ part_id: p.part_id, proposal: p.proposal }));
    const saved = history.state;
    selection = new Set(preview.parts.filter(p => p.decision !== "skip" && (!Array.isArray(saved?.part_ids) || saved.part_ids.includes(p.part_id))).map(p => p.part_id));
    cursor = Number.isInteger(saved?.cursor) && preview.parts[saved.cursor] ? saved.cursor : 0;
    original = saved?.request?.preview_id === savedPreview.preview_id ? saved.request : undefined;
    draw();
  }
  const onLanguageChanged = () => {
    if (preview) {
      if (draft) sceneContext(draft.blueprint.title, draft.blueprint.purpose.work);
      else if (recordTitle) sceneContext(recordTitle);
      draw();
      return;
    }
    if (draft) {
      const checked = page.main.querySelector<HTMLInputElement>('input[name="scene-target"]:checked')?.value;
      const input = page.main.querySelector<HTMLInputElement>("input.mw-input");
      const typed = input?.value;
      chooseTarget(draft);
      if (checked) {
        const radio = page.main.querySelector<HTMLInputElement>(`input[name="scene-target"][value="${CSS.escape(checked)}"]`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const nextInput = page.main.querySelector<HTMLInputElement>("input.mw-input");
      if (nextInput && typed !== undefined) nextInput.value = typed;
      return;
    }
    if (lastLibrary) page.library(lastLibrary);
  };
  document.addEventListener("molis-work:language-changed", onLanguageChanged);
  addEventListener("pagehide", () => {
    stream?.abort();
    document.removeEventListener("molis-work:language-changed", onLanguageChanged);
  }, { once: true });
  void start().catch(report);
}
