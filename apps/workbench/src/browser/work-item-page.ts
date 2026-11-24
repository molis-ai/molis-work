import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkLineEvent, WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { escapeHtml as e, icon, renderButton, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { runBusy } from "./busy.js";
import type { MainlineSourceView, WorkItemChangedDetail, WorkItemSummary } from "./mainline-types.js";

function plainLine(value: string): string {
  return value.replace(/```[^\n]*/gu, " ").replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/gu, "$1").replace(/^[ \t]*(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gmu, "")
    .replace(/\*\*|__|~~|`/gu, "").replace(/\s+/gu, " ").trim();
}

function renderEventGlyph(ev: WorkLineEvent): string {
  if (ev.suggestion) return `<i class="work-dg" data-g="sug" aria-hidden="true"></i>`;
  if (ev.waiting) return `<i class="work-dg" data-g="you" aria-hidden="true"></i>`;
  if (ev.wing === "done") return `<span class="work-dg" data-g="done" aria-hidden="true">${icon("check")}</span>`;
  if (ev.tasks.running > 0) return `<i class="work-dg" data-g="run" aria-hidden="true"></i>`;
  return `<i class="work-dg" data-g="next" aria-hidden="true"></i>`;
}

const WORK_ITEM_SYSTEM_OWNER = "work-item";

export interface WorkItemPageHost {
  route(path: string): string;
  showToast(message: string | unknown, isError?: boolean): void;
  openSurface(surface: string): void;
  openItem(surface: string, id: string, title: string): void;
  startAssistant(): void;
  openContents(): void;
  refreshMainline(): Promise<unknown>;
  openPickObject(itemId: string): void;
}

function classifyEvent(event: WorkLineEvent): "you" | "now" | "next" | "done" {
  const s = event.line_state ?? "";
  if (event.waiting || s === "answer" || s === "approval" || s === "reauth" || s === "failed" || s === "verify" || s === "interrupted") return "you";
  if (event.wing === "done" || s === "done" || s === "saved" || s === "round-ended") return "done";
  if ((s === "running" || s === "queued" || event.tasks.running > 0) && !event.suggestion) return "now";
  return "next";
}

function renderSection(title: string, events: readonly WorkLineEvent[], isYou: boolean): string {
  if (!events.length) return "";
  const rows = events.map((ev) => {
    const glyph = renderEventGlyph(ev);
    const note = plainLine(ev.summary || ev.origin.title);
    return `<button class="ml-item-event-row" type="button" data-item-page-event="${e(ev.id)}" data-waiting="${isYou}">${glyph}`
      + `<span class="ml-item-event-body"><strong>${e(plainLine(ev.title))}</strong>${note ? `<small>${e(note)}</small>` : ""}</span>`
      + `${icon("chevron-right")}</button>`;
  }).join("");
  return `<section class="ml-item-section"><h2 class="ml-item-section-head"><span>${e(title)}</span><em>${events.length}</em></h2><div class="ml-item-section-list">${rows}</div></section>`;
}

export function mountWorkItemPage(host: WorkItemPageHost) {
  const request = (globalThis as { molisWorkRequest?: UiRequest }).molisWorkRequest;
  if (!request) return null;

  let marker = document.querySelector<HTMLElement>(`[data-system-view-owner="${WORK_ITEM_SYSTEM_OWNER}"]`);
  if (!marker) {
    marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.systemViewOwner = WORK_ITEM_SYSTEM_OWNER;
    marker.dataset.systemViewIcon = "flag";
    document.body.append(marker);
  }

  let items: readonly WorkItemSummary[] = [];
  let sources: readonly MainlineSourceView[] = [];
  let revision = "";
  let lineEvents: readonly WorkLineEvent[] = [];
  let currentItemId: string | null = null;
  let renamingFor: string | null = null;
  const openTabs = new Map<string, { itemId: string; root: HTMLElement }>();

  const api = <T = unknown>(path: string, body: Record<string, unknown>): Promise<T> =>
    request<T>(host.route(path), { method: "POST", body });

  const isContentsPaneOpen = (): boolean =>
    document.body.dataset.sideOpen === "true" && Boolean(document.querySelector('[data-side-body="item-contents"]:not([hidden])'));

  const renderBodyHtml = (itemId: string): string => {
    const isCurrent = itemId === currentItemId;
    const events = isCurrent ? lineEvents : [];
    const byGroup = { you: [] as WorkLineEvent[], now: [] as WorkLineEvent[], next: [] as WorkLineEvent[], done: [] as WorkLineEvent[] };
    for (const ev of events) byGroup[classifyEvent(ev)].push(ev);
    const hasSections = byGroup.you.length + byGroup.now.length + byGroup.next.length + byGroup.done.length > 0;
    const dialogOpen = !document.querySelector<HTMLElement>("[data-assistant-panel]")?.hidden;
    return hasSections
      ? `<div class="ml-item-sections">`
        + renderSection(uiText.text("workbench.mainline.section-you"), byGroup.you, true)
        + renderSection(uiText.text("workbench.mainline.section-now"), byGroup.now, false)
        + renderSection(uiText.text("workbench.mainline.section-next"), byGroup.next, false)
        + renderSection(uiText.text("workbench.mainline.section-done"), byGroup.done, false)
        + `</div>`
      : `<div class="ml-item-empty" data-item-page-empty>`
        + `<h2>${e(uiText.text("workbench.mainline.page-empty-title"))}</h2>`
        + `<p>${e(uiText.text("workbench.mainline.page-empty-body"))}</p>`
        + `<div class="ml-item-empty-acts">`
        + renderButton({ variant: dialogOpen ? "secondary" : "primary", size: "sm", label: uiText.text("workbench.mainline.add-things"), attrs: { "data-item-page-add": itemId } })
        + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.start-with-assistant"), attrs: { "data-item-page-ask": "" } })
        + `</div></div>`;
  };

  const renderPage = (itemId: string, root: HTMLElement, force = false) => {
    const item = items.find((entry) => entry.item_id === itemId);
    if (!item) return;
    // Preserve active inline rename input and caret when background attention/refresh events arrive.
    if (!force && renamingFor === itemId && root.querySelector("[data-item-page-rename-form]")) {
      const bodySlot = root.querySelector<HTMLElement>("[data-item-page-body]");
      if (bodySlot) bodySlot.innerHTML = renderBodyHtml(itemId);
      return;
    }
    const creatable = item.light ? sources.filter((s) => s.create) : [];
    const convertButtons = creatable.map((src) => renderButton({
      variant: "secondary",
      size: "sm",
      label: uiText.text("workbench.mainline.convert-to", { kind: src.label }),
      attrs: { "data-item-page-convert": src.kind, "data-item-page-id": itemId },
    })).join("");

    const titleArea = renamingFor === itemId
      ? `<form class="ml-item-rename-form" data-item-page-rename-form="${e(itemId)}">`
        + `<input class="mw-input" type="text" data-item-page-rename-input value="${e(item.name)}" maxlength="200" required>`
        + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.save-name"), attrs: { type: "submit", "data-item-page-rename-save": "" } })
        + renderButton({ variant: "ghost", size: "sm", label: uiText.text("common.control.cancel"), attrs: { "data-item-page-rename-cancel": "" } })
        + `</form>`
      : `<h1>${e(item.name)}</h1>`
        + (item.light ? renderButton({ variant: "ghost", size: "sm", icon: "edit", label: uiText.text("workbench.mainline.rename-item"), attrs: { "data-item-page-rename": itemId } }) : "");

    const bodyHtml = renderBodyHtml(itemId);
    const contentsPaneOpen = isContentsPaneOpen();

    root.innerHTML = `<article class="ml-item-page" data-work-item-page="${e(itemId)}">`
      + `<header class="ml-item-page-head">`
      + `<p class="ml-item-kicker">${e(uiText.text("workbench.mainline.light-kicker"))}</p>`
      + `<div class="ml-item-title-row">${titleArea}</div>`
      + `<div class="ml-item-actions">`
      + renderButton({ variant: "secondary", size: "sm", icon: "plus", label: uiText.text("workbench.mainline.add-things"), attrs: { "data-item-page-add": itemId } })
      + (convertButtons ? `<span class="ml-item-convert-wrap">${convertButtons}</span>` : "")
      + renderButton({ variant: "secondary", size: "sm", icon: "check", label: uiText.text("workbench.mainline.mark-done"), attrs: { "data-item-page-complete": itemId } })
      + renderButton({ variant: "ghost", size: "sm", icon: "x", label: uiText.text("workbench.mainline.remove-item"), className: "ml-item-remove-btn", attrs: { "data-item-page-remove": itemId } })
      + `</div></header><div data-item-page-body>${bodyHtml}</div>`
      + `<footer class="ml-item-contents-strip"${contentsPaneOpen ? " hidden" : ""}><span>${e(uiText.text("workbench.mainline.contents-title"))}</span>`
      + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.view-contents"), attrs: { "data-item-page-contents": "" } })
      + `</footer></article>`;
  };

  const repaintAll = (force = false) => {
    for (const { itemId, root } of openTabs.values()) renderPage(itemId, root, force);
  };

  const confirmRemove = (itemId: string, name: string) => {
    const dlg = document.createElement("dialog");
    dlg.className = "mw-dialog ml-hold-dialog";
    dlg.innerHTML = `<div class="ml-hold-shell"><h2>${e(uiText.text("workbench.mainline.remove-confirm-title", { name }))}</h2>`
      + `<p>${e(uiText.text("workbench.mainline.remove-confirm-body"))}</p>`
      + `<div class="ml-hold-foot">`
      + renderButton({ variant: "secondary", size: "sm", label: uiText.text("common.control.cancel"), attrs: { "data-rem-cancel": "" } })
      + renderButton({ variant: "danger", size: "sm", label: uiText.text("workbench.mainline.remove-item"), attrs: { "data-rem-ok": "" } })
      + `</div></div>`;
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (ev) => {
      const el = ev.target instanceof Element ? ev.target : null;
      if (el?.closest("[data-rem-cancel]")) {
        dlg.close();
        return;
      }
      const okBtn = el?.closest<HTMLElement>("[data-rem-ok]");
      if (okBtn) {
        void runBusy(okBtn, async () => {
          await api("/api/mainline/items/remove", { expected_revision: revision, item_id: itemId });
          dlg.close();
          document.dispatchEvent(new CustomEvent("molis-work:system-view-close", { detail: { owner: WORK_ITEM_SYSTEM_OWNER, id: itemId } }));
          await host.refreshMainline();
          host.showToast(uiText.text("workbench.mainline.removed-toast"));
        }).catch((err) => host.showToast(err, true));
      }
    });
    dlg.showModal();
  };

  const bindRoot = (root: HTMLElement) => {
    if (root.dataset.workItemBound) return;
    root.dataset.workItemBound = "1";
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const renameBtn = target.closest<HTMLElement>("[data-item-page-rename]");
      if (renameBtn?.dataset.itemPageRename) {
        renamingFor = renameBtn.dataset.itemPageRename;
        repaintAll(true);
        root.querySelector<HTMLInputElement>("[data-item-page-rename-input]")?.focus();
        return;
      }
      if (target.closest("[data-item-page-rename-cancel]")) {
        renamingFor = null;
        repaintAll(true);
        return;
      }
      const addBtn = target.closest<HTMLElement>("[data-item-page-add]");
      if (addBtn?.dataset.itemPageAdd) {
        host.openPickObject(addBtn.dataset.itemPageAdd);
        return;
      }
      if (target.closest("[data-item-page-ask]")) {
        host.startAssistant();
        return;
      }
      if (target.closest("[data-item-page-contents]")) {
        host.openContents();
        return;
      }
      const convBtn = target.closest<HTMLElement>("[data-item-page-convert]");
      if (convBtn?.dataset.itemPageConvert && convBtn.dataset.itemPageId) {
        const kind = convBtn.dataset.itemPageConvert;
        const id = convBtn.dataset.itemPageId;
        const label = sources.find((s) => s.kind === kind)?.label ?? kind;
        void runBusy(convBtn, async () => {
          const res = await api<{ item?: { source?: { kind: string; id: string } } }>("/api/mainline/items/convert", {
            expected_revision: revision,
            item_id: id,
            kind,
            request_id: crypto.randomUUID(),
          });
          document.dispatchEvent(new CustomEvent("molis-work:system-view-close", { detail: { owner: WORK_ITEM_SYSTEM_OWNER, id } }));
          await host.refreshMainline();
          if (res?.item?.source) {
            const opened = await api<{ target?: { kind?: string; surface?: string; id?: string; title?: string } }>("/api/mainline/open", { subject: res.item.source }).catch(() => null);
            const to = opened?.target;
            if (to?.surface) {
              if (to.kind === "surface" || !to.id) host.openSurface(to.surface);
              else host.openItem(to.surface, to.id, to.title ?? label);
            }
          }
          host.showToast(uiText.text("workbench.mainline.converted-toast", { kind: label }));
        }).catch((err) => host.showToast(err, true));
        return;
      }
      const doneBtn = target.closest<HTMLElement>("[data-item-page-complete]");
      if (doneBtn?.dataset.itemPageComplete) {
        const id = doneBtn.dataset.itemPageComplete;
        const itemName = items.find((i) => i.item_id === id)?.name ?? "";
        void runBusy(doneBtn, async () => {
          await api("/api/mainline/items/complete", { expected_revision: revision, item_id: id, completed: true });
          const fresh = (await host.refreshMainline()) as { mainline?: { revision?: string } } | null;
          document.dispatchEvent(new CustomEvent("molis-work:system-view-close", { detail: { owner: WORK_ITEM_SYSTEM_OWNER, id } }));
          const msg = uiText.text("workbench.mainline.completed-toast", { name: itemName });
          const card = (globalThis as typeof globalThis & {
            molisPlacement?: { card?(title: string, detail: string, actions: Array<{ label: string; primary?: boolean; run(): void }>, tone?: string): void };
          }).molisPlacement?.card;
          if (card) {
            const nextRev = fresh?.mainline?.revision ?? revision;
            card(msg, "", [{
              label: uiText.text("workbench.mainline.undo"),
              run: () => {
                void api("/api/mainline/items/complete", { expected_revision: nextRev, item_id: id, completed: false })
                  .then(() => host.refreshMainline())
                  .catch((err) => host.showToast(err, true));
              },
            }], "done");
          } else {
            host.showToast(msg);
          }
        }).catch((err) => host.showToast(err, true));
        return;
      }
      const remBtn = target.closest<HTMLElement>("[data-item-page-remove]");
      if (remBtn?.dataset.itemPageRemove) {
        const id = remBtn.dataset.itemPageRemove;
        confirmRemove(id, items.find((i) => i.item_id === id)?.name ?? "");
        return;
      }
      const evBtn = target.closest<HTMLElement>("[data-item-page-event]");
      if (evBtn?.dataset.itemPageEvent) {
        const ev = lineEvents.find((one) => one.id === evBtn.dataset.itemPageEvent);
        if (ev?.open) {
          if (ev.open.kind === "surface" || !ev.open.id) host.openSurface(ev.open.surface);
          else host.openItem(ev.open.surface, ev.open.id, ev.open.title);
        }
      }
    });
    root.addEventListener("submit", (event) => {
      const form = (event.target as Element)?.closest<HTMLFormElement>("[data-item-page-rename-form]");
      if (!form?.dataset.itemPageRenameForm) return;
      event.preventDefault();
      const id = form.dataset.itemPageRenameForm;
      const input = form.querySelector<HTMLInputElement>("[data-item-page-rename-input]");
      const saveBtn = form.querySelector<HTMLButtonElement>("[data-item-page-rename-save]");
      const name = input?.value.trim() ?? "";
      if (!name) return;
      void runBusy(saveBtn, async () => {
        await api("/api/mainline/items/rename", { expected_revision: revision, item_id: id, name });
        renamingFor = null;
        await host.refreshMainline();
        repaintAll(true);
      }).catch((err) => {
        host.showToast(err, true);
        input?.focus();
      });
    });
  };

  document.addEventListener("molis-work:system-view-changed", (event) => {
    const open = ((event as CustomEvent<{ open?: Array<{ owner: string; id: string; tab_id: string }> }>).detail?.open ?? [])
      .filter((tab) => tab.owner === WORK_ITEM_SYSTEM_OWNER);
    for (const [tabId, entry] of openTabs) {
      if (!open.some((tab) => tab.tab_id === tabId) || !entry.root.isConnected) openTabs.delete(tabId);
    }
    for (const tab of open) {
      const root = document.querySelector<HTMLElement>(`[data-system-tab="${CSS.escape(tab.tab_id)}"]`);
      if (!root) continue;
      bindRoot(root);
      openTabs.set(tab.tab_id, { itemId: tab.id, root });
      renderPage(tab.id, root);
    }
  });

  document.addEventListener("molis-work:work-item-changed", (event) => {
    const detail = (event as CustomEvent<WorkItemChangedDetail>).detail;
    items = detail.items;
    sources = detail.sources;
    revision = detail.revision;
    currentItemId = detail.item_id;
    repaintAll();
  });

  document.addEventListener("molis-work:attention", (event) => {
    const line = (event as CustomEvent<{ line?: WorkLineReadResult | null }>).detail?.line;
    if (!line) return;
    lineEvents = line.events;
    repaintAll();
  });

  document.addEventListener("molis:side-shown", (event) => {
    const detail = (event as CustomEvent<{ tab?: string | null; open?: boolean }>).detail;
    const contentsPaneOpen = detail && typeof detail.open === "boolean"
      ? detail.open && detail.tab === "item-contents"
      : isContentsPaneOpen();
    for (const { root } of openTabs.values()) {
      const strip = root.querySelector<HTMLElement>(".ml-item-contents-strip");
      if (strip) strip.hidden = contentsPaneOpen;
    }
  });
  document.addEventListener("molis-work:language-changed", () => repaintAll(true));
  return { repaintAll };
}
