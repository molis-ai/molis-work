import { codingArchive } from "../session-archive.js";
import { errorMessage, part } from "../dom.js";
import { renderGoalFace, renderGoalRows } from "./goals.js";
import { applyConfiguration, refreshState, rememberConfiguration } from "./configuration.js";
import { controls } from "./controls.js";
import { onClick } from "./click.js";
import { renderDirectory } from "./directory.js";
import { loadEarlier } from "./live.js";
import { renderMethods } from "./methods.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { openCodingItem, select, setAttach, surfaceChanged } from "./select.js";
import type { SessionConfiguration } from "./shapes.js";

/** What a CustomEvent carries; the page reads it by shape, since an event made in another window is not an `instanceof CustomEvent` here. */
const detailOf = <Detail>(event: Event): Detail | undefined => (event as CustomEvent<Detail | null>).detail ?? undefined;

interface SelectDetail { readonly itemId?: string }
interface AssistantEffectDetail { readonly capability_id?: unknown; readonly session_id?: unknown }
interface CharacterCodingDetail { readonly reference?: unknown; readonly title: string; readonly task?: string; readonly skill_ids?: string[]; readonly workspace_id?: string }

/** A tab of Coding is chosen or closed: the page shows that session, or the directory again. */
function listenSelect(page: Page) {
  const { lifetime, refs, root, s } = page;
  lifetime.listen(root, "molis-work:select-item", event => {
    const itemId = detailOf<SelectDetail>(event)?.itemId;
    root.dataset.codingDetail = String(Boolean(itemId));
    s.sessionOnShow = Boolean(itemId);
    if (itemId) { void openCodingItem(page, itemId).catch(error => status(page, errorMessage(error), true)); return; }
    refs.taskboard.refreshOutline();
    renderGoalFace(page);
    void refs.draft.flush().catch(error => status(page, errorMessage(error), true));
  });
}

/** The bottom Assistant can carry this same session through Coding's own actions. When it changes the session's settings or
 *  starts a round, the page takes what is saved, so its next save cannot write the old choice back. */
function listenAssistant(page: Page) {
  const { L, lifetime, q, s } = page;
  lifetime.listen(window, "molis:assistant-effect", event => {
    const detail = detailOf<AssistantEffectDetail>(event) ?? {};
    if (typeof detail.capability_id !== "string" || !detail.capability_id.startsWith("coding.") || !s.current || detail.session_id !== s.current) return;
    const id = s.current;
    void api<{ configuration?: SessionConfiguration }>(page, sessionPath(id) + "?window=1").then(data => {
      if (s.current !== id || !data.configuration) return;
      const before = s.configurations.get(id)?.intent;
      s.configurations.set(id, { ...s.configurations.get(id), ...data.configuration });
      applyConfiguration(page);
      controls(page);
      if (before !== data.configuration.intent) status(page, L("coding.intent.changed-by-assistant", { intent: q<HTMLSelectElement>("[data-coding-intent]").selectedOptions[0]?.textContent || data.configuration.intent }));
    }).catch(() => {
      // The saved choice could not be read: the full read below shows whatever the session holds.
    });
    void readCurrent(page);
  });
}

/** A Character brings a task to Coding: a session is made for it with the Character and the task saved, never started by itself. */
async function bringCharacter(page: Page, selected: CharacterCodingDetail) {
  const { L, host, input, refs, s } = page;
  const result = await api<{ session: { session_id: string } }>(page, "/sessions", "POST", { title: selected.title }), id = result.session.session_id;
  // Persist the exact publication and task before navigation; never start a paid run automatically.
  await api(page, sessionPath(id), "PATCH", { draft: selected.task || "", character: selected.reference, character_skill_ids: selected.skill_ids || [] });
  await refreshState(page);
  host.openItem("coding", id, selected.title);
  await select(page, id);
  if (selected.workspace_id) {
    s.workspaceId = selected.workspace_id;
    rememberConfiguration(page);
    await refs.draft.flush();
    await refreshState(page);
  }
  input.focus();
  status(page, L("coding.character.brought-in"));
}

function listenCharacter(page: Page) {
  const { L, lifetime, s } = page;
  lifetime.listen(window, "molis-work:character-coding", event => {
    const selected = detailOf<CharacterCodingDetail>(event);
    if (s.creatingCharacterSession || !selected?.reference) return;
    s.creatingCharacterSession = true;
    void bringCharacter(page, selected)
      .catch(error => status(page, L("coding.character.session-failed", { reason: errorMessage(error) }), true))
      .finally(() => { s.creatingCharacterSession = false; });
  });
}

/** What reaches the page from outside: its tabs, the Assistant, a Character and the earlier rounds scrolled to. */
export function mountSessionEvents(page: Page) {
  const { s, turns } = page;
  s.earlierWatch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadEarlier(page); }, { root: turns, rootMargin: "900px 0px 0px 0px" });
  listenSelect(page);
  listenAssistant(page);
  s.creatingCharacterSession = false;
  listenCharacter(page);
}

/** The composer keeps rarely used context behind one "+" so the bar stays about the task. */
function listenAttach(page: Page) {
  const { lifetime, q, refs, root } = page, menu = q("[data-coding-attach-menu]"), toggle = q("[data-coding-attach-toggle]");
  refs.attachMenu = menu;
  refs.attachToggle = toggle;
  lifetime.listen(document, "click", event => {
    if (!menu.hidden && !(event.target instanceof Element && event.target.closest("[data-coding-attach-toggle]"))) setAttach(page, false);
  });
  lifetime.listen(root, "keydown", event => {
    if ((event as KeyboardEvent).key === "Escape" && !menu.hidden) { setAttach(page, false); toggle.focus(); }
  });
  lifetime.listen(toggle, "click", () => setAttach(page, menu.hidden));
}

/** The page's own controls: every click on it, the searches, the settings of the next round. */
export function mountControlEvents(page: Page) {
  const { L, directory, lifetime, q, refs, root, s, turns } = page;
  listenAttach(page);
  codingArchive({ root, listen: lifetime.listen, api: (path, method, body) => api(page, path, method, body), path: sessionPath,
    confirm: page.host.confirm, current: () => s.current, assertCurrent: lifetime.assertCurrent, text: L,
    changed: async (id, archived) => {
      if (archived && s.current === id) {
        s.generation++; s.current = ""; s.lastRun = null; root.dataset.codingDetail = "false"; s.sessionOnShow = false;
        refs.taskboard.loading(""); renderGoalFace(page);
      }
      await refreshState(page); status(page, L(archived ? "coding.session.archived" : "coding.session.restored"));
    }, failed: message => status(page, message, true),
  });
  lifetime.listen(root, "click", event => { void onClick(page, event as MouseEvent); });
  lifetime.listen(part(directory, "[data-coding-search]"), "input", () => renderDirectory(page));
  // Late growth (a review card loading, a group opening) keeps a following reader at the newest line.
  lifetime.observe(new MutationObserver(() => { if (!s.reportRun) s.follow.pin(); }), turns, { childList: true, subtree: true, characterData: true });
  for (const field of [q("[data-coding-intent]"), q("[data-coding-model]"), q("[data-coding-effort]")]) {
    lifetime.listen(field, "change", () => {
      const id = s.current;
      rememberConfiguration(page);
      controls(page);
      void refs.draft.flush().then(() => surfaceChanged(page, id)).catch(error => status(page, L("coding.configuration.unsaved", { reason: errorMessage(error) }), true));
    });
  }
  lifetime.listen(q("[data-coding-method-search]"), "input", () => renderMethods(page));
  lifetime.listen(q("[data-coding-goal-search]"), "input", () => renderGoalRows(page));
}
