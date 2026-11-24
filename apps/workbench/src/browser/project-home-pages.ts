import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  HomePageApprovalReceipt,
  HomePageApprovalReadResult,
  HomePageDiffResult,
  HomePageFilesResult,
  HomePageOverview,
  HomePageRef,
  HomePageSelectResult,
  HomePageVersionSummary,
} from "@molis-ai/molis-work-contracts/services/home";
import { escapeHtml, renderAlert, t as uiText } from "./mainline-ui.js";
import { mountMergeEditor } from "./home-page-merge.js";
import { mountHomePageFrame, type MountedHomePageFrame } from "./plugin-frame/home-page-document.js";
import { runBusy } from "./busy.js";
import {
  checkedGrants,
  homePageRefKey,
  mirrorBasicPage,
  relabelApprovalDialog,
  relabelComparison,
  updateComparison,
  localizeDesignIssueReason,
  renderApprovalDialogHtml,
  renderCompareChromeParts,
  renderCompareShellHtml,
  renderHomeNoticeHtml,
  renderVersionSlotHtml,
  type InspectResponse,
} from "./project-home-pages-render.js";

interface HomePagesUiHost {
  readonly root: HTMLElement;
  readonly projectKey: string;
  readonly routePrefix: string;
  api<T>(path: string, method: "POST" | "DELETE", body?: unknown, signal?: AbortSignal): Promise<T>;
  headers(): Record<string, string>;
  receipt(message: string): void;
  onModeChange(hasGeneratedActive: boolean): void;
}

type Session = { page_session_id: string; loaded?: HomePageFilesResult };
async function mountVersion(host: HomePagesUiHost, ref: HomePageRef, container: HTMLElement, preview: boolean, signal: AbortSignal, onCrash?: (reason: string) => void) {
  const session = await host.api<Session>(preview ? "/api/home-pages/preview" : "/api/home-pages/session", "POST", preview ? { ...ref, include_files: true } : {});
  try {
    signal.throwIfAborted();
    const loaded = session.loaded;
    if (!loaded || homePageRefKey(loaded.version) !== homePageRefKey(ref)) throw new Error(uiText.text("workbench.home-pages.preview-failed"));
    return await mountHomePageFrame({ container, loaded, pageSessionId: session.page_session_id, isPreview: preview,
      routePrefix: host.routePrefix, headers: host.headers, signal, onCrash });
  } catch (error) {
    void globalThis.molisWorkRequest(host.routePrefix + "/api/home-pages/session/" + encodeURIComponent(session.page_session_id),
      { method: "DELETE", keepalive: true, headers: host.headers() }).catch(() => undefined);
    throw error;
  }
}

const craft = () =>
  (globalThis as typeof globalThis & { molisCraft?: { land?: (node: Element) => void; turn?: (node: Element, back?: boolean) => void } }).molisCraft;

/**
 * Mounts generated-page live runtime, Plan B side-by-side comparison, Check Summary, Edit Conflict, version popover,
 * adoption/restore dialog, and automatic fallback inside 36A's 「项目的第一页」 body slot (Batch 37-1).
 */
export function mountHomePages(host: HomePagesUiHost) {
  const versionHost = host.root.querySelector<HTMLElement>("[data-home-page-version]");
  const noticeHost = host.root.querySelector<HTMLElement>("[data-home-generated-notice]");
  const liveHost = host.root.querySelector<HTMLElement>("[data-home-generated-body]");
  const compareHost = host.root.querySelector<HTMLElement>("[data-home-compare]");
  const dialog = host.root.querySelector<HTMLDialogElement>("[data-home-adopt-dialog]");
  if (!liveHost || !compareHost || !noticeHost) return null;

  let overview: HomePageOverview | null = null;
  let liveFrame: MountedHomePageFrame | null = null;
  let liveMountedKey: string | null = null;
  let compareNowFrame: MountedHomePageFrame | null = null;
  let compareDraftFrame: MountedHomePageFrame | null = null;
  let comparingDraft: HomePageVersionSummary | null = null;
  let compareInspect: InspectResponse | null = null;
  let compareDiff: HomePageDiffResult | null = null;
  let compareView: "now" | "draft" = "draft";
  let conflictChoice: "mine" | "new" | "merge" | null = null;
  let versionMenuOpen = false;
  let checksOpen = false;
  let dismissedDraftKey: string | null = null;
  let fallbackAlert: { title: string; body: string; retryRef?: HomePageRef } | null = null;
  let restoreNotice: { page: HomePageRef; title: string } | null = null;
  let dialogTarget: { operation: "adopt" | "restore"; version: HomePageVersionSummary; inspect: InspectResponse } | null = null;
  let dialogGeneration = 0;
  let nowObserver: MutationObserver | null = null;
  let syncAbort: AbortController | null = null;
  const query = new URLSearchParams(location.search);
  const sceneRef = { page_id: query.get("homePage"), version: Number(query.get("homeVersion")) };
  let sceneApproval = query.get("homeApproval");
  let sceneOpened = false;
  const intentKey = "molis.home.decision:" + host.projectKey;
  type Intent = { operation: "adopt" | "restore" | "basic"; ref: string; actions: readonly ExactActionReference[]; request_id: string; expected_revision: string };
  let pending: Intent | null = null;
  try { pending = JSON.parse(sessionStorage.getItem(intentKey) || "null"); } catch { /* previous intent unavailable */ }
  async function decision(operation: Intent["operation"], ref: string, actions: readonly ExactActionReference[], revision: string) {
    if (!pending || pending.operation !== operation || pending.ref !== ref || JSON.stringify(pending.actions) !== JSON.stringify(actions)) {
      if (pending) {
        const recovered = await recoverDecision();
        if (recovered) throw new Error(recovered);
      }
      const scene = operation === "adopt" && ref === sceneRef.page_id + "@" + sceneRef.version && sceneApproval;
      pending = { operation, ref, actions, request_id: scene || crypto.randomUUID(), expected_revision: revision };
      try { sessionStorage.setItem(intentKey, JSON.stringify(pending)); } catch { /* in-memory retry is still available */ }
    }
    return { request_id: pending.request_id, expected_revision: pending.expected_revision };
  }
  function forgetDecision() {
    pending = null;
    try { sessionStorage.removeItem(intentKey); } catch { /* storage unavailable */ }
  }
  function finishScene() {
    sceneApproval = null;
    sceneOpened = true;
    const url = new URL(location.href);
    for (const key of ["homePage", "homeVersion", "homeApproval"]) url.searchParams.delete(key);
    history.replaceState(history.state, "", url);
  }
  async function recoverDecision(signal?: AbortSignal) {
    const intent = pending;
    if (!intent) return;
    const read = await host.api<{ results: HomePageApprovalReadResult[] }>("/api/home-pages/read", "POST",
      { queries: [{ by: "approval_request", operation: intent.operation, request_id: intent.request_id }] }, signal);
    const row = read.results[0];
    if (pending !== intent || row?.kind !== "receipt") return;
    const receipt = row.receipt;
    if (receipt.approval && homePageRefKey(receipt.approval.page) !== intent.ref) {
      throw new Error(uiText.text("workbench.home-pages.receipt-target-changed"));
    }
    if (sceneApproval === intent.request_id) finishScene();
    forgetDecision();
    if (overview) overview = { ...overview, ...row.current };
    const actions = (receipt.approval?.approved_actions ?? []).map(ref => dialogTarget?.inspect.actions.find(action =>
      action.capability_id === ref.capability_id && action.version === ref.version && action.provider_id === ref.provider_id)?.title ?? ref.capability_id);
    return uiText.text("workbench.home-pages.recovered-grants", { actions: actions.join(", ") || uiText.text("workbench.home-pages.no-granted-actions") });
  }

  let liveLoad = new AbortController();
  let compareLoad = new AbortController();
  const disposeLive = () => {
    liveLoad.abort();
    liveLoad = new AbortController();
    liveFrame?.dispose();
    liveFrame = null;
    liveMountedKey = null;
    liveHost.replaceChildren();
    liveHost.hidden = true;
  };

  const disposeCompareFrames = () => {
    ++dialogGeneration;
    nowObserver?.disconnect();
    nowObserver = null;
    compareLoad.abort();
    compareLoad = new AbortController();
    compareNowFrame?.dispose();
    compareNowFrame = null;
    compareDraftFrame?.dispose();
    compareDraftFrame = null;
  };

  const hasManualConflict = (): boolean => {
    if (!comparingDraft || !overview || !compareDiff || comparingDraft.based_on == null) return false;
    const base = overview.versions.find(v => v.page_id === comparingDraft!.page_id && v.version === comparingDraft!.based_on);
    return Boolean(base && base.author === "person" && comparingDraft.author === "assistant" && (compareDiff.files.length || compareDiff.actions.added.length || compareDiff.actions.removed.length
      || compareDiff.entry.before !== compareDiff.entry.after || comparingDraft.title !== base.title));
  };

  const blocker = (): "check" | "conflict" | null => {
    if (!compareInspect || !compareInspect.report.ok) return "check";
    if (hasManualConflict() && (conflictChoice === null || conflictChoice === "merge")) return "conflict";
    return null;
  };

  const renderVersionSlot = () => {
    if (!versionHost || !overview) return;
    versionHost.innerHTML = renderVersionSlotHtml(overview, versionMenuOpen);
  };

  const renderNotice = () => {
    if (!overview) {
      noticeHost.replaceChildren();
      return;
    }
    const yieldPrimary = Boolean(
      host.root.querySelector("[data-home-groups] .mw-btn--primary")
      || document.querySelector("[data-assistant-panel]:not([hidden])"),
    );
    noticeHost.innerHTML = renderHomeNoticeHtml({
      overview,
      comparing: Boolean(comparingDraft),
      dismissedDraftKey,
      fallbackAlert,
      restoreNotice,
      yieldPrimary,
    });
  };

  const renderChrome = () => {
    renderVersionSlot();
    renderNotice();
    host.onModeChange(Boolean(comparingDraft || (overview?.selection.kind === "page" && !fallbackAlert)));
  };

  const renderCompareChrome = () => {
    if (!comparingDraft || !compareInspect || !overview) return;
    const { issuesHtml, barHtml } = renderCompareChromeParts({
      draft: comparingDraft,
      inspect: compareInspect,
      diff: compareDiff,
      hasManualConflict: hasManualConflict(),
      conflictChoice,
      blocker: blocker(),
      checksOpen,
    });
    updateComparison(compareHost, compareView, issuesHtml, barHtml);
  };

  const exitCompare = () => {
    disposeCompareFrames();
    comparingDraft = null;
    compareInspect = null;
    compareDiff = null;
    conflictChoice = null;
    checksOpen = false;
    compareHost.replaceChildren();
    compareHost.hidden = true;
    renderChrome();
    void ensureLiveMounted();
  };

  async function enterCompare({ page_id, version }: HomePageRef): Promise<void> {
    const ref = { page_id, version };
    if (!overview) return;
    const draft = overview.versions.find(v => v.page_id === ref.page_id && v.version === ref.version);
    if (!draft) return;
    disposeLive();
    disposeCompareFrames();
    const { signal } = compareLoad;
    comparingDraft = draft;
    compareInspect = null;
    compareDiff = null;
    compareHost!.replaceChildren();
    dialogTarget = null;
    if (dialog?.open) dialog.close();
    conflictChoice = null;
    checksOpen = false;
    compareView = "draft";
    versionMenuOpen = false;

    const activeRef: HomePageRef | null =
      overview.selection.kind === "page"
        ? { page_id: overview.selection.page_id, version: overview.selection.version }
        : null;
    try {
      const [inspect, diff] = await Promise.all([
        host.api<InspectResponse>("/api/home-pages/inspect", "POST", ref),
        draft.based_on != null
          ? host.api<HomePageDiffResult>("/api/home-pages/diff", "POST", { page_id: draft.page_id, from_version: draft.based_on, to_version: draft.version }, signal)
          : Promise.resolve(null),
      ]);
      signal.throwIfAborted();
      compareInspect = inspect;
      compareDiff = diff;
      const activeLabel = activeRef
        ? uiText.text("workbench.home-pages.now-version", { v: activeRef.version })
        : uiText.text("workbench.home-pages.default-first-page");
      compareHost!.hidden = false;
      compareHost!.innerHTML = renderCompareShellHtml(activeLabel, draft);

      const nowStage = compareHost!.querySelector<HTMLElement>("[data-hp-now-stage]")!;
      const draftStage = compareHost!.querySelector<HTMLElement>("[data-hp-draft-stage]")!;
      if (activeRef) {
        try {
          compareNowFrame = await mountVersion(host, activeRef, nowStage, true, signal);
        } catch {
          nowStage.innerHTML = `<p class="hp-quiet-note" data-hp-now-note="unavailable">${escapeHtml(uiText.text("workbench.home-pages.now-unavailable-in-compare"))}</p>`;
        }
      } else {
        nowObserver = mirrorBasicPage(host.root, nowStage, signal);
      }

      if (!inspect.report.ok) {
        // Per Batch 37 design rule ("不过的页面不进预览"): never open a preview session or mount an iframe for a failed draft.
        const firstIssue = inspect.report.checks.find(c => c.severity === "error")?.issues[0];
        const firstReason = firstIssue ? localizeDesignIssueReason(firstIssue) : uiText.text("workbench.home-pages.preview-blocked-body");
        draftStage.innerHTML = renderAlert({
          tone: "danger",
          title: uiText.text("workbench.home-pages.preview-blocked-title"),
          body: firstReason,
        });
      } else {
        compareDraftFrame = await mountVersion(host, ref, draftStage, true, signal, reason => {
            draftStage.innerHTML = renderAlert({
              tone: "warning",
              title: uiText.text("workbench.home-pages.preview-crashed-title"),
              body: reason,
            });
        });
      }
      signal.throwIfAborted();
      renderCompareChrome();
      renderChrome();
    } catch (error) {
      if (signal.aborted) return;
      exitCompare();
      host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.preview-failed"));
    }
  }

  async function ensureLiveMounted(): Promise<void> {
    if (comparingDraft || !overview) return;
    if (overview.selection.kind !== "page") {
      disposeLive();
      renderChrome();
      return;
    }
    const targetRef: HomePageRef = { page_id: overview.selection.page_id, version: overview.selection.version };
    const key = homePageRefKey(targetRef);
    if (liveFrame && liveMountedKey === key && !fallbackAlert) {
      liveHost!.hidden = false;
      renderChrome();
      return;
    }
    disposeLive();
    const { signal } = liveLoad;
    try {
      liveHost!.hidden = false;
      liveMountedKey = key;
      fallbackAlert = null;
      liveFrame = await mountVersion(host, targetRef, liveHost!, false, signal, reason => {
          disposeLive();
          fallbackAlert = {
            title: uiText.text("workbench.home-pages.load-failed-title", { v: targetRef.version }),
            body: reason,
            retryRef: targetRef,
          };
          renderChrome();
          craft()?.turn?.(host.root, true);
      });
      renderChrome();
    } catch (error) {
      if (signal.aborted) return;
      disposeLive();
      fallbackAlert = {
        title: uiText.text("workbench.home-pages.load-failed-title", { v: targetRef.version }),
        body: error instanceof Error ? error.message : uiText.text("workbench.home-pages.load-failed-body"),
        retryRef: targetRef,
      };
      renderChrome();
      craft()?.turn?.(host.root, true);
    }
  }

  async function openApprovalDialog(operation: "adopt" | "restore", ref: HomePageRef): Promise<void> {
    if (!dialog || !overview) return;
    const generation = ++dialogGeneration;
    const guard = compareLoad.signal;
    if (operation === "adopt" && comparingDraft && blocker()) return;
    const target = overview.versions.find(v => v.page_id === ref.page_id && v.version === ref.version);
    if (!target) return;
    const inspect =
      comparingDraft && homePageRefKey(comparingDraft) === homePageRefKey(ref) && compareInspect
        ? compareInspect
        : await host.api<InspectResponse>("/api/home-pages/inspect", "POST", ref);
    if (generation !== dialogGeneration || guard.aborted || homePageRefKey(inspect.version) !== homePageRefKey(ref)) return;
    dialogTarget = { operation, version: target, inspect };
    dialog.innerHTML = renderApprovalDialogHtml({ operation, target, inspect, overview });
    if (pending?.operation === operation && pending.ref === ref.page_id + "@" + ref.version) {
      const prior = pending.actions;
      dialog.querySelectorAll<HTMLInputElement>("input[data-hp-grant]").forEach(box => {
        const item = inspect.actions[Number(box.dataset.hpGrant)];
        if (item && !box.disabled) box.checked = prior.some(a => a.provider_id === item.provider_id && a.capability_id === item.capability_id && a.version === item.version);
      });
    }
    dialog.setAttribute("aria-labelledby", "hp-adopt-title");
    if (!dialog.open) dialog.showModal();
  }

  let mutating = false;

  async function confirmDialog(triggerBtn?: HTMLElement | null): Promise<void> {
    if (!dialogTarget || !overview || !dialog || mutating) return;
    const { operation, version, inspect } = dialogTarget;
    const approved = checkedGrants(dialog, inspect);
    const endpoint = operation === "restore" ? "/api/home-pages/restore" : "/api/home-pages/adopt";
    mutating = true;
    try {
      await runBusy(triggerBtn, async () => {
        const receipt = await host.api<HomePageApprovalReceipt>(endpoint, "POST", {
          page_id: version.page_id,
          version: version.version,
          approved_actions: approved,
          ...await decision(operation, version.page_id + "@" + version.version, approved, overview!.revision),
        });
        forgetDecision();
        if (sceneApproval && operation === "adopt" && version.page_id === sceneRef.page_id && version.version === sceneRef.version) {
          finishScene();
        }
        dialog.close();
        dialogTarget = null;
        restoreNotice = null;
        fallbackAlert = null;
        if (comparingDraft) exitCompare();
        const verifiedRevision = await sync();
        if (verifiedRevision !== receipt.revision) {
          host.receipt(uiText.text("workbench.home-pages.decision-history"));
          return;
        }
        craft()?.land?.(liveHost!);
        host.receipt(
          uiText.text(operation === "restore" ? "workbench.home-pages.restored-toast" : "workbench.home-pages.adopted-toast", {
            v: version.version,
          }),
        );
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "home.request_conflict") {
        const recovered = await recoverDecision();
        if (recovered) { host.receipt(recovered);
          return; }
      }
      if (code === "home.revision_conflict") {
        forgetDecision();
        dialog.close();
        dialogTarget = null;
        await sync();
      }
      host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.adopt-failed"));
    } finally {
      mutating = false;
    }
  }

  async function selectBasic(triggerBtn?: HTMLElement | null): Promise<void> {
    if (!overview || mutating) return;
    const prev =
      overview.selection.kind === "page"
        ? (() => {
            const sel = overview.selection;
            return overview.versions.find(v => v.page_id === sel.page_id && v.version === sel.version);
          })()
        : null;
    mutating = true;
    try {
      await runBusy(triggerBtn, async () => {
        const receipt = await host.api<HomePageSelectResult>("/api/home-pages/select", "POST", {
          kind: "basic",
          ...await decision("basic", "", [], overview!.revision),
        });
        forgetDecision();
        versionMenuOpen = false;
        fallbackAlert = null;
        if (comparingDraft) exitCompare();
        restoreNotice = prev ? { page: { page_id: prev.page_id, version: prev.version }, title: prev.title } : null;
        const verifiedRevision = await sync();
        if (verifiedRevision !== receipt.revision) {
          restoreNotice = null;
          renderNotice();
          host.receipt(uiText.text("workbench.home-pages.decision-history"));
          return;
        }
        craft()?.turn?.(host.root, true);
        host.receipt(uiText.text("workbench.home-pages.switched-to-default"));
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "home.revision_conflict") { forgetDecision();
        await sync(); }
      host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.switch-failed"));
    } finally {
      mutating = false;
    }
  }

  async function sync(): Promise<string | undefined> {
    syncAbort?.abort();
    const controller = (syncAbort = new AbortController());
    try {
      const message = await recoverDecision(controller.signal);
      if (message) host.receipt(message);
      const next = await host.api<HomePageOverview>("/api/home-pages/read", "POST", {}, controller.signal);
      if (controller.signal.aborted) return;
      overview = next;
      renderChrome();
      if (!sceneOpened && sceneRef.page_id && next.versions.some(v => v.page_id === sceneRef.page_id && v.version === sceneRef.version)) {
        sceneOpened = true;
        await enterCompare({ page_id: sceneRef.page_id, version: sceneRef.version });
      } else await ensureLiveMounted();
      return controller.signal.aborted ? undefined : next.revision;
    } catch {
      if (!controller.signal.aborted) host.onModeChange(false);
    }
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const viewBtn = target.closest<HTMLButtonElement>("[data-hp-view]");
    if (viewBtn && compareHost.contains(viewBtn)) {
      compareView = viewBtn.dataset.hpView === "now" ? "now" : "draft";
      renderCompareChrome();
      return;
    }
    const actEl = target.closest<HTMLElement>("[data-hp-act]");
    if (actEl) {
      const act = actEl.dataset.hpAct;
      if (act === "toggle-versions") {
        versionMenuOpen = !versionMenuOpen;
        renderVersionSlot();
        return;
      }
      if (act === "toggle-checks") {
        checksOpen = !checksOpen;
        renderCompareChrome();
        return;
      }
      if (act === "compare" && actEl.dataset.hpPage && actEl.dataset.hpVer) {
        void runBusy(actEl, () => enterCompare({ page_id: actEl.dataset.hpPage!, version: Number(actEl.dataset.hpVer) }));
        return;
      }
      if (act === "exit-compare") {
        exitCompare();
        return;
      }
      if (act === "dismiss-draft" && actEl.dataset.hpKey) {
        dismissedDraftKey = actEl.dataset.hpKey;
        renderNotice();
        return;
      }
      if (act === "conflict-pick") {
        const pick = actEl.dataset.hpPick;
        conflictChoice = pick === "mine" || pick === "new" || pick === "merge" ? pick : null;
        renderCompareChrome();
        compareHost.querySelector("[data-hp-merge]")?.remove();
        if (pick === "merge" && comparingDraft?.based_on) {
          const draft = comparingDraft;
          const { signal } = compareLoad;
          void Promise.all([draft.based_on, draft.version].map(version =>
            host.api<HomePageFilesResult>("/api/home-pages/files/read", "POST", { page_id: draft.page_id, version }, signal))).then(([mine, next]) => {
            if (!mine || !next || signal.aborted || conflictChoice !== "merge") return;
            mountMergeEditor(compareHost, mine, next, async merged => {
              const saved = await host.api<{ version: HomePageVersionSummary }>("/api/home-pages/drafts/save", "POST", {
                draft: merged, page_id: draft.page_id, expected_version: draft.version, based_on: draft.version,
              });
              await sync();
              await enterCompare(saved.version);
            }, error => host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.preview-failed")));
          }).catch(error => { if (!signal.aborted) host.receipt(error.message); });
        }
        return;
      }
      if (act === "open-adopt" && comparingDraft && !blocker()) {
        if (hasManualConflict() && conflictChoice === "mine" && comparingDraft.based_on != null) {
          const baseRef: HomePageRef = { page_id: comparingDraft.page_id, version: comparingDraft.based_on };
          const active = overview?.selection.kind === "page" ? overview.selection : null;
          if (active && active.page_id === baseRef.page_id && active.version === baseRef.version) {
            dismissedDraftKey = homePageRefKey(comparingDraft);
            exitCompare();
            host.receipt(uiText.text("workbench.home-pages.kept-mine-toast", { base: baseRef.version }));
          } else {
            void openApprovalDialog("restore", baseRef);
          }
          return;
        }
        void openApprovalDialog("adopt", { page_id: comparingDraft.page_id, version: comparingDraft.version });
        return;
      }
      if (act === "open-restore" && actEl.dataset.hpPage && actEl.dataset.hpVer) {
        versionMenuOpen = false;
        renderVersionSlot();
        void openApprovalDialog("restore", { page_id: actEl.dataset.hpPage, version: Number(actEl.dataset.hpVer) });
        return;
      }
      if (act === "select-basic") {
        void selectBasic(actEl);
        return;
      }
      if (act === "retry-load") {
        fallbackAlert = null;
        void ensureLiveMounted();
        return;
      }
      if (act === "dialog-cancel") {
        dialog?.close();
        dialogTarget = null;
        return;
      }
      if (act === "dialog-confirm") {
        event.preventDefault();
        void confirmDialog(actEl);
        return;
      }
    }
    if (versionMenuOpen && !target.closest(".hp-ver-wrap")) {
      versionMenuOpen = false;
      renderVersionSlot();
    }
    if (checksOpen && !target.closest("[data-slot='check-summary']")) {
      checksOpen = false;
      renderCompareChrome();
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (versionMenuOpen) {
      versionMenuOpen = false;
      renderVersionSlot();
    }
    if (checksOpen) {
      checksOpen = false;
      renderCompareChrome();
    }
  };

  const onLanguageChanged = () => {
    if (!overview) return;
    renderChrome();
    if (comparingDraft) {
      relabelComparison(compareHost, overview);
      renderCompareChrome();
    }
    if (dialogTarget && dialog?.open) {
      relabelApprovalDialog(dialog, dialogTarget, overview);
    }
  };

  const dismissDialog = () => { ++dialogGeneration; };
  dialog?.addEventListener("close", dismissDialog);
  host.root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("molis-work:language-changed", onLanguageChanged);
  return {
    sync,
    suspend() {
      syncAbort?.abort();
      disposeCompareFrames();
      comparingDraft = null;
      compareHost.replaceChildren();
      compareHost.hidden = true;
      disposeLive();
    },
    dispose() {
      syncAbort?.abort();
      dialog?.removeEventListener("close", dismissDialog);
      host.root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("molis-work:language-changed", onLanguageChanged);
      disposeLive();
      disposeCompareFrames();
    },
  };
}
