import type { AssistantRound, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";

export const assistantWorkFixture = {
  work_id: "current", executor: { kind: "assistant" }, revision: 1, title: "Contract fixture", scope: { kind: "project", project_id: "fixture-project" },
  origin: null, state: "running", session_id: "session-fixture", draft: "unsent original", created_at: "2026-11-08T00:00:00Z", updated_at: "2026-11-08T00:00:01Z", archived: false,
} satisfies AssistantWork;
const round = {
  run_id: "run-current", text: "Test input", materials: [], context: null, started_at: "2026-11-08T00:00:01Z", phase: "running", turns: [], activity: [], awaiting_input: [], ended_at: null,
} satisfies AssistantRound;
export const assistantViewFixtures = {
  empty: { work: { ...assistantWorkFixture, state: "idle" }, rounds: [], reviews: [], cards: [], objects: [] },
  running: { work: assistantWorkFixture, rounds: [round], reviews: [], cards: [], objects: [] },
  failed: { work: { ...assistantWorkFixture, state: "failed" }, rounds: [{ ...round, phase: "failed", ended_at: "2026-11-08T00:00:02Z" }], reviews: [], cards: [], objects: [], problem: { message: "Run failed", action: "Retry" } },
  latestWithoutUsage: { work: assistantWorkFixture, rounds: [{ ...round, run_id: "old", phase: "completed", ended_at: "2026-11-08T00:00:02Z", model: { model_id: "old-model" }, usage: { tokens: { input: 777, output: 888 } } }, round], reviews: [], cards: [], objects: [] },
} satisfies Record<string, AssistantWorkView>;
