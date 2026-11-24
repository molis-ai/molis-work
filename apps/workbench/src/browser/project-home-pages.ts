import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  HomePageApprovalReceipt,
  HomePageDiffResult,
  HomePageFilesResult,
  HomePageOverview,
  HomePagePreviewResult,
  HomePageRef,
  HomePageSelectResult,
  HomePageVersionSummary,
} from "@molis-ai/molis-work-contracts/services/home";
import { escapeHtml, renderAlert, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { mountHomePageFrame, type MountedHomePageFrame } from "./plugin-frame/home-page-document.js";
import {
  homePageRefKey,
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
  let syncAbort: AbortController | null = null;

  const disposeLive = () => {
    liveFrame?.dispose();
    liveFrame = null;
    liveMountedKey = null;
    liveHost.replaceChildren();
    liveHost.hidden = true;
  };

  const disposeCompareFrames = () => {
    compareNowFrame?.dispose();
    compareNowFrame = null;
    compareDraftFrame?.dispose();
    compareDraftFrame = null;
  };

  const hasManualConflict = (): boolean => {
    if (!comparingDraft || !overview || !compareDiff || comparingDraft.based_on == null) return false;
    const base = overview.versions.find(v => v.page_id === comparingDraft!.page_id && v.version === comparingDraft!.based_on);
    return Boolean(base && base.author === "person" && comparingDraft.author === "assistant" && compareDiff.files.length > 0);
  };

  const blocker = (): "check" | "conflict" | null => {
    if (compareInspect && !compareInspect.report.ok) return "check";
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
    noticeHost.innerHTML = renderHomeNoticeHtml({
      overview,
      comparing: Boolean(comparingDraft),
      dismissedDraftKey,
      fallbackAlert,
      restoreNotice,
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
    const issuesSlot = compareHost.querySelector<HTMLElement>("[data-hp-compare-issues]");
    const barSlot = compareHost.querySelector<HTMLElement>("[data-hp-compare-bar]");
    const grid = compareHost.querySelector<HTMLElement>("[data-hp-compare-grid]");
    if (issuesSlot) issuesSlot.innerHTML = issuesHtml;
    if (barSlot) barSlot.innerHTML = barHtml;
    if (grid) grid.dataset.view = compareView;
    compareHost.querySelectorAll<HTMLButtonElement>("[data-hp-view]").forEach(btn => {
      const on = btn.dataset.hpView === compareView;
      btn.classList.toggle("is-current", on);
      btn.setAttribute("aria-pressed", String(on));
    });
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

  async function enterCompare(ref: HomePageRef): Promise<void> {
    if (!overview) return;
    const draft = overview.versions.find(v => v.page_id === ref.page_id && v.version === ref.version);
    if (!draft) return;
    disposeLive();
    disposeCompareFrames();
    comparingDraft = draft;
    conflictChoice = null;
    checksOpen = false;
    compareView = "draft";
    versionMenuOpen = false;

    const activeRef = overview.selection.kind === "page" ? overview.selection : null;
    try {
      const [inspect, diff] = await Promise.all([
        host.api<InspectResponse>("/api/home-pages/inspect", "POST", ref),
        draft.based_on != null
          ? host.api<HomePageDiffResult>("/api/home-pages/diff", "POST", { page_id: draft.page_id, from_version: draft.based_on, to_version: draft.version }).catch(() => null)
          : Promise.resolve(null),
      ]);
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
          const [liveSession, liveFiles] = await Promise.all([
            host.api<{ page_session_id: string }>("/api/home-pages/session", "POST", {}),
            host.api<HomePageFilesResult>("/api/home-pages/files/read", "POST", activeRef),
          ]);
          compareNowFrame = await mountHomePageFrame({
            container: nowStage,
            loaded: liveFiles,
            pageSessionId: liveSession.page_session_id,
            isPreview: false,
            routePrefix: host.routePrefix,
            headers: host.headers,
          });
        } catch {
          nowStage.innerHTML = `<p class="hp-quiet-note">${escapeHtml(uiText.text("workbench.home-pages.now-unavailable-in-compare"))}</p>`;
        }
      } else {
        nowStage.innerHTML = `<p class="hp-quiet-note">${escapeHtml(uiText.text("workbench.home-pages.now-is-default"))}</p>`;
      }

      if (!inspect.report.ok) {
        // Per Batch 37 design rule ("不过的页面不进预览"): never open a preview session or mount an iframe for a failed draft.
        const firstReason = inspect.report.checks.find(c => c.severity === "error")?.issues[0]?.reason
          ?? uiText.text("workbench.home-pages.preview-blocked-body");
        draftStage.innerHTML = renderAlert({
          tone: "danger",
          title: uiText.text("workbench.home-pages.preview-blocked-title"),
          body: firstReason,
        });
      } else {
        const [preview, draftFiles] = await Promise.all([
          host.api<HomePagePreviewResult>("/api/home-pages/preview", "POST", ref),
          host.api<HomePageFilesResult>("/api/home-pages/files/read", "POST", ref),
        ]);
        compareDraftFrame = await mountHomePageFrame({
          container: draftStage,
          loaded: draftFiles,
          pageSessionId: preview.page_session_id,
          isPreview: true,
          routePrefix: host.routePrefix,
          headers: host.headers,
          onCrash: reason => {
            draftStage.innerHTML = renderAlert({
              tone: "warning",
              title: uiText.text("workbench.home-pages.preview-crashed-title"),
              body: reason,
            });
          },
        });
      }
      renderCompareChrome();
      renderChrome();
    } catch (error) {
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
    try {
      const [session, files] = await Promise.all([
        host.api<{ page_session_id: string }>("/api/home-pages/session", "POST", {}),
        host.api<HomePageFilesResult>("/api/home-pages/files/read", "POST", targetRef),
      ]);
      if (comparingDraft) return;
      liveHost!.hidden = false;
      liveMountedKey = key;
      fallbackAlert = null;
      liveFrame = await mountHomePageFrame({
        container: liveHost!,
        loaded: files,
        pageSessionId: session.page_session_id,
        isPreview: false,
        routePrefix: host.routePrefix,
        headers: host.headers,
        onCrash: reason => {
          disposeLive();
          fallbackAlert = {
            title: uiText.text("workbench.home-pages.load-failed-title", { v: targetRef.version }),
            body: reason,
            retryRef: targetRef,
          };
          renderChrome();
          craft()?.turn?.(host.root, true);
        },
      });
      renderChrome();
    } catch (error) {
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
    const target = overview.versions.find(v => v.page_id === ref.page_id && v.version === ref.version);
    if (!target) return;
    const inspect =
      comparingDraft && homePageRefKey(comparingDraft) === homePageRefKey(ref) && compareInspect
        ? compareInspect
        : await host.api<InspectResponse>("/api/home-pages/inspect", "POST", ref);
    dialogTarget = { operation, version: target, inspect };
    dialog.innerHTML = renderApprovalDialogHtml({ operation, target, inspect, overview });
    dialog.setAttribute("aria-labelledby", "hp-adopt-title");
    if (!dialog.open) dialog.showModal();
  }

  async function confirmDialog(): Promise<void> {
    if (!dialogTarget || !overview || !dialog) return;
    const { operation, version, inspect } = dialogTarget;
    const approved: ExactActionReference[] = [];
    dialog.querySelectorAll<HTMLInputElement>("input[data-hp-grant]").forEach(box => {
      if (!box.checked || box.disabled) return;
      const item = inspect.actions[Number(box.dataset.hpGrant)];
      if (item) approved.push({ capability_id: item.capability_id, version: item.version, provider_id: item.provider_id });
    });
    const endpoint = operation === "restore" ? "/api/home-pages/restore" : "/api/home-pages/adopt";
    try {
      await host.api<HomePageApprovalReceipt>(endpoint, "POST", {
        page_id: version.page_id,
        version: version.version,
        approved_actions: approved,
        request_id: `ui-${operation}-${crypto.randomUUID()}`,
        expected_revision: overview.revision,
      });
      dialog.close();
      dialogTarget = null;
      restoreNotice = null;
      fallbackAlert = null;
      if (comparingDraft) exitCompare();
      await sync();
      craft()?.land?.(liveHost!);
      host.receipt(
        uiText.text(operation === "restore" ? "workbench.home-pages.restored-toast" : "workbench.home-pages.adopted-toast", {
          v: version.version,
        }),
      );
    } catch (error) {
      host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.adopt-failed"));
    }
  }

  async function selectBasic(): Promise<void> {
    if (!overview) return;
    const prev =
      overview.selection.kind === "page"
        ? (() => {
            const sel = overview.selection;
            return overview.versions.find(v => v.page_id === sel.page_id && v.version === sel.version);
          })()
        : null;
    try {
      await host.api<HomePageSelectResult>("/api/home-pages/select", "POST", {
        kind: "basic",
        request_id: `ui-basic-${crypto.randomUUID()}`,
        expected_revision: overview.revision,
      });
      versionMenuOpen = false;
      fallbackAlert = null;
      if (comparingDraft) exitCompare();
      restoreNotice = prev ? { page: { page_id: prev.page_id, version: prev.version }, title: prev.title } : null;
      await sync();
      craft()?.turn?.(host.root, true);
      host.receipt(uiText.text("workbench.home-pages.switched-to-default"));
    } catch (error) {
      host.receipt(error instanceof Error ? error.message : uiText.text("workbench.home-pages.switch-failed"));
    }
  }

  async function sync(): Promise<void> {
    syncAbort?.abort();
    const controller = (syncAbort = new AbortController());
    try {
      const next = await host.api<HomePageOverview>("/api/home-pages/read", "POST", {}, controller.signal);
      if (controller.signal.aborted) return;
      overview = next;
      renderChrome();
      await ensureLiveMounted();
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
        void enterCompare({ page_id: actEl.dataset.hpPage, version: Number(actEl.dataset.hpVer) });
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
        void selectBasic();
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
        void confirmDialog();
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

  host.root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  return {
    sync,
    openCompare: (ref: HomePageRef) => enterCompare(ref),
    dispose() {
      syncAbort?.abort();
      host.root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      disposeLive();
      disposeCompareFrames();
    },
  };
}
