import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "./dom.js";
export interface SavedHistory {
  readonly total: number;
  readonly state?: string;
  readonly offset: number;
  readonly runs: readonly { readonly run_id: string; readonly outcome: string; readonly messages: readonly { readonly role: string; readonly text: string }[] }[];
}
/** Imported history is a transcript; original approval controls never become live. */
export function showSavedHistory(turns: HTMLElement, history: SavedHistory | undefined, load: (before: number) => Promise<void>, force = false) {
  let section = turns.querySelector<HTMLElement>("[data-coding-saved-history]");
  if (!history?.total) {
    section?.remove();
    return;
  }
  turns.querySelector("[data-coding-welcome]")?.remove();
  if (section && history.state && section.dataset.historyState === history.state && !force) return;
  if (!section) {
    section = document.createElement("section");
    section.dataset.codingSavedHistory = "";
    turns.prepend(section);
  }
  section.dataset.historyState = history.state || "";
  section.dataset.historyTotal = String(history.total);
  section.replaceChildren();
  const title = document.createElement("p");
  title.dataset.codingSavedHistoryTitle = "";
  title.textContent = uiText.text("coding.saved-history.title", { count: history.total });
  section.append(title);
  if (history.offset) {
    const earlier = document.createElement("button");
    earlier.type = "button";
    earlier.className = "mw-btn mw-btn--ghost";
    earlier.dataset.codingSavedHistoryEarlier = "";
    earlier.textContent = uiText.text("coding.saved-history.earlier");
    earlier.onclick = async () => {
      earlier.disabled = true;
      section?.querySelector("[role=status]")?.remove();
      try {
        await load(history.offset);
      } catch (error) {
        const note = document.createElement("p");
        note.role = "status";
        note.textContent = errorMessage(error) || uiText.text("coding.saved-history.load-failed");
        section?.append(note);
      } finally {
        earlier.disabled = false;
      }
    };
    section.append(earlier);
  }
  for (const run of history.runs) {
    const item = document.createElement("details");
    const label = document.createElement("summary");
    label.textContent = `${run.run_id} · ${run.outcome}`;
    item.append(label);
    item.open = true;
    for (const message of run.messages) {
      const line = document.createElement("pre");
      line.style.whiteSpace = "pre-wrap";
      line.style.overflowWrap = "anywhere";
      line.textContent = `${message.role} · ${message.text}`;
      item.append(line);
    }
    section.append(item);
  }
}

export function retitleSavedHistory(turns: HTMLElement) {
  const section = turns.querySelector<HTMLElement>("[data-coding-saved-history]");
  if (!section) return;
  const title = section.querySelector<HTMLElement>("[data-coding-saved-history-title]");
  if (title) title.textContent = uiText.text("coding.saved-history.title", { count: Number(section.dataset.historyTotal || 0) });
  const earlier = section.querySelector<HTMLElement>("[data-coding-saved-history-earlier]");
  if (earlier) earlier.textContent = uiText.text("coding.saved-history.earlier");
}
