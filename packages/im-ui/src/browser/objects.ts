import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ImCtx } from "./controller-types.js";
import type { StreamKind } from "./types.js";

export function createImObjects(c: ImCtx, limit: number) {
  const { s, q, drafts, e } = c;
  const key = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
  const labels = new Map<string, string>();
  const attempted = new Set<string>();
  let searching: AbortController | undefined;
  let resolving: AbortController | undefined;
  const bridge = () => !s.authLost && s.roomState?.room.project_id && s.roomState.room.owner_id === s.member?.id ? window.molisDiscussionObjects : undefined;
  function resolveMissing(host: NonNullable<ReturnType<typeof bridge>>, subjects: readonly ActionSubject[]) {
    const room = s.roomId;
    if (!room || !s.hostVisible || document.hidden) return;
    const missing = subjects.filter(subject => {
      const k = key(subject);
      return !labels.has(k) && !attempted.has(k);
    });
    if (!missing.length) return;
    const controller = resolving ??= new AbortController();
    for (const subject of missing) {
      const k = key(subject);
      attempted.add(k);
      void host.search(room, subject.id, controller.signal).then(result => {
        if (controller.signal.aborted || bridge() !== host || s.roomId !== room) return;
        const found = result.items.find(item => item.kind === subject.kind && item.id === subject.id);
        if (found?.label) {
          labels.set(k, found.label);
          paint("group");
          paint("thread");
        }
      }).catch(() => undefined);
    }
  }
  function paint(kind: StreamKind) {
    const host = bridge(), form = c.formFor(kind), open = form.querySelector<HTMLButtonElement>("[data-im-add-object]")!;
    const target = c.target(kind), subjects = drafts.get(target)?.subjects ?? [];
    open.hidden = !host; open.disabled = subjects.length >= limit || s.busyTargets.has(target);
    open.title = uiText.text("im-ui.object.add"); open.setAttribute("aria-label", open.title);
    const fallback = uiText.text("im-ui.object.referenced");
    const removeTemplate = uiText.text("im-ui.object.remove", { title: "" });
    const root = form.querySelector<HTMLElement>("[data-im-draft-objects]")!;
    const signature = JSON.stringify([Boolean(host), fallback, removeTemplate, subjects.map(subject => [key(subject), labels.get(key(subject))])]);
    if (host && subjects.length) resolveMissing(host, subjects);
    if (root.dataset.signature === signature) return;
    root.dataset.signature = signature; root.replaceChildren();
    if (!host) return;
    for (const [index, subject] of subjects.entries()) {
      const title = labels.get(key(subject)) || fallback;
      const button = document.createElement("button"); button.type = "button"; button.className = "im-object-chip";
      button.textContent = title + " ×"; button.setAttribute("aria-label", uiText.text("im-ui.object.remove", { title }));
      button.onclick = event => {
        if (!event.isTrusted || target !== c.target(kind) || s.busyTargets.has(target)) return;
        drafts.objects(target, subjects.filter((_, at) => at !== index)); paint(kind); c.syncComposer(kind); open.focus();
      };
      root.append(button);
    }
  }
  function picker(kind: StreamKind) {
    const host = bridge(), target = c.target(kind), room = s.roomId, before = s.epoch;
    if (!host || !target || !s.hostVisible) return;
    const label = uiText.text("im-ui.object.search");
    c.openDialog(uiText.text("im-ui.object.add"), '<label class="im-field">' + e(label) + '<input type="search" maxlength="200" placeholder="' + e(label) + '"></label><div data-im-object-choices aria-live="polite"></div>');
    const input = c.dialogBody.querySelector("input")!, output = c.dialogBody.querySelector<HTMLElement>("[data-im-object-choices]")!;
    const current = () => c.dialog.open && input.isConnected && before === s.epoch && target === c.target(kind) && host === bridge() && s.hostVisible;
    input.oninput = async () => {
      searching?.abort(); output.replaceChildren();
      const query = input.value.trim(); if (!query) return;
      const request = searching = new AbortController();
      try {
        const result = await host.search(room, query, request.signal);
        if (request.signal.aborted || !current()) return;
        for (const candidate of result.items) {
          const button = document.createElement("button"); button.type = "button"; button.className = "im-search-result";
          button.textContent = candidate.label;
          if (candidate.owner) { const owner = document.createElement("small"); owner.textContent = candidate.owner; button.append(owner); }
          button.onclick = event => {
            if (!event.isTrusted || !current()) return;
            c.readDraft(kind);
            const subjects = drafts.get(target)?.subjects ?? [], subject = { kind: candidate.kind, id: candidate.id };
            if (subjects.length >= limit || subjects.some(item => key(item) === key(subject))) return;
            labels.set(key(subject), candidate.label); drafts.objects(target, [...subjects, subject]); paint(kind);
            c.dialog.close(); c.syncComposer(kind); c.inputFor(kind).focus();
          };
          output.append(button);
        }
        if (!result.items.length) output.textContent = uiText.text("im-ui.object.none");
      } catch {
        if (!request.signal.aborted && current()) output.textContent = uiText.text("im-ui.object.unavailable");
      }
    };
    input.focus();
  }
  for (const kind of ["group", "thread"] as const) {
    const button = c.formFor(kind).querySelector<HTMLButtonElement>("[data-im-add-object]")!;
    button.onclick = event => { if (event.isTrusted) picker(kind); };
  }
  c.dialog.addEventListener("close", () => searching?.abort());
  const resetLabels = () => {
    resolving?.abort();
    resolving = undefined;
    labels.clear();
    attempted.clear();
  };
  const clearStream = () => {
    searching?.abort();
    window.molisDiscussionObjects?.clear();
  };
  const clearAll = () => {
    clearStream();
    resetLabels();
  };
  window.addEventListener("pagehide", clearAll, { once: true });
  return () => {
    const host = bridge();
    if (!host) resetLabels();
    paint("group"); paint("thread");
    if (host && s.hostVisible && !document.hidden && q("[data-search]").hidden && !s.threadDraft) {
      host.update(s.roomId, q('[data-stream="' + c.activeKind() + '"]'), true);
    } else clearStream();
  };
}
