import assert from "node:assert/strict";
import test from "node:test";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { attentionErrors } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";
import { goalErrors } from "@molis-ai/molis-work-module-goals";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";
import { actionErrorFromResponse, actionErrorKind, actionErrorResponse, draftActionCard, runActionCard, type ActionCard, type ActionCardPorts } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience D26: "the data moved on" is said once, by the declared kind. These owners' refusals say it, so
// each is a conflict: 409 at the action gateway, still a conflict after the HTTP hop, and a stale card, never a plain failure.
const MOVED_ON = [
  [characterErrors.conflict("草稿已变化，请重新读取后发布"), "characters.conflict"],
  [goalErrors["goals.event_agreement.stale_config_version"]("当前配置版本已变化"), "goals.event_agreement.stale_config_version"],
  [goalErrors["goals.event_decision.stale_commitment"]("原约定已经变化"), "goals.event_decision.stale_commitment"],
  [goalErrors["goals.event_progress.stale_goal"]("原目标已变化"), "goals.event_progress.stale_goal"],
  [attentionErrors.revision_conflict("这条 Inbox Entry 已经变化"), "attention.revision_conflict"],
  [shelfErrors.configuration_changed("生成期间模型选择已变化"), "shelf.configuration_changed"],
] as const;

const reference = { capability_id: "fixture.items.update", version: 1, provider_id: "io.molis.work.fixture" };
const view = { ...reference, operation: "command", provider: { provider_id: reference.provider_id, title: "Fixture" },
  action: { title: "改一项", description: "", subject_kinds: [], permissions: [], audiences: ["agent"], input_schema: { type: "object", properties: { title: { type: "string" } } } },
  availability: { available: true } } as never as ActionView;

async function runThrowing(error: unknown): Promise<ActionCard> {
  const ports: ActionCardPorts = {
    store: { update: (card, expected, patch) => { assert.equal(card.revision, expected); return { ...card, ...patch, revision: card.revision + 1 }; } },
    authority: async () => ({ discover: async () => [view], check: () => undefined, invoke: async () => { throw error; } }),
    readSubject: async () => null, now: () => new Date("2026-10-16T09:00:00Z"), timeZone: "UTC",
    refuse: (reason, message) => Object.assign(new Error(message), { reason }),
  };
  const card = await draftActionCard("card-1", { title: "改", summary: "改一项", reference, input: { title: "x" } }, [view], { ...ports, check: () => undefined });
  return runActionCard(card, { revision: card.revision, values: {} }, ports);
}

test("D26: the owners' “the data moved on” refusals are conflicts — 409 at the gateway, conflict after the hop, a stale card", async () => {
  for (const [error, code] of MOVED_ON) {
    assert.equal(error.code, code);
    assert.equal(actionErrorKind(error), "conflict", code);
    const answer = actionErrorResponse(error);
    assert.deepEqual([answer.status, answer.body.code], [409, code], code);
    assert.equal(actionErrorKind(actionErrorFromResponse(answer.status, answer.body)), "conflict", `${code} after the HTTP hop`);
    assert.equal((await runThrowing(error)).status, "stale", code);
  }
});
