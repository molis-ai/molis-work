import { isAbort, messageOf, required } from "./dom.js";
import type { Failure, LingguangPage, Reading, Spark } from "./types.js";

const FILE_LIMIT = 25 * 1024 * 1024;

/** Reading a file or a page into a spark: the progress dialog, the link question, the local-model question and the import. */
export function installMaterial(page: LingguangPage): void {
  const { L, el, s, request, api } = page;
  const stageText = (stage: string) => {
    switch (stage) {
      case "extracting": return L("lingguang.reading.stage-extracting");
      case "fetching": return L("lingguang.reading.stage-fetching");
      case "downloading": case "model_download": return L("lingguang.reading.stage-downloading");
      case "transcribing": return L("lingguang.reading.stage-transcribing");
      case "loading": return L("lingguang.reading.stage-loading");
      case "ocr": return L("lingguang.reading.stage-ocr");
      case "frames": case "frame_ocr": return L("lingguang.reading.stage-frames");
      default: return L("lingguang.reading.loading");
    }
  };

  /** Read a file or a page with its progress shown; closing the dialog stops it. The reading, or null when stopped. */
  page.readMaterial = async (path, payload) => {
    const controller = new AbortController();
    const dialog = el.readingDialog;
    const stage = required(dialog, "[data-lingguang-reading-text]"), bar = required<HTMLProgressElement>(dialog, "[data-lingguang-reading-progress]");
    stage.textContent = L("lingguang.reading.loading");
    bar.value = 0;
    const onClose = () => controller.abort();
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    let result: Reading | null = null, failure: Failure | null = null;
    try {
      result = await molisWorkRequest.stream<Reading | null>(page.host.pluginRoute(path), { body: payload, signal: controller.signal, scope: page.life, onProgress: (event) => {
        stage.textContent = stageText(event.stage);
        if (typeof event.progress === "number") bar.value = Math.max(0, Math.min(1, event.progress));
      } });
      if (!result) throw new Error(L("lingguang.reading.empty"));
    } catch (error) { failure = error as Failure; }
    finally { dialog.removeEventListener("close", onClose); if (dialog.open) dialog.close(); }
    if (failure) {
      if (isAbort(failure)) { page.showNote(L("lingguang.reading.stopped")); return null; }
      // Transcription needs a local speech model: downloaded only on the person's yes, then the reading starts again.
      if (failure.code === "material.model_required") {
        const bytes = Number(failure.body?.details?.approximate_bytes);
        const question = bytes > 0 ? L("lingguang.reading.model-prompt-size", { mb: Math.round(bytes / 1024 / 1024) }) : L("lingguang.reading.model-prompt");
        return await page.ask(question, L("lingguang.reading.model-ok")) ? page.readMaterial(path, { ...payload, allow_model_download: true }) : null;
      }
      throw failure;
    }
    return result;
  };

  page.askLink = () => new Promise<string | null>((resolve) => {
    const dialog = el.linkDialog, input = required<HTMLInputElement>(dialog, "[data-lingguang-link-input]");
    input.value = "";
    dialog.returnValue = "cancel";
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      const value = input.value.trim();
      resolve(dialog.returnValue === "ok" && value ? value : null);
    };
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    input.focus();
  });
  required(el.linkDialog, "[data-lingguang-link-cancel]").addEventListener("click", () => el.linkDialog.close("cancel"));

  /** A reading becomes one spark, its origin and anything it could not read said in it. */
  page.keepReading = async (reading, fallbackTitle, origin) => {
    const issues = reading.partial && reading.issues && reading.issues.length
      ? L("lingguang.reading.issues", { issues: reading.issues.join(L("lingguang.reading.issue-separator")) }) : "";
    const body = [reading.text, origin, issues].filter(Boolean).join("\n\n");
    const payload = await request<{ spark: Spark }>("POST", api, { title: (reading.title || fallbackTitle).slice(0, 80), body });
    s.picks = new Set([payload.spark.id]);
    await page.loadList();
    page.fillEditor(payload.spark);
    page.placed({ verb: "created", title: payload.spark.title, object: { kind: "lingguang_spark", id: payload.spark.id } });
    if (reading.partial) page.showNote(L("lingguang.reading.partial"));
  };

  el.fileInput.addEventListener("change", () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = "";
    if (!file) return;
    void (async () => {
      if (file.size > FILE_LIMIT) throw new Error(L("lingguang.reading.too-large"));
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
      const reading = await page.readMaterial(`${api}/material`, { file_name: file.name, data_base64: btoa(binary) });
      if (reading) await page.keepReading(reading, file.name.replace(/\.[^.]+$/, ""), L("lingguang.reading.origin-file", { name: file.name }));
    })().catch((error: unknown) => page.showNote(messageOf(error), true));
  });
}
