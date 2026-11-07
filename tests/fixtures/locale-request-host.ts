import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { ReportGoalEventsResult } from "@molis-ai/molis-work-plugin-goals/contract";
import { initializeBoard } from "./goals-board.js";

const [home, phase] = process.argv.slice(2);
assert.ok(home && (phase === "create" || phase === "replay"));
const receiptPath = join(home, "locale-test-receipt.json");
const previous = phase === "replay" ? JSON.parse(await readFile(receiptPath, "utf8")) as { project_id: string; receipt: ReportGoalEventsResult } : null;
const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => previous
  ? catalog.getProject(previous.project_id)
  : catalog.createProject({ display_name: "Locale retry", actor_id: LOCAL_PERSON_ACTOR_ID }));
const project_id = project.project_id;
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
const reference = molisWorkHostProjectReference({ projectId: project_id, databasePath: project.database_path });
const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id, audience: "user",
  permissions: ["goals:read", "goals:write", "attention:write"], user_action: { source: "management", conversation_ref: "test://locale", message_ref: "test://locale-report" } };
const actions = bindActionClient(host.actionClient(reference), () => caller);
const keys = ["é", "e\u0301", "e", "中", "阿", "😀", "\ue000", "2", "10"];
const fields = Object.fromEntries((phase === "create" ? keys : [...keys].reverse()).map(key => [key, `value ${key}`]));
const input = { goal_id: "locale-goal", idempotency_key: "same-report", events: [{ type_id: "locale-result", type_version: 1, title: "原文保持", fields }] };
try {
  if (phase === "create") {
    await initializeBoard(host, reference);
    await actions.invoke(goalsActions.create, { goal_id: "locale-goal", title: "跨语言重试", idempotency_key: "create-goal" });
    await actions.invoke(goalsActions.configure, { goal_id: "locale-goal", expected_version: 0, idempotency_key: "configure-fields",
      types: [{ type_id: "locale-result", version: 1, name: "结果原文", purpose: "保留每个字段的原文", fields: keys.map(field_id => ({ field_id, name: field_id, purpose: "原文", format: "text" as const, required: true })) }] });
  }
  const receipt = await actions.invoke(goalsActions.report, input);
  assert.equal(receipt.replayed, phase === "replay");
  const storedReceipt = JSON.parse(JSON.stringify(receipt)) as ReportGoalEventsResult;
  if (previous) assert.deepEqual(receipt, { ...previous.receipt, replayed: true });
  else await writeFile(receiptPath, JSON.stringify({ project_id, receipt }), { mode: 0o600 });
  assert.deepEqual(await actions.invoke(goalsActions.report, input), { ...storedReceipt, replayed: true });
  const before = await actions.invoke(goalsActions.events, { goal_id: "locale-goal", limit: 100 });
  const reports = before.events.filter(event => event.kind === "report");
  assert.equal(reports.length, 1);
  assert.deepEqual({ ...reports[0]!.payload }, fields);
  await assert.rejects(actions.invoke(goalsActions.report, { ...input, events: [{ ...input.events[0]!, fields: { ...fields, e: "different request" } }] }), { code: "goals.request.idempotency_key_reused" });
  assert.deepEqual(await actions.invoke(goalsActions.events, { goal_id: "locale-goal", limit: 100 }), before, "a refused retry adds no event or cursor");
  process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale, event_id: reports[0]!.event_id, cursor: before.observed_event_cursor, replayed: receipt.replayed }));
} finally {
  await host.close();
}
