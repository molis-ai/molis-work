import { isDeepStrictEqual } from "node:util";
import type { Runtime } from "@prologue/sdk";
import type { AgentReviewDocument } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { ReviewDecisionControl } from "../review-decisions.js";
import { presentToolReview, reviewField, reviewText } from "../review-presentation.js";
import type { ProloguePending } from "./prologue-approvals.js";
import type { RoundState } from "./prologue-node-kit.js";
import { readResourceText } from "./prologue-node-kit.js";
import { desktopActionCard, type PrologueSurfaces, type SurfaceReviewTarget } from "./prologue-surfaces.js";
import { describeBrowserAction, surfaceActionWords, type SurfaceReviewDetail } from "./prologue-surface-review-words.js";

type Effect = NonNullable<ReturnType<Runtime["effects"]["get"]>>;
type Subject = Extract<Effect["proposal"]["subject"], { what: "surface" }>;

/** Ephemeral proof for this one card, not a second permission or persisted execution fact. */
export interface SurfaceReview {
  readonly document: AgentReviewDocument;
  readonly control: ReviewDecisionControl & { beforeAnswer?(): void };
  present(): AgentReviewDocument;
}

function browserCard(subject: Subject, detail: SurfaceReviewDetail): AgentReviewDocument {
  const verbs: Record<string, string> = { pointer: "点击页面", key: "按键", text: "输入文字", navigate: "打开网址", wait: "等待页面", upload: "向网站上传本机文件", download: "把文件存到本机" };
  const blank = subject.scope === "about:blank", where = blank ? "空白页" : subject.scope;
  const site = blank ? reviewText("surface.blank-page") : where, action = surfaceActionWords(verbs, subject.action, "browser");
  return presentToolReview({ kind: "tool-operation", tool: "surface-act", summary: `在 ${where} ${verbs[subject.action] ?? subject.action}` }, [
    reviewField("网站", where, "site", { value: [site] }), reviewField("动作", verbs[subject.action] ?? subject.action, "action", { value: action }),
    reviewField("详情", detail.raw, "detail", { value: detail.words }),
    ...(subject.action === "upload" ? [reviewField("注意", "上传会把这个文件发送给该网站，确认前请核对文件", "warning", { value: [reviewText("surface.site-upload-warning")] })] : []),
  ], [reviewText("surface.on-site"), " ", site, " · ", ...action]);
}

/** Snapshot the exact pending, effect and binding; loss of readability is permanent for this frozen card. */
export async function createSurfaceReview(runtime: Runtime, state: RoundState, surfaces: PrologueSurfaces | undefined,
  pending: ProloguePending, effect: Effect, subject: Subject): Promise<SurfaceReview> {
  const runId = pending.origin?.run ?? "", sessionId = pending.origin?.session ?? "", run = state.activeRuns.get(runId);
  const assertPending = () => {
    const question = runtime.effects.pendings.get(pending.ref), latest = runtime.effects.get(effect.ref);
    if (!run?.live() || state.activeRuns.get(runId) !== run || state.runSessions.get(runId) !== sessionId
      || question?.state !== "open" || question.origin?.run !== runId || question.origin.session !== sessionId
      || question.effectRef?.kind !== effect.ref.kind || question.effectRef.id !== effect.ref.id || question.effectRef.revision !== effect.ref.revision
      || latest?.state !== "awaiting-approval" || latest.pending?.ref.id !== pending.ref.id || latest.pending.ref.revision !== pending.ref.revision
      || !isDeepStrictEqual(latest.proposal, effect.proposal)) throw agentErrors.pending_not_open("原界面操作已不再等待这项决定");
  };
  let binding: SurfaceReviewTarget | undefined, readable = false;
  try { binding = surfaces?.review(runId, sessionId, effect.ref, subject); } catch { /* A saved summary can still be refused by the original waiter. */ }
  const assertAuthority = () => {
    if (!run?.live() || state.activeRuns.get(runId) !== run || !binding) throw agentErrors.review_not_permitted("原轮次的界面已不可用");
    run.assertAuthority(); binding.assertCurrent();
  };
  const current = () => { try { assertPending(); assertAuthority(); return true; } catch { return false; } };
  const label = effect.proposal.summary.replace(/^On this \w+: /u, "").replace(/\.$/u, "");
  const fallback = subject.surface === "desktop"
    ? (await desktopActionCard(undefined, subject.action, subject.scope, label, undefined, effect.proposal.kind)).document
    : browserCard(subject, await describeBrowserAction(undefined, subject.action, label));
  let document = fallback;
  let focus: string | undefined;
  const typed = current() && subject.action === "text" && effect.proposal.reviewRef
    ? await readResourceText(runtime, effect.proposal.reviewRef).catch(() => undefined) : undefined;
  if (current() && (subject.action !== "text" || typed !== undefined)) {
    try {
      await binding!.beforeEffect();
      assertPending();
      assertAuthority();
      if (subject.surface === "desktop") {
        const candidate = await desktopActionCard(binding, subject.action, subject.scope, label, typed, effect.proposal.kind);
        if (current() && candidate.reviewable) { document = candidate.document; readable = true; focus = candidate.focus; }
      } else {
        const detail = await binding!.describe(subject.action, label, typed);
        if (current() && detail.reviewable && (subject.action !== "text" || detail.focus)) {
          document = browserCard(subject, detail); readable = true; focus = detail.focus;
        }
      }
    } catch { /* Incomplete content or focus may be shown only as a refusal-only original summary. */ }
  }
  const assertApproval = () => {
    if (!readable) throw agentErrors.review_not_permitted("这张审查卡未能核对完整内容，请拒绝后重新提案");
    assertAuthority();
  };
  const beforeApproval = async () => {
    assertApproval();
    try {
      await binding!.beforeEffect();
      if (subject.action === "text" || subject.action === "pointer") {
        const latest = subject.surface === "desktop"
          ? await desktopActionCard(binding, subject.action, subject.scope, label, typed, effect.proposal.kind)
          : await binding!.describe(subject.action, label, typed).then(detail => ({ reviewable: detail.reviewable, focus: detail.focus, document: browserCard(subject, detail) }));
        if (!latest.reviewable || latest.focus !== focus || !isDeepStrictEqual(latest.document, document)) {
          throw agentErrors.review_not_permitted("原审查的目标或输入焦点已变化，请重新观察");
        }
      }
      assertApproval();
    } catch (error) {
      readable = false;
      throw error;
    }
  };
  const body = subject.surface === "browser" && subject.action === "text" ? effect.proposal.reviewRef : undefined;
  return { document,
    control: { assertCurrent: assertApproval, beforeEffect: beforeApproval, ...(body && focus ? {
      beforeAnswer() { assertApproval(); binding!.retainTextApproval(body, focus!); },
    } : {}) },
    present() {
      assertPending();
      if (readable && current()) return document;
      readable = false;
      return fallback;
    },
  };
}
