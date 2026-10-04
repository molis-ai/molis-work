import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import {
  insertHistoricalClarificationSession,
  insertHistoricalClarificationTurn,
} from "./historical-sql-fixture.js";

test("a historical clarification dialogue stays readable after the project is reopened", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-dialogue-schema-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const sessionId = "dialogue-recovered";
  const goalId = "dialogue-goal";
  const roughIdea = "重新打开后仍在的澄清正文";
  try {
    const coordinator = new GoalProjectApplication(store);
    coordinator.initializeBoard({ board_id: "board", title: "Recovered dialogue", actor_id: "user", idempotency_key: "init" });
    coordinator.goals.commands.createGoal("board", {
      goal_id: goalId,
      title: "澄清会话",
      outcome: "重新打开后仍能读到原文",
      why: "保留历史澄清",
      business_logic: "只读历史会话",
      acceptance_criteria: [],
    }, { actor_id: "user", idempotency_key: "create-dialogue-goal" });
    insertHistoricalClarificationSession(store.db, {
      session_id: sessionId,
      board_id: "board",
      goal_id: goalId,
      rough_idea: roughIdea,
      state: "clarifying",
      created_by: "runtime",
    });
    insertHistoricalClarificationTurn(store.db, {
      turn_id: `${sessionId}-turn-1`,
      session_id: sessionId,
      board_id: "board",
      goal_id: goalId,
      actor_id: "runtime",
      turn_index: 1,
      turn_kind: "rough_idea",
      user_message: roughIdea,
    });
  } finally { store.close(); }
  const reopened = new LocalProjectDatabase(databasePath);
  try {
    const snapshot = reopened.snapshot("board");
    assert.equal(snapshot.clarification_sessions.find((session) => session.session_id === sessionId)?.rough_idea, roughIdea);
    assert.equal(snapshot.clarification_turns.find((turn) => turn.session_id === sessionId)?.user_message, roughIdea);
  } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
});
