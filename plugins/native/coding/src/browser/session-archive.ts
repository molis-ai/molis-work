import type { UiPageDialogs } from "@molis-ai/molis-work-contracts/platform/ui";

type ArchivedSession = { session_id: string; title: string; state: string };
/** One mounted page owns discovery, confirmation and the fixed request's retry, for both lifecycle directions. */
export function codingArchive(ports: {
  readonly root: HTMLElement;
  readonly listen: (target: EventTarget, name: string, callback: (event: Event) => void) => void;
  readonly api: (path: string, method?: string, body?: unknown) => Promise<{ archive_decision?: unknown; unarchive_decision?: unknown; sessions?: ArchivedSession[] }>;
  readonly path: (id: string) => string;
  readonly confirm: UiPageDialogs["confirm"];
  readonly current: () => string;
  readonly assertCurrent: () => void;
  readonly text: (key: string, values?: Record<string, string | number>) => string;
  readonly changed: (id: string, archived: boolean) => Promise<void>;
  readonly failed: (message: string) => void;
}) {
  const requests = new Map<string, { archive?: true; archive_decision?: unknown; unarchive_decision?: unknown }>();
  const panel = ports.root.querySelector<HTMLDetailsElement>("[data-coding-archived]"), list = panel?.querySelector("[data-coding-archived-list]");
  const load = async () => {
    if (!panel?.open || !list) return;
    const result = await ports.api("/sessions/archived"); ports.assertCurrent();
    if (!panel.open) return;
    list.replaceChildren();
    for (const row of result.sessions ?? []) {
      const line = document.createElement("div"); line.className = "mw-dir-row";
      const title = document.createElement("span"); title.textContent = row.title;
      const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--ghost";
      button.dataset.codingRestore = row.session_id; button.dataset.title = row.title; button.dataset.state = row.state;
      button.textContent = ports.text("coding.session.restore"); line.append(title, button); list.append(line);
    }
    if (!list.childElementCount) list.textContent = ports.text("coding.session.archived-empty");
  };
  if (panel) ports.listen(panel, "toggle", () => { if (panel.open) void load().catch(error => ports.failed(String(error))); });
  ports.listen(ports.root, "click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-coding-archive], [data-coding-restore]");
    if (!button || button.disabled) return;
    const archived = button.hasAttribute("data-coding-archive"), id = archived ? ports.current() : button.dataset.codingRestore!;
    if (!id) return;
    void (async () => {
      button.disabled = true;
      try {
        const key = (archived ? "archive:" : "restore:") + id;
        let request = requests.get(key);
        if (!request) {
          const result = await ports.api(ports.path(id) + (archived ? "/archive-preview" : "/unarchive-preview")); ports.assertCurrent();
          if (archived && ports.current() !== id) return;
          const title = archived ? ports.root.querySelector("[data-coding-title]")?.textContent ?? "" : button.dataset.title!;
          const question = archived ? ports.text("coding.session.archive-confirm") : ports.text("coding.session.restore-confirm", { title });
          if (!await ports.confirm(question)) return;
          ports.assertCurrent();
          request = archived ? { archive: true, archive_decision: result.archive_decision } : { unarchive_decision: result.unarchive_decision };
          requests.set(key, request);
        }
        await ports.api(ports.path(id) + (archived ? "" : "/unarchive"), archived ? "PATCH" : "POST", request);
        ports.assertCurrent(); requests.delete(key);
        await ports.changed(id, archived); await load();
      } catch (error) { ports.failed((error instanceof Error ? error.message : String(error)) + " " + ports.text("coding.session.lifecycle-retry")); }
      finally { button.disabled = false; }
    })();
  });
}
