/**
 * Real Jev for the slice (specs/archive/contextual-interaction §5.2, §5.4): the multi-question request goes through the
 * Prologue inference port, the same path the Host uses for TypeSafe. The key is read in-process from the person's own
 * Home (they agreed on 2026-09-30), kept only in memory, never printed or written. Real answers can be recorded so the
 * `replay` mode can later show recorded Jev instead of hand-written samples.
 */
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { TYPESAFE_SYSTEMONE_URL } from "@molis-ai/molis-work-module-functions";
import { FUNCTIONS_DEFAULT_MODEL } from "@molis-ai/molis-work-contracts/modules/functions";
import type { ContextualCandidate, SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { typeSafeCredential } from "../../apps/local-host/src/typesafe-connection.js";

const CREDENTIAL_REF = "typesafe:contextual-slice";

export interface RecordedAnswer {
  readonly match: readonly string[];
  readonly activity: string;
  readonly granularity: string;
  readonly next: Record<string, number>;
  readonly intent: Record<string, number>;
  readonly surface: string | null;
  readonly speak_up: number | null;
  readonly confidence: number | null;
  readonly latency_ms: number;
  readonly model: string;
  readonly recorded_at: string;
}

export function createJevEvaluator(options: { home?: string; recordTo?: string }) {
  const home = options.home ?? join(homedir(), ".molis-work");
  let key: string | null | undefined;
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  const credential = () => {
    if (key === undefined) key = typeSafeCredential(home, "functions");
    if (!key) throw new Error("这个 Home 没有可用的 TypeSafe Key");
    return key;
  };
  const inference = async () => {
    adapter ??= await createPrologueNodeAdapter({ app: { appId: "io.molis.work.contextual-slice", appVersion: "0.0.0" },
      storageRoot: join(mkdtempSync(join(tmpdir(), "molis-contextual-slice-")), "runtime") });
    return adapter.inference;
  };
  return {
    /** Whether a key is available, without revealing anything about it. */
    configured(): boolean { try { credential(); return true; } catch { return false; } },
    async evaluate(input: { state: string; questions: Record<string, unknown>; signal: AbortSignal; focus?: SurfaceFocus; candidates?: readonly ContextualCandidate[] }) {
      const started = Date.now();
      const body = await (await inference()).evaluateTypeSafe({
        endpoint: TYPESAFE_SYSTEMONE_URL, model: FUNCTIONS_DEFAULT_MODEL, state: input.state, questions: input.questions,
        credential_ref: CREDENTIAL_REF, resolveCredential: ref => ref === CREDENTIAL_REF ? credential() : null,
        signal: input.signal, timeout_ms: 30_000,
      });
      const latency = Date.now() - started;
      const model = typeof (body as { model?: unknown }).model === "string" ? String((body as { model: string }).model) : FUNCTIONS_DEFAULT_MODEL;
      if (options.recordTo && input.focus && input.candidates) record(options.recordTo, body, input.focus, input.candidates, latency, model);
      return { basis: "jev" as const, body, model: `Jev · ${model}` };
    },
    async close() { await adapter?.close(); },
  };
}

function record(file: string, body: unknown, focus: SurfaceFocus, candidates: readonly ContextualCandidate[], latency: number, model: string) {
  const answers = (body as { answers?: Record<string, { choice?: unknown; probabilities?: Record<string, number>; confidence?: number; noul?: number }> }).answers ?? {};
  const byKey = new Map(candidates.map(item => [item.key, `${item.source.provider_id}:${item.offer_id}`]));
  const next = Object.fromEntries(Object.entries(answers.next?.probabilities ?? {}).filter(([key]) => byKey.has(key)).map(([key, value]) => [byKey.get(key)!, value]));
  const entry: RecordedAnswer = {
    match: focus.targets.map(target => target.text.replace(/\s+/g, " ").trim().slice(0, 24)), activity: focus.activity, granularity: focus.granularity,
    next, intent: answers.intent?.probabilities ?? {}, surface: typeof answers.surface?.choice === "string" ? answers.surface.choice : null,
    speak_up: typeof answers.speak_up?.noul === "number" ? answers.speak_up.noul : null, confidence: typeof answers.next?.confidence === "number" ? answers.next.confidence : null,
    latency_ms: latency, model, recorded_at: new Date().toISOString(),
  };
  const list: RecordedAnswer[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const same = list.findIndex(item => JSON.stringify([item.match, item.activity, item.granularity]) === JSON.stringify([entry.match, entry.activity, entry.granularity]));
  if (same >= 0) list[same] = entry; else list.push(entry);
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}
