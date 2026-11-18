import type { BlueprintAdoptionApplyInput, BlueprintAdoptionApplyResult, BlueprintAdoptionPreviewResult, BlueprintAdoptionReadResult,
  BlueprintAdoptionTarget, BlueprintAdoptionUndoResult, BlueprintApplyStep, BlueprintDraftResult, BlueprintLibraryResult,
  BlueprintPreviewChange, UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { OwnedTextRef, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { readEventStream } from "./event-stream.js";

import type { sceneReviewPage, renderSceneReview } from "./scene-review-view.js";

export function sceneOnboarding(request: UiRequest, readStream: typeof readEventStream,
  words: (key: string, args?: Record<string, string | number>) => string, say: (ref: OwnedTextRef) => string, makePage: typeof sceneReviewPage, renderReview: typeof renderSceneReview) {
  const page = makePage(words, say, action);
  const { frame, project, error, t, button, pageUrl, sceneContext } = page;
  const api = (project ? "/projects/" + encodeURIComponent(project) : "") + "/api/blueprints/";
  const params = new URLSearchParams(location.search);
  let busy = false, cursor = 0, all = false, stream: AbortController | undefined, adopted = "", viewingResult = false;
  let draft: BlueprintDraftResult["draft"] | undefined, preview: BlueprintAdoptionPreviewResult | undefined;
  let target: BlueprintAdoptionTarget, selection = new Set<string>(), changes: BlueprintPreviewChange[] = [];
  let original: BlueprintAdoptionApplyInput | undefined, targetProject: string | undefined;
  let undo: { operation: "remove" | "revert"; request_id: string } | undefined;
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
      accepted: Boolean(original), adopted, destination: targetProject, undo: undo?.operation, applied, undone, all, results: viewingResult }, {
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
    if (status.latest_undo) { undo = status.latest_undo; for (const step of status.latest_undo.steps) undone.set(step.part_id, step); }
  }
  function remember(id: string, destination?: string | null) {
    adopted = id; targetProject = destination ?? undefined; viewingResult = true;
    history.replaceState(null, "", pageUrl(project, { adoption: id }));
  }
  function rememberReview() {
    if (preview && !adopted) history.replaceState({ cursor, part_ids: [...selection], request: original },
      "", pageUrl(project, { preview: preview.preview_id }));
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
            if (data.kind === "undo") { undo = data.undo; undone.set(data.step.part_id, data.step); }
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
    rememberReview();
    draw();
    const done = await request<BlueprintAdoptionApplyResult>(api + "apply", { body: original });
    remember(done.adoption_id, done.target.kind === "project" ? done.target.project_id : undefined);
    for (const step of done.steps) applied.set(step.part_id, step);
  }
  async function reverse(op: "revert" | "remove") {
    undo ??= { operation: op, request_id: crypto.randomUUID() };
    const done = await request<BlueprintAdoptionUndoResult>(api + undo.operation, { body: { adoption_id: adopted, request_id: undo.request_id } });
    undo = done.undo; for (const step of done.undo.steps) undone.set(step.part_id, step);
  }
  async function showPreview(current: BlueprintDraftResult["draft"], dest: BlueprintAdoptionTarget, edits: BlueprintPreviewChange[], reset = true) {
    const result = await request<BlueprintAdoptionPreviewResult>(api + "preview", { body: {
      source: current.source, target: dest, part_ids: current.blueprint.parts.map(p => p.part_id), changes: edits,
    } });
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
    const query = adoptionId ? "?id=" + encodeURIComponent(adoptionId) : previewId ? "?preview=" + encodeURIComponent(previewId) : "";
    const records = await request<BlueprintLibraryResult>(api + "library" + query);
    if (records.preview && records.adoptions[0]) {
      preview = records.preview; original = records.adoptions[0].request; const record = records.adoptions[0];
      sceneContext(record.title);
      remember(record.adoption_id, record.target.kind === "project" ? record.target.project_id : undefined);
      watch(preview.preview_id); draw(); return;
    }
    if (previewId && records.preview?.source.kind === "draft") {
      preview = records.preview; target = preview.target;
      draft = (await request<BlueprintDraftResult>(api + "draft?id=" + encodeURIComponent(records.preview.source.draft_id))).draft;
      sceneContext(draft.blueprint.title, draft.blueprint.purpose.work);
      if (draft.source.revision !== records.preview.source.revision || Date.parse(preview.expires_at) <= Date.now()) {
        preview = undefined; chooseTarget(draft); return;
      }
      changes = preview.parts.map(p => ({ part_id: p.part_id, proposal: p.proposal }));
      const saved = history.state;
      selection = new Set(preview.parts.filter(p => p.decision !== "skip" && (!Array.isArray(saved?.part_ids) || saved.part_ids.includes(p.part_id))).map(p => p.part_id));
      cursor = Number.isInteger(saved?.cursor) && preview.parts[saved.cursor] ? saved.cursor : 0;
      original = saved?.request?.preview_id === previewId ? saved.request : undefined;
      watch(previewId); draw(); return;
    }
    page.library(records);
  }
  addEventListener("pagehide", () => stream?.abort(), { once: true });
  void start().catch(report);
}
