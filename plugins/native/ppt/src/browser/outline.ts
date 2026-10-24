import { messageOf } from "./dom.js";
import type { OutlineAttempt, Ppt, PptPage } from "./types.js";

interface OutlinePages { documents?: { id: string; title?: string }[]; unavailable_reason?: string | null }
interface OutlineReply { presentation: Ppt; slide_count: number }

/** The outline dialog: pasted text or a Pages document turned into slides, locally or through the model. */
export function installOutline(page: PptPage): void {
  const { L, el, s } = page;
  const box = el.outBox;
  const q = <T extends Element>(selector: string): T | null => box?.querySelector<T>(selector) ?? null;
  // A reason the server gave is a sentence it wrote; the common translator knows it by its Chinese original.
  const noModel = () => (s.aiUnavailableReason ? L(s.aiUnavailableReason) : L("ppt.outline.no-model"));

  const endOutline = () => {
    const attempt = s.outline;
    s.outline = null;
    if (!attempt) return;
    attempt.controller.abort();
    attempt.submit.disabled = false;
    attempt.submit.textContent = attempt.label;
  };

  const showOutlineError = (text: string) => {
    const errorBox = q<HTMLElement>("[data-ppt-outline-error]");
    if (!errorBox) return;
    errorBox.hidden = !text;
    errorBox.textContent = text || "";
  };

  const markCurrent = (selector: string, current: (button: HTMLElement) => boolean) => {
    box?.querySelectorAll<HTMLElement>(selector).forEach((button) => {
      const on = current(button);
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-checked", String(on));
    });
  };

  const paintOutlineSource = async () => {
    if (!box) return;
    markCurrent("[data-ppt-outline-source]", (button) => button.dataset.pptOutlineSource === s.outlineKind);
    const pageField = q<HTMLElement>("[data-ppt-outline-page-field]");
    const textField = q<HTMLElement>("[data-ppt-outline-text-field]");
    const pageNote = q<HTMLElement>("[data-ppt-outline-page-note]");
    const textarea = q<HTMLTextAreaElement>("[data-ppt-outline-text]");
    const usePage = s.outlineKind === "page";
    if (textField) textField.hidden = usePage;
    if (textarea) textarea.required = !usePage;
    if (pageField) pageField.hidden = !usePage;
    if (!usePage) { if (pageNote) pageNote.hidden = true; return; }
    const select = q<HTMLSelectElement>("[data-ppt-outline-page]");
    if (select && select.dataset.loaded === "true") return;
    if (pageNote) { pageNote.hidden = false; pageNote.textContent = L("ppt.outline.loading"); }
    try {
      const payload = await page.request<OutlinePages>("GET", page.api + "/outline-pages");
      const documents = payload.documents || [];
      if (select) {
        select.replaceChildren(...documents.map((doc) => {
          const option = document.createElement("option");
          option.value = doc.id;
          option.textContent = doc.title || L("ppt.outline.untitled-doc");
          return option;
        }));
        select.dataset.loaded = "true";
      }
      if (pageNote) {
        pageNote.hidden = documents.length > 0;
        pageNote.textContent = documents.length ? "" : (payload.unavailable_reason ? L(payload.unavailable_reason) : L("ppt.outline.no-docs"));
      }
    } catch (error) {
      if (pageNote) { pageNote.hidden = false; pageNote.textContent = messageOf(error) || L("ppt.outline.docs-failed"); }
    }
  };

  page.paintOutlineModes = () => {
    if (!box) return;
    const ai = q<HTMLButtonElement>('[data-ppt-outline-mode="ai"]');
    const reason = q<HTMLElement>("[data-ppt-outline-ai-reason]");
    if (ai) { ai.disabled = !s.aiAvailable; ai.title = s.aiAvailable ? "" : noModel(); }
    if (!s.aiAvailable && s.outlineMode === "ai") s.outlineMode = "local";
    markCurrent("[data-ppt-outline-mode]", (button) => button.dataset.pptOutlineMode === s.outlineMode);
    if (reason) { reason.hidden = s.aiAvailable; reason.textContent = s.aiAvailable ? "" : noModel(); }
  };

  page.openOutline = () => {
    const open = s.selected;
    if (!box || !open) return;
    endOutline();
    showOutlineError("");
    const replace = q<HTMLInputElement>("[data-ppt-outline-replace]");
    const first = open.slides[0];
    const blank = open.slides.length === 1 && !first?.title && !first?.bullets.length && !first?.notes;
    const replaceRow = replace?.closest("label");
    if (replace && replaceRow) { replace.checked = false; replaceRow.hidden = blank; }
    page.paintOutlineModes();
    const select = q<HTMLSelectElement>("[data-ppt-outline-page]");
    if (select) delete select.dataset.loaded;
    void paintOutlineSource();
    box.showModal();
    q<HTMLElement>(s.outlineKind === "page" ? "[data-ppt-outline-page]" : "[data-ppt-outline-text]")?.focus();
  };

  const submitOutline = async () => {
    const open = s.selected;
    if (!box || !open || s.outline) return;
    const textarea = q<HTMLTextAreaElement>("[data-ppt-outline-text]");
    const text = (textarea?.value || "").trim();
    const pageId = s.outlineKind === "page" ? (q<HTMLSelectElement>("[data-ppt-outline-page]")?.value || "") : "";
    if (s.outlineKind === "page" && !pageId) { showOutlineError(L("ppt.outline.pick-first")); return; }
    if (s.outlineKind === "text" && !text) { showOutlineError(L("ppt.outline.empty-text")); textarea?.focus(); return; }
    const submit = q<HTMLButtonElement>("[data-ppt-outline-submit]");
    if (!submit) return;
    const replace = Boolean(q<HTMLInputElement>("[data-ppt-outline-replace]")?.checked);
    showOutlineError("");
    submit.disabled = true;
    const label = submit.textContent ?? "";
    const attempt: OutlineAttempt = { controller: new AbortController(), submit, label, id: open.id, revision: s.editRev, mode: s.outlineMode, source: s.outlineKind, text: textarea?.value || "" };
    s.outline = attempt;
    submit.textContent = s.outlineMode === "ai" ? L("ppt.outline.working") : label;
    try {
      await page.save();
      if (s.outline !== attempt || !box.open || s.selected?.id !== attempt.id || s.editRev !== attempt.revision) return;
      const record = page.open();
      const payload = await page.request<OutlineReply>("POST", page.api + "/" + encodeURIComponent(record.id) + (attempt.mode === "ai" ? "/outline-ai" : "/outline"),
        { ...(pageId ? { page_id: pageId } : { text }), replace, expected_version: record.version }, attempt.controller.signal);
      if (s.outline !== attempt || !box.open || s.selected?.id !== record.id || s.editRev !== attempt.revision || s.selected.version !== record.version) return;
      s.slideKey = payload.presentation.slides[replace ? 0 : Math.max(0, payload.presentation.slides.length - payload.slide_count)]?.id || s.slideKey;
      page.fillEditor(payload.presentation);
      await page.loadList();
      if (s.outline !== attempt || !box.open) return;
      const unchanged = (textarea?.value || "") === attempt.text && s.outlineMode === attempt.mode && s.outlineKind === attempt.source
        && (!pageId || q<HTMLSelectElement>("[data-ppt-outline-page]")?.value === pageId);
      if (unchanged) { if (textarea) textarea.value = ""; endOutline(); box.close(); }
      page.showNote(L("ppt.outline.done", { count: payload.slide_count }), false);
    } catch (error) {
      if (s.outline === attempt && !attempt.controller.signal.aborted) showOutlineError(messageOf(error) || L("ppt.error.request"));
    } finally {
      if (s.outline === attempt) endOutline();
    }
  };

  box?.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-ppt-outline-close]")) { endOutline(); box.close(); return; }
    const sourceButton = target.closest<HTMLElement>("[data-ppt-outline-source]");
    if (sourceButton) { s.outlineKind = sourceButton.dataset.pptOutlineSource === "page" ? "page" : "text"; void paintOutlineSource(); return; }
    const mode = target.closest<HTMLButtonElement>("[data-ppt-outline-mode]");
    if (mode && !mode.disabled) { s.outlineMode = mode.dataset.pptOutlineMode === "ai" ? "ai" : "local"; page.paintOutlineModes(); }
  });
  box?.addEventListener("cancel", endOutline);
  box?.addEventListener("close", () => { if (!box.open) endOutline(); });
  el.outlineForm?.addEventListener("submit", (event) => { event.preventDefault(); void submitOutline(); });
}
