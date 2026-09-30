import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  ContextualCandidate, ContextualJudgeRequest, ContextualJudgeResponse, ContextualJudgment, SurfaceFocus,
} from "@molis-ai/molis-work-contracts/services/contextual";
import {
  contextualDigest, fragmentCandidates, judgmentQuestions, judgmentState, planContextualLayout, readContextualJudgment,
} from "@molis-ai/molis-work-kernel";

/**
 * Host side of context-driven interaction (specs/contextual-interaction §4, §5, §8). Candidates come from the caller's
 * authorized directory snapshot; the judgment only ranks them. One judgment per pane at a time: a newer request
 * aborts the older one, and a result is only ever returned for the context it was asked about.
 */

export interface ContextualEvaluation {
  /** SystemOne answer body: `{ answers: { next, intent, surface, speak_up }, model?, usage? }`. */
  readonly body: unknown;
  readonly basis: "jev" | "replay";
  readonly model?: string;
}

export interface ContextualJudgmentPorts<Caller> {
  /** The caller's authorized directory; never widened here. */
  directory(caller: Caller): Promise<readonly ActionView[]>;
  /** Multi-question judgment. Absent means no judgment model is configured. */
  evaluate?(input: { state: string; questions: Record<string, unknown>; signal: AbortSignal }): Promise<ContextualEvaluation>;
  /** Whether `evaluate` can be asked right now (a connection is set up); false reads as “unconfigured”, not a failure. */
  configured?(): boolean;
  /** Preferences and conventions for this context, through `memory.recall`; absent or failing is not an error. */
  recall?(focus: SurfaceFocus, caller: Caller, signal: AbortSignal): Promise<{ state: "ok" | "off"; items: readonly { kind: string; text: string }[] }>;
  /** Redact secrets and mark instruction-shaped text before anything leaves the machine. */
  screen?(text: string): { text: string; notes: readonly string[] };
  now?(): number;
  /** Upper bound for one judgment; the bar never waits on it (spec §8). */
  readonly timeoutMs?: number;
  /** How long recall may take before the judgment goes on without it. */
  readonly recallMs?: number;
}

type Fallback = NonNullable<ContextualJudgeResponse["receipt"]["fallback"]>;

export interface ContextualJudgmentService<Caller> {
  /** Candidates and the rule layout, without any model: what the bar shows at once. */
  candidates(request: ContextualJudgeRequest, caller: Caller): Promise<ContextualJudgeResponse>;
  /** The judged layout. Resolves with a rules layout (and the reason) when the judgment is unavailable. */
  judge(request: ContextualJudgeRequest, caller: Caller, signal?: AbortSignal): Promise<ContextualJudgeResponse>;
  /** Forget a pane's pending judgment, e.g. when its place changed. */
  cancel(paneId: string): void;
}

const CACHE_LIMIT = 64;

export function createContextualJudgmentService<Caller>(ports: ContextualJudgmentPorts<Caller>): ContextualJudgmentService<Caller> {
  const pending = new Map<string, AbortController>();
  const cache = new Map<string, { judgment: ContextualJudgment; candidates: readonly ContextualCandidate[]; digest: string; screened: readonly string[] }>();
  const now = ports.now ?? Date.now;

  const respond = (request: ContextualJudgeRequest, candidates: readonly ContextualCandidate[], judgment: ContextualJudgment | null,
    receipt: { digest: string | null; screened: readonly string[]; fallback?: Fallback }): ContextualJudgeResponse => ({
    plan: planContextualLayout({ focus: request.focus, candidates, judgment, pinned: request.pinned, previous: request.previous, dismissed: request.dismissed }),
    judgment,
    receipt: { context_id: request.focus.context_id, state_digest: receipt.digest, candidate_count: candidates.filter(item => item.available).length,
      screened: receipt.screened, ...(receipt.fallback ? { fallback: receipt.fallback } : {}) },
  });

  const cacheKey = (request: ContextualJudgeRequest) => request.focus.context_id + "\u0000" + request.focus.object.id;

  return {
    async candidates(request, caller) {
      const candidates = fragmentCandidates(await ports.directory(caller), request.focus);
      return respond(request, candidates, null, { digest: null, screened: [], ...(candidates.some(item => item.available) ? {} : { fallback: "no_candidates" as const }) });
    },

    async judge(request, caller, outer) {
      pending.get(request.pane_id)?.abort();
      const controller = new AbortController();
      pending.set(request.pane_id, controller);
      const abort = () => controller.abort();
      outer?.addEventListener("abort", abort, { once: true });
      try {
        const candidates = fragmentCandidates(await ports.directory(caller), request.focus);
        if (!candidates.some(item => item.available)) return respond(request, candidates, null, { digest: null, screened: [], fallback: "no_candidates" });
        const cached = cache.get(cacheKey(request));
        if (cached && JSON.stringify(cached.candidates.map(item => [item.key, item.available])) === JSON.stringify(candidates.map(item => [item.key, item.available]))) {
          return respond(request, candidates, cached.judgment, { digest: cached.digest, screened: cached.screened });
        }
        if (!ports.evaluate || ports.configured?.() === false) return respond(request, candidates, null, { digest: null, screened: [], fallback: "unconfigured" });

        let memory: readonly { kind: string; text: string }[] = [];
        const screened: string[] = [];
        if (ports.recall) {
          const recallSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(ports.recallMs ?? 400)]);
          try {
            const recalled = await ports.recall(request.focus, caller, recallSignal);
            if (recalled.state === "off") screened.push("记忆：使用方已关闭");
            else memory = recalled.items;
          } catch { screened.push("记忆：未取到，判断不带偏好"); }
        }
        if (controller.signal.aborted) return respond(request, candidates, null, { digest: null, screened, fallback: "aborted" });

        const state = judgmentState(request.focus, { recent: request.recent, memory });
        screened.push(...state.clipped.map(label => `截断：${label}`));
        const cleaned = ports.screen ? ports.screen(state.text) : { text: state.text, notes: [] };
        screened.push(...cleaned.notes);
        const digest = contextualDigest(cleaned.text);
        const started = now();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(ports.timeoutMs ?? 30_000)]);
        let evaluation: ContextualEvaluation;
        try {
          evaluation = await ports.evaluate({ state: cleaned.text, questions: judgmentQuestions(candidates, request.focus), signal });
        } catch {
          const fallback: Fallback = controller.signal.aborted ? "aborted" : signal.aborted ? "timeout" : "failed";
          return respond(request, candidates, null, { digest, screened, fallback });
        }
        if (controller.signal.aborted) return respond(request, candidates, null, { digest, screened, fallback: "aborted" });
        const judgment = readContextualJudgment(evaluation.body, candidates, evaluation.basis, now() - started, evaluation.model);
        if (!Object.keys(judgment.next).length) return respond(request, candidates, null, { digest, screened, fallback: "failed" });
        cache.set(cacheKey(request), { judgment, candidates, digest, screened });
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        return respond(request, candidates, judgment, { digest, screened });
      } finally {
        outer?.removeEventListener("abort", abort);
        if (pending.get(request.pane_id) === controller) pending.delete(request.pane_id);
      }
    },

    cancel(paneId) {
      pending.get(paneId)?.abort();
      pending.delete(paneId);
    },
  };
}
