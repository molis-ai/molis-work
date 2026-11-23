import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml as e, icon, renderButton, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { MainlineContentEntryView, WorkItemChangedDetail, WorkItemSummary } from "./mainline-types.js";

export interface WorkItemContentsHost {
  route(path: string): string;
  showToast(message: string | unknown, isError?: boolean): void;
  openItem(surface: string, id: string, title: string): void;
  openBeside(surface: string, id?: string, title?: string): void;
  openObject(subject: ActionSubject): Promise<boolean>;
  refreshMainline(): Promise<unknown>;
}

interface PlacementToastGlobal {
  molisWorkRequest?: UiRequest;
  molisPlacement?: {
    card?(title: string, detail: string, actions: Array<{ label: string; primary?: boolean; run(): void }>, tone?: string): void;
  };
}

function renderContentsEntries(entries: readonly MainlineContentEntryView[]): string {
  if (!entries.length) {
    return `<p class="side-ic-empty" data-side-ic-empty>${e(uiText.text("workbench.mainline.contents-empty"))}</p>`;
  }
  const byKind = new Map<string, MainlineContentEntryView[]>();
  for (const entry of entries) {
    const key = entry.state === "ok" ? entry.kind_label : entry.subject.kind;
    byKind.set(key, [...(byKind.get(key) ?? []), entry]);
  }
  return [...byKind.entries()].map(([groupLabel, list]) => {
    const rows = list.map((entry) => {
      const key = `${entry.subject.kind}|${entry.subject.id}`;
      if (entry.state !== "ok") {
        const statusWord = uiText.text(entry.state === "denied" ? "workbench.mainline.item-denied" : "workbench.mainline.item-missing");
        return `<div class="side-ic-row" data-state="${entry.state}" data-ic-entry="${e(key)}">`
          + `<div class="side-ic-open"><strong>${e(statusWord)}</strong></div>`
          + (entry.removable
            ? `<div class="side-ic-acts"><button class="ml-icon-btn" type="button" data-ic-release="${e(key)}" aria-label="${e(uiText.text("workbench.mainline.take-out"))}" title="${e(uiText.text("workbench.mainline.take-out"))}">${icon("x")}</button></div>`
            : "")
          + `</div>`;
      }
      const sub = uiText.text(entry.origin === "held" ? "workbench.mainline.origin-held" : "workbench.mainline.origin-related");
      return `<div class="side-ic-row" data-state="ok" data-ic-entry="${e(key)}">`
        + `<button class="side-ic-open" type="button" data-ic-open="${e(key)}"><strong>${e(entry.title)}</strong><small>${e(sub)}</small></button>`
        + `<div class="side-ic-acts">`
        + (entry.open ? `<button class="ml-icon-btn" type="button" data-ic-beside="${e(key)}" aria-label="${e(uiText.text("workbench.mainline.open-beside"))}" title="${e(uiText.text("workbench.mainline.open-beside"))}">${icon("panel")}</button>` : "")
        + (entry.removable ? `<button class="ml-icon-btn" type="button" data-ic-release="${e(key)}" aria-label="${e(uiText.text("workbench.mainline.take-out"))}" title="${e(uiText.text("workbench.mainline.take-out"))}">${icon("x")}</button>` : "")
        + `</div></div>`;
    }).join("");
    return `<section class="side-ic-group"><h3 class="side-ic-group-title">${e(groupLabel)}</h3>${rows}</section>`;
  }).join("");
}

export function mountWorkItemContents(host: WorkItemContentsHost) {
  const root = document.querySelector<HTMLElement>("[data-side-item-contents]");
  const tabBtn = document.querySelector<HTMLElement>('[data-side-tab="item-contents"]');
  const globals = globalThis as typeof globalThis & PlacementToastGlobal;
  const request = globals.molisWorkRequest;
  if (!root || !request) return null;

  let currentItemId: string | null = null;
  let currentItemName: string | null = null;
  let allItems: readonly WorkItemSummary[] = [];
  let entries: readonly MainlineContentEntryView[] = [];

  const api = <T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> =>
    request<T>(host.route(path), { method: "POST", body });

  const paint = () => {
    if (tabBtn) tabBtn.hidden = !currentItemId;
    if (!currentItemId) {
      root.innerHTML = `<div class="side-ic-head"><strong>${e(uiText.text("workbench.mainline.contents-title"))}</strong></div>`
        + `<div class="side-ic-body"><p class="side-ic-empty">${e(uiText.text("workbench.mainline.contents-no-item"))}</p></div>`;
      return;
    }
    root.innerHTML = `<div class="side-ic-head"><strong>${e(uiText.text("workbench.mainline.contents-title"))}${currentItemName ? ` · ${e(currentItemName)}` : ""}</strong>`
      + renderButton({ variant: "ghost", size: "sm", icon: "plus", label: uiText.text("workbench.mainline.add-things"), attrs: { "data-ic-add": currentItemId } })
      + `</div><div class="side-ic-body">${renderContentsEntries(entries)}</div>`;
  };

  const load = async () => {
    if (!currentItemId) {
      entries = [];
      paint();
      return;
    }
    const readingFor = currentItemId;
    try {
      const res = await api<{ entries?: MainlineContentEntryView[] }>("/api/mainline/items/contents/view", { item_id: readingFor });
      if (readingFor !== currentItemId) return;
      entries = res.entries ?? [];
      paint();
    } catch {
      if (readingFor === currentItemId) paint();
    }
  };

  const openHoldDialog = async (subject: ActionSubject, title?: string) => {
    try {
      const [cand, list] = await Promise.all([
        api<{ targets: Array<{ subject: ActionSubject; current?: boolean }> }>("/api/mainline/holds/candidates", { subject }),
        api<{ targets: ActionSubject[] }>("/api/mainline/holds/list", { subject }),
      ]);
      const heldSet = new Set(list.targets.map((t) => t.id));
      const nameOf = (id: string) => allItems.find((item) => item.item_id === id)?.name || id;
      const dlg = document.createElement("dialog");
      dlg.className = "mw-dialog ml-hold-dialog";
      dlg.dataset.mainlineHoldDialog = "";
      const rows = cand.targets.map((t) => {
        const checked = heldSet.has(t.subject.id) ? " checked" : "";
        return `<label class="ml-hold-choice"><input type="checkbox" name="item" value="${e(t.subject.id)}"${checked}><span>${e(nameOf(t.subject.id))}</span></label>`;
      }).join("");
      dlg.innerHTML = `<div class="ml-hold-shell">`
        + `<h2>${e(uiText.text("workbench.mainline.hold-dialog-title"))}${title ? ` · ${e(title)}` : ""}</h2>`
        + `<p>${e(uiText.text("workbench.mainline.hold-dialog-desc"))}</p>`
        + `<div class="ml-hold-list" data-hold-list>${rows || `<p class="side-ic-empty">${e(uiText.text("workbench.mainline.empty-title"))}</p>`}</div>`
        + `<form class="ml-hold-create" data-hold-create>`
        + `<input class="ml-create-input" type="text" data-hold-new-name maxlength="200" placeholder="${e(uiText.text("workbench.mainline.hold-new-placeholder"))}">`
        + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.hold-new-button"), attrs: { type: "submit" } })
        + `</form>`
        + `<div class="ml-hold-foot">${renderButton({ variant: "secondary", size: "sm", label: uiText.text("common.control.close"), attrs: { "data-hold-close": "" } })}</div></div>`;
      document.body.append(dlg);
      dlg.addEventListener("close", () => dlg.remove());
      dlg.addEventListener("click", (ev) => {
        if ((ev.target as Element)?.closest("[data-hold-close]")) dlg.close();
      });
      dlg.addEventListener("change", (ev) => {
        const box = (ev.target as Element)?.closest<HTMLInputElement>('input[name="item"]');
        if (!box) return;
        const path = box.checked ? "/api/mainline/holds/bind" : "/api/mainline/holds/release";
        void api(path, { subject, target: { kind: "work_item", id: box.value } }).then(async () => {
          host.showToast(uiText.text("workbench.mainline.hold-saved-toast"));
          await Promise.all([load(), host.refreshMainline()]);
        }).catch((err) => {
          box.checked = !box.checked;
          host.showToast(err, true);
        });
      });
      dlg.addEventListener("submit", (ev) => {
        const form = (ev.target as Element)?.closest<HTMLFormElement>("[data-hold-create]");
        if (!form) return;
        ev.preventDefault();
        const input = form.querySelector<HTMLInputElement>("[data-hold-new-name]");
        const name = input?.value.trim() ?? "";
        if (!name) return;
        void api("/api/mainline/holds/create", { subject, name }).then(async () => {
          dlg.close();
          host.showToast(uiText.text("workbench.mainline.put-in-toast"));
          await Promise.all([load(), host.refreshMainline()]);
        }).catch((err) => host.showToast(err, true));
      });
      dlg.showModal();
    } catch (error) {
      host.showToast(error, true);
    }
  };

  const openPickObject = async (itemId: string) => {
    try {
      const sourcesRes = await request<{
        sources?: Array<{
          id: string;
          title: string;
          plugin_id?: string;
          state?: string;
          page?: { entries?: Array<{ title: string; subject?: ActionSubject }> };
        }>;
      }>(host.route("/api/side/files/sources?first_pages=1"), { method: "GET" });
      const objects: Array<{ title: string; group: string; subject: ActionSubject }> = [];
      for (const source of sourcesRes.sources ?? []) {
        if (source.state !== "ready") continue;
        const groupTitle = source.plugin_id === "system.materials" ? uiText.text("workbench.side-panel-files.folder") : source.title;
        for (const row of source.page?.entries ?? []) {
          if (row.subject) objects.push({ title: row.title, group: groupTitle, subject: row.subject });
        }
      }
      const dlg = document.createElement("dialog");
      dlg.className = "mw-dialog ml-hold-dialog";
      dlg.dataset.mainlinePickObjectDialog = "";
      const listHtml = objects.length
        ? objects.slice(0, 60).map((obj, idx) => `<div class="side-ic-row"><div class="side-ic-open"><strong>${e(obj.title)}</strong><small>${e(obj.group)}</small></div>`
          + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.put-in"), attrs: { "data-pick-obj": String(idx) } })
          + `</div>`).join("")
        : `<p class="side-ic-empty">${e(uiText.text("workbench.mainline.pick-object-empty"))}</p>`;
      dlg.innerHTML = `<div class="ml-hold-shell"><h2>${e(uiText.text("workbench.mainline.pick-object-title"))}</h2>`
        + `<div class="ml-hold-list">${listHtml}</div>`
        + `<div class="ml-hold-foot">${renderButton({ variant: "secondary", size: "sm", label: uiText.text("common.control.close"), attrs: { "data-pick-close": "" } })}</div></div>`;
      document.body.append(dlg);
      dlg.addEventListener("close", () => dlg.remove());
      dlg.addEventListener("click", (ev) => {
        const el = ev.target instanceof Element ? ev.target : null;
        if (el?.closest("[data-pick-close]")) {
          dlg.close();
          return;
        }
        const btn = el?.closest<HTMLElement>("[data-pick-obj]");
        if (!btn?.dataset.pickObj) return;
        const chosen = objects[Number(btn.dataset.pickObj)];
        if (!chosen) return;
        void api("/api/mainline/holds/bind", { subject: chosen.subject, target: { kind: "work_item", id: itemId } }).then(async () => {
          dlg.close();
          host.showToast(uiText.text("workbench.mainline.put-in-toast"));
          await Promise.all([load(), host.refreshMainline()]);
        }).catch((err) => host.showToast(err, true));
      });
      dlg.showModal();
    } catch (error) {
      host.showToast(error, true);
    }
  };

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const addBtn = target.closest<HTMLElement>("[data-ic-add]");
    if (addBtn?.dataset.icAdd) {
      void openPickObject(addBtn.dataset.icAdd);
      return;
    }
    const openBtn = target.closest<HTMLElement>("[data-ic-open]");
    if (openBtn?.dataset.icOpen) {
      const entry = entries.find((one) => `${one.subject.kind}|${one.subject.id}` === openBtn.dataset.icOpen);
      if (!entry) return;
      if (entry.open) host.openItem(entry.open.surface, entry.open.id, entry.open.title);
      else void host.openObject(entry.subject);
      return;
    }
    const besideBtn = target.closest<HTMLElement>("[data-ic-beside]");
    if (besideBtn?.dataset.icBeside) {
      const entry = entries.find((one) => `${one.subject.kind}|${one.subject.id}` === besideBtn.dataset.icBeside);
      if (entry?.open) host.openBeside(entry.open.surface, entry.open.id, entry.open.title);
      return;
    }
    const relBtn = target.closest<HTMLElement>("[data-ic-release]");
    if (relBtn?.dataset.icRelease && currentItemId) {
      const entry = entries.find((one) => `${one.subject.kind}|${one.subject.id}` === relBtn.dataset.icRelease);
      const itemId = currentItemId;
      if (!entry) return;
      void api("/api/mainline/holds/release", { subject: entry.subject, target: { kind: "work_item", id: itemId } }).then(async () => {
        await Promise.all([load(), host.refreshMainline()]);
        const card = globals.molisPlacement?.card;
        const msg = uiText.text("workbench.mainline.taken-out-toast");
        if (card) {
          card(msg, "", [{
            label: uiText.text("workbench.mainline.undo"),
            run: () => {
              void api("/api/mainline/holds/bind", { subject: entry.subject, target: { kind: "work_item", id: itemId } })
                .then(() => Promise.all([load(), host.refreshMainline()]));
            },
          }], "done");
        } else {
          host.showToast(msg);
        }
      }).catch((err) => host.showToast(err, true));
    }
  });

  document.addEventListener("molis-work:work-item-changed", (event) => {
    const detail = (event as CustomEvent<WorkItemChangedDetail>).detail;
    currentItemId = detail.item_id;
    currentItemName = detail.item_name;
    allItems = detail.items;
    void load();
  });

  document.addEventListener("molis-work:work-item-hold-open", (event) => {
    const detail = (event as CustomEvent<{ subject?: ActionSubject; title?: string; mode?: "hold" | "as-item" }>).detail;
    if (!detail?.subject) return;
    if (detail.mode === "as-item") {
      void api<{ item?: { item_id: string } }>("/api/mainline/items/create", { from: detail.subject }).then(async (res) => {
        await host.refreshMainline();
        const card = globals.molisPlacement?.card;
        const msg = uiText.text("workbench.mainline.created-toast", { name: detail.title || detail.subject!.id });
        if (card && res?.item?.item_id) {
          const itemId = res.item.item_id;
          card(msg, "", [{
            label: uiText.text("workbench.mainline.switch-to"),
            primary: true,
            run: () => document.dispatchEvent(new CustomEvent("molis-work:work-item-switch", { detail: { item_id: itemId } })),
          }], "done");
        } else {
          host.showToast(msg);
        }
      }).catch((err) => host.showToast(err, true));
      return;
    }
    void openHoldDialog(detail.subject, detail.title);
  });

  document.addEventListener("molis:side-shown", (event) => {
    const detail = (event as CustomEvent<{ tab?: string; open?: boolean }>).detail;
    if (detail?.open && detail.tab === "item-contents") void load();
  });

  document.addEventListener("molis-work:language-changed", () => paint());
  paint();
  return { load, openPickObject, openHoldDialog };
}
