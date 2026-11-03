import { codeOf, isAbort, messageOf, statusOf } from "./dom.js";
import type { Issue, IssuesHost, IssuesPage, PageReport, Pending, QuestionResult, SavedResult, Translate } from "./types.js";

const UNSENT = "molis:issue-unsent";
/** Beside the model's own limit: still waiting after this long, the draft is retired first so a late answer cannot save beside one made by hand. */
const ORGANIZE_LIMIT_MS = 120_000;
const MODEL_DOWN = ["actions.connection_required", "plugin.model_failed"];
const NO_WORDS_OF_OURS = ["actions.execution_failed", "plugin.model_output_invalid"];

type Stored = Omit<Pending, "images"> & { shots?: number };

/** A write to this device's storage that cannot be kept still leaves the page working. */
export function remembered(write: () => void): void {
  try { write(); } catch { return; }
}

// The page the person was on, as the shell reports it; a report, never proof of what was on screen.
const where = (host: IssuesHost): PageReport | null => {
  try { return host.page?.() ?? null; } catch { return null; }
};
// Unfinished captures are kept on this device as well, so leaving the page loses none of their words (pictures stay
// with the page) nor why one is waiting. Coming back, one that was saved meanwhile drops out once the list shows it.
// Another open Issue view keeps its own entries: each view replaces only the ones it holds.
const stored = (): Stored[] => {
  try { return JSON.parse(localStorage.getItem(UNSENT) || "[]") as Stored[]; } catch { return []; }
};
// Why naming did not work, as the person reads it on the row; the words and pictures are kept either way. A refusal with
// its own reason (a picture over the limit, too many unsaved captures, a model reply Issue cannot use) says it in its own
// words; a failure with no code of ours, an internal one, or a model answer that was not JSON has no wording worth showing.
const failureText = (L: Translate, error: unknown) => {
  const code = codeOf(error);
  if (code && MODEL_DOWN.includes(code)) return L("issues.capture.model-down");
  if (code === "actions.timeout") return L("issues.capture.timed-out");
  return code && !NO_WORDS_OF_OURS.includes(code) ? messageOf(error) : L("issues.capture.failed");
};

/**
 * A capture in the background. Sending hands the words and screenshots to a draft the Issue plugin keeps, then asks
 * Issue to name and save it (`issues.name_draft`: one call to the Host's text model inside Issue's own action, ISSUE-50);
 * the save can be undone, so nobody confirms it first. A saved record shows up in the list with Undo; anything else
 * (a question, a failure, no model) stays as a row that opens into the editor with nothing lost.
 */
export function installCapture(page: IssuesPage): void {
  const { el, state, L, scope, host } = page;
  page.remember = () => remembered(() => {
    const others = stored().filter((entry) => !state.held.has(entry.id));
    state.held = new Set(state.pending.map((item) => item.id));
    localStorage.setItem(UNSENT, JSON.stringify([...others, ...state.pending.map(({ images, state: _state, ...entry }) => ({ ...entry, shots: images.length }))]));
  });
  // The row is the one place to continue (more words, a failure): opening it shows the words and pictures as they were.
  const attention = (item: Pending, note: string, kind: "failed" | "question" = "failed") => {
    item.state = "attention";
    item.note = note;
    item.kind = kind;
    page.render();
  };
  const drop = (item: Pending) => { state.pending = state.pending.filter((entry) => entry !== item); };
  const add = (issue: Issue) => {
    state.rows = [issue, ...state.rows.filter((row) => row.id !== issue.id)];
    state.fresh = issue.id;
  };
  // Undo takes the record back while nobody has changed it, and returns the words to an empty composer.
  const undo = async (issue: Issue, item: Pending) => {
    await page.api("discard", { id: issue.id, expected_version: issue.version });
    state.rows = state.rows.filter((row) => row.id !== issue.id);
    page.render();
    if (!el.desc.value.trim() && !state.images.length) {
      el.desc.value = item.text;
      const restored = page.pictures(() => item.images);
      remembered(() => localStorage.setItem(page.storageKey, el.desc.value));
      page.paint();
      page.fit(el.desc);
      el.desc.focus();
      page.toast(L("issues.capture.undone-restored"));
      await restored;
    } else page.toast(L("issues.capture.undone"));
  };
  const saved = (item: Pending, issue: Issue) => {
    drop(item);
    add(issue);
    page.render();
    page.toast(L("issues.capture.recorded", { title: issue.title }), L("issues.capture.undo"), () => undo(issue, item));
  };
  // Retires an unfinished draft. It may have been saved meanwhile: then that record is the result.
  const release = async (item: Pending) => {
    await page.api("cancel-capture", { draft_id: item.id });
    try { return await page.read(item.id); } catch (error) {
      if (statusOf(error) !== 404) throw error;
      return null;
    }
  };
  const organize = async (item: Pending) => {
    item.state = "organizing";
    item.note = "";
    item.at = Date.now();
    page.render();
    let over = false;
    const live = () => !over && item.state === "organizing" && state.pending.includes(item);
    const overdue = () => {
      if (!live()) return;
      if (Date.now() - item.at <= ORGANIZE_LIMIT_MS) { scope.timeout(overdue, 1000); return; }
      over = true;
      release(item).then((already) => { if (already) saved(item, already); else attention(item, L("issues.capture.timed-out")); }, (error: unknown) => attention(item, messageOf(error)));
    };
    overdue();
    try {
      await page.api("prepare", { draft_id: item.id, description: item.text, images: item.images, ...(item.page ? { page: item.page } : {}) });
      const result = await page.api<SavedResult | QuestionResult>("name-draft", { draft_id: item.id });
      if (!live()) return;
      if (result.status === "saved") saved(item, result.issue);
      else attention(item, L("issues.capture.need-more", { question: L(result.question) }), "question");
    } catch (error) {
      if (isAbort(error) || !live()) return;
      // The answer was lost on the way back: the record may be there already.
      if (codeOf(error) === "ui_host.outcome_unknown" || codeOf(error) === "ui_host.invalid_response") {
        const already = await page.read(item.id).catch(() => null);
        if (already) { saved(item, already); return; }
      }
      attention(item, failureText(L, error));
    }
  };
  page.submit = async () => {
    if (state.importing || state.restoring || state.pictureWrites || (!el.desc.value.trim() && !state.images.length)) return;
    const item: Pending = { id: crypto.randomUUID(), text: el.desc.value, images: state.images, page: where(host), at: Date.now() };
    const cleared = page.pictures(() => []);
    state.pending.unshift(item);
    el.desc.value = "";
    state.images = [];
    remembered(() => localStorage.removeItem(page.storageKey));
    page.paint();
    page.fit(el.desc);
    el.desc.focus();
    try { await cleared; await organize(item); } catch (error) { attention(item, messageOf(error)); }
  };
  const settled = async (item: Pending, issue: Issue, original?: Pending) => {
    drop(item);
    add(issue);
    state.current = null;
    state.editing = false;
    await page.back();
    page.toast(L("issues.capture.recorded", { title: issue.title }), original ? L("issues.capture.undo") : "", original ? () => undo(issue, original) : null);
  };
  page.keep = async (item, data) => {
    const already = await release(item);
    if (already) return settled(item, already);
    // Retain the request identity before dispatch: a lost receipt is checked before another write.
    if (!item.manual) item.id = crypto.randomUUID();
    Object.assign(item, { manual: true, text: data.description, images: data.images, card: { title: data.title, type: data.type } });
    page.remember();
    const id = item.id;
    await page.api("prepare", { draft_id: id, description: data.description, images: data.images, ...(item.page ? { page: item.page } : {}) });
    const issue = await page.api<Issue>("capture", { draft_id: id, title: data.title, type: data.type });
    await settled(item, issue, item);
  };
  page.redo = async (item) => {
    const text = el.detailInput.value, shot = state.edits;
    if (!text.trim() && !shot.length) { page.flag(L("issues.composer.need-words")); return; }
    const already = await release(item);
    if (already) return settled(item, already);
    const next: Pending = { id: crypto.randomUUID(), text, images: shot, page: item.page, at: Date.now() };
    state.pending[state.pending.indexOf(item)] = next;
    state.current = null;
    state.editing = false;
    await page.back();
    await organize(next);
  };
  page.abandon = async (item) => {
    if (!await page.confirm(L("issues.capture.abandon-title"), L("issues.capture.abandon-text"), L("issues.editor.discard"))) return;
    const already = await release(item);
    if (already) return settled(item, already);
    drop(item);
    state.current = null;
    state.editing = false;
    await page.back();
    page.toast(L("issues.capture.abandoned"));
  };
  for (const entry of stored()) {
    state.held.add(entry.id);
    state.pending.push({ ...entry, images: [], restored: true, state: "attention", kind: entry.kind || "failed",
      note: (entry.note || L("issues.capture.unfinished")) + (entry.shots ? L("issues.capture.unfinished-shots") : "") });
  }
}
