import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { runBusy } from "./busy.js";
import { createMainlineOrganizeDialog } from "./mainline-organize.js";
import {
  renderMainlineSourceChips,
  renderMainlineSwitcherBody,
  renderMainlineSwitcherShell,
} from "./mainline-switcher-render.js";
import {
  buildWorkItemSummaries,
  itemDisplayTitle,
  otherItemsWaitingCount,
  type MainlineViewResponse,
  type WorkItemChangedDetail,
} from "./mainline-types.js";

const EMPTY_VIEW: MainlineViewResponse = {
  mainline: { revision: "", current: null, items: [], groups: [], recent: [], completed: [], completed_total: 0 },
  resolved: {},
  counts: { items: {}, groups: {} },
  sources: [],
  task_items: {},
};

export interface MainlineSwitcherHost {
  readonly projectId: string;
  route(path: string): string;
  showToast(message: string | unknown, isError?: boolean): void;
  openHome(): void;
  openObject(subject: { kind: string; id: string }): Promise<boolean>;
}

interface CraftGlobals {
  molisWorkRequest?: UiRequest;
  molisCraft?: {
    carry?(from: Element, change: () => unknown): unknown;
    turn?(target: Element | null, back?: boolean): void;
  };
  molisPlacement?: {
    card?(title: string, detail: string, actions: Array<{ label: string; primary?: boolean; run(): void }>, tone?: string): void;
  };
}

function readStoredSet(key: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStoredSet(key: string, values: ReadonlySet<string>): void {
  try { localStorage.setItem(key, JSON.stringify([...values])); } catch { /* viewer convenience only */ }
}

export function mountMainlineSwitcher(host: MainlineSwitcherHost) {
  const slot = document.querySelector<HTMLElement>("[data-corner-mainline]");
  const corner = document.querySelector<HTMLElement>("[data-top-corner]");
  const toggle = corner?.querySelector<HTMLElement>("[data-top-corner-toggle]") ?? null;
  const listEl = corner?.querySelector<HTMLElement>("[data-top-corner-list]") ?? null;
  const globals = globalThis as typeof globalThis & CraftGlobals;
  const request = globals.molisWorkRequest;
  if (!slot || !corner || !toggle || !listEl || !request || !host.projectId || host.projectId === "personal") return null;

  const GROUPS_KEY = `molis.mainline.groups:${host.projectId}`;
  const VISITED_KEY = `molis.mainline.visited:${host.projectId}`;
  const DISMISSED_KEY = `molis.mainline.example-dismissed:${host.projectId}`;
  const settingsLink = slot.dataset.settingsHref || `/projects/${encodeURIComponent(host.projectId)}/settings`;

  let view: MainlineViewResponse = EMPTY_VIEW;
  let hydrated = false;
  let lastBodyHtml = "";
  let lastChipsHtml = "";
  let query = "";
  let selectedKind = "";
  let completedExpanded = false;
  let lastCurrent: string | null | undefined;
  const collapsedGroups = readStoredSet(GROUPS_KEY);
  let needsGroupDefaults = true;
  try { needsGroupDefaults = localStorage.getItem(GROUPS_KEY) === null; } catch { /* use defaults */ }
  const visited = readStoredSet(VISITED_KEY);
  let exampleDismissed = (() => { try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; } })();

  const api = <T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> =>
    request<T>(host.route(path), { method: "POST", body });

  const closeCorner = () => {
    if (listEl.hidden) return;
    listEl.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  const openCorner = () => {
    if (listEl.hidden) toggle.click();
  };

  const paintCornerTrigger = (current: MainlineViewResponse) => {
    const id = current.mainline.current;
    const nameEl = toggle.querySelector<HTMLElement>(".top-corner-page-name");
    const ringEl = toggle.querySelector<HTMLElement>("[data-top-corner-ring]");
    const item = id ? current.mainline.items.find((entry) => entry.item_id === id) : undefined;
    const res = id ? current.resolved[id] : undefined;
    const label = id ? itemDisplayTitle(res, item?.name) : uiText.text("workbench.settings-navigation.project-home");
    if (nameEl && nameEl.textContent !== label) nameEl.textContent = label;
    toggle.toggleAttribute("data-has-work-item", Boolean(id));
    if (ringEl) {
      ringEl.hidden = !id;
      if (id) {
        const waiting = current.counts.items[id]?.waiting ?? 0;
        const dot = ringEl.querySelector<HTMLElement>(".top-corner-item-dot");
        if (dot) {
          dot.dataset.waiting = String(waiting > 0);
          dot.dataset.state = res?.state ?? "ok";
        }
      }
    }
    const projectEl = toggle.querySelector<HTMLElement>(".top-corner-project-name");
    const projectName = projectEl?.textContent?.trim() ?? "";
    const tip = toggle.getAttribute("title")?.trim() ?? "";
    const full = projectName ? `${projectName} › ${label}${tip ? ` · ${tip}` : ""}` : label;
    toggle.setAttribute("aria-label", full);
  };

  const announce = (current: MainlineViewResponse, previousId: string | null, firstEntry: boolean) => {
    const id = current.mainline.current;
    const item = id ? current.mainline.items.find((entry) => entry.item_id === id) : undefined;
    const res = id ? current.resolved[id] : undefined;
    const detail: WorkItemChangedDetail = {
      item_id: id,
      item_name: id ? itemDisplayTitle(res, item?.name) : null,
      previous_id: previousId,
      first_entry: firstEntry,
      source: item?.source ?? null,
      other_waiting: otherItemsWaitingCount(current, id),
      revision: current.mainline.revision,
      sources: current.sources,
      items: buildWorkItemSummaries(current),
      task_items: current.task_items,
    };
    document.dispatchEvent(new CustomEvent("molis-work:work-item-changed", { detail }));
  };

  const renderState = () => ({
    view,
    query,
    collapsedGroups,
    completedExpanded,
    exampleDismissed,
    selectedKind,
    settingsHref: settingsLink,
  });

  const syncHomeCurrent = () => {
    const homeBtn = slot.querySelector<HTMLElement>("[data-corner-home]");
    if (!homeBtn) return;
    if (view.mainline.current === null && document.body.dataset.desktopSurface === "home") {
      homeBtn.setAttribute("aria-current", "page");
    } else {
      homeBtn.removeAttribute("aria-current");
    }
  };

  const mountShell = () => {
    const state = renderState();
    const createVal = slot.querySelector<HTMLInputElement>("[data-mainline-create-input]")?.value ?? "";
    slot.innerHTML = renderMainlineSwitcherShell(state);
    lastBodyHtml = renderMainlineSwitcherBody(state);
    lastChipsHtml = renderMainlineSourceChips(state);
    const nextCreate = slot.querySelector<HTMLInputElement>("[data-mainline-create-input]");
    if (nextCreate && createVal) nextCreate.value = createVal;
    syncHomeCurrent();
    paintCornerTrigger(view);
  };

  const paint = () => {
    const scrollEl = slot.querySelector<HTMLElement>("[data-ml-scroll]");
    const chipsEl = slot.querySelector<HTMLElement>("[data-ml-source-chips]");
    if (!scrollEl || !chipsEl) {
      mountShell();
      return;
    }
    syncHomeCurrent();
    const state = renderState();
    const nextBody = renderMainlineSwitcherBody(state);
    if (nextBody !== lastBodyHtml) {
      lastBodyHtml = nextBody;
      scrollEl.innerHTML = nextBody;
    }
    const nextChips = renderMainlineSourceChips(state);
    if (nextChips !== lastChipsHtml) {
      lastChipsHtml = nextChips;
      chipsEl.innerHTML = nextChips;
      chipsEl.hidden = !nextChips;
    }
    paintCornerTrigger(view);
  };

  const refresh = async (emit = true): Promise<MainlineViewResponse | null> => {
    try {
      const next = await api<MainlineViewResponse>("/api/mainline/items/view", {});
      const prev = lastCurrent === undefined ? null : lastCurrent;
      const changed = lastCurrent !== undefined && lastCurrent !== next.mainline.current;
      if (needsGroupDefaults) {
        for (const group of next.mainline.groups) collapsedGroups.add(group.group_id);
        needsGroupDefaults = false;
      }
      view = next;
      hydrated = true;
      if (selectedKind && !next.sources.some((s) => s.kind === selectedKind && s.create)) selectedKind = "";
      lastCurrent = next.mainline.current;
      paint();
      if (emit) announce(next, prev, changed && Boolean(next.mainline.current && !visited.has(next.mainline.current)));
      return next;
    } catch {
      return view;
    }
  };

  const switchTo = async (itemId: string | null, originEl?: Element | null, openHomeOnNull = false) => {
    if (!hydrated && itemId !== null) await refresh(false);
    const prev = view.mainline.current;
    if (prev === itemId) {
      closeCorner();
      if (itemId === null) host.openHome();
      return;
    }
    try {
      const firstEntry = Boolean(itemId && !visited.has(itemId));
      await api("/api/mainline/switch", { item_id: itemId });
      if (itemId) {
        visited.add(itemId);
        writeStoredSet(VISITED_KEY, visited);
      }
      const next = await api<MainlineViewResponse>("/api/mainline/items/view", {});
      view = next;
      lastCurrent = next.mainline.current;
      const craft = globals.molisCraft;
      const applyVisual = () => {
        paint();
        closeCorner();
        announce(next, prev, firstEntry);
        if (itemId === null && openHomeOnNull) host.openHome();
      };
      if (originEl && craft?.carry) {
        craft.carry(originEl, applyVisual);
      } else {
        applyVisual();
        const stage = document.querySelector("[data-tab-panes]");
        if (craft?.turn && stage) craft.turn(stage, !itemId);
      }
    } catch (error) {
      host.showToast(error, true);
    }
  };

  const organize = createMainlineOrganizeDialog({
    read: () => view,
    refresh: () => refresh(false),
    call: (path, body) => api(path, body),
    toast: (msg, isErr) => host.showToast(msg, isErr),
    notifyChanged: async () => { await refresh(true); },
  });

  const runMutation = async (path: string, body: Record<string, unknown>, onSuccess?: (fresh: MainlineViewResponse) => void) => {
    try {
      await api(path, body);
      const fresh = await refresh(true);
      if (fresh && onSuccess) onSuccess(fresh);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "mainline.conflict") {
        await refresh(true);
        host.showToast(uiText.text("workbench.mainline.conflict-retry"), true);
      } else {
        host.showToast(error, true);
      }
    }
  };

  const handleComplete = (itemId: string, completed: boolean) => {
    if (!view) return;
    const item = view.mainline.items.find((entry) => entry.item_id === itemId);
    const title = itemDisplayTitle(view.resolved[itemId], item?.name);
    void runMutation("/api/mainline/items/complete", { expected_revision: view.mainline.revision, item_id: itemId, completed }, (fresh) => {
      const msg = uiText.text(completed ? "workbench.mainline.completed-toast" : "workbench.mainline.restored-toast", { name: title });
      const card = globals.molisPlacement?.card;
      if (completed && card) {
        card(msg, "", [{
          label: uiText.text("workbench.mainline.undo"),
          run: () => { void runMutation("/api/mainline/items/complete", { expected_revision: fresh.mainline.revision, item_id: itemId, completed: false }); },
        }], "done");
      } else {
        host.showToast(msg);
      }
    });
  };

  const handleClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !view) return;
    if (target.closest("[data-ml-pick-home]")) {
      // Stop bubble to top-corner.ts [data-corner-home] so host.open('home') never runs while currentWorkItemId is still set (would corrupt by-item PFG-22 layout).
      event.stopPropagation();
      void switchTo(null, target.closest("[data-ml-pick-home]"), true);
      return;
    }
    const pick = target.closest<HTMLElement>("[data-ml-pick]");
    if (pick?.dataset.mlPick) {
      if (pick.dataset.state === "missing" || pick.dataset.state === "denied") return;
      void switchTo(pick.dataset.mlPick, pick);
      return;
    }
    const groupToggle = target.closest<HTMLElement>("[data-ml-group-toggle]");
    if (groupToggle?.dataset.mlGroupToggle) {
      const gid = groupToggle.dataset.mlGroupToggle;
      if (collapsedGroups.has(gid)) collapsedGroups.delete(gid);
      else collapsedGroups.add(gid);
      writeStoredSet(GROUPS_KEY, collapsedGroups);
      paint();
      return;
    }
    if (target.closest("[data-ml-completed-toggle]")) {
      completedExpanded = !completedExpanded;
      paint();
      return;
    }
    if (target.closest("[data-ml-focus-create]")) {
      slot.querySelector<HTMLInputElement>("[data-mainline-create-input]")?.focus();
      return;
    }
    if (target.closest("[data-ml-example-dismiss]")) {
      exampleDismissed = true;
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
      paint();
      return;
    }
    if (target.closest("[data-ml-example-create]")) {
      const name = uiText.text("workbench.mainline.example-name");
      void runMutation("/api/mainline/items/create", { name }, (fresh) => {
        const created = fresh.mainline.items.at(-1);
        if (created) void switchTo(created.item_id);
      });
      return;
    }
    const kindChip = target.closest<HTMLElement>("[data-ml-create-kind]");
    if (kindChip?.dataset.mlCreateKind) {
      selectedKind = selectedKind === kindChip.dataset.mlCreateKind ? "" : kindChip.dataset.mlCreateKind;
      paint();
      slot.querySelector<HTMLInputElement>("[data-mainline-create-input]")?.focus();
      return;
    }
    if (target.closest("[data-mainline-organize-open]")) {
      closeCorner();
      void organize.open();
      return;
    }
    const doneBtn = target.closest<HTMLElement>("[data-ml-done]");
    if (doneBtn?.dataset.mlDone) {
      handleComplete(doneBtn.dataset.mlDone, true);
      return;
    }
    const restoreBtn = target.closest<HTMLElement>("[data-ml-restore]");
    if (restoreBtn?.dataset.mlRestore) {
      handleComplete(restoreBtn.dataset.mlRestore, false);
      return;
    }
    const remBtn = target.closest<HTMLElement>("[data-ml-remove]");
    if (remBtn?.dataset.mlRemove) {
      void runMutation("/api/mainline/items/remove", { expected_revision: view.mainline.revision, item_id: remBtn.dataset.mlRemove }, () => {
        host.showToast(uiText.text("workbench.mainline.removed-toast"));
      });
      return;
    }
    const pinBtn = target.closest<HTMLElement>("[data-ml-pin]");
    if (pinBtn?.dataset.mlPin && pinBtn.dataset.mlGroup) {
      const group = view.mainline.groups.find((g) => g.group_id === pinBtn.dataset.mlGroup);
      const idx = Math.max(0, group?.items.findIndex((entry) => entry.item_id === pinBtn.dataset.mlPin) ?? 0);
      void runMutation("/api/mainline/items/move", { expected_revision: view.mainline.revision, item_id: pinBtn.dataset.mlPin, group_id: pinBtn.dataset.mlGroup, index: idx, pinned: pinBtn.dataset.mlPinned !== "true" });
      return;
    }
    const up = target.closest<HTMLElement>("[data-ml-up]");
    const down = target.closest<HTMLElement>("[data-ml-down]");
    if (up || down) {
      const btn = (up ?? down)!;
      const itemId = (up ? btn.dataset.mlUp : btn.dataset.mlDown)!;
      const gid = btn.dataset.mlGroup!;
      const group = view.mainline.groups.find((g) => g.group_id === gid);
      const idx = group?.items.findIndex((entry) => entry.item_id === itemId) ?? -1;
      if (idx >= 0) {
        void runMutation("/api/mainline/items/move", { expected_revision: view.mainline.revision, item_id: itemId, group_id: gid, index: up ? Math.max(0, idx - 1) : idx + 1 });
      }
    }
  };

  slot.addEventListener("click", handleClick);
  slot.addEventListener("input", (event) => {
    const input = (event.target as Element)?.closest<HTMLInputElement>("[data-mainline-search]");
    if (!input) return;
    query = input.value;
    paint();
  });
  let creating = false;
  slot.addEventListener("submit", (event) => {
    const form = (event.target as Element)?.closest<HTMLFormElement>("[data-ml-create-form]");
    if (!form) return;
    event.preventDefault();
    if (creating) return;
    const input = form.querySelector<HTMLInputElement>("[data-mainline-create-input]");
    const submitBtn = form.querySelector<HTMLButtonElement>("[data-ml-create-submit]");
    const name = input?.value.trim() ?? "";
    if (!name) {
      input?.focus();
      return;
    }
    const kind = selectedKind;
    const payload: Record<string, unknown> = kind
      ? { create_as: { kind, name }, request_id: crypto.randomUUID() }
      : { name };
    creating = true;
    const createOnly = async () => {
      try {
        return await api<{ item?: { item_id: string } }>("/api/mainline/items/create", payload);
      } finally {
        creating = false;
      }
    };
    void runBusy(submitBtn, createOnly).then(async (res) => {
      selectedKind = "";
      if (input) input.value = "";
      host.showToast(uiText.text("workbench.mainline.created-toast", { name }));
      await refresh(false);
      if (res?.item?.item_id) await switchTo(res.item.item_id);
      else await refresh(true);
    }).catch((error) => host.showToast(error, true));
  });

  new MutationObserver(() => {
    if (!listEl.hidden) void refresh(false);
  }).observe(listEl, { attributes: true, attributeFilter: ["hidden"] });

  document.addEventListener("molis-work:work-item-switch", (event) => {
    const detail = (event as CustomEvent<{ item_id?: string | null; open_switcher?: boolean; previous?: boolean; open_organize?: boolean }>).detail ?? {};
    if (detail.open_switcher) {
      openCorner();
      return;
    }
    if (detail.open_organize) {
      closeCorner();
      void organize.open();
      return;
    }
    if (detail.previous) {
      const done = new Set(view?.mainline.completed ?? []);
      const prev = view?.mainline.recent.find((id) => id !== view?.mainline.current && !done.has(id)) ?? null;
      void switchTo(prev);
      return;
    }
    if ("item_id" in detail) void switchTo(detail.item_id ?? null);
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.code === "BracketLeft") {
      if (event.target instanceof Element && event.target.closest(".xterm, input, textarea, [contenteditable]")) return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent("molis-work:work-item-switch", { detail: { previous: true } }));
    }
  });

  document.addEventListener("molis-work:language-changed", () => mountShell());
  document.addEventListener("molis-work:plugins-changed", () => { if (hydrated) void refresh(true); });
  window.addEventListener("molis:placement-changed", () => { if (hydrated) void refresh(true); });

  // Mount the stable frame synchronously (zero network requests) so opening never shifts 「项目主页」, 「项目设置」, or 「全部项目」.
  mountShell();

  // N53: ride the page's single `/api/attention` read on boot so projects with zero work items send zero extra HTTP requests until the person opens the switcher.
  let bootChecked = false;
  document.addEventListener("molis-work:attention", (event) => {
    if (bootChecked || hydrated) return;
    bootChecked = true;
    const summary = (event as CustomEvent<{ mainline_summary?: { has_items?: boolean; current?: string | null } }>).detail?.mainline_summary;
    if (!summary || summary.has_items || summary.current) void refresh(true);
  });
  return { refresh, switchTo, openOrganize: () => organize.open(), current: () => view.mainline.current };
}
